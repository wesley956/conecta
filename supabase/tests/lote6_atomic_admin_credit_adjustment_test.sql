begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(14);

select has_function(
  'public',
  'admin_adjust_seller_credit_transaction',
  array['uuid','integer','text','uuid','text'],
  'RPC administrativa de ajuste atômico existe'
);
select ok(
  not has_function_privilege('anon', 'public.admin_adjust_seller_credit_transaction(uuid,integer,text,uuid,text)', 'execute'),
  'anon não executa ajuste administrativo'
);
select ok(
  not has_function_privilege('authenticated', 'public.admin_adjust_seller_credit_transaction(uuid,integer,text,uuid,text)', 'execute'),
  'authenticated não executa ajuste administrativo diretamente'
);
select ok(
  has_function_privilege('service_role', 'public.admin_adjust_seller_credit_transaction(uuid,integer,text,uuid,text)', 'execute'),
  'service_role executa ajuste administrativo'
);

insert into public.panel_sellers(
  id, name, whatsapp, email, status, credit_balance, can_go_negative
) values (
  '00000000-0000-0000-0000-000000009601',
  'Vendedor Lote 6',
  '551199996001',
  'lote6@example.invalid',
  'active',
  10,
  false
);

select lives_ok(
  $$select public.admin_adjust_seller_credit_transaction(
    '00000000-0000-0000-0000-000000009601',
    5,
    'Cortesia de teste do Lote 6',
    null,
    'lote6:add:1'
  )$$,
  'Ajuste positivo executa em uma transação'
);
select is(
  (select credit_balance from public.panel_sellers where id = '00000000-0000-0000-0000-000000009601'),
  15,
  'Saldo sobe uma única vez'
);
select is(
  (select count(*)::integer from public.panel_credit_ledger
    where seller_id = '00000000-0000-0000-0000-000000009601'
      and idempotency_key = 'lote6:add:1'),
  1,
  'Ledger recebe uma única linha para a chave idempotente'
);
select is(
  (select type from public.panel_credit_ledger
    where seller_id = '00000000-0000-0000-0000-000000009601'
      and idempotency_key = 'lote6:add:1'),
  'manual_add',
  'Ajuste positivo usa manual_add'
);
select is(
  (select count(*)::integer from public.panel_audit_logs
    where entity_id = '00000000-0000-0000-0000-000000009601'
      and action = 'credit.added'),
  1,
  'Ajuste positivo gera uma auditoria'
);

select lives_ok(
  $$select public.admin_adjust_seller_credit_transaction(
    '00000000-0000-0000-0000-000000009601',
    5,
    'Cortesia de teste do Lote 6',
    null,
    'lote6:add:1'
  )$$,
  'Retry com a mesma chave é aceito'
);
select is(
  (select credit_balance from public.panel_sellers where id = '00000000-0000-0000-0000-000000009601'),
  15,
  'Retry não duplica saldo'
);
select is(
  (select count(*)::integer from public.panel_audit_logs
    where entity_id = '00000000-0000-0000-0000-000000009601'
      and action = 'credit.added'),
  1,
  'Retry não duplica auditoria'
);

select lives_ok(
  $$select public.admin_adjust_seller_credit_transaction(
    '00000000-0000-0000-0000-000000009601',
    -3,
    'Correção de teste do Lote 6',
    null,
    'lote6:remove:1'
  )$$,
  'Ajuste negativo usa a mesma transação segura'
);
select ok(
  (select credit_balance = 12 from public.panel_sellers where id = '00000000-0000-0000-0000-000000009601')
  and (select type = 'manual_remove' from public.panel_credit_ledger
       where seller_id = '00000000-0000-0000-0000-000000009601'
         and idempotency_key = 'lote6:remove:1')
  and (select count(*) = 1 from public.panel_audit_logs
       where entity_id = '00000000-0000-0000-0000-000000009601'
         and action = 'credit.removed'),
  'Remoção atualiza saldo, ledger e auditoria juntos'
);

select * from finish();
rollback;
