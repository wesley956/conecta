create table if not exists public.playlist_cache_generation_lock (
  id text primary key check (id = 'global'),
  playlist_id uuid not null references public.panel_playlists(id) on delete cascade,
  token uuid not null,
  started_at timestamptz not null default now()
);

alter table public.playlist_cache_generation_lock enable row level security;

revoke all on table public.playlist_cache_generation_lock from anon, authenticated;
grant select, insert, update, delete on table public.playlist_cache_generation_lock to service_role;
