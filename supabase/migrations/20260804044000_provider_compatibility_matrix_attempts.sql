begin;

create table if not exists public.playlist_provider_attempts (
  id uuid primary key default gen_random_uuid(),
  client_event_id text not null unique,
  device_id uuid not null references public.panel_devices(id) on delete cascade,
  playlist_id uuid not null references public.panel_playlists(id) on delete cascade,
  assignment_id uuid references public.panel_device_playlists(id) on delete set null,
  device_code_snapshot text not null,
  playlist_name_snapshot text,
  platform text,
  app_version text,
  phase text not null default 'fast',
  section text not null,
  transport text not null,
  strategy_key text not null,
  protocol text,
  host_snapshot text not null,
  port integer,
  path_snapshot text,
  http_version text,
  request_profile text,
  output_format text,
  result text not null,
  http_status integer,
  duration_ms bigint not null default 0,
  response_bytes bigint,
  content_type text,
  server_header text,
  redirect_snapshot text,
  item_count integer,
  error_code text,
  error_message text,
  correlation_id text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint playlist_provider_attempts_event_length
    check (char_length(client_event_id) between 8 and 180),
  constraint playlist_provider_attempts_phase_check
    check (phase in ('fast', 'compatibility', 'deep')),
  constraint playlist_provider_attempts_section_check
    check (section in ('authentication', 'channels', 'movies', 'series', 'epg', 'm3u', 'catalog', 'unknown')),
  constraint playlist_provider_attempts_transport_check
    check (transport in ('cache', 'xtream', 'm3u', 'local', 'unknown')),
  constraint playlist_provider_attempts_protocol_check
    check (protocol is null or protocol in ('http', 'https', 'local', 'unknown')),
  constraint playlist_provider_attempts_result_check
    check (result in ('success', 'partial', 'empty', 'failure', 'skipped')),
  constraint playlist_provider_attempts_http_status_check
    check (http_status is null or http_status between 100 and 599),
  constraint playlist_provider_attempts_port_check
    check (port is null or port between 1 and 65535),
  constraint playlist_provider_attempts_duration_check
    check (duration_ms between 0 and 3600000),
  constraint playlist_provider_attempts_response_size_check
    check (response_bytes is null or response_bytes >= 0),
  constraint playlist_provider_attempts_item_count_check
    check (item_count is null or item_count >= 0),
  constraint playlist_provider_attempts_safe_host_check
    check (position('?' in host_snapshot) = 0 and position('@' in host_snapshot) = 0),
  constraint playlist_provider_attempts_safe_path_check
    check (path_snapshot is null or (position('?' in path_snapshot) = 0 and position('@' in path_snapshot) = 0)),
  constraint playlist_provider_attempts_safe_redirect_check
    check (redirect_snapshot is null or (position('?' in redirect_snapshot) = 0 and position('@' in redirect_snapshot) = 0))
);

create index if not exists playlist_provider_attempts_playlist_time_idx
  on public.playlist_provider_attempts (playlist_id, occurred_at desc);

create index if not exists playlist_provider_attempts_device_time_idx
  on public.playlist_provider_attempts (device_id, occurred_at desc);

create index if not exists playlist_provider_attempts_strategy_idx
  on public.playlist_provider_attempts (strategy_key, result, occurred_at desc);

create index if not exists playlist_provider_attempts_correlation_idx
  on public.playlist_provider_attempts (correlation_id)
  where correlation_id is not null;

alter table public.playlist_provider_attempts enable row level security;
revoke all on table public.playlist_provider_attempts from anon, authenticated;
grant all on table public.playlist_provider_attempts to service_role;

comment on table public.playlist_provider_attempts is
  'Tentativas sanitizadas da matriz de compatibilidade. Nunca armazena query string, usuário ou senha do provedor.';
comment on column public.playlist_provider_attempts.host_snapshot is
  'Somente hostname sanitizado, sem credenciais, query ou caminho.';
comment on column public.playlist_provider_attempts.path_snapshot is
  'Somente caminho sanitizado do endpoint, sem query string.';
comment on column public.playlist_provider_attempts.strategy_key is
  'Identificador técnico da combinação testada, sem credenciais.';

commit;
