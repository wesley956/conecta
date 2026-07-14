begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(25);

select has_column(
  'public',
  'panel_credit_ledger',
  'operation_fingerprint',
  'Extrato possui fingerprint da operação'
);

select has_function(
  'public',
  'apply_device_subscription_transaction',
  array[
    'uuid', 'uuid', 'uuid', 'uuid', 'timestamp with time zone',
    'text', 'text', 'text', 'uuid', 'text', 'boolean'
  ],
  'RPC atômica de assinatura existe'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.apply_device_subscription_transaction(uuid,uuid,uuid,uuid,timestamp with time zone,text,text,text,uuid,text,boolean)',
    'execute'
  ),
  'anon não pode aplicar assinatura'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.apply_device_subscription_transaction(uuid,uuid,uuid,uuid,timestamp with time zone,text,text,text,uuid,text,boolean)',
    'execute'
  ),
  'authenticated não pode aplicar assinatura diretamente'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.apply_device_subscription_transaction(uuid,uuid,uuid,uuid,timestamp with time zone,text,text,text,uuid,text,boolean)',
    'execute'
  ),
  'service_role pode aplicar assinatura'
);

insert into public.panel_sellers (
  id, name, whatsapp, status, credit_balance, can_go_negative
) values
  ('00000000-0000-0000-0000-000000002001', 'Vendedor Principal', '551100002001', 'active', 10, false),
  ('00000000-0000-0000-0000-000000002002', 'Outro Vendedor', '551100002002', 'active', 10, false),
  ('00000000-0000-0000-0000-000000002003', 'Vendedor Sem Saldo', '551100002003', 'active', 0, false);

insert into public.panel_plans (
  id, name, duration_days, credit_cost, max_devices, status
) values (
  '00000000-0000-0000-0000-000000002101',
  'Plano Teste',
  30,
  2,
  1,
  'active'
);

insert into public.panel_playlists (
  id, name, playlist_url, playlist_type, active
) values (
  '00000000-0000-0000-0000-000000002201',
  'Lista Teste',
  'https://example.invalid/list.m3u',
  'm3u',
  true
);

insert into public.panel_seller_playlists (
  seller_id, playlist_id, active
) values
  ('00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000002201', true),
  ('00000000-0000-0000-0000-000000002002', '00000000-0000-0000-0000-000000002201', true),
  ('00000000-0000-0000-0000-000000002003', '00000000-0000-0000-0000-000000002201', true);

insert into public.panel_devices (
  id, device_code, status
) values
  ('00000000-0000-0000-0000-000000002301', 'RPTV-ATOMIC1', 'pending'),
  ('00000000-0000-0000-0000-000000002302', 'RPTV-ATOMIC2', 'pending');

select lives_ok(
  $$select * from public.apply_device_subscription_transaction(
    '00000000-0000-0000-0000-000000002001',
    '00000000-0000-0000-0000-000000002301',
    '00000000-0000-0000-0000-000000002101',
    '00000000-0000-0000-0000-000000002201',
    '2099-01-01 00:00:00+00',
    'activation',
    'test',
    'activation-key',
    null,
    'Cliente Teste',
    true
  )$$,
  'Ativação inicial é aplicada'
);

select is(
  (select credit_balance from public.panel_sellers
    where id = '00000000-0000-0000-0000-000000002001'),
  8,
  'Ativação debita o custo do plano'
);

select is(
  (select status from public.panel_devices
    where id = '00000000-0000-0000-0000-000000002301'),
  'active',
  'Ativação deixa o aparelho ativo'
);

select is(
  (select seller_id from public.panel_devices
    where id = '00000000-0000-0000-0000-000000002301'),
  '00000000-0000-0000-0000-000000002001'::uuid,
  'Ativação vincula o vendedor'
);

select is(
  (select count(*)::integer from public.panel_credit_ledger
    where seller_id = '00000000-0000-0000-0000-000000002001'
      and idempotency_key = 'activation-key'),
  1,
  'Ativação cria um lançamento'
);

select is(
  (select applied from public.apply_device_subscription_transaction(
    '00000000-0000-0000-0000-000000002001',
    '00000000-0000-0000-0000-000000002301',
    '00000000-0000-0000-0000-000000002101',
    '00000000-0000-0000-0000-000000002201',
    '2099-01-01 00:00:00+00',
    'activation',
    'test',
    'activation-key',
    null,
    'Cliente Teste',
    true
  )),
  false,
  'Retry exato da ativação retorna não aplicado'
);

select is(
  (select credit_balance from public.panel_sellers
    where id = '00000000-0000-0000-0000-000000002001'),
  8,
  'Retry da ativação não debita novamente'
);

select is(
  (select count(*)::integer from public.panel_credit_ledger
    where seller_id = '00000000-0000-0000-0000-000000002001'
      and idempotency_key = 'activation-key'),
  1,
  'Retry da ativação não duplica o extrato'
);

select throws_ok(
  $$select * from public.apply_device_subscription_transaction(
    '00000000-0000-0000-0000-000000002001',
    '00000000-0000-0000-0000-000000002301',
    '00000000-0000-0000-0000-000000002101',
    '00000000-0000-0000-0000-000000002201',
    '2099-01-02 00:00:00+00',
    'activation',
    'test',
    'activation-key',
    null,
    'Cliente Teste',
    true
  )$$,
  '23505',
  'Chave de idempotência já utilizada em outra operação.',
  'A mesma chave não pode representar outra operação'
);

select lives_ok(
  $$select * from public.apply_device_subscription_transaction(
    '00000000-0000-0000-0000-000000002001',
    '00000000-0000-0000-0000-000000002301',
    '00000000-0000-0000-0000-000000002101',
    '00000000-0000-0000-0000-000000002201',
    '2099-02-01 00:00:00+00',
    'renewal',
    'test',
    'renewal-key',
    null,
    'Cliente Teste',
    true
  )$$,
  'Renovação que amplia a validade é aplicada'
);

select is(
  (select credit_balance from public.panel_sellers
    where id = '00000000-0000-0000-0000-000000002001'),
  6,
  'Renovação debita o custo do plano'
);

select is(
  (select subscription_expires_at from public.panel_devices
    where id = '00000000-0000-0000-0000-000000002301'),
  '2099-02-01 00:00:00+00'::timestamptz,
  'Renovação atualiza a validade'
);

select is(
  (select applied from public.apply_device_subscription_transaction(
    '00000000-0000-0000-0000-000000002001',
    '00000000-0000-0000-0000-000000002301',
    '00000000-0000-0000-0000-000000002101',
    '00000000-0000-0000-0000-000000002201',
    '2099-02-01 00:00:00+00',
    'renewal',
    'test',
    'renewal-key',
    null,
    'Cliente Teste',
    true
  )),
  false,
  'Retry exato da renovação retorna não aplicado'
);

select is(
  (select credit_balance from public.panel_sellers
    where id = '00000000-0000-0000-0000-000000002001'),
  6,
  'Retry da renovação não debita novamente'
);

select throws_ok(
  $$select * from public.apply_device_subscription_transaction(
    '00000000-0000-0000-0000-000000002001',
    '00000000-0000-0000-0000-000000002301',
    '00000000-0000-0000-0000-000000002101',
    '00000000-0000-0000-0000-000000002201',
    '2099-02-01 00:00:00+00',
    'renewal',
    'test',
    'renewal-without-extension',
    null,
    'Cliente Teste',
    true
  )$$,
  '22023',
  'A renovação deve ampliar a data atual de expiração.',
  'Nova renovação sem ampliar a validade é rejeitada'
);

select throws_ok(
  $$select * from public.apply_device_subscription_transaction(
    '00000000-0000-0000-0000-000000002002',
    '00000000-0000-0000-0000-000000002301',
    '00000000-0000-0000-0000-000000002101',
    '00000000-0000-0000-0000-000000002201',
    '2099-03-01 00:00:00+00',
    'renewal',
    'test',
    'other-seller-key',
    null,
    'Cliente Teste',
    true
  )$$,
  'P0001',
  'Este aparelho pertence a outro vendedor.',
  'Vendedor não pode renovar aparelho de outro vendedor'
);

select throws_ok(
  $$select * from public.apply_device_subscription_transaction(
    '00000000-0000-0000-0000-000000002003',
    '00000000-0000-0000-0000-000000002302',
    '00000000-0000-0000-0000-000000002101',
    '00000000-0000-0000-0000-000000002201',
    '2099-01-01 00:00:00+00',
    'activation',
    'test',
    'insufficient-subscription-key',
    null,
    'Sem Saldo',
    true
  )$$,
  'P0001',
  'Saldo insuficiente. Saldo atual: 0. Custo: 2.',
  'Saldo insuficiente cancela a operação comercial'
);

select is(
  (select credit_balance from public.panel_sellers
    where id = '00000000-0000-0000-0000-000000002003'),
  0,
  'Falha de saldo não altera o vendedor'
);

select is(
  (select status from public.panel_devices
    where id = '00000000-0000-0000-0000-000000002302'),
  'pending',
  'Falha de saldo não ativa o aparelho'
);

select is(
  (select count(*)::integer from public.panel_credit_ledger
    where seller_id = '00000000-0000-0000-0000-000000002003'),
  0,
  'Falha de saldo não cria lançamento'
);

select * from finish();
rollback;
