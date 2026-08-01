begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select no_plan();

select has_function(
  'public',
  'apply_device_subscription_complete_transaction',
  array['uuid', 'uuid', 'uuid', 'uuid', 'uuid', 'timestamp with time zone', 'text', 'text', 'text', 'uuid', 'text', 'boolean'],
  'RPC comercial completa existe'
);
select has_function(
  'public',
  'set_device_playlists_transaction',
  array['uuid', 'uuid', 'uuid', 'uuid', 'boolean'],
  'RPC transacional do par principal/reserva existe'
);
select has_function(
  'public',
  'remove_seller_playlist_transaction',
  array['uuid', 'uuid'],
  'RPC transacional de remoção do vendedor existe'
);
select has_function(
  'public',
  'delete_playlist_with_reassignment',
  array['uuid'],
  'RPC transacional de exclusão global existe'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.apply_device_subscription_complete_transaction(uuid,uuid,uuid,uuid,uuid,timestamp with time zone,text,text,text,uuid,text,boolean)',
    'execute'
  ),
  'anon não executa a operação comercial completa'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.delete_playlist_with_reassignment(uuid)',
    'execute'
  ),
  'authenticated não exclui playlists globalmente'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.apply_device_subscription_complete_transaction(uuid,uuid,uuid,uuid,uuid,timestamp with time zone,text,text,text,uuid,text,boolean)',
    'execute'
  ),
  'service_role executa a operação comercial completa'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.set_device_playlists_transaction(uuid,uuid,uuid,uuid,boolean)',
    'execute'
  ),
  'service_role troca as listas do aparelho'
);
select ok(
  pg_get_functiondef(
    'public.apply_device_subscription_complete_transaction(uuid,uuid,uuid,uuid,uuid,timestamp with time zone,text,text,text,uuid,text,boolean)'::regprocedure
  ) like '%pg_advisory_xact_lock%',
  'Ativação participa da trava transacional por playlist'
);
select ok(
  pg_get_functiondef('public.delete_playlist_with_reassignment(uuid)'::regprocedure)
    like '%pg_advisory_xact_lock%',
  'Exclusão participa da mesma trava por playlist'
);

insert into public.panel_sellers (
  id, name, whatsapp, status, credit_balance, can_go_negative
) values
  ('00000000-0000-0000-0000-00000000c001', 'Vendedor Consistente', '55119999C001', 'active', 20, false),
  ('00000000-0000-0000-0000-00000000c002', 'Vendedor Isolado', '55119999C002', 'active', 20, false);

insert into public.panel_customers (
  id, name, whatsapp, seller_id, status
) values (
  '00000000-0000-0000-0000-00000000c101',
  'Cliente Consistente',
  '55118888C101',
  '00000000-0000-0000-0000-00000000c001',
  'active'
);

insert into public.panel_plans (
  id, name, duration_days, credit_cost, max_devices, status
) values (
  '00000000-0000-0000-0000-00000000c201',
  'Plano Consistente',
  30,
  2,
  2,
  'active'
);

insert into public.panel_playlists (
  id, name, playlist_url, playlist_type, active
) values
  ('00000000-0000-0000-0000-00000000c301', 'Principal Comercial', 'https://example.invalid/c301.m3u', 'm3u', true),
  ('00000000-0000-0000-0000-00000000c302', 'Reserva Comercial', 'https://example.invalid/c302.m3u', 'm3u', true),
  ('00000000-0000-0000-0000-00000000c303', 'Alternativa Comercial', 'https://example.invalid/c303.m3u', 'm3u', true),
  ('00000000-0000-0000-0000-00000000c304', 'Não Permitida', 'https://example.invalid/c304.m3u', 'm3u', true),
  ('00000000-0000-0000-0000-00000000c305', 'Permissão Não Usada', 'https://example.invalid/c305.m3u', 'm3u', true),
  ('00000000-0000-0000-0000-00000000c306', 'Excluir com Reserva', 'https://example.invalid/c306.m3u', 'm3u', true),
  ('00000000-0000-0000-0000-00000000c307', 'Reserva da Exclusão', 'https://example.invalid/c307.m3u', 'm3u', true),
  ('00000000-0000-0000-0000-00000000c308', 'Excluir sem Reserva', 'https://example.invalid/c308.m3u', 'm3u', true);

insert into public.panel_seller_playlists (seller_id, playlist_id, active)
select
  '00000000-0000-0000-0000-00000000c001'::uuid,
  playlist_id,
  true
from unnest(array[
  '00000000-0000-0000-0000-00000000c301'::uuid,
  '00000000-0000-0000-0000-00000000c302'::uuid,
  '00000000-0000-0000-0000-00000000c303'::uuid,
  '00000000-0000-0000-0000-00000000c305'::uuid,
  '00000000-0000-0000-0000-00000000c306'::uuid,
  '00000000-0000-0000-0000-00000000c307'::uuid,
  '00000000-0000-0000-0000-00000000c308'::uuid
]) as allowed(playlist_id);

insert into public.panel_devices (id, device_code, status) values
  ('00000000-0000-0000-0000-00000000c401', 'RPTV-COM001', 'pending'),
  ('00000000-0000-0000-0000-00000000c402', 'RPTV-COM002', 'pending'),
  ('00000000-0000-0000-0000-00000000c403', 'RPTV-COM003', 'pending');

select lives_ok(
  $$select * from public.apply_device_subscription_complete_transaction(
    '00000000-0000-0000-0000-00000000c001',
    '00000000-0000-0000-0000-00000000c401',
    '00000000-0000-0000-0000-00000000c201',
    '00000000-0000-0000-0000-00000000c301',
    '00000000-0000-0000-0000-00000000c302',
    '2099-01-31 23:59:59+00',
    'activation',
    'seller:test',
    'commercial-complete-activation',
    '00000000-0000-0000-0000-00000000c101',
    'Cliente Consistente',
    true
  )$$,
  'Ativação, débito e reserva são confirmados juntos'
);
select is(
  (select credit_balance from public.panel_sellers where id = '00000000-0000-0000-0000-00000000c001'),
  18,
  'Ativação completa debita uma vez'
);
select is(
  (select status from public.panel_devices where id = '00000000-0000-0000-0000-00000000c401'),
  'active',
  'Ativação completa libera o aparelho'
);
select is(
  (select playlist_id from public.panel_device_playlists where device_id = '00000000-0000-0000-0000-00000000c401' and priority = 1),
  '00000000-0000-0000-0000-00000000c301'::uuid,
  'Principal é gravada na transação completa'
);
select is(
  (select playlist_id from public.panel_device_playlists where device_id = '00000000-0000-0000-0000-00000000c401' and priority = 2),
  '00000000-0000-0000-0000-00000000c302'::uuid,
  'Reserva é gravada na transação completa'
);
select is(
  (select count(*)::integer from public.panel_credit_ledger where idempotency_key = 'commercial-complete-activation'),
  1,
  'Ativação completa cria um único lançamento'
);
select is(
  (select applied from public.apply_device_subscription_complete_transaction(
    '00000000-0000-0000-0000-00000000c001',
    '00000000-0000-0000-0000-00000000c401',
    '00000000-0000-0000-0000-00000000c201',
    '00000000-0000-0000-0000-00000000c301',
    '00000000-0000-0000-0000-00000000c302',
    '2099-01-31 23:59:59+00',
    'activation',
    'seller:test',
    'commercial-complete-activation',
    '00000000-0000-0000-0000-00000000c101',
    'Cliente Consistente',
    true
  )),
  false,
  'Retry idêntico é idempotente'
);
select is(
  (select credit_balance from public.panel_sellers where id = '00000000-0000-0000-0000-00000000c001'),
  18,
  'Retry idêntico não duplica o débito'
);
select is(
  (select count(*)::integer from public.panel_credit_ledger where idempotency_key = 'commercial-complete-activation'),
  1,
  'Retry idêntico não duplica o extrato'
);
select throws_ok(
  $$select * from public.apply_device_subscription_complete_transaction(
    '00000000-0000-0000-0000-00000000c001',
    '00000000-0000-0000-0000-00000000c401',
    '00000000-0000-0000-0000-00000000c201',
    '00000000-0000-0000-0000-00000000c301',
    '00000000-0000-0000-0000-00000000c303',
    '2099-01-31 23:59:59+00',
    'activation',
    'seller:test',
    'commercial-complete-activation',
    '00000000-0000-0000-0000-00000000c101',
    'Cliente Consistente',
    true
  )$$,
  '23505',
  'Chave de idempotência já utilizada com outra lista reserva.',
  'A mesma chave não pode trocar a reserva depois da confirmação'
);
select is(
  (select playlist_id from public.panel_device_playlists where device_id = '00000000-0000-0000-0000-00000000c401' and priority = 2),
  '00000000-0000-0000-0000-00000000c302'::uuid,
  'Retry divergente preserva a reserva original'
);

select throws_ok(
  $$select * from public.apply_device_subscription_complete_transaction(
    '00000000-0000-0000-0000-00000000c001',
    '00000000-0000-0000-0000-00000000c402',
    '00000000-0000-0000-0000-00000000c201',
    '00000000-0000-0000-0000-00000000c301',
    '00000000-0000-0000-0000-00000000c304',
    '2099-01-31 23:59:59+00',
    'activation',
    'seller:test',
    'commercial-invalid-backup',
    null,
    'Sem Reserva Permitida',
    true
  )$$,
  'P0001',
  'Lista reserva não liberada para este vendedor.',
  'Reserva sem permissão cancela toda a ativação'
);
select is(
  (select status from public.panel_devices where id = '00000000-0000-0000-0000-00000000c402'),
  'pending',
  'Falha de reserva não deixa aparelho ativo'
);
select is(
  (select count(*)::integer from public.panel_credit_ledger where idempotency_key = 'commercial-invalid-backup'),
  0,
  'Falha de reserva não cria débito'
);
select is(
  (select credit_balance from public.panel_sellers where id = '00000000-0000-0000-0000-00000000c001'),
  18,
  'Falha de reserva preserva o saldo'
);

update public.panel_devices
set seller_id = '00000000-0000-0000-0000-00000000c001'
where id = '00000000-0000-0000-0000-00000000c402';

select lives_ok(
  $$select * from public.set_device_playlists_transaction(
    '00000000-0000-0000-0000-00000000c402',
    '00000000-0000-0000-0000-00000000c303',
    '00000000-0000-0000-0000-00000000c302',
    '00000000-0000-0000-0000-00000000c001',
    true
  )$$,
  'Par principal/reserva é salvo numa única RPC'
);
select results_eq(
  $$select playlist_id, priority from public.panel_device_playlists
    where device_id = '00000000-0000-0000-0000-00000000c402'
    order by priority$$,
  $$values
    ('00000000-0000-0000-0000-00000000c303'::uuid, 1::smallint),
    ('00000000-0000-0000-0000-00000000c302'::uuid, 2::smallint)$$,
  'Par salvo não possui janela intermediária nem duplicidade'
);
select throws_ok(
  $$select * from public.set_device_playlists_transaction(
    '00000000-0000-0000-0000-00000000c402',
    '00000000-0000-0000-0000-00000000c303',
    '00000000-0000-0000-0000-00000000c303',
    '00000000-0000-0000-0000-00000000c001',
    true
  )$$,
  '22023',
  'A lista reserva precisa ser diferente da lista principal.',
  'Par inválido é rejeitado antes de qualquer escrita'
);
select results_eq(
  $$select playlist_id, priority from public.panel_device_playlists
    where device_id = '00000000-0000-0000-0000-00000000c402'
    order by priority$$,
  $$values
    ('00000000-0000-0000-0000-00000000c303'::uuid, 1::smallint),
    ('00000000-0000-0000-0000-00000000c302'::uuid, 2::smallint)$$,
  'Falha do par preserva as duas posições anteriores'
);

select is(
  (select removed from public.remove_seller_playlist_transaction(
    '00000000-0000-0000-0000-00000000c001',
    '00000000-0000-0000-0000-00000000c301'
  )),
  false,
  'Vendedor não remove lista usada enquanto a operação está serializada'
);
select ok(
  exists (
    select 1 from public.panel_seller_playlists
    where seller_id = '00000000-0000-0000-0000-00000000c001'
      and playlist_id = '00000000-0000-0000-0000-00000000c301'
  ),
  'Permissão usada permanece após a tentativa bloqueada'
);
select is(
  (select removed from public.remove_seller_playlist_transaction(
    '00000000-0000-0000-0000-00000000c001',
    '00000000-0000-0000-0000-00000000c305'
  )),
  true,
  'Permissão sem uso é removida atomicamente'
);
select ok(
  not exists (
    select 1 from public.panel_seller_playlists
    where seller_id = '00000000-0000-0000-0000-00000000c001'
      and playlist_id = '00000000-0000-0000-0000-00000000c305'
  ),
  'Remoção concluída não deixa permissão residual'
);

update public.panel_devices
set seller_id = '00000000-0000-0000-0000-00000000c001',
    playlist_id = '00000000-0000-0000-0000-00000000c306'
where id = '00000000-0000-0000-0000-00000000c403';

insert into public.panel_device_playlists (device_id, playlist_id, priority, active)
values (
  '00000000-0000-0000-0000-00000000c403',
  '00000000-0000-0000-0000-00000000c307',
  2,
  true
);

insert into public.panel_subscriptions (
  id,
  customer_id,
  seller_id,
  plan_id,
  status,
  expires_at,
  plan_name_snapshot,
  duration_days_snapshot,
  max_devices_snapshot,
  simultaneous_connections_snapshot,
  credit_cost_snapshot
) values
  (
    '00000000-0000-0000-0000-00000000c501',
    '00000000-0000-0000-0000-00000000c101',
    '00000000-0000-0000-0000-00000000c001',
    '00000000-0000-0000-0000-00000000c201',
    'active',
    '2099-12-31 23:59:59+00',
    'Plano Consistente',
    30,
    2,
    1,
    2
  ),
  (
    '00000000-0000-0000-0000-00000000c502',
    '00000000-0000-0000-0000-00000000c101',
    '00000000-0000-0000-0000-00000000c001',
    '00000000-0000-0000-0000-00000000c201',
    'active',
    '2099-12-31 23:59:59+00',
    'Plano Consistente',
    30,
    2,
    1,
    2
  );

insert into public.panel_subscription_playlists (subscription_id, playlist_id, priority, active) values
  ('00000000-0000-0000-0000-00000000c501', '00000000-0000-0000-0000-00000000c306', 1, true),
  ('00000000-0000-0000-0000-00000000c501', '00000000-0000-0000-0000-00000000c307', 2, true),
  ('00000000-0000-0000-0000-00000000c502', '00000000-0000-0000-0000-00000000c308', 1, true);

create temporary table commercial_delete_result on commit drop as
select * from public.delete_playlist_with_reassignment(
  '00000000-0000-0000-0000-00000000c306'
);

select is((select deleted from commercial_delete_result), true, 'Exclusão transacional conclui o delete');
select is((select devices_reassigned from commercial_delete_result), 1, 'Exclusão contabiliza aparelho promovido');
select is((select subscriptions_reassigned from commercial_delete_result), 1, 'Exclusão contabiliza assinatura promovida');
select ok(
  not exists (select 1 from public.panel_playlists where id = '00000000-0000-0000-0000-00000000c306'),
  'Lista excluída não permanece no catálogo'
);
select is(
  (select playlist_id from public.panel_devices where id = '00000000-0000-0000-0000-00000000c403'),
  '00000000-0000-0000-0000-00000000c307'::uuid,
  'Aparelho promove a reserva na mesma transação da exclusão'
);
select is(
  (select playlist_id from public.panel_subscription_playlists
    where subscription_id = '00000000-0000-0000-0000-00000000c501' and priority = 1 and active is true),
  '00000000-0000-0000-0000-00000000c307'::uuid,
  'Assinatura promove a reserva na mesma transação da exclusão'
);
select throws_ok(
  $$select * from public.delete_playlist_with_reassignment(
    '00000000-0000-0000-0000-00000000c308'
  )$$,
  'P0001',
  'A lista é principal de uma assinatura sem reserva e não pode ser excluída.',
  'Exclusão sem reserva é bloqueada antes de alterar dados'
);
select ok(
  exists (select 1 from public.panel_playlists where id = '00000000-0000-0000-0000-00000000c308'),
  'Bloqueio preserva a lista principal sem reserva'
);

select * from finish();
rollback;
