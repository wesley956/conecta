-- Correlação ponta a ponta, saneamento de diagnósticos e exclusão Auth recuperável.

create or replace function public.redact_sensitive_text(p_value text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_value text := p_value;
begin
  if v_value is null then
    return null;
  end if;

  v_value := regexp_replace(
    v_value,
    '(https?|xtream)://[^[:space:]<>"'']+',
    '[URL protegida]',
    'gi'
  );
  v_value := regexp_replace(
    v_value,
    '((username|user|usuario|password|passwd|senha|token|credential|credencial|secret|apikey|api_key)[[:space:]]*[:=][[:space:]]*)[^[:space:],;]+',
    '\1[protegido]',
    'gi'
  );
  return v_value;
end;
$$;

create or replace function public.redact_sensitive_jsonb(p_value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_type text := jsonb_typeof(p_value);
begin
  if p_value is null then
    return null;
  end if;

  if v_type = 'object' then
    return coalesce((
      select jsonb_object_agg(
        entry.key,
        case
          when entry.key ~* '(password|passwd|username|credential|secret|token|playlist[_-]?url|m3u[_-]?url)'
            then to_jsonb('[protegido]'::text)
          else public.redact_sensitive_jsonb(entry.value)
        end
      )
      from jsonb_each(p_value) entry
    ), '{}'::jsonb);
  end if;

  if v_type = 'array' then
    return coalesce((
      select jsonb_agg(public.redact_sensitive_jsonb(entry.value) order by entry.ordinality)
      from jsonb_array_elements(p_value) with ordinality entry(value, ordinality)
    ), '[]'::jsonb);
  end if;

  if v_type = 'string' then
    return to_jsonb(public.redact_sensitive_text(p_value #>> '{}'));
  end if;

  return p_value;
end;
$$;

revoke all on function public.redact_sensitive_text(text) from public, anon, authenticated;
revoke all on function public.redact_sensitive_jsonb(jsonb) from public, anon, authenticated;
grant execute on function public.redact_sensitive_text(text) to service_role;
grant execute on function public.redact_sensitive_jsonb(jsonb) to service_role;

alter table public.panel_playback_diagnostics
  add column if not exists correlation_id text,
  add column if not exists failover_attempt_id text,
  add column if not exists cache_attempt_id uuid references public.playlist_cache_generation_attempts(id) on delete set null;

alter table public.panel_device_playlists
  add column if not exists last_correlation_id text,
  add column if not exists last_failover_attempt_id text;

alter table public.playlist_cache_generation_attempts
  add column if not exists correlation_id text;

create index if not exists panel_playback_diagnostics_correlation_idx
  on public.panel_playback_diagnostics (correlation_id, occurred_at desc)
  where correlation_id is not null;
create index if not exists panel_playback_diagnostics_failover_attempt_idx
  on public.panel_playback_diagnostics (failover_attempt_id, occurred_at desc)
  where failover_attempt_id is not null;
create index if not exists panel_playback_diagnostics_cache_attempt_idx
  on public.panel_playback_diagnostics (cache_attempt_id, occurred_at desc)
  where cache_attempt_id is not null;
create index if not exists playlist_cache_generation_correlation_idx
  on public.playlist_cache_generation_attempts (correlation_id, started_at desc)
  where correlation_id is not null;

create or replace function public.sanitize_panel_audit_log()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.description := public.redact_sensitive_text(new.description);
  new.metadata := public.redact_sensitive_jsonb(coalesce(new.metadata, '{}'::jsonb));
  return new;
end;
$$;

drop trigger if exists sanitize_panel_audit_log_trigger on public.panel_audit_logs;
create trigger sanitize_panel_audit_log_trigger
before insert or update of description, metadata on public.panel_audit_logs
for each row execute function public.sanitize_panel_audit_log();

create or replace function public.sanitize_playback_diagnostic()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.content_title := public.redact_sensitive_text(new.content_title);
  new.error_message := coalesce(
    nullif(public.redact_sensitive_text(new.error_message), ''),
    'Falha de reprodução sem detalhe seguro.'
  );
  new.recovery_action := public.redact_sensitive_text(new.recovery_action);
  new.admin_notes := public.redact_sensitive_text(new.admin_notes);
  new.correlation_id := coalesce(nullif(new.correlation_id, ''), nullif(new.client_event_id, ''));

  if new.correlation_id is not null and new.correlation_id !~ '^[A-Za-z0-9:_-]{1,180}$' then
    new.correlation_id := null;
  end if;
  if new.failover_attempt_id is not null and new.failover_attempt_id !~ '^[A-Za-z0-9:_-]{1,180}$' then
    new.failover_attempt_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists sanitize_playback_diagnostic_trigger on public.panel_playback_diagnostics;
create trigger sanitize_playback_diagnostic_trigger
before insert or update of content_title, error_message, recovery_action, admin_notes,
  correlation_id, failover_attempt_id, client_event_id
on public.panel_playback_diagnostics
for each row execute function public.sanitize_playback_diagnostic();

create or replace function public.sanitize_playlist_health()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.last_error := public.redact_sensitive_text(new.last_error);
  if new.last_correlation_id is not null and new.last_correlation_id !~ '^[A-Za-z0-9:_-]{1,180}$' then
    new.last_correlation_id := null;
  end if;
  if new.last_failover_attempt_id is not null and new.last_failover_attempt_id !~ '^[A-Za-z0-9:_-]{1,180}$' then
    new.last_failover_attempt_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists sanitize_playlist_health_trigger on public.panel_device_playlists;
create trigger sanitize_playlist_health_trigger
before insert or update of last_error, last_correlation_id, last_failover_attempt_id
on public.panel_device_playlists
for each row execute function public.sanitize_playlist_health();

create or replace function public.sanitize_playlist_cache_attempt()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.correlation_id := coalesce(nullif(new.correlation_id, ''), 'cache:' || new.id::text);
  new.error_message := public.redact_sensitive_text(new.error_message);
  new.cache_attempts := public.redact_sensitive_jsonb(coalesce(new.cache_attempts, '[]'::jsonb));
  return new;
end;
$$;

drop trigger if exists sanitize_playlist_cache_attempt_trigger on public.playlist_cache_generation_attempts;
create trigger sanitize_playlist_cache_attempt_trigger
before insert or update of correlation_id, error_message, cache_attempts
on public.playlist_cache_generation_attempts
for each row execute function public.sanitize_playlist_cache_attempt();

create or replace function public.sanitize_playlist_cache_summary()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.playlist_cache_error := public.redact_sensitive_text(new.playlist_cache_error);
  return new;
end;
$$;

drop trigger if exists sanitize_playlist_cache_summary_trigger on public.panel_playlists;
create trigger sanitize_playlist_cache_summary_trigger
before insert or update of playlist_cache_error on public.panel_playlists
for each row execute function public.sanitize_playlist_cache_summary();

create or replace function public.link_playlist_health_diagnostic()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_client_event_id text;
  v_cache_attempt_id uuid;
begin
  if new.last_failure_at is not distinct from old.last_failure_at or new.last_failure_at is null then
    return new;
  end if;

  v_client_event_id := 'health:' || new.id::text || ':' ||
    floor(extract(epoch from new.last_failure_at) * 1000)::bigint::text;

  select attempt.id
  into v_cache_attempt_id
  from public.playlist_cache_generation_attempts attempt
  where attempt.playlist_id = new.playlist_id
  order by attempt.started_at desc
  limit 1;

  update public.panel_playback_diagnostics diagnostic
  set
    correlation_id = coalesce(new.last_correlation_id, diagnostic.client_event_id),
    failover_attempt_id = new.last_failover_attempt_id,
    cache_attempt_id = v_cache_attempt_id,
    updated_at = now()
  where diagnostic.client_event_id = v_client_event_id;

  return new;
end;
$$;

drop trigger if exists zz_link_playlist_health_diagnostic_trigger on public.panel_device_playlists;
create trigger zz_link_playlist_health_diagnostic_trigger
after update of last_failure_at on public.panel_device_playlists
for each row execute function public.link_playlist_health_diagnostic();

update public.panel_audit_logs
set
  description = public.redact_sensitive_text(description),
  metadata = public.redact_sensitive_jsonb(coalesce(metadata, '{}'::jsonb));

update public.panel_playback_diagnostics
set
  content_title = public.redact_sensitive_text(content_title),
  error_message = public.redact_sensitive_text(error_message),
  recovery_action = public.redact_sensitive_text(recovery_action),
  admin_notes = public.redact_sensitive_text(admin_notes),
  correlation_id = case
    when client_event_id ~ '^[A-Za-z0-9:_-]{1,180}$' then client_event_id
    else null
  end
where correlation_id is null
   or content_title ~* '(https?|xtream)://'
   or error_message ~* '(https?|xtream)://|password|username|senha|token|credential'
   or recovery_action ~* '(https?|xtream)://|password|username|senha|token|credential'
   or admin_notes ~* '(https?|xtream)://|password|username|senha|token|credential';

update public.panel_device_playlists
set last_error = public.redact_sensitive_text(last_error)
where last_error ~* '(https?|xtream)://|password|username|senha|token|credential';

update public.panel_playlists
set playlist_cache_error = public.redact_sensitive_text(playlist_cache_error)
where playlist_cache_error ~* '(https?|xtream)://|password|username|senha|token|credential';

update public.playlist_cache_generation_attempts
set
  correlation_id = coalesce(correlation_id, 'cache:' || id::text),
  error_message = public.redact_sensitive_text(error_message),
  cache_attempts = public.redact_sensitive_jsonb(cache_attempts);

create table if not exists public.panel_auth_deletion_queue (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.panel_sellers(id) on delete cascade,
  auth_user_id uuid not null,
  reason text not null default 'temporary_access_not_renewed',
  not_before timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  attempts integer not null default 0 check (attempts between 0 and 10),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (auth_user_id)
);

create index if not exists panel_auth_deletion_queue_due_idx
  on public.panel_auth_deletion_queue (not_before, created_at)
  where status in ('pending', 'failed');

alter table public.panel_auth_deletion_queue enable row level security;
alter table public.panel_auth_deletion_queue force row level security;
revoke all on table public.panel_auth_deletion_queue from public, anon, authenticated;
grant select, insert, update on table public.panel_auth_deletion_queue to service_role;

create or replace function public.enqueue_seller_auth_deletion()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.deleted_at is null
     and new.deleted_at is not null
     and new.deletion_reason = 'temporary_access_not_renewed' then
    insert into public.panel_auth_deletion_queue (
      seller_id, auth_user_id, reason, not_before
    )
    select
      new.id,
      role_record.user_id,
      new.deletion_reason,
      new.deleted_at + interval '7 days'
    from public.panel_user_roles role_record
    where role_record.seller_id = new.id
      and role_record.role = 'seller'
    on conflict (auth_user_id) do update
    set
      seller_id = excluded.seller_id,
      reason = excluded.reason,
      not_before = greatest(public.panel_auth_deletion_queue.not_before, excluded.not_before),
      status = 'pending',
      attempts = 0,
      locked_at = null,
      completed_at = null,
      last_error = null,
      updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists enqueue_seller_auth_deletion_trigger on public.panel_sellers;
create trigger enqueue_seller_auth_deletion_trigger
after update of deleted_at, deletion_reason on public.panel_sellers
for each row execute function public.enqueue_seller_auth_deletion();

insert into public.panel_auth_deletion_queue (seller_id, auth_user_id, reason, not_before)
select
  seller.id,
  role_record.user_id,
  seller.deletion_reason,
  seller.deleted_at + interval '7 days'
from public.panel_sellers seller
join public.panel_user_roles role_record
  on role_record.seller_id = seller.id
 and role_record.role = 'seller'
where seller.deleted_at is not null
  and seller.deletion_reason = 'temporary_access_not_renewed'
on conflict (auth_user_id) do nothing;

create or replace function public.claim_seller_auth_deletions(p_limit integer default 25)
returns table (queue_id uuid, seller_id uuid, auth_user_id uuid)
language sql
security definer
set search_path = public, pg_temp
as $$
  with due as (
    select queue.id
    from public.panel_auth_deletion_queue queue
    where (
        queue.status in ('pending', 'failed')
        or (queue.status = 'processing' and queue.locked_at < now() - interval '15 minutes')
      )
      and queue.not_before <= now()
      and queue.attempts < 5
    order by queue.not_before, queue.created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
  ), claimed as (
    update public.panel_auth_deletion_queue queue
    set
      status = 'processing',
      attempts = queue.attempts + 1,
      locked_at = now(),
      last_error = null,
      updated_at = now()
    from due
    where queue.id = due.id
    returning queue.id, queue.seller_id, queue.auth_user_id
  )
  select claimed.id, claimed.seller_id, claimed.auth_user_id
  from claimed;
$$;

revoke all on function public.claim_seller_auth_deletions(integer) from public, anon, authenticated;
grant execute on function public.claim_seller_auth_deletions(integer) to service_role;

comment on table public.panel_auth_deletion_queue is
  'Fila recuperável: remove o usuário Auth somente sete dias após a exclusão lógica automática.';
comment on column public.panel_playback_diagnostics.correlation_id is
  'Identificador seguro compartilhado entre aparelho, failover, cache e painel.';
