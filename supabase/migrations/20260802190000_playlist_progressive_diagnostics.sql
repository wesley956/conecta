begin;

create table if not exists public.panel_playlist_diagnostics (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.panel_playlists(id) on delete cascade,
  requested_by_user_id uuid,
  requested_by_role text not null check (requested_by_role in ('owner', 'admin', 'seller')),
  requested_by_seller_id uuid references public.panel_sellers(id) on delete set null,
  status text not null default 'running'
    check (status in ('running', 'waiting_device', 'completed', 'expired', 'failed')),
  classification text,
  strategy text check (strategy is null or strategy in ('server_cache', 'direct', 'hybrid', 'retry', 'blocked')),
  server_steps jsonb not null default '[]'::jsonb,
  device_steps jsonb not null default '[]'::jsonb,
  comparison jsonb not null default '{}'::jsonb,
  summary text,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  constraint panel_playlist_diagnostics_server_steps_array
    check (jsonb_typeof(server_steps) = 'array'),
  constraint panel_playlist_diagnostics_device_steps_array
    check (jsonb_typeof(device_steps) = 'array'),
  constraint panel_playlist_diagnostics_comparison_object
    check (jsonb_typeof(comparison) = 'object')
);

create index if not exists panel_playlist_diagnostics_playlist_started_idx
  on public.panel_playlist_diagnostics (playlist_id, started_at desc);

create index if not exists panel_playlist_diagnostics_status_updated_idx
  on public.panel_playlist_diagnostics (status, updated_at desc);

create table if not exists public.panel_playlist_diagnostic_tasks (
  id uuid primary key default gen_random_uuid(),
  diagnostic_id uuid not null unique
    references public.panel_playlist_diagnostics(id) on delete cascade,
  playlist_id uuid not null references public.panel_playlists(id) on delete cascade,
  device_id uuid not null references public.panel_devices(id) on delete cascade,
  status text not null default 'waiting_device'
    check (status in ('waiting_device', 'claimed', 'completed', 'expired', 'cancelled')),
  requested_checks jsonb not null default '["head", "auth", "playback"]'::jsonb,
  result jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  updated_at timestamptz not null default now(),
  constraint panel_playlist_diagnostic_tasks_checks_array
    check (jsonb_typeof(requested_checks) = 'array'),
  constraint panel_playlist_diagnostic_tasks_result_array
    check (jsonb_typeof(result) = 'array')
);

create index if not exists panel_playlist_diagnostic_tasks_device_status_idx
  on public.panel_playlist_diagnostic_tasks (device_id, status, expires_at);

create index if not exists panel_playlist_diagnostic_tasks_playlist_created_idx
  on public.panel_playlist_diagnostic_tasks (playlist_id, created_at desc);

alter table public.panel_playlist_diagnostics enable row level security;
alter table public.panel_playlist_diagnostic_tasks enable row level security;

revoke all on table public.panel_playlist_diagnostics from anon, authenticated;
revoke all on table public.panel_playlist_diagnostic_tasks from anon, authenticated;
grant all on table public.panel_playlist_diagnostics to service_role;
grant all on table public.panel_playlist_diagnostic_tasks to service_role;

comment on table public.panel_playlist_diagnostics is
  'Diagnóstico progressivo de listas. Guarda somente resultados técnicos saneados, nunca URL, usuário, senha ou catálogo.';
comment on table public.panel_playlist_diagnostic_tasks is
  'Tarefa curta entregue a um Android oficial autenticado para comparar servidor e rede do aparelho.';

commit;
