create or replace function public.normalize_provider_http404_direct_fallback()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if lower(coalesce(new.playlist_type, '')) in ('m3u', 'xtream')
     and new.playlist_cache_status = 'error'
     and new.playlist_cache_error_code in ('PROVIDER_ENDPOINT_NOT_FOUND', 'DATACENTER_HTTP_404') then
    new.playlist_cache_error_code := 'DATACENTER_HTTP_404';
    new.playlist_access_mode := 'direct';
  end if;

  return new;
end;
$$;

drop trigger if exists panel_playlists_provider_http404_direct_fallback
  on public.panel_playlists;

create trigger panel_playlists_provider_http404_direct_fallback
before insert or update of playlist_cache_status, playlist_cache_error_code, playlist_access_mode, playlist_type
on public.panel_playlists
for each row
execute function public.normalize_provider_http404_direct_fallback();

update public.panel_playlists
set
  playlist_cache_error_code = 'DATACENTER_HTTP_404',
  playlist_access_mode = 'direct'
where lower(coalesce(playlist_type, '')) in ('m3u', 'xtream')
  and playlist_cache_status = 'error'
  and playlist_cache_error_code in ('PROVIDER_ENDPOINT_NOT_FOUND', 'DATACENTER_HTTP_404');

comment on function public.normalize_provider_http404_direct_fallback() is
  'Impede que provedores que ocultam endpoints de datacenters sejam bloqueados; aparelhos comerciais usam acesso direto.';
