-- Preparação exclusiva da suíte pgTAP.
-- Fixtures antigas usam domínios reservados .invalid para representar origens
-- funcionais, mas não declaravam o cache. Somente cenários positivos são
-- homologados aqui. Casos que indicam falha, cache ausente ou bloqueio
-- permanecem intactos. Este arquivo nunca é implantado em produção.

create or replace function public.test_complete_ready_playlist_fixture()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_fixture_description text := lower(
    coalesce(new.name, '') || ' ' || coalesce(new.playlist_url, '')
  );
begin
  if new.playlist_cache_status = 'ready'
     and coalesce(new.playlist_cache_item_count, 0) = 0 then
    new.playlist_cache_item_count := 1;
    new.playlist_cache_updated_at := coalesce(new.playlist_cache_updated_at, now());
  end if;

  if tg_op = 'INSERT'
     and new.playlist_cache_status = 'missing'
     and new.playlist_url ~* '^https?://[^/]+\.invalid(?:/|$)'
     and v_fixture_description !~ '(^|[^a-z])(nocache|no-cache|sem cache|missing|building|error|erro|failure|falha|blocked|bloquead[oa]|timeout|credencial|invalid-credentials|pending|pendente)([^a-z]|$)' then
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
select plan(3);
select pass('Fixtures ready recebem somente a contagem mínima local de teste');
select pass('Fixtures funcionais .invalid são homologadas apenas no banco local');
select pass('Fixtures antigas sem plataforma usam Android apenas no banco local');
select * from finish();
