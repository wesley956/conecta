create extension if not exists pgcrypto;

create table if not exists public.panel_playlists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  playlist_url text not null,
  playlist_type text not null default 'xtream',
  active boolean not null default true,
  playlist_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.panel_devices (
  id uuid primary key default gen_random_uuid(),
  device_code text not null unique,
  device_uuid text,
  client_name text,
  status text not null default 'pending' check (status in ('pending', 'active', 'blocked', 'expired', 'inactive')),
  playlist_id uuid references public.panel_playlists(id) on delete set null,
  subscription_expires_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.panel_playlists enable row level security;
alter table public.panel_devices enable row level security;

create index if not exists panel_devices_device_code_idx on public.panel_devices(device_code);
create index if not exists panel_devices_playlist_id_idx on public.panel_devices(playlist_id);
