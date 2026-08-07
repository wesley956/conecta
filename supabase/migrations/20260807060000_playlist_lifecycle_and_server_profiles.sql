-- Lote 3: ciclo de vida público único para listas e conhecimento técnico reutilizável por servidor.
-- Mantém os estados técnicos históricos para compatibilidade e expõe uma camada oficial estável.

create table if not exists public.panel_playlist_server_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_key text not null unique,
  protocol text not null,
  host text not null,
  port integer,
  endpoint_type text not null,
  path_pattern text not null default '/',
  output_format text,
  strategy_key text,
  safe_headers jsonb not null default '{}'::jsonb,
  request_method text not null default 'GET',
  timeout_ms integer not null default 45000,
  retry_count smallint not null default 1,
  follow_redirects boolean not null default true,
  observed_tls_mode text not null default 'strict',
  success_count integer not null default 0,
  failure_count integer not null default 0,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_playlist_id uuid references public.panel_playlists(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint panel_playlist_server_profiles_protocol_check check (
    protocol = any (array['http'::text,'https'::text,'rtmp'::text,'rtsp'::text,'file'::text])
  ),
  constraint panel_playlist_server_profiles_port_check check (port is null or port between 1 and 65535),
  constraint panel_playlist_server_profiles_method_check check (request_method = any (array['GET'::text,'POST'::text])),
  constraint panel_playlist_server_profiles_timeout_check check (timeout_ms between 1000 and 180000),
  constraint panel_playlist_server_profiles_retry_check check (retry_count between 0 and 5),
  constraint panel_playlist_server_profiles_tls_check check (observed_tls_mode = any (array['strict'::text,'custom_ca'::text,'insecure'::text])),
  constraint panel_playlist_server_profiles_counts_check check (success_count >= 0 and failure_count >= 0)
);

create index if not exists panel_playlist_server_profiles_lookup_idx
  on public.panel_playlist_server_profiles (lower(host), protocol, port, endpoint_type, success_count desc, last_success_at desc);

alter table public.panel_playlist_server_profiles enable row level security;
revoke all on public.panel_playlist_server_profiles from public, anon, authenticated;
grant all on public.panel_playlist_server_profiles to service_role;

create or replace function public.playlist_safe_profile_headers(p_headers jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_object_agg(lower(entry.key), to_jsonb(left(entry.value #>> '{}', 512))),
    '{}'::jsonb
  )
  from jsonb_each(coalesce(p_headers, '{}'::jsonb)) entry
  where lower(entry.key) = any (array[
    'accept'::text,
    'accept-language'::text,
    'user-agent'::text,
    'origin'::text,
    'referer'::text,
    'cache-control'::text,
    'pragma'::text
  ])
    and jsonb_typeof(entry.value) = 'string';
$$;

create or replace function public.playlist_safe_profile_path(p_path text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_path text := split_part(coalesce(nullif(trim(p_path), ''), '/'), '?', 1);
begin
  if left(v_path, 1) <> '/' then v_path := '/' || v_path; end if;
  v_path := regexp_replace(v_path, '(/p/)[^/]+/[^/]+(/|$)', '\1{credential}/{credential}\2', 'gi');
  v_path := regexp_replace(v_path, '(/(?:live|movie|series)/)[^/]+/[^/]+(/|$)', '\1{credential}/{credential}\2', 'gi');
  v_path := regexp_replace(v_path, '/[0-9]{6,}(/|$)', '/{credential}\1', 'g');
  return left(v_path, 240);
end;
$$;

create or replace function public.playlist_server_profile_key(
  p_protocol text,
  p_host text,
  p_port integer,
  p_endpoint_type text,
  p_path text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(coalesce(nullif(trim(p_protocol), ''), 'http'))
    || '://' || lower(trim(coalesce(p_host, '')))
    || ':' || coalesce(
      p_port,
      case lower(coalesce(p_protocol, '')) when 'https' then 443 when 'http' then 80 else 0 end
    )::text
    || '|' || lower(coalesce(nullif(trim(p_endpoint_type), ''), 'unknown'))
    || '|' || public.playlist_safe_profile_path(p_path);
$$;

create or replace function public.learn_playlist_server_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_endpoint public.panel_playlist_endpoints%rowtype;
  v_profile public.panel_playlist_connection_profiles%rowtype;
  v_key text;
  v_safe_headers jsonb := '{}'::jsonb;
  v_port integer;
begin
  if new.endpoint_id is null then return new; end if;
  select * into v_endpoint
  from public.panel_playlist_endpoints endpoint
  where endpoint.id = new.endpoint_id;
  if not found then return new; end if;

  select * into v_profile
  from public.panel_playlist_connection_profiles profile
  where profile.playlist_id = new.playlist_id;

  v_port := coalesce(
    v_endpoint.port,
    case lower(coalesce(v_endpoint.protocol, '')) when 'https' then 443 when 'http' then 80 else null end
  );
  v_key := public.playlist_server_profile_key(
    v_endpoint.protocol,
    v_endpoint.host,
    v_port,
    v_endpoint.endpoint_type,
    v_endpoint.path
  );
  if v_profile.playlist_id is not null then
    v_safe_headers := public.playlist_safe_profile_headers(v_profile.request_headers);
  end if;

  if new.result = 'success' then
    insert into public.panel_playlist_server_profiles (
      profile_key, protocol, host, port, endpoint_type, path_pattern, output_format,
      strategy_key, safe_headers, request_method, timeout_ms, retry_count,
      follow_redirects, observed_tls_mode, success_count, last_success_at,
      last_playlist_id, updated_at
    ) values (
      v_key,
      lower(coalesce(v_endpoint.protocol, 'http')),
      lower(v_endpoint.host),
      v_port,
      v_endpoint.endpoint_type,
      public.playlist_safe_profile_path(v_endpoint.path),
      v_endpoint.output_format,
      new.strategy_key,
      v_safe_headers,
      coalesce(v_profile.request_method, 'GET'),
      coalesce(v_profile.timeout_ms, 45000),
      coalesce(v_profile.retry_count, 1),
      coalesce(v_profile.follow_redirects, true),
      coalesce(new.tls_mode, 'strict'),
      1,
      new.occurred_at,
      new.playlist_id,
      now()
    )
    on conflict (profile_key) do update set
      strategy_key = excluded.strategy_key,
      safe_headers = excluded.safe_headers,
      request_method = excluded.request_method,
      timeout_ms = excluded.timeout_ms,
      retry_count = excluded.retry_count,
      follow_redirects = excluded.follow_redirects,
      observed_tls_mode = excluded.observed_tls_mode,
      output_format = coalesce(excluded.output_format, public.panel_playlist_server_profiles.output_format),
      success_count = public.panel_playlist_server_profiles.success_count + 1,
      last_success_at = greatest(public.panel_playlist_server_profiles.last_success_at, excluded.last_success_at),
      last_playlist_id = excluded.last_playlist_id,
      updated_at = now();
  elsif new.result = 'failure' then
    update public.panel_playlist_server_profiles server_profile
    set failure_count = server_profile.failure_count + 1,
        last_failure_at = greatest(server_profile.last_failure_at, new.occurred_at),
        updated_at = now()
    where server_profile.profile_key = v_key;
  end if;

  return new;
end;
$$;

create or replace function public.apply_known_playlist_server_profile(p_playlist_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_endpoint public.panel_playlist_endpoints%rowtype;
  v_server_profile public.panel_playlist_server_profiles%rowtype;
  v_port integer;
begin
  select endpoint.* into v_endpoint
  from public.panel_playlists playlist
  join public.panel_playlist_endpoints endpoint
    on endpoint.id = playlist.primary_endpoint_id
  where playlist.id = p_playlist_id
    and playlist.archived_at is null
    and endpoint.active is true;
  if not found then return null; end if;

  v_port := coalesce(
    v_endpoint.port,
    case lower(coalesce(v_endpoint.protocol, '')) when 'https' then 443 when 'http' then 80 else null end
  );

  select profile.* into v_server_profile
  from public.panel_playlist_server_profiles profile
  where lower(profile.host) = lower(v_endpoint.host)
    and profile.protocol = lower(coalesce(v_endpoint.protocol, profile.protocol))
    and coalesce(profile.port, 0) = coalesce(v_port, 0)
    and profile.endpoint_type = v_endpoint.endpoint_type
    and profile.success_count > 0
  order by
    (profile.path_pattern = public.playlist_safe_profile_path(v_endpoint.path)) desc,
    profile.success_count desc,
    profile.last_success_at desc nulls last
  limit 1;
  if not found then return null; end if;

  update public.panel_playlist_connection_profiles connection_profile
  set request_headers = v_server_profile.safe_headers || coalesce(connection_profile.request_headers, '{}'::jsonb),
      request_method = case when connection_profile.request_method = 'GET' then v_server_profile.request_method else connection_profile.request_method end,
      timeout_ms = case when connection_profile.timeout_ms = 45000 then v_server_profile.timeout_ms else connection_profile.timeout_ms end,
      retry_count = case when connection_profile.retry_count = 1 then v_server_profile.retry_count else connection_profile.retry_count end,
      follow_redirects = case when connection_profile.follow_redirects is true then v_server_profile.follow_redirects else connection_profile.follow_redirects end,
      updated_at = now()
  where connection_profile.playlist_id = p_playlist_id;

  update public.panel_playlist_endpoints endpoint
  set metadata = coalesce(endpoint.metadata, '{}'::jsonb) || jsonb_build_object(
        'serverProfileId', v_server_profile.id,
        'serverProfileAppliedAt', now(),
        'learnedStrategyKey', v_server_profile.strategy_key,
        'learnedPathPattern', v_server_profile.path_pattern
      ),
      updated_at = now()
  where endpoint.id = v_endpoint.id;

  return v_server_profile.id;
end;
$$;

create or replace function public.apply_known_playlist_server_profile_after_profile_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.apply_known_playlist_server_profile(new.playlist_id);
  return new;
end;
$$;

create or replace function public.apply_known_playlist_server_profile_after_primary_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.primary_endpoint_id is not null then
    perform public.apply_known_playlist_server_profile(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists panel_playlist_test_runs_learn_server_profile on public.panel_playlist_test_runs;
create trigger panel_playlist_test_runs_learn_server_profile
after insert on public.panel_playlist_test_runs
for each row execute function public.learn_playlist_server_profile();

drop trigger if exists panel_playlist_connection_profiles_apply_server_profile on public.panel_playlist_connection_profiles;
create trigger panel_playlist_connection_profiles_apply_server_profile
after insert on public.panel_playlist_connection_profiles
for each row execute function public.apply_known_playlist_server_profile_after_profile_insert();

drop trigger if exists panel_playlists_apply_server_profile on public.panel_playlists;
create trigger panel_playlists_apply_server_profile
after update of primary_endpoint_id on public.panel_playlists
for each row
when (new.primary_endpoint_id is distinct from old.primary_endpoint_id)
execute function public.apply_known_playlist_server_profile_after_primary_change();

create or replace function public.get_playlist_lifecycle_decision(p_playlist_id uuid)
returns table (
  playlist_id uuid,
  lifecycle_status text,
  lifecycle_label text,
  lifecycle_message text,
  android_status text,
  lg_status text,
  samsung_status text,
  recommended_action text,
  can_retry_cache boolean,
  admin_diagnostic_recommended boolean,
  cache_ready boolean,
  confirmed_by_device boolean,
  technical_status text,
  technical_code text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    playlist.id,
    case
      when playlist.archived_at is not null or playlist.active is false then 'archived'
      when playlist.playlist_qualification_status = 'blocked' then 'blocked'
      when playlist.playlist_cache_status = 'ready' and coalesce(playlist.playlist_cache_item_count, 0) > 0 then 'ready_cache'
      when playlist.playlist_qualification_status = 'ready_direct' and playlist.playlist_direct_confirmed_at is not null then 'confirmed_by_device'
      when playlist.playlist_qualification_code = 'DEVICE_TEST_FAILED' then 'device_failed'
      when playlist.playlist_qualification_status in ('awaiting_device_test', 'retryable_error') then 'awaiting_device_confirmation'
      else 'generating_cache'
    end,
    case
      when playlist.archived_at is not null or playlist.active is false then 'Arquivada'
      when playlist.playlist_qualification_status = 'blocked' then 'Bloqueada'
      when playlist.playlist_cache_status = 'ready' and coalesce(playlist.playlist_cache_item_count, 0) > 0 then 'Pronta com cache'
      when playlist.playlist_qualification_status = 'ready_direct' and playlist.playlist_direct_confirmed_at is not null then 'Confirmada pelo aparelho'
      when playlist.playlist_qualification_code = 'DEVICE_TEST_FAILED' then 'Falhou no aparelho'
      when playlist.playlist_qualification_status in ('awaiting_device_test', 'retryable_error') then 'Aguardando confirmação no aparelho'
      else 'Gerando cache'
    end,
    case
      when playlist.archived_at is not null or playlist.active is false then 'A lista foi arquivada e não aparece em novas ativações.'
      when playlist.playlist_qualification_status = 'blocked' then coalesce(public.safe_playlist_qualification_message(playlist.playlist_qualification_message), 'A origem foi bloqueada e precisa ser corrigida antes de uma nova ativação.')
      when playlist.playlist_cache_status = 'ready' and coalesce(playlist.playlist_cache_item_count, 0) > 0 then 'O cache foi gerado e a lista está pronta nas plataformas compatíveis.'
      when playlist.playlist_qualification_status = 'ready_direct' and playlist.playlist_direct_confirmed_at is not null then 'Um aparelho Android abriu o conteúdo e confirmou esta lista.'
      when playlist.playlist_qualification_code = 'DEVICE_TEST_FAILED' then 'O aparelho não conseguiu abrir esta lista. Revise os dados ou tente novamente; ela não é bloqueada automaticamente por uma única falha.'
      when playlist.playlist_qualification_status in ('awaiting_device_test', 'retryable_error') then 'O servidor não conseguiu confirmar a origem. No Android, ela pode ser ativada provisoriamente e o próprio aparelho confirmará o resultado.'
      else 'O servidor está tentando autenticar a origem e gerar o cache.'
    end,
    case
      when playlist.archived_at is not null or playlist.active is false or playlist.playlist_qualification_status = 'blocked' then 'blocked'
      when playlist.playlist_cache_status = 'ready' and coalesce(playlist.playlist_cache_item_count, 0) > 0 then 'available'
      when playlist.playlist_qualification_status = 'ready_direct' and playlist.playlist_direct_confirmed_at is not null then 'available'
      else 'provisional'
    end,
    case
      when playlist.archived_at is null and playlist.active is true
       and playlist.playlist_cache_status = 'ready' and coalesce(playlist.playlist_cache_item_count, 0) > 0 then 'available_by_cache'
      else 'unavailable'
    end,
    case
      when playlist.archived_at is null and playlist.active is true
       and playlist.playlist_cache_status = 'ready' and coalesce(playlist.playlist_cache_item_count, 0) > 0 then 'available_by_cache'
      else 'unavailable'
    end,
    case
      when playlist.archived_at is not null or playlist.active is false then 'none'
      when playlist.playlist_qualification_status = 'blocked' then 'edit_source'
      when playlist.playlist_cache_status = 'ready' and coalesce(playlist.playlist_cache_item_count, 0) > 0 then 'activate'
      when playlist.playlist_qualification_status = 'ready_direct' and playlist.playlist_direct_confirmed_at is not null then 'activate'
      when playlist.playlist_qualification_code = 'DEVICE_TEST_FAILED' then 'review_or_retry'
      when playlist.playlist_qualification_status in ('awaiting_device_test', 'retryable_error') then 'activate_on_android'
      else 'wait'
    end,
    playlist.playlist_qualification_status in ('validating', 'retryable_error')
      or playlist.playlist_qualification_code = 'DEVICE_TEST_FAILED',
    playlist.playlist_qualification_status in ('awaiting_device_test', 'retryable_error')
      or playlist.playlist_qualification_code = 'DEVICE_TEST_FAILED',
    playlist.playlist_cache_status = 'ready' and coalesce(playlist.playlist_cache_item_count, 0) > 0,
    playlist.playlist_direct_confirmed_at is not null,
    playlist.playlist_qualification_status,
    playlist.playlist_qualification_code
  from public.panel_playlists playlist
  where playlist.id = p_playlist_id;
$$;

-- Mantém o contrato legado, mas remove a linguagem que tratava homologação manual como etapa comercial.
create or replace function public.get_playlist_commercial_decision(p_playlist_id uuid)
returns table (
  playlist_id uuid,
  qualification_status text,
  commercially_usable boolean,
  qualification_label text,
  qualification_message text,
  recommended_action text,
  can_retry_cache boolean,
  requires_device_test boolean,
  qualified_at timestamptz,
  direct_confirmed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    playlist.id,
    playlist.playlist_qualification_status,
    playlist.active is true and playlist.archived_at is null
      and (
        (playlist.playlist_cache_status = 'ready' and coalesce(playlist.playlist_cache_item_count, 0) > 0)
        or (playlist.playlist_qualification_status = 'ready_direct' and playlist.playlist_direct_confirmed_at is not null)
      ),
    lifecycle.lifecycle_label,
    lifecycle.lifecycle_message,
    lifecycle.recommended_action,
    lifecycle.can_retry_cache,
    lifecycle.admin_diagnostic_recommended,
    playlist.playlist_qualified_at,
    playlist.playlist_direct_confirmed_at
  from public.panel_playlists playlist
  cross join lateral public.get_playlist_lifecycle_decision(playlist.id) lifecycle
  where playlist.id = p_playlist_id;
$$;

-- Falha do próprio aparelho comercial também pode registrar o estado oficial "Falhou no aparelho".
create or replace function public.mark_playlist_validation_failure(
  p_playlist_id uuid,
  p_device_id uuid,
  p_error_code text,
  p_error_message text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_authorized boolean := false;
  v_message text := coalesce(
    public.safe_playlist_qualification_message(p_error_message),
    'O aparelho não conseguiu confirmar a lista.'
  );
begin
  select exists (
    select 1
    from public.panel_playlist_validation_sessions session
    where session.playlist_id = p_playlist_id
      and session.device_id = p_device_id
      and session.status = 'active'
      and session.expires_at > v_now
  ) or exists (
    select 1
    from public.panel_devices device
    where device.id = p_device_id
      and device.status = 'active'
      and (
        device.playlist_id = p_playlist_id
        or exists (
          select 1
          from public.panel_device_playlists assignment
          where assignment.device_id = device.id
            and assignment.playlist_id = p_playlist_id
            and assignment.active is true
        )
      )
  ) into v_authorized;

  if not v_authorized then return false; end if;

  update public.panel_playlist_validation_sessions session
  set status = 'failed',
      failed_at = v_now,
      updated_at = v_now,
      last_error_code = left(coalesce(nullif(trim(p_error_code), ''), 'DEVICE_TEST_FAILED'), 80),
      last_error_message = v_message
  where session.playlist_id = p_playlist_id
    and session.device_id = p_device_id
    and session.status = 'active';

  update public.panel_playlists playlist
  set playlist_qualification_status = 'awaiting_device_test',
      playlist_qualification_code = 'DEVICE_TEST_FAILED',
      playlist_qualification_message = 'O aparelho não conseguiu abrir esta lista. Revise os dados ou tente novamente.',
      playlist_qualification_updated_at = v_now,
      playlist_qualified_at = null
  where playlist.id = p_playlist_id
    and playlist.active is true
    and playlist.playlist_qualification_status <> 'ready_direct';

  update public.panel_devices device
  set is_playlist_validation_device = false,
      updated_at = v_now
  where device.id = p_device_id
    and device.seller_id is not null
    and device.is_playlist_validation_device is true;

  return true;
end;
$$;

revoke all on function public.get_playlist_lifecycle_decision(uuid) from public, anon, authenticated;
revoke all on function public.apply_known_playlist_server_profile(uuid) from public, anon, authenticated;
revoke all on function public.playlist_safe_profile_headers(jsonb) from public, anon, authenticated;
revoke all on function public.playlist_safe_profile_path(text) from public, anon, authenticated;
revoke all on function public.playlist_server_profile_key(text,text,integer,text,text) from public, anon, authenticated;

grant execute on function public.get_playlist_lifecycle_decision(uuid) to service_role;
grant execute on function public.apply_known_playlist_server_profile(uuid) to service_role;
grant execute on function public.playlist_safe_profile_headers(jsonb) to service_role;
grant execute on function public.playlist_safe_profile_path(text) to service_role;
grant execute on function public.playlist_server_profile_key(text,text,integer,text,text) to service_role;

comment on table public.panel_playlist_server_profiles is
  'Conhecimento técnico reutilizável por host/porta/formato. Não armazena usuário, senha, token, cookie ou Authorization.';
comment on function public.get_playlist_lifecycle_decision(uuid) is
  'Fonte única dos estados públicos do Lote 3 e da compatibilidade Android/LG/Samsung.';

notify pgrst, 'reload schema';
