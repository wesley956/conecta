alter table public.panel_playlists
  add column if not exists playlist_cache_status text not null default 'missing',
  add column if not exists playlist_cache_path text,
  add column if not exists playlist_cache_version text,
  add column if not exists playlist_cache_updated_at timestamptz,
  add column if not exists playlist_cache_item_count integer not null default 0,
  add column if not exists playlist_cache_size_bytes integer not null default 0,
  add column if not exists playlist_cache_error text;

create index if not exists panel_playlists_cache_status_idx
  on public.panel_playlists(playlist_cache_status);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'playlist-cache',
  'playlist-cache',
  false,
  104857600,
  array['application/json', 'application/octet-stream']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
