-- WEB-12 / WEB-13 / WEB-15 / WEB-16
-- Fonte canônica cross-client, telemetria sanitizada e auditoria administrativa.
-- Todas as tabelas permanecem service-role only; clientes usam Edge Functions autenticadas.

create table if not exists public.web_player_library_favorites (
  scope_key text not null,
  content_key text not null,
  content_type text not null,
  active boolean not null default true,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (scope_key, content_key),
  constraint web_player_favorite_scope_check check (scope_key ~ '^(customer|device):[0-9a-f-]{36}$'),
  constraint web_player_favorite_key_check check (length(content_key) between 3 and 500),
  constraint web_player_favorite_type_check check (content_type in ('channel','movie','series')),
  constraint web_player_favorite_version_check check (version > 0)
);

create table if not exists public.web_player_library_progress (
  scope_key text not null,
  content_key text not null,
  content_type text not null,
  position_ms bigint not null,
  duration_ms bigint not null,
  completed boolean not null default false,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (scope_key, content_key),
  constraint web_player_progress_scope_check check (scope_key ~ '^(customer|device):[0-9a-f-]{36}$'),
  constraint web_player_progress_key_check check (length(content_key) between 3 and 500),
  constraint web_player_progress_type_check check (content_type in ('movie','episode')),
  constraint web_player_progress_position_check check (position_ms >= 0),
  constraint web_player_progress_duration_check check (duration_ms > 0),
  constraint web_player_progress_bounds_check check (position_ms <= duration_ms),
  constraint web_player_progress_version_check check (version > 0)
);

create table if not exists public.web_player_library_preferences (
  scope_key text primary key,
  aspect_mode text,
  language text,
  subtitle_language text,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  constraint web_player_preferences_scope_check check (scope_key ~ '^(customer|device):[0-9a-f-]{36}$'),
  constraint web_player_preferences_aspect_check check (aspect_mode is null or aspect_mode in ('contain','cover','fill')),
  constraint web_player_preferences_language_check check (language is null or length(language) <= 40),
  constraint web_player_preferences_subtitle_check check (subtitle_language is null or length(subtitle_language) <= 40),
  constraint web_player_preferences_version_check check (version > 0)
);

create table if not exists public.web_player_diagnostics (
  id uuid primary key default gen_random_uuid(),
  correlation_id text not null unique,
  session_id uuid references public.web_player_sessions(id) on delete set null,
  device_id uuid references public.panel_devices(id) on delete set null,
  browser_family text,
  web_version text,
  content_type text,
  error_code text not null,
  stage text not null,
  recovered boolean not null default false,
  playlist_role text,
  created_at timestamptz not null default now(),
  constraint web_player_diag_correlation_check check (length(correlation_id) between 8 and 120),
  constraint web_player_diag_browser_check check (browser_family is null or length(browser_family) <= 80),
  constraint web_player_diag_version_check check (web_version is null or length(web_version) <= 40),
  constraint web_player_diag_type_check check (content_type is null or content_type in ('channel','movie','episode','unknown')),
  constraint web_player_diag_code_check check (error_code ~ '^[A-Z0-9_:-]{2,80}$'),
  constraint web_player_diag_stage_check check (stage in ('authorize','gateway','player','recovery','session','pwa')),
  constraint web_player_diag_role_check check (playlist_role is null or playlist_role in ('primary','backup'))
);

create index if not exists web_player_diagnostics_created_idx on public.web_player_diagnostics(created_at desc);
create index if not exists web_player_diagnostics_error_idx on public.web_player_diagnostics(error_code, created_at desc);
create index if not exists web_player_diagnostics_device_idx on public.web_player_diagnostics(device_id, created_at desc);

create table if not exists public.web_player_rate_events (
  id bigint generated always as identity primary key,
  subject_hash text not null,
  bucket text not null,
  occurred_at timestamptz not null default now(),
  constraint web_player_rate_hash_check check (subject_hash ~ '^[0-9a-f]{64}$'),
  constraint web_player_rate_bucket_check check (bucket in ('refresh','catalog','playback','diagnostic','panel'))
);
create index if not exists web_player_rate_window_idx on public.web_player_rate_events(bucket, subject_hash, occurred_at desc);

create table if not exists public.web_player_admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null,
  actor_role text not null,
  seller_id uuid references public.panel_sellers(id) on delete set null,
  device_id uuid references public.panel_devices(id) on delete set null,
  action text not null,
  created_at timestamptz not null default now(),
  constraint web_player_admin_audit_role_check check (actor_role in ('owner','admin','seller')),
  constraint web_player_admin_audit_action_check check (action in ('enable_web','disable_web','set_pin','reset_pin','revoke_session','revoke_all','set_session_limit'))
);
create index if not exists web_player_admin_audit_device_idx on public.web_player_admin_audit(device_id, created_at desc);

alter table public.web_player_library_favorites enable row level security;
alter table public.web_player_library_progress enable row level security;
alter table public.web_player_library_preferences enable row level security;
alter table public.web_player_diagnostics enable row level security;
alter table public.web_player_rate_events enable row level security;
alter table public.web_player_admin_audit enable row level security;

revoke all on table public.web_player_library_favorites from public, anon, authenticated;
revoke all on table public.web_player_library_progress from public, anon, authenticated;
revoke all on table public.web_player_library_preferences from public, anon, authenticated;
revoke all on table public.web_player_diagnostics from public, anon, authenticated;
revoke all on table public.web_player_rate_events from public, anon, authenticated;
revoke all on table public.web_player_admin_audit from public, anon, authenticated;

grant select, insert, update, delete on table public.web_player_library_favorites to service_role;
grant select, insert, update, delete on table public.web_player_library_progress to service_role;
grant select, insert, update, delete on table public.web_player_library_preferences to service_role;
grant select, insert, update, delete on table public.web_player_diagnostics to service_role;
grant select, insert, update, delete on table public.web_player_rate_events to service_role;
grant select, insert, update, delete on table public.web_player_admin_audit to service_role;
grant usage, select on sequence public.web_player_rate_events_id_seq to service_role;

create or replace function public.web_player_scope_key(p_device_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select case
    when customer_id is not null then 'customer:' || customer_id::text
    else 'device:' || id::text
  end
  from public.panel_devices
  where id = p_device_id;
$$;
revoke all on function public.web_player_scope_key(uuid) from public, anon, authenticated;
grant execute on function public.web_player_scope_key(uuid) to service_role;

-- Favorito é uma intenção binária explícita. A ordem serial do servidor resolve conflitos
-- entre abas de forma previsível e versionada, sem depender do relógio do cliente.
create or replace function public.web_player_set_favorite(
  p_scope_key text,
  p_content_key text,
  p_content_type text,
  p_active boolean
) returns table(active boolean, version bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.web_player_library_favorites(scope_key, content_key, content_type, active)
  values (p_scope_key, p_content_key, p_content_type, p_active)
  on conflict (scope_key, content_key) do update
  set content_type = excluded.content_type,
      active = excluded.active,
      version = public.web_player_library_favorites.version + 1,
      updated_at = now();

  return query
  select f.active, f.version, f.updated_at
  from public.web_player_library_favorites f
  where f.scope_key = p_scope_key and f.content_key = p_content_key;
end;
$$;
revoke all on function public.web_player_set_favorite(text,text,text,boolean) from public, anon, authenticated;
grant execute on function public.web_player_set_favorite(text,text,text,boolean) to service_role;

-- Progresso é monotônico por padrão para impedir que um checkpoint atrasado de outro
-- cliente faça o usuário voltar para trás. Reinício deliberado usa a ação reset no BFF.
create or replace function public.web_player_set_progress(
  p_scope_key text,
  p_content_key text,
  p_content_type text,
  p_position_ms bigint,
  p_duration_ms bigint
) returns table(position_ms bigint, duration_ms bigint, completed boolean, version bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_position bigint;
  v_completed boolean;
begin
  if p_duration_ms <= 0 or p_position_ms < 0 then
    raise exception 'WEB_PROGRESS_INVALID';
  end if;

  v_position := least(p_position_ms, p_duration_ms);
  v_completed := (p_duration_ms - v_position) <= 45000;

  insert into public.web_player_library_progress(
    scope_key, content_key, content_type, position_ms, duration_ms, completed
  ) values (
    p_scope_key, p_content_key, p_content_type,
    case when v_completed then p_duration_ms else v_position end,
    p_duration_ms,
    v_completed
  )
  on conflict (scope_key, content_key) do update
  set content_type = excluded.content_type,
      duration_ms = greatest(public.web_player_library_progress.duration_ms, excluded.duration_ms),
      position_ms = case
        when public.web_player_library_progress.completed then public.web_player_library_progress.position_ms
        when excluded.completed then excluded.duration_ms
        else greatest(public.web_player_library_progress.position_ms, excluded.position_ms)
      end,
      completed = public.web_player_library_progress.completed or excluded.completed,
      version = public.web_player_library_progress.version + 1,
      updated_at = now();

  return query
  select p.position_ms, p.duration_ms, p.completed, p.version, p.updated_at
  from public.web_player_library_progress p
  where p.scope_key = p_scope_key and p.content_key = p_content_key;
end;
$$;
revoke all on function public.web_player_set_progress(text,text,text,bigint,bigint) from public, anon, authenticated;
grant execute on function public.web_player_set_progress(text,text,text,bigint,bigint) to service_role;

create or replace view public.web_player_observability_daily
with (security_invoker = true)
as
select
  date_trunc('day', created_at) as day,
  coalesce(browser_family, 'unknown') as browser_family,
  coalesce(content_type, 'unknown') as content_type,
  stage,
  error_code,
  count(*) as events,
  count(*) filter (where recovered) as recovered_events
from public.web_player_diagnostics
group by 1,2,3,4,5;

revoke all on public.web_player_observability_daily from public, anon, authenticated;
grant select on public.web_player_observability_daily to service_role;

comment on table public.web_player_library_progress is
  'Canonical cross-client VOD progress keyed by customer/device scope and stable contentKey; no stream URL or credential.';
comment on table public.web_player_diagnostics is
  'Sanitized Web Player support telemetry. URLs, PINs, credentials and tokens are forbidden by contract.';
