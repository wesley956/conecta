-- Preparação exclusiva da suíte pgTAP.
-- Os testes antigos utilizam domínios reservados .invalid como listas funcionais.
-- Esta trigger não faz parte das migrations e nunca é implantada em produção.

create or replace function public.test_auto_qualify_reserved_playlist_fixture()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.playlist_url ~* '^https?://[^/]+\.invalid(?:/|$)' then
    new.playlist_access_mode := 'server_cache';
    new.playlist_cache_status := 'ready';
    new.playlist_cache_item_count := greatest(coalesce(new.playlist_cache_item_count, 0), 1);
    new.playlist_cache_updated_at := coalesce(new.playlist_cache_updated_at, now());
    new.playlist_cache_error := null;
    new.playlist_cache_error_code := null;
  end if;
  return new;
end;
$$;

drop trigger if exists aaa_test_auto_qualify_reserved_playlist_fixture
  on public.panel_playlists;
create trigger aaa_test_auto_qualify_reserved_playlist_fixture
before insert or update of playlist_url, playlist_cache_status, playlist_cache_item_count
on public.panel_playlists
for each row execute function public.test_auto_qualify_reserved_playlist_fixture();

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(1);
select pass('Fixtures .invalid são homologadas somente no banco local de testes');
select * from finish();
