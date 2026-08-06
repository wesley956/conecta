begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(8);

insert into public.panel_sellers (
  id, name, whatsapp, status, credit_balance, can_go_negative
) values (
  '00000000-0000-0000-0000-00000000b001',
  'Vendedor Homologação Vinculada',
  '55110000B001',
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
  playlist_access_mode,
  playlist_cache_status,
  playlist_cache_item_count,
  playlist_cache_error_code,
  playlist_cache_error
) values (
  '00000000-0000-0000-0000-00000000b201',
  'Direto do vendedor aguardando aparelho',
  'http://127.0.0.1/seller-linked/get.php?username=fixture&password=fixture',
  'xtream',
  true,
  'direct',
  'error',
  0,
  'DATACENTER_HTTP_404',
  'Servidor de teste respondeu HTTP 404.'
);

insert into public.panel_seller_playlists (seller_id, playlist_id, active)
values (
  '00000000-0000-0000-0000-00000000b001',
  '00000000-0000-0000-0000-00000000b201',
  true
);

insert into public.panel_devices (
  id,
  device_code,
  status,
  seller_id,
  device_type,
  device_credential_hash,
  is_playlist_validation_device
) values (
  '00000000-0000-0000-0000-00000000b301',
  'RPTV-SELLER-LAB',
  'pending',
  '00000000-0000-0000-0000-00000000b001',
  'android',
  repeat('c', 64),
  true
);

select is(
  (select playlist_qualification_status from public.panel_playlists where id = '00000000-0000-0000-0000-00000000b201'),
  'awaiting_device_test',
  'Lista direta do vendedor aguarda confirmação real no aparelho'
);

select lives_ok(
  $$select * from public.start_playlist_validation_session(
    '00000000-0000-0000-0000-00000000b201',
    '00000000-0000-0000-0000-00000000b301',
    15,
    null
  )$$,
  'Aparelho pendente do mesmo vendedor pode iniciar a homologação'
);

select is(
  (select status from public.panel_playlist_validation_sessions where playlist_id = '00000000-0000-0000-0000-00000000b201'),
  'active',
  'Sessão vinculada fica ativa'
);

select is(
  (select count(*)::integer from public.panel_credit_ledger where seller_id = '00000000-0000-0000-0000-00000000b001'),
  0,
  'Homologação vinculada não consome crédito'
);

select ok(
  public.mark_playlist_direct_success(
    '00000000-0000-0000-0000-00000000b201',
    '00000000-0000-0000-0000-00000000b301'
  ),
  'Sucesso real promove a lista do vendedor'
);

select is(
  (select playlist_qualification_status from public.panel_playlists where id = '00000000-0000-0000-0000-00000000b201'),
  'ready_direct',
  'Lista fica liberada para ativação'
);

select ok(
  not (select is_playlist_validation_device from public.panel_devices where id = '00000000-0000-0000-0000-00000000b301'),
  'Aparelho do vendedor volta automaticamente ao fluxo normal'
);

select is(
  (select seller_id from public.panel_devices where id = '00000000-0000-0000-0000-00000000b301'),
  '00000000-0000-0000-0000-00000000b001'::uuid,
  'Vínculo com o vendedor é preservado'
);

select * from finish();
rollback;
