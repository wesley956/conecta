-- WEB-01 / WEB-02 / WEB-03
-- Fundação de autenticação e sessão do RonecaPlayTV Web Player.
-- Tabelas são service-role only; nenhuma credencial Web é exposta pelo Data API.

alter table public.panel_devices
  add column if not exists web_access_enabled boolean not null default false,
  add column if not exists web_pin_hash text,
  add column if not exists web_pin_salt text,
  add column if not exists web_pin_iterations integer not null default 210000,
  add column if not exists web_pin_updated_at timestamptz,
  add column if not exists web_session_limit smallint not null default 2;

alter table public.panel_devices
  drop constraint if exists panel_devices_web_pin_iterations_check,
  add constraint panel_devices_web_pin_iterations_check
    check (web_pin_iterations between 100000 and 1000000),
  drop constraint if exists panel_devices_web_session_limit_check,
  add constraint panel_devices_web_session_limit_check
    check (web_session_limit between 1 and 8),
  drop constraint if exists panel_devices_web_pin_pair_check,
  add constraint panel_devices_web_pin_pair_check
    check (
      (web_pin_hash is null and web_pin_salt is null)
      or (web_pin_hash is not null and web_pin_salt is not null)
    );

create table if not exists public.web_player_sessions (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.panel_devices(id) on delete cascade,
  access_token_hash text not null unique,
  refresh_token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  idle_expires_at timestamptz not null,
  absolute_expires_at timestamptz not null,
  revoked_at timestamptz,
  revoke_reason text,
  user_agent_family text,
  client_ip_hash text,
  generation integer not null default 1,
  constraint web_player_sessions_expiry_check
    check (idle_expires_at <= absolute_expires_at),
  constraint web_player_sessions_access_hash_check
    check (access_token_hash ~ '^[0-9a-f]{64}$'),
  constraint web_player_sessions_refresh_hash_check
    check (refresh_token_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists web_player_sessions_device_active_idx
  on public.web_player_sessions(device_id, revoked_at, absolute_expires_at, idle_expires_at);
create index if not exists web_player_sessions_last_used_idx
  on public.web_player_sessions(last_used_at desc);

create table if not exists public.web_player_login_attempts (
  id bigint generated always as identity primary key,
  code_hash text not null,
  ip_hash text not null,
  success boolean not null default false,
  attempted_at timestamptz not null default now(),
  constraint web_player_login_attempts_code_hash_check
    check (code_hash ~ '^[0-9a-f]{64}$'),
  constraint web_player_login_attempts_ip_hash_check
    check (ip_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists web_player_login_attempts_code_window_idx
  on public.web_player_login_attempts(code_hash, attempted_at desc);
create index if not exists web_player_login_attempts_ip_window_idx
  on public.web_player_login_attempts(ip_hash, attempted_at desc);

alter table public.web_player_sessions enable row level security;
alter table public.web_player_login_attempts enable row level security;

revoke all on table public.web_player_sessions from public, anon, authenticated;
revoke all on table public.web_player_login_attempts from public, anon, authenticated;
grant select, insert, update, delete on table public.web_player_sessions to service_role;
grant select, insert, update, delete on table public.web_player_login_attempts to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Criação serializada de sessão: bloqueia a linha do aparelho para que requests
-- concorrentes não ultrapassem o limite configurado.
create or replace function public.web_player_create_session(
  p_device_id uuid,
  p_access_token_hash text,
  p_refresh_token_hash text,
  p_idle_expires_at timestamptz,
  p_absolute_expires_at timestamptz,
  p_user_agent_family text default null,
  p_client_ip_hash text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device public.panel_devices%rowtype;
  v_active_count integer;
  v_session_id uuid;
begin
  select * into v_device
  from public.panel_devices
  where id = p_device_id
  for update;

  if not found then
    raise exception 'WEB_DEVICE_NOT_FOUND';
  end if;

  if v_device.status <> 'active' then
    raise exception 'WEB_DEVICE_NOT_ACTIVE';
  end if;

  if v_device.subscription_expires_at is not null
     and v_device.subscription_expires_at <= now() then
    raise exception 'WEB_DEVICE_EXPIRED';
  end if;

  if not coalesce(v_device.web_access_enabled, false) then
    raise exception 'WEB_ACCESS_DISABLED';
  end if;

  update public.web_player_sessions
  set revoked_at = coalesce(revoked_at, now()),
      revoke_reason = coalesce(revoke_reason, 'expired')
  where device_id = p_device_id
    and revoked_at is null
    and (idle_expires_at <= now() or absolute_expires_at <= now());

  select count(*) into v_active_count
  from public.web_player_sessions
  where device_id = p_device_id
    and revoked_at is null
    and idle_expires_at > now()
    and absolute_expires_at > now();

  if v_active_count >= greatest(1, least(8, coalesce(v_device.web_session_limit, 2))) then
    raise exception 'WEB_SESSION_LIMIT_REACHED';
  end if;

  insert into public.web_player_sessions (
    device_id,
    access_token_hash,
    refresh_token_hash,
    idle_expires_at,
    absolute_expires_at,
    user_agent_family,
    client_ip_hash
  ) values (
    p_device_id,
    p_access_token_hash,
    p_refresh_token_hash,
    p_idle_expires_at,
    p_absolute_expires_at,
    left(nullif(trim(p_user_agent_family), ''), 120),
    nullif(trim(p_client_ip_hash), '')
  ) returning id into v_session_id;

  return v_session_id;
end;
$$;

revoke all on function public.web_player_create_session(uuid, text, text, timestamptz, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.web_player_create_session(uuid, text, text, timestamptz, timestamptz, text, text) to service_role;

comment on column public.panel_devices.web_pin_hash is
  'PBKDF2-SHA256 derivation encoded as hex. Never stores the Web PIN in plaintext.';
comment on table public.web_player_sessions is
  'Revocable browser sessions linked to an existing commercial device; service-role only.';
comment on table public.web_player_login_attempts is
  'Hashed anti-enumeration/rate-limit events for Web Player login; service-role only.';
