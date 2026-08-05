begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(24);

select has_column('public', 'panel_playlists', 'playlist_qualification_status', 'Lista possui estado comercial');
select has_column('public', 'panel_devices', 'is_playlist_validation_device', 'Aparelho pode ser reservado para validação');
select has_table('public', 'panel_playlist_validation_sessions', 'Sessões de validação existem');
select has_function('public', 'playlist_is_commercially_usable', array['uuid'], 'Decisão comercial existe no banco');
select has_function(
  'public',
  'start_playlist_validation_session',
  array['uuid', 'uuid', 'integer', 'uuid'],
  'Sessão direta pode ser iniciada de forma transacional'
);

insert into public.panel_sellers (
  id, name, whatsapp, status, credit_balance, can_go_negative
) values (
  '00000000-0000-0000-0000-00000000a001',
  'Vendedor Qualificação',
  '55110000A001',
  'active',
  10,
  false
);

insert into public.panel_plans (
  id, name, duration_days, credit_cost, max_devices, status
) values (
  '00000000-0000-0000-0000-00000000a101',
  'Plano Qualificação',
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
) values
  (
    '00000000-0000-0000-0000-00000000a201',
    'Cache Homologado',
    'http://127.0.0.1/cache/get.php?username=fixture&password=fixture',
    'xtream',
    true,
    'server_cache',
    'ready',
    25,
    null,
    null
  ),
  (
    '00000000-0000-0000-0000-00000000a202',
    'Direto Pendente',
    'http://127.0.0.1/direct/get.php?username=fixture&password=fixture',
    'xtream',
    true,
    'direct',
    'error',
    0,
    'DATACENTER_TIMEOUT',
    'Timeout em http://127.0.0.1/direct/get.php?username=segredo&password=segredo'
  ),
  (
    '00000000-0000-0000-0000-00000000a203',
    'Credencial Bloqueada',
    'http://127.0.0.1/blocked/get.php?username=fixture&password=fixture',
    'xtream',
    true,
    'blocked',
    'error',
    0,
    'INVALID_CREDENTIALS',
    'Falha em http://127.0.0.1/blocked/get.php?username=segredo&password=segredo'
  );

insert into public.panel_seller_playlists (seller_id, playlist_id, active)
values
  ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a201', true),
  ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a202', true),
  ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a203', true);

insert into public.panel_devices (
  id,
  device_code,
  status,
  device_credential_hash,
  is_playlist_validation_device
) values
  (
    '00000000-0000-0000-0000-00000000a301',
    'RPTV-QUAL01',
    'pending',
    repeat('a', 64),
    false
  ),
  (
    '00000000-0000-0000-0000-00000000a302',
    'RPTV-LABQ01',
    'pending',
    repeat('b', 64),
    true
  );

select is(
  (select playlist_qualification_status from public.panel_playlists where id = '00000000-0000-0000-0000-00000000a201'),
  'ready_cache',
  'Cache concluído é homologado automaticamente'
);
select ok(
  public.playlist_is_commercially_usable('00000000-0000-0000-0000-00000000a201'),
  'Cache homologado pode ser comercializado'
);
select is(
  (select playlist_qualification_status from public.panel_playlists where id = '00000000-0000-0000-0000-00000000a202'),
  'awaiting_device_test',
  'Timeout de datacenter exige teste real no aparelho'
);
select ok(
  not public.playlist_is_commercially_usable('00000000-0000-0000-0000-00000000a202'),
  'Acesso direto ainda não comprovado não pode ser comercializado'
);
select is(
  (select playlist_qualification_status from public.panel_playlists where id = '00000000-0000-0000-0000-00000000a203'),
  'blocked',
  'Credencial inválida bloqueia a lista'
);
select ok(
  position('segredo' in coalesce((
    select playlist_qualification_message
    from public.panel_playlists
    where id = '00000000-0000-0000-0000-00000000a203'
  ), '')) = 0,
  'Mensagem comercial não expõe credenciais'
);

select throws_ok(
  $$select * from public.apply_device_subscription_transaction(
    '00000000-0000-0000-0000-00000000a001',
    '00000000-0000-0000-0000-00000000a301',
    '00000000-0000-0000-0000-00000000a101',
    '00000000-0000-0000-0000-00000000a202',
    '2099-01-01 00:00:00+00',
    'activation',
    'qualification-test',
    'pending-direct-must-fail',
    null,
    'Cliente Pendente',
    true
  )$$,
  'P0001',
  'Lista principal ainda não está homologada para ativação. Estado: aguardando teste no aparelho.',
  'Lista direta pendente é rejeitada antes da cobrança'
);
select is(
  (select credit_balance from public.panel_sellers where id = '00000000-0000-0000-0000-00000000a001'),
  10,
  'Falha de homologação preserva o saldo'
);

select lives_ok(
  $$select * from public.start_playlist_validation_session(
    '00000000-0000-0000-0000-00000000a202',
    '00000000-0000-0000-0000-00000000a302',
    15,
    null
  )$$,
  'Sessão direta inicia sem venda'
);
select is(
  (select status from public.panel_playlist_validation_sessions where playlist_id = '00000000-0000-0000-0000-00000000a202'),
  'active',
  'Sessão fica ativa somente no aparelho de validação'
);
select is(
  (select count(*)::integer from public.panel_credit_ledger where seller_id = '00000000-0000-0000-0000-00000000a001'),
  0,
  'Sessão de validação não cria lançamento financeiro'
);
select ok(
  public.mark_playlist_direct_success(
    '00000000-0000-0000-0000-00000000a202',
    '00000000-0000-0000-0000-00000000a302'
  ),
  'Sucesso do aparelho autorizado promove a lista'
);
select is(
  (select playlist_qualification_status from public.panel_playlists where id = '00000000-0000-0000-0000-00000000a202'),
  'ready_direct',
  'Lista direta comprovada fica homologada'
);
select is(
  (select status from public.panel_playlist_validation_sessions where playlist_id = '00000000-0000-0000-0000-00000000a202'),
  'succeeded',
  'Sessão é encerrada como sucesso'
);

select lives_ok(
  $$select * from public.apply_device_subscription_transaction(
    '00000000-0000-0000-0000-00000000a001',
    '00000000-0000-0000-0000-00000000a301',
    '00000000-0000-0000-0000-00000000a101',
    '00000000-0000-0000-0000-00000000a202',
    '2099-01-01 00:00:00+00',
    'activation',
    'qualification-test',
    'confirmed-direct-must-pass',
    null,
    'Cliente Homologado',
    true
  )$$,
  'Lista direta homologada pode ser ativada'
);
select is(
  (select credit_balance from public.panel_sellers where id = '00000000-0000-0000-0000-00000000a001'),
  8,
  'Crédito é consumido somente após a homologação'
);
select is(
  (select status from public.panel_devices where id = '00000000-0000-0000-0000-00000000a301'),
  'active',
  'Aparelho comercial é ativado após a homologação'
);

update public.panel_playlists
set playlist_url = 'http://127.0.0.1/direct-alterado/get.php?username=fixture&password=fixture'
where id = '00000000-0000-0000-0000-00000000a202';

select is(
  (select playlist_qualification_status from public.panel_playlists where id = '00000000-0000-0000-0000-00000000a202'),
  'validating',
  'Alteração da origem invalida a homologação anterior'
);
select ok(
  not public.playlist_is_commercially_usable('00000000-0000-0000-0000-00000000a202'),
  'Origem alterada precisa ser homologada novamente'
);

select * from finish();
rollback;
