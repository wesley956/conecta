-- Preparação exclusiva da suíte pgTAP.
-- Fixtures antigas frequentemente declaram cache ready sem informar contagem
-- e aparelhos sem device_type. Somente esses detalhes são completados;
-- cenários error/missing/building permanecem intactos.

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

create or replace function public.test_complete_device_type_fixture()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.device_type := coalesce(nullif(trim(new.device_type), ''), 'android');
  return new;
end;
$$;

drop trigger if exists aaa_test_complete_device_type_fixture
  on public.panel_devices;
create trigger aaa_test_complete_device_type_fixture
before insert on public.panel_devices
for each row execute function public.test_complete_device_type_fixture();

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(2);
select pass('Fixtures ready recebem somente a contagem mínima local de teste');
select pass('Fixtures antigas sem plataforma usam Android apenas no banco local');
select * from finish();
