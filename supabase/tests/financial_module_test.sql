begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(24);

select has_table('public', 'panel_financial_records', 'Tabela financeira existe');
select has_column('public', 'panel_financial_records', 'amount_cents', 'Financeiro armazena valores em centavos');
select has_column('public', 'panel_financial_records', 'status', 'Financeiro possui status de pagamento');
select has_column('public', 'panel_financial_records', 'seller_id', 'Financeiro pode ser isolado por vendedor');
select has_column('public', 'panel_financial_records', 'operation_fingerprint', 'Financeiro possui fingerprint idempotente');

select has_function(
  'public',
  'apply_device_subscription_with_finance',
  array[
    'uuid', 'uuid', 'uuid', 'uuid', 'uuid', 'timestamp with time zone',
    'text', 'text', 'text', 'uuid', 'text', 'boolean', 'bigint', 'text',
    'text', 'date', 'timestamp with time zone', 'text', 'text', 'uuid', 'text'
  ],
  'RPC comercial com financeiro existe'
);

select ok(
  not has_table_privilege('anon', 'public.panel_financial_records', 'select'),
  'anon não pode ler o financeiro'
);

select ok(
  not has_table_privilege('authenticated', 'public.panel_financial_records', 'select'),
  'authenticated não pode ler o financeiro diretamente'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.apply_device_subscription_with_finance(uuid,uuid,uuid,uuid,uuid,timestamp with time zone,text,text,text,uuid,text,boolean,bigint,text,text,date,timestamp with time zone,text,text,uuid,text)',
    'execute'
  ),
  'anon não pode executar cobrança financeira'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.apply_device_subscription_with_finance(uuid,uuid,uuid,uuid,uuid,timestamp with time zone,text,text,text,uuid,text,boolean,bigint,text,text,date,timestamp with time zone,text,text,uuid,text)',
    'execute'
  ),
  'service_role pode executar cobrança financeira'
);

insert into public.panel_sellers (
  id, name, whatsapp, status, credit_balance, can_go_negative
) values
  ('00000000-0000-0000-0000-000000009001', 'Vendedor Financeiro', '551199990001', 'active', 10, false),
  ('00000000-0000-0000-0000-000000009002', 'Vendedor Sem Saldo Financeiro', '551199990002', 'active', 0, false);

insert into public.panel_customers (
  id, name, whatsapp, seller_id, status
) values (
  '00000000-0000-0000-0000-000000009101',
  'Cliente Financeiro',
  '551188880001',
  '00000000-0000-0000-0000-000000009001',
  'active'
);

insert into public.panel_plans (
  id, name, duration_days, credit_cost, max_devices, status
) values (
  '00000000-0000-0000-0000-000000009201',
  'Plano Financeiro',
  30,
  2,
  1,
  'active'
);

insert into public.panel_playlists (
  id, name, playlist_url, playlist_type, active
) values
  ('00000000-0000-0000-0000-000000009301', 'Lista Financeira Principal', 'https://example.invalid/main.m3u', 'm3u', true),
  ('00000000-0000-0000-0000-000000009302', 'Lista Financeira Reserva', 'https://example.invalid/backup.m3u', 'm3u', true);

insert into public.panel_seller_playlists (seller_id, playlist_id, active) values
  ('00000000-0000-0000-0000-000000009001', '00000000-0000-0000-0000-000000009301', true),
  ('00000000-0000-0000-0000-000000009001', '00000000-0000-0000-0000-000000009302', true),
  ('00000000-0000-0000-0000-000000009002', '00000000-0000-0000-0000-000000009301', true);

insert into public.panel_devices (id, device_code, status) values
  ('00000000-0000-0000-0000-000000009401', 'RPTV-FIN01', 'pending'),
  ('00000000-0000-0000-0000-000000009402', 'RPTV-FIN02', 'pending'),
  ('00000000-0000-0000-0000-000000009403', 'RPTV-FIN03', 'pending');

select lives_ok(
  $$select * from public.apply_device_subscription_with_finance(
    '00000000-0000-0000-0000-000000009001',
    '00000000-0000-0000-0000-000000009401',
    '00000000-0000-0000-0000-000000009201',
    '00000000-0000-0000-0000-000000009301',
    '00000000-0000-0000-0000-000000009302',
    '2099-01-31 23:59:59+00',
    'activation',
    'seller',
    'finance-activation-key',
    '00000000-0000-0000-0000-000000009101',
    'Cliente Financeiro',
    true,
    4990,
    'paid',
    'pix',
    null,
    '2099-01-01 10:00:00+00',
    'Pagamento confirmado no teste',
    'Mensalidade teste',
    null,
    'seller'
  )$$,
  'Ativação, crédito e financeiro são processados juntos'
);

select is(
  (select credit_balance from public.panel_sellers where id = '00000000-0000-0000-0000-000000009001'),
  8,
  'Ativação financeira debita créditos'
);

select is(
  (select status from public.panel_devices where id = '00000000-0000-0000-0000-000000009401'),
  'active',
  'Ativação financeira libera o aparelho'
);

select is(
  (select count(*)::integer from public.panel_financial_records where idempotency_key = 'finance-activation-key'),
  1,
  'Ativação cria uma única receita'
);

select is(
  (select amount_cents from public.panel_financial_records where idempotency_key = 'finance-activation-key'),
  4990::bigint,
  'Receita preserva o valor em centavos'
);

select is(
  (select status from public.panel_financial_records where idempotency_key = 'finance-activation-key'),
  'paid',
  'Receita registra pagamento confirmado'
);

select is(
  (select source from public.panel_financial_records where idempotency_key = 'finance-activation-key'),
  'device_activation',
  'Receita identifica sua origem como ativação'
);

select is(
  (select playlist_id from public.panel_device_playlists
    where device_id = '00000000-0000-0000-0000-000000009401' and priority = 2),
  '00000000-0000-0000-0000-000000009302'::uuid,
  'Lista reserva é gravada na mesma operação'
);

select is(
  (select applied from public.apply_device_subscription_with_finance(
    '00000000-0000-0000-0000-000000009001',
    '00000000-0000-0000-0000-000000009401',
    '00000000-0000-0000-0000-000000009201',
    '00000000-0000-0000-0000-000000009301',
    '00000000-0000-0000-0000-000000009302',
    '2099-01-31 23:59:59+00',
    'activation',
    'seller',
    'finance-activation-key',
    '00000000-0000-0000-0000-000000009101',
    'Cliente Financeiro',
    true,
    4990,
    'paid',
    'pix',
    null,
    '2099-01-01 10:00:00+00',
    'Pagamento confirmado no teste',
    'Mensalidade teste',
    null,
    'seller'
  )),
  false,
  'Retry idêntico não reaplica a ativação'
);

select is(
  (select count(*)::integer from public.panel_financial_records where idempotency_key = 'finance-activation-key'),
  1,
  'Retry não duplica a receita'
);

select is(
  (select credit_balance from public.panel_sellers where id = '00000000-0000-0000-0000-000000009001'),
  8,
  'Retry não debita créditos novamente'
);

select throws_ok(
  $$select * from public.apply_device_subscription_with_finance(
    '00000000-0000-0000-0000-000000009001',
    '00000000-0000-0000-0000-000000009401',
    '00000000-0000-0000-0000-000000009201',
    '00000000-0000-0000-0000-000000009301',
    '00000000-0000-0000-0000-000000009302',
    '2099-01-31 23:59:59+00',
    'activation',
    'seller',
    'finance-activation-key',
    '00000000-0000-0000-0000-000000009101',
    'Cliente Financeiro',
    true,
    5990,
    'paid',
    'pix',
    null,
    '2099-01-01 10:00:00+00',
    'Valor diferente',
    'Mensalidade teste',
    null,
    'seller'
  )$$,
  '23505',
  'Chave de idempotência financeira já utilizada em outra operação.',
  'A mesma chave não aceita outro valor financeiro'
);

select lives_ok(
  $$select * from public.apply_device_subscription_with_finance(
    '00000000-0000-0000-0000-000000009001',
    '00000000-0000-0000-0000-000000009402',
    '00000000-0000-0000-0000-000000009201',
    '00000000-0000-0000-0000-000000009301',
    null,
    '2099-01-31 23:59:59+00',
    'activation',
    'admin',
    'activation-without-finance',
    null,
    'Sem registro financeiro',
    false,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    'admin'
  )$$,
  'Financeiro é opcional durante a ativação'
);

select is(
  (select count(*)::integer from public.panel_financial_records where idempotency_key = 'activation-without-finance'),
  0,
  'Ativação sem valor não cria receita vazia'
);

select throws_ok(
  $$select * from public.apply_device_subscription_with_finance(
    '00000000-0000-0000-0000-000000009002',
    '00000000-0000-0000-0000-000000009403',
    '00000000-0000-0000-0000-000000009201',
    '00000000-0000-0000-0000-000000009301',
    null,
    '2099-01-31 23:59:59+00',
    'activation',
    'seller',
    'finance-no-balance',
    null,
    'Sem saldo',
    true,
    4990,
    'pending',
    'pix',
    '2099-01-10',
    null,
    null,
    null,
    null,
    'seller'
  )$$,
  'P0001',
  'Saldo insuficiente. Saldo atual: 0. Custo: 2.',
  'Saldo insuficiente cancela também o registro financeiro'
);

select is(
  (select status from public.panel_devices where id = '00000000-0000-0000-0000-000000009403'),
  'pending',
  'Falha financeira mantém aparelho pendente'
);

select is(
  (select count(*)::integer from public.panel_financial_records where idempotency_key = 'finance-no-balance'),
  0,
  'Falha comercial não deixa receita órfã'
);

select * from finish();
rollback;
