begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(18);

select has_column(
  'public',
  'panel_credit_ledger',
  'idempotency_key',
  'Extrato possui chave de idempotência'
);

select has_function(
  'public',
  'apply_seller_credit_transaction',
  array['uuid', 'integer', 'text', 'uuid', 'text', 'text', 'text'],
  'RPC atômica de créditos existe'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.apply_seller_credit_transaction(uuid,integer,text,uuid,text,text,text)',
    'execute'
  ),
  'anon não pode movimentar créditos'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.apply_seller_credit_transaction(uuid,integer,text,uuid,text,text,text)',
    'execute'
  ),
  'authenticated não pode movimentar créditos diretamente'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.apply_seller_credit_transaction(uuid,integer,text,uuid,text,text,text)',
    'execute'
  ),
  'service_role pode movimentar créditos'
);

insert into public.panel_sellers (
  id,
  name,
  whatsapp,
  status,
  credit_balance,
  can_go_negative
) values
  ('00000000-0000-0000-0000-000000001001', 'Vendedor A', '551100000001', 'active', 10, false),
  ('00000000-0000-0000-0000-000000001002', 'Vendedor B', '551100000002', 'active', 5, false),
  ('00000000-0000-0000-0000-000000001003', 'Vendedor Negativo', '551100000003', 'active', 0, true);

select lives_ok(
  $$select * from public.apply_seller_credit_transaction(
    '00000000-0000-0000-0000-000000001001',
    -3,
    'activation',
    null,
    'Ativação teste',
    'test',
    'shared-key'
  )$$,
  'Primeira movimentação é aplicada'
);

select is(
  (select credit_balance from public.panel_sellers
    where id = '00000000-0000-0000-0000-000000001001'),
  7,
  'Saldo do primeiro vendedor é debitado'
);

select is(
  (select count(*)::integer from public.panel_credit_ledger
    where seller_id = '00000000-0000-0000-0000-000000001001'
      and idempotency_key = 'shared-key'),
  1,
  'Primeira chave gera somente um lançamento'
);

select is(
  (select applied from public.apply_seller_credit_transaction(
    '00000000-0000-0000-0000-000000001001',
    -3,
    'activation',
    null,
    'Repetição teste',
    'test',
    'shared-key'
  )),
  false,
  'Repetição da mesma chave não é reaplicada'
);

select is(
  (select credit_balance from public.panel_sellers
    where id = '00000000-0000-0000-0000-000000001001'),
  7,
  'Repetição não altera o saldo'
);

select lives_ok(
  $$select * from public.apply_seller_credit_transaction(
    '00000000-0000-0000-0000-000000001002',
    -2,
    'activation',
    null,
    'Outro vendedor',
    'test',
    'shared-key'
  )$$,
  'A mesma chave pode ser usada por outro vendedor'
);

select is(
  (select credit_balance from public.panel_sellers
    where id = '00000000-0000-0000-0000-000000001002'),
  3,
  'Segundo vendedor é debitado independentemente'
);

select is(
  (select count(*)::integer from public.panel_credit_ledger
    where idempotency_key = 'shared-key'),
  2,
  'A chave compartilhada gera um lançamento por vendedor'
);

select throws_ok(
  $$select * from public.apply_seller_credit_transaction(
    '00000000-0000-0000-0000-000000001001',
    -100,
    'renewal',
    null,
    'Saldo insuficiente',
    'test',
    'insufficient-key'
  )$$,
  'P0001',
  'Saldo insuficiente. Saldo atual: 7. Movimentação: -100.',
  'Saldo insuficiente é rejeitado'
);

select is(
  (select credit_balance from public.panel_sellers
    where id = '00000000-0000-0000-0000-000000001001'),
  7,
  'Falha por saldo insuficiente não altera o saldo'
);

select lives_ok(
  $$select * from public.apply_seller_credit_transaction(
    '00000000-0000-0000-0000-000000001003',
    -4,
    'renewal',
    null,
    'Saldo negativo autorizado',
    'test',
    'negative-key'
  )$$,
  'Vendedor autorizado pode ficar negativo'
);

select is(
  (select credit_balance from public.panel_sellers
    where id = '00000000-0000-0000-0000-000000001003'),
  -4,
  'Saldo negativo autorizado é persistido'
);

select throws_ok(
  $$select * from public.apply_seller_credit_transaction(
    '00000000-0000-0000-0000-000000001001',
    1,
    'purchase',
    null,
    'Chave longa',
    'test',
    repeat('x', 201)
  )$$,
  '22023',
  'A chave de idempotência excede 200 caracteres.',
  'Chave de idempotência excessiva é rejeitada'
);

select * from finish();
rollback;
