begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(37);

select has_table(
  'public',
  'panel_device_commercial_operations',
  'Fluxo canônico possui registro próprio de idempotência'
);

select has_function(
  'public',
  'seller_device_flow_transaction',
  array[
    'uuid','uuid','text','text','uuid','uuid','uuid','timestamp with time zone',
    'uuid','text','text','text','text','uuid'
  ],
  'RPC canônica do fluxo comercial existe'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.seller_device_flow_transaction(uuid,uuid,text,text,uuid,uuid,uuid,timestamp with time zone,uuid,text,text,text,text,uuid)',
    'execute'
  ),
  'anon não pode executar o fluxo comercial diretamente'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.seller_device_flow_transaction(uuid,uuid,text,text,uuid,uuid,uuid,timestamp with time zone,uuid,text,text,text,text,uuid)',
    'execute'
  ),
  'authenticated não pode executar o fluxo comercial diretamente'
);

insert into public.panel_sellers (
  id, name, whatsapp, status, credit_balance, can_go_negative
) values
  ('20000000-0000-4000-8000-000000000001', 'Vendedor Canônico', '551199990001', 'active', 10, false),
  ('20000000-0000-4000-8000-000000000002', 'Vendedor Sem Saldo Canônico', '551199990002', 'active', 0, false);

insert into public.panel_plans (
  id, name, duration_days, credit_cost, max_devices, status
) values (
  '20000000-0000-4000-8000-000000000101',
  'Plano Canônico',
  30,
  2,
  1,
  'active'
);

insert into public.panel_playlists (
  id, name, playlist_url, playlist_type, active,
  playlist_access_mode, playlist_cache_status, playlist_cache_item_count, playlist_cache_updated_at
) values
  ('20000000-0000-4000-8000-000000000201', 'Lista Canônica A', 'https://canonical-a.invalid/get.m3u', 'm3u', true, 'server_cache', 'ready', 10, now()),
  ('20000000-0000-4000-8000-000000000202', 'Lista Canônica B', 'https://canonical-b.invalid/get.m3u', 'm3u', true, 'server_cache', 'ready', 10, now()),
  ('20000000-0000-4000-8000-000000000203', 'Lista Canônica C', 'https://canonical-c.invalid/get.m3u', 'm3u', true, 'server_cache', 'ready', 10, now());

insert into public.panel_seller_playlists(seller_id, playlist_id, active)
select seller_id, playlist_id, true
from (
  values
    ('20000000-0000-4000-8000-000000000001'::uuid),
    ('20000000-0000-4000-8000-000000000002'::uuid)
) sellers(seller_id)
cross join (
  values
    ('20000000-0000-4000-8000-000000000201'::uuid),
    ('20000000-0000-4000-8000-000000000202'::uuid),
    ('20000000-0000-4000-8000-000000000203'::uuid)
) playlists(playlist_id);

insert into public.panel_customers(id, seller_id, name, whatsapp, status)
values (
  '20000000-0000-4000-8000-000000000301',
  '20000000-0000-4000-8000-000000000001',
  'Cliente Canônico',
  '551198880001',
  'active'
);

insert into public.panel_devices(id, device_code, status)
values
  ('20000000-0000-4000-8000-000000000401', 'RPTV-CANON1', 'pending'),
  ('20000000-0000-4000-8000-000000000402', 'RPTV-CANON2', 'pending');

select lives_ok(
  $$select public.seller_device_flow_transaction(
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000401',
    'activation',
    'canonical-activation-1',
    '20000000-0000-4000-8000-000000000101',
    '20000000-0000-4000-8000-000000000201',
    '20000000-0000-4000-8000-000000000202',
    '2099-01-01 00:00:00+00',
    '20000000-0000-4000-8000-000000000301',
    null,
    null,
    null,
    'seller-device-flow:seller:test',
    null
  )$$,
  'Ativação canônica com lista reserva é aplicada'
);

select is(
  (select credit_balance from public.panel_sellers where id = '20000000-0000-4000-8000-000000000001'),
  8,
  'Ativação canônica debita o custo do plano uma vez'
);

select is(
  (select status from public.panel_devices where id = '20000000-0000-4000-8000-000000000401'),
  'active',
  'Ativação canônica deixa o aparelho ativo'
);

select is(
  (select playlist_id from public.panel_devices where id = '20000000-0000-4000-8000-000000000401'),
  '20000000-0000-4000-8000-000000000201'::uuid,
  'Ativação canônica grava a lista principal no aparelho'
);

select is(
  (select playlist_id from public.panel_device_playlists
    where device_id = '20000000-0000-4000-8000-000000000401' and priority = 2 and active is true),
  '20000000-0000-4000-8000-000000000202'::uuid,
  'Ativação canônica grava a lista reserva na mesma transação'
);

select is(
  (select count(*)::integer from public.panel_device_commercial_operations
    where seller_id = '20000000-0000-4000-8000-000000000001'
      and idempotency_key = 'canonical-activation-1'),
  1,
  'Ativação canônica registra uma única operação comercial'
);

select is(
  (select count(*)::integer from public.panel_audit_logs
    where entity_id = '20000000-0000-4000-8000-000000000401'
      and action = 'device.activated_canonical'),
  1,
  'Ativação canônica gera auditoria'
);

select is(
  (public.seller_device_flow_transaction(
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000401',
    'activation',
    'canonical-activation-1',
    '20000000-0000-4000-8000-000000000101',
    '20000000-0000-4000-8000-000000000201',
    '20000000-0000-4000-8000-000000000202',
    '2099-01-01 00:00:00+00',
    '20000000-0000-4000-8000-000000000301',
    null, null, null, 'seller-device-flow:seller:test', null
  )->>'applied')::boolean,
  false,
  'Retry idêntico da ativação retorna replay idempotente'
);

select is(
  (select credit_balance from public.panel_sellers where id = '20000000-0000-4000-8000-000000000001'),
  8,
  'Retry da ativação não cobra crédito novamente'
);

select throws_ok(
  $$select public.seller_device_flow_transaction(
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000401',
    'activation',
    'canonical-activation-1',
    '20000000-0000-4000-8000-000000000101',
    '20000000-0000-4000-8000-000000000201',
    '20000000-0000-4000-8000-000000000202',
    '2099-01-02 00:00:00+00',
    '20000000-0000-4000-8000-000000000301',
    null, null, null, 'seller-device-flow:seller:test', null
  )$$,
  '23505',
  'Chave de idempotência já utilizada em outra operação.',
  'Mesma chave não pode representar outra intenção comercial'
);

select lives_ok(
  $$select public.seller_device_flow_transaction(
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000401',
    'renewal',
    'canonical-renewal-1',
    '20000000-0000-4000-8000-000000000101',
    null,
    null,
    '2099-02-01 00:00:00+00',
    null, null, null, null,
    'seller-device-flow:seller:test',
    null
  )$$,
  'Renovação canônica é aplicada sem reenviar cliente ou listas'
);

select is(
  (select credit_balance from public.panel_sellers where id = '20000000-0000-4000-8000-000000000001'),
  6,
  'Renovação canônica debita somente o custo do plano'
);

select is(
  (select subscription_expires_at from public.panel_devices where id = '20000000-0000-4000-8000-000000000401'),
  '2099-02-01 00:00:00+00'::timestamptz,
  'Renovação canônica amplia a validade'
);

select is(
  (select customer_id from public.panel_devices where id = '20000000-0000-4000-8000-000000000401'),
  '20000000-0000-4000-8000-000000000301'::uuid,
  'Renovação preserva o cliente'
);

select is(
  (select playlist_id from public.panel_device_playlists
    where device_id = '20000000-0000-4000-8000-000000000401' and priority = 1 and active is true),
  '20000000-0000-4000-8000-000000000201'::uuid,
  'Renovação preserva a lista principal'
);

select is(
  (select playlist_id from public.panel_device_playlists
    where device_id = '20000000-0000-4000-8000-000000000401' and priority = 2 and active is true),
  '20000000-0000-4000-8000-000000000202'::uuid,
  'Renovação preserva a lista reserva'
);

select is(
  (public.seller_device_flow_transaction(
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000401',
    'renewal',
    'canonical-renewal-1',
    '20000000-0000-4000-8000-000000000101',
    null, null,
    '2099-02-01 00:00:00+00',
    null, null, null, null,
    'seller-device-flow:seller:test', null
  )->>'applied')::boolean,
  false,
  'Retry idêntico da renovação retorna replay idempotente'
);

select is(
  (select credit_balance from public.panel_sellers where id = '20000000-0000-4000-8000-000000000001'),
  6,
  'Retry da renovação não cobra novamente'
);

select lives_ok(
  $$select public.seller_device_flow_transaction(
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000401',
    'change_playlists',
    'canonical-change-1',
    null,
    '20000000-0000-4000-8000-000000000203',
    '20000000-0000-4000-8000-000000000201',
    null,
    null, null, null,
    'Troca comercial de teste',
    'seller-device-flow:seller:test',
    null
  )$$,
  'Troca canônica de listas é aplicada sem plano ou validade'
);

select is(
  (select playlist_id from public.panel_device_playlists
    where device_id = '20000000-0000-4000-8000-000000000401' and priority = 1 and active is true),
  '20000000-0000-4000-8000-000000000203'::uuid,
  'Troca canônica atualiza a principal'
);

select is(
  (select playlist_id from public.panel_device_playlists
    where device_id = '20000000-0000-4000-8000-000000000401' and priority = 2 and active is true),
  '20000000-0000-4000-8000-000000000201'::uuid,
  'Troca canônica atualiza a reserva'
);

select is(
  (select credit_balance from public.panel_sellers where id = '20000000-0000-4000-8000-000000000001'),
  6,
  'Troca de listas não consome crédito'
);

select is(
  (select subscription_expires_at from public.panel_devices where id = '20000000-0000-4000-8000-000000000401'),
  '2099-02-01 00:00:00+00'::timestamptz,
  'Troca de listas não altera a validade'
);

select is(
  (select plan_id from public.panel_devices where id = '20000000-0000-4000-8000-000000000401'),
  '20000000-0000-4000-8000-000000000101'::uuid,
  'Troca de listas não altera o plano'
);

select is(
  (select count(*)::integer from public.panel_device_playlist_revisions
    where device_id = '20000000-0000-4000-8000-000000000401'
      and performed_by = 'seller-device-flow:seller:test'),
  2,
  'Troca de principal e reserva registra duas revisões auditáveis'
);

select is(
  (select count(*)::integer from public.panel_audit_logs
    where entity_id = '20000000-0000-4000-8000-000000000401'
      and action = 'device.playlists_changed_canonical'),
  1,
  'Troca de listas gera auditoria canônica'
);

select throws_ok(
  $$select public.seller_device_flow_transaction(
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000401',
    'change_playlists',
    'canonical-change-invalid-plan',
    '20000000-0000-4000-8000-000000000101',
    '20000000-0000-4000-8000-000000000201',
    '20000000-0000-4000-8000-000000000202',
    null,
    null, null, null, null,
    'seller-device-flow:seller:test', null
  )$$,
  '22023',
  'Alterar listas não muda cliente, plano, validade ou crédito.',
  'Troca de listas rejeita tentativa de alterar plano'
);

select throws_ok(
  $$select public.seller_device_flow_transaction(
    '20000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000402',
    'activation',
    'canonical-no-balance-1',
    '20000000-0000-4000-8000-000000000101',
    '20000000-0000-4000-8000-000000000201',
    '20000000-0000-4000-8000-000000000202',
    '2099-01-01 00:00:00+00',
    null,
    'Cliente Sem Saldo Novo',
    '551197770002',
    null,
    'seller-device-flow:seller:test',
    null
  )$$,
  'P0001',
  'Saldo insuficiente. Saldo atual: 0. Custo: 2.',
  'Saldo insuficiente aborta a ativação canônica'
);

select is(
  (select status from public.panel_devices where id = '20000000-0000-4000-8000-000000000402'),
  'pending',
  'Falha por saldo deixa o aparelho pendente'
);

select is(
  (select credit_balance from public.panel_sellers where id = '20000000-0000-4000-8000-000000000002'),
  0,
  'Falha por saldo preserva o saldo'
);

select is(
  (select count(*)::integer from public.panel_customers
    where seller_id = '20000000-0000-4000-8000-000000000002'
      and whatsapp = '551197770002'),
  0,
  'Falha por saldo reverte o cliente criado dentro da transação'
);

select is(
  (select count(*)::integer from public.panel_device_commercial_operations
    where seller_id = '20000000-0000-4000-8000-000000000002'
      and idempotency_key = 'canonical-no-balance-1'),
  0,
  'Falha por saldo não persiste operação parcial'
);

select is(
  (select count(*)::integer from public.panel_credit_ledger
    where seller_id = '20000000-0000-4000-8000-000000000002'),
  0,
  'Falha por saldo não cria lançamento de crédito'
);

select * from finish();
rollback;
