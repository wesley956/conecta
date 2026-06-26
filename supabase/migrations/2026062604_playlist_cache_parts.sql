alter table public.panel_playlists
  add column if not exists playlist_cache_manifest_path text,
  add column if not exists playlist_cache_channels_path text,
  add column if not exists playlist_cache_movies_path text,
  add column if not exists playlist_cache_series_path text;
