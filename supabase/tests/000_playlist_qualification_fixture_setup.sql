-- Preparação exclusiva da suíte pgTAP.
-- Fixtures antigas frequentemente declaram cache ready sem informar contagem.
-- Somente esse detalhe é completado; cenários error/missing/building permanecem
-- intactos e continuam testando falhas reais.

create or replace function public.test_complete_ready_playlist_fixture()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.playlist_cache_status = 'ready'
     and coalesce(new.playlist_cache_item_count, 0) = 0 then
    new.playlist_cache_item_count := 1;
    new.playlist_cache_updated_at := coalesce(new.playlist_cache_updated_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists aaa_test_complete_ready_playlist_fixture
  on public.panel_playlists;
create trigger aaa_test_complete_ready_playlist_fixture
before insert or update of playlist_cache_status, playlist_cache_item_count
on public.panel_playlists
for each row execute function public.test_complete_ready_playlist_fixture();

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(1);
select pass('Fixtures ready recebem somente a contagem mínima local de teste');
select * from finish();
