begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(16);

select has_function(
  'public',
  'update_credit_order_payment_transaction',
  array['uuid','text','uuid'],
  'RPC atômica de pagamento de pacote existe'
);
select ok(
  not has_function_privilege('anon', 'public.update_credit_order_payment_transaction(uuid,text,uuid)', 'execute'),
  'anon não atualiza pagamento diretamente'
);
select ok(
  not has_function_privilege('authenticated', 'public.update_credit_order_payment_transaction(uuid,text,uuid)', 'execute'),
  'authenticated não atualiza pagamento diretamente'
);
select ok(
  has_function_privilege('service_role', 'public.update_credit_order_payment_transaction(uuid,text,uuid)', 'execute'),
  'service_role executa pagamento atômico'
);

insert into public.panel_sellers(
  id, name, whatsapp, email, status, credit_balance, can_go_negative,
  financial_credit_limit_cents, allow_credit_purchases_on_terms
) values (
  '00000000-0000-0000-0000-000000009611',
  'Vendedor Pacote Lote 6',
  '551199996011',
  'lote6-pacote@example.invalid',
  'active',
  0,
  false,
  100000,
  true
);

select lives_ok(
  $$select public.create_credit_package_order(
    '00000000-0000-0000-0000-000000009611',
    (select id from public.panel_credit_packages where code = 'AVULSO_10' limit 1),
    1,
    'pending',
    'pix',
    'after_payment',
    current_date + 5,
    'Pedido de teste do Lote 6',
    'lote6:package:1',
    null,
    'admin'
  )$$,
  'Pedido pendente é criado pela regra canônica existente'
);

select ok(
  (select payment_status = 'pending' and credits_status = 'waiting_payment'
     from public.panel_credit_orders
    where seller_id = '00000000-0000-0000-0000-000000009611'
      and idempotency_key = 'lote6:package:1'),
  'Pedido nasce pendente sem liberar créditos'
);
select is(
  (select status from public.panel_financial_records
    where idempotency_key = 'credit-order-finance:' || (
      select id::text from public.panel_credit_orders
       where seller_id = '00000000-0000-0000-0000-000000009611'
         and idempotency_key = 'lote6:package:1'
    )),
  'pending',
  'Financeiro nasce pendente junto com o pedido'
);
select is(
  (select credit_balance from public.panel_sellers where id = '00000000-0000-0000-0000-000000009611'),
  0,
  'Pedido pendente não altera saldo de créditos'
);

select lives_ok(
  $$select public.update_credit_order_payment_transaction(
    (select id from public.panel_credit_orders
      where seller_id = '00000000-0000-0000-0000-000000009611'
        and idempotency_key = 'lote6:package:1'),
    'paid',
    null
  )$$,
  'Pagamento e liberação executam na mesma transação'
);

select ok(
  (select payment_status = 'paid'
          and credits_status = 'released'
          and paid_at is not null
          and released_at is not null
     from public.panel_credit_orders
    where seller_id = '00000000-0000-0000-0000-000000009611'
      and idempotency_key = 'lote6:package:1'),
  'Pedido pago termina com créditos liberados'
);
select is(
  (select status from public.panel_financial_records
    where idempotency_key = 'credit-order-finance:' || (
      select id::text from public.panel_credit_orders
       where seller_id = '00000000-0000-0000-0000-000000009611'
         and idempotency_key = 'lote6:package:1'
    )),
  'paid',
  'Registro financeiro fica pago na mesma operação'
);
select is(
  (select credit_balance from public.panel_sellers where id = '00000000-0000-0000-0000-000000009611'),
  10,
  'Pagamento libera exatamente os 10 créditos do pacote'
);
select ok(
  (select count(*) = 1 from public.panel_credit_ledger
    where seller_id = '00000000-0000-0000-0000-000000009611'
      and type = 'credit_purchase')
  and (select count(*) = 1 from public.panel_credit_lots
       where seller_id = '00000000-0000-0000-0000-000000009611')
  and (select count(*) = 1 from public.panel_audit_logs
       where entity_type = 'credit_order'
         and action = 'credits.package_order.payment_updated'
         and entity_id = (select id from public.panel_credit_orders
                          where seller_id = '00000000-0000-0000-0000-000000009611'
                            and idempotency_key = 'lote6:package:1')),
  'Ledger, lote e auditoria são criados uma única vez'
);

select lives_ok(
  $$select public.update_credit_order_payment_transaction(
    (select id from public.panel_credit_orders
      where seller_id = '00000000-0000-0000-0000-000000009611'
        and idempotency_key = 'lote6:package:1'),
    'paid',
    null
  )$$,
  'Retry do mesmo status pago é seguro'
);
select ok(
  (select credit_balance = 10 from public.panel_sellers where id = '00000000-0000-0000-0000-000000009611')
  and (select count(*) = 1 from public.panel_credit_ledger
       where seller_id = '00000000-0000-0000-0000-000000009611'
         and type = 'credit_purchase')
  and (select count(*) = 1 from public.panel_credit_lots
       where seller_id = '00000000-0000-0000-0000-000000009611')
  and (select count(*) = 1 from public.panel_audit_logs
       where entity_type = 'credit_order'
         and action = 'credits.package_order.payment_updated'
         and entity_id = (select id from public.panel_credit_orders
                          where seller_id = '00000000-0000-0000-0000-000000009611'
                            and idempotency_key = 'lote6:package:1')),
  'Retry não duplica saldo, ledger, lote nem auditoria'
);

select throws_ok(
  $$select public.update_credit_order_payment_transaction(
    (select id from public.panel_credit_orders
      where seller_id = '00000000-0000-0000-0000-000000009611'
        and idempotency_key = 'lote6:package:1'),
    'cancelled',
    null
  )$$,
  'P0001',
  'Créditos já liberados não podem ser cancelados sem um estorno específico.',
  'Cancelamento de créditos já liberados continua bloqueado'
);

select * from finish();
rollback;
