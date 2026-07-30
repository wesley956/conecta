alter table public.panel_playlists
  add column if not exists playlist_access_mode text not null default 'server_cache',
  add column if not exists playlist_cache_error_code text,
  add column if not exists playlist_cache_attempts jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'panel_playlists_access_mode_check'
      and conrelid = 'public.panel_playlists'::regclass
  ) then
    alter table public.panel_playlists
      add constraint panel_playlists_access_mode_check
      check (playlist_access_mode in ('server_cache', 'direct', 'blocked'));
  end if;
end
$$;

update public.panel_playlists
set
  playlist_access_mode = case
    when playlist_cache_status = 'ready' then 'server_cache'
    when playlist_cache_status = 'error'
      and playlist_type in ('m3u', 'xtream')
      and (
        playlist_cache_error ~* '(tempo limite|timeout|timed out|fetch failed|connection (reset|refused)|network error|dns)'
        or playlist_cache_error ~* 'HTTP (403|406|409|418|429|451|500|502|503|504|520|521|522|523|524)'
        or playlist_cache_error ~* 'HTTP 404'
      )
      and playlist_cache_error !~* '(HTTP 401|não autoriz|nao autoriz|unauthori[sz]ed|invalid (user|username|password|credential)|credencia)'
      then 'direct'
    when playlist_cache_status = 'error' then 'blocked'
    else 'server_cache'
  end,
  playlist_cache_error_code = case
    when playlist_cache_status = 'ready' then null
    when playlist_cache_status = 'error'
      and playlist_cache_error ~* '(tempo limite|timeout|timed out)'
      then 'DATACENTER_TIMEOUT'
    when playlist_cache_status = 'error'
      and playlist_cache_error ~* 'HTTP 404'
      then 'DATACENTER_HTTP_404'
    when playlist_cache_status = 'error'
      and playlist_cache_error ~* 'HTTP (403|406|409|418|429|451|500|502|503|504|520|521|522|523|524)'
      then 'DATACENTER_BLOCKED'
    when playlist_cache_status = 'error' then 'CACHE_BUILD_FAILED'
    else null
  end
where playlist_access_mode = 'server_cache'
   or playlist_cache_error_code is null;

comment on column public.panel_playlists.playlist_access_mode is
  'server_cache usa o cache central; direct autoriza download residencial autenticado; blocked impede ativação.';
comment on column public.panel_playlists.playlist_cache_error_code is
  'Código estável e sem credenciais para diferenciar bloqueio de datacenter, credenciais e conteúdo inválido.';
comment on column public.panel_playlists.playlist_cache_attempts is
  'Diagnóstico separado das tentativas M3U e Xtream, sem armazenar a URL da origem.';
