begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(18);

select has_table('public', 'panel_device_playlist_operations', 'Operações idempotentes do aparelho existem');
select has_table('public', 'panel_device_playlist_revisions', 'Histórico de edição do aparelho existe');
select has_function(
  'public',
  'replace_device_playlist_transaction',
  array['uuid', 'smallint', 'uuid', 'text', 'text', 'uuid', 'text'],
  'RPC compatível com aparelhos atuais existe'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.replace_device_playlist_transaction(uuid,smallint,uuid,text,text,uuid,text)',
    'execute'
  ),
  'anon não troca lista diretamente'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.replace_device_playlist_transaction(uuid,smallint,uuid,text,text,uuid,text)',
    'execute'
  ),
  'usuário autenticado não chama a RPC diretamente'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.replace_device_playlist_transaction(uuid,smallint,uuid,text,text,uuid,text)',
    'execute'
  ),
  'service_role executa a troca protegida'
);

insert into public.panel_sellers (
  id, name, whatsapp, status, credit_balance, can_go_negative
) values (
  '00000000-0000-0000-0000-000000007001',
  'Vendedor compatível',
  '551199970001',
  'active',
  15,
  false
);

insert into public.panel_customers (
  id, seller_id, name, whatsapp, status
) values (
  '00000000-0000-0000-0000-000000007101',
  '00000000-0000-0000-0000-000000007001',
  'Cliente compatível',
  '551199977101',
  'active'
);

insert into public.panel_plans (
  id, name, duration_days, credit_cost, max_devices,
  simultaneous_connections, status
) values (
  '00000000-0000-0000-0000-000000007201',
  'Plano duas conexões',
  30,
  2,
  2,
  2,
  'active'
);

insert into public.panel_playlists (
  id, name, playlist_url, playlist_type, active, max_connections,
  playlist_cache_status, playlist_cache_path
) values
  (
    '00000000-0000-0000-0000-000000007301',
    'Origem antiga compartilhada',
    'https://old-legacy.invalid/get.php?username=old&password=old',
    'xtream',
    true,
    2,
    'ready',
    'tests/old-legacy.json'
  ),
  (
    '00000000-0000-0000-0000-000000007302',
    'Origem nova pronta',
    'https://new-legacy.invalid/get.php?username=new&password=new',
    'xtream',
    true,
    3,
    'ready',
    'tests/new-legacy.json'
  ),
  (
    '00000000-0000-0000-0000-000000007303',
    'Reserva nova pronta',
    'https://backup-legacy.invalid/get.php?username=b&password=b',
    'xtream',
    true,
    3,
    'ready',
    'tests/backup-legacy.json'
  ),
  (
    '00000000-0000-0000-0000-000000007304',
    'Origem sem cache',
    'https://nocache-legacy.invalid/get.php?username=x&password=x',
    'xtream',
    true,
    3,
    'error',
    null
  ),
  (
    '00000000-0000-0000-0000-000000007305',
    'Origem sem conexões',
    'https://low-legacy.invalid/get.php?username=x&password=x',
    'xtream',
    true,
    1,
    'ready',
    'tests/low-legacy.json'
  );

insert into public.panel_seller_playlists (seller_id, playlist_id, active) values
  ('00000000-0000-0000-0000-000000007001', '00000000-0000-0000-0000-000000007301', true),
  ('00000000-0000-0000-0000-000000007001', '00000000-0000-0000-0000-000000007302', true),
  ('00000000-0000-0000-0000-000000007001', '00000000-0000-0000-0000-000000007303', true),
  ('00000000-0000-0000-0000-000000007001', '00000000-0000-0000-0000-000000007304', true),
  ('00000000-0000-0000-0000-000000007001', '00000000-0000-0000-0000-000000007305', true);

insert into public.panel_devices (
  id, device_code, seller_id, customer_id, plan_id, status,
  subscription_expires_at, playlist_id
) values
  (
    '00000000-0000-0000-0000-000000007401',
    'RPTV-LEGACY-01',
    '00000000-0000-0000-0000-000000007001',
    '00000000-0000-0000-0000-000000007101',
    '00000000-0000-0000-0000-000000007201',
    'active',
    '2099-01-01 00:00:00+00',
    '00000000-0000-0000-0000-000000007301'
  ),
  (
    '00000000-0000-0000-0000-000000007402',
    'RPTV-LEGACY-02',
    '00000000-0000-0000-0000-000000007001',
    '00000000-0000-0000-0000-000000007101',
    '00000000-0000-0000-0000-000000007201',
    'active',
    '2099-01-01 00:00:00+00',
    '00000000-0000-0000-0000-000000007301'
  );

insert into public.panel_device_playlists (device_id, playlist_id, priority, active) values
  ('00000000-0000-0000-0000-000000007401', '00000000-0000-0000-0000-000000007301', 1, true),
  ('00000000-0000-0000-0000-000000007402', '00000000-0000-0000-0000-000000007301', 1, true);

select lives_ok(
  $$select * from public.replace_device_playlist_transaction(
    '00000000-0000-0000-0000-000000007401',
    1::smallint,
    '00000000-0000-0000-0000-000000007302',
    'Corrigir senha digitada',
    'teste',
    null,
    'legacy-primary-key'
  )$$,
  'Lista principal pronta é aplicada ao aparelho escolhido'
);

select is(
  (select playlist_id from public.panel_devices where id = '00000000-0000-0000-0000-000000007401'),
  '00000000-0000-0000-0000-000000007302'::uuid,
  'Aparelho editado aponta para a origem nova'
);

select is(
  (select playlist_id from public.panel_devices where id = '00000000-0000-0000-0000-000000007402'),
  '00000000-0000-0000-0000-000000007301'::uuid,
  'Outro aparelho que usava a origem antiga não é alterado'
);

select is(
  (select active from public.panel_playlists where id = '00000000-0000-0000-0000-000000007301'),
  true,
  'Origem antiga compartilhada permanece ativa'
);

select is(
  (select credit_balance from public.panel_sellers where id = '00000000-0000-0000-0000-000000007001'),
  15,
  'Editar lista não cobra créditos'
);

select is(
  (select applied from public.replace_device_playlist_transaction(
    '00000000-0000-0000-0000-000000007401',
    1::smallint,
    '00000000-0000-0000-0000-000000007302',
    'Corrigir senha digitada',
    'teste',
    null,
    'legacy-primary-key'
  )),
  false,
  'Retry idempotente não reaplica a troca'
);

select is(
  (select count(*)::integer from public.panel_device_playlist_revisions
    where device_id = '00000000-0000-0000-0000-000000007401'),
  1,
  'Retry não duplica o histórico'
);

select lives_ok(
  $$select * from public.replace_device_playlist_transaction(
    '00000000-0000-0000-0000-000000007401',
    2::smallint,
    '00000000-0000-0000-0000-000000007303',
    'Adicionar redundância',
    'teste',
    null,
    'legacy-backup-key'
  )$$,
  'Lista reserva pode ser adicionada ao aparelho atual'
);

select is(
  (select playlist_id from public.panel_device_playlists
    where device_id = '00000000-0000-0000-0000-000000007401' and priority = 2),
  '00000000-0000-0000-0000-000000007303'::uuid,
  'Reserva fica vinculada na posição correta'
);

select throws_ok(
  $$select * from public.replace_device_playlist_transaction(
    '00000000-0000-0000-0000-000000007401',
    1::smallint,
    '00000000-0000-0000-0000-000000007304',
    'Origem sem cache',
    'teste',
    null,
    'legacy-nocache-key'
  )$$,
  'P0001',
  'A nova lista ainda não possui cache válido.',
  'Origem sem cache pronto é recusada'
);

select throws_ok(
  $$select * from public.replace_device_playlist_transaction(
    '00000000-0000-0000-0000-000000007401',
    1::smallint,
    '00000000-0000-0000-0000-000000007305',
    'Origem sem conexões',
    'teste',
    null,
    'legacy-low-key'
  )$$,
  'P0001',
  'A nova lista não suporta as conexões simultâneas do plano.',
  'Origem com conexões insuficientes é recusada'
);

select is(
  (select playlist_id from public.panel_devices where id = '00000000-0000-0000-0000-000000007401'),
  '00000000-0000-0000-0000-000000007302'::uuid,
  'Falhas preservam a lista principal válida'
);

select is(
  (select count(*)::integer from public.panel_audit_logs
    where action = 'device.playlist_replaced'
      and entity_id = '00000000-0000-0000-0000-000000007401'),
  2,
  'Principal e reserva geram auditoria'
);

select * from finish();
rollback;
