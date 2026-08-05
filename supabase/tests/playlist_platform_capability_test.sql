begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(6);

insert into public.panel_sellers (
  id, name, whatsapp, status, credit_balance, can_go_negative
) values (
  '00000000-0000-0000-0000-00000000b001',
  'Vendedor Plataforma',
  '55110000B001',
  'active',
  10,
  false
);

insert into public.panel_plans (
  id, name, duration_days, credit_cost, max_devices, status
) values (
  '00000000-0000-0000-0000-00000000b101',
  'Plano Plataforma',
  30,
  2,
  1,
  'active'
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
  'Direto Android',
  'http://127.0.0.1/platform/get.php?username=fixture&password=fixture',
  'xtream',
  true,
  'direct',
  'error',
  0,
  'DATACENTER_TIMEOUT',
  'O datacenter não recebeu a resposta.'
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
  device_type,
  status,
  device_credential_hash,
  is_playlist_validation_device
) values
  (
    '00000000-0000-0000-0000-00000000b301',
    'RPTV-LABP01',
    'androidtv',
    'pending',
    repeat('c', 64),
    true
  ),
  (
    '00000000-0000-0000-0000-00000000b302',
    'RPTV-TIZEN1',
    'tizen',
    'pending',
    repeat('d', 64),
    false
  ),
  (
    '00000000-0000-0000-0000-00000000b303',
    'RPTV-ANDR01',
    'androidtv',
    'pending',
    repeat('e', 64),
    false
  );

select lives_ok(
  $$select * from public.start_playlist_validation_session(
    '00000000-0000-0000-0000-00000000b201',
    '00000000-0000-0000-0000-00000000b301',
    15,
    null
  )$$,
  'Android pode iniciar a homologação direta'
);

select ok(
  public.mark_playlist_direct_success(
    '00000000-0000-0000-0000-00000000b201',
    '00000000-0000-0000-0000-00000000b301'
  ),
  'Android pode confirmar a lista direta'
);

select throws_ok(
  $$select * from public.apply_device_subscription_transaction(
    '00000000-0000-0000-0000-00000000b001',
    '00000000-0000-0000-0000-00000000b302',
    '00000000-0000-0000-0000-00000000b101',
    '00000000-0000-0000-0000-00000000b201',
    '2099-01-01 00:00:00+00',
    'activation',
    'platform-test',
    'tizen-direct-must-fail',
    null,
    'Cliente Tizen',
    true
  )$$,
  'P0001',
  'Lista principal utiliza acesso direto, que nesta etapa está homologado somente para Android.',
  'Tizen não consome uma lista somente direta'
);

select is(
  (select credit_balance from public.panel_sellers where id = '00000000-0000-0000-0000-00000000b001'),
  10,
  'Recusa por plataforma preserva o saldo'
);

select lives_ok(
  $$select * from public.apply_device_subscription_transaction(
    '00000000-0000-0000-0000-00000000b001',
    '00000000-0000-0000-0000-00000000b303',
    '00000000-0000-0000-0000-00000000b101',
    '00000000-0000-0000-0000-00000000b201',
    '2099-01-01 00:00:00+00',
    'activation',
    'platform-test',
    'android-direct-must-pass',
    null,
    'Cliente Android',
    true
  )$$,
  'Android pode ativar a lista direta homologada'
);

select is(
  (select credit_balance from public.panel_sellers where id = '00000000-0000-0000-0000-00000000b001'),
  8,
  'Android consome crédito somente após a homologação'
);

select * from finish();
rollback;
