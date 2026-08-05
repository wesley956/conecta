begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(5);

insert into public.panel_sellers (
  id, name, whatsapp, status, credit_balance, can_go_negative
) values (
  '00000000-0000-0000-0000-00000000c001',
  'Vendedor Cadastro Canônico',
  '55110000C001',
  'active',
  5,
  false
);

insert into public.panel_playlists (
  id,
  name,
  playlist_url,
  playlist_type,
  active,
  playlist_cache_status,
  playlist_cache_item_count,
  playlist_access_mode,
  source_fingerprint
) values (
  '00000000-0000-0000-0000-00000000c201',
  'Lista Legada Sem Fingerprint',
  'http://127.0.0.1/legacy/get.php?username=fixture&password=fixture',
  'xtream',
  true,
  'ready',
  15,
  'server_cache',
  null
);

create temporary table canonical_registration_result as
select *
from public.register_playlist_source_transaction(
  'Outro nome não deve duplicar',
  'http://127.0.0.1/legacy/get.php?username=fixture&password=fixture',
  'xtream',
  1,
  repeat('f', 64),
  '00000000-0000-0000-0000-00000000c001'
);

select is(
  (select playlist_id from canonical_registration_result),
  '00000000-0000-0000-0000-00000000c201'::uuid,
  'Cadastro retorna a linha legada equivalente'
);

select ok(
  not (select created from canonical_registration_result),
  'Origem legada é reutilizada em vez de criada novamente'
);

select is(
  (
    select count(*)::integer
    from public.panel_playlists
    where active is true
      and playlist_url = 'http://127.0.0.1/legacy/get.php?username=fixture&password=fixture'
  ),
  1,
  'Cadastro canônico não cria duplicata'
);

select is(
  (
    select source_fingerprint
    from public.panel_playlists
    where id = '00000000-0000-0000-0000-00000000c201'
  ),
  repeat('f', 64),
  'Fingerprint é preenchido no registro legado escolhido'
);

select ok(
  exists (
    select 1
    from public.panel_seller_playlists
    where seller_id = '00000000-0000-0000-0000-00000000c001'
      and playlist_id = '00000000-0000-0000-0000-00000000c201'
      and active is true
  ),
  'Permissão do vendedor é criada na mesma transação'
);

select * from finish();
rollback;
