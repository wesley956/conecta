begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(39);

select has_table('public', 'panel_subscriptions', 'Tabela central de assinaturas existe');
select has_table('public', 'panel_subscription_devices', 'Vínculos de aparelhos existem');
select has_table('public', 'panel_subscription_playlists', 'Listas exclusivas da assinatura existem');
select has_table('public', 'panel_lab_sessions', 'Sessões temporárias de laboratório existem');

select throws_ok(
  $$insert into public.panel_plans (
      id, name, duration_days, credit_cost, max_devices, simultaneous_connections, billing_cycle, status
    ) values (
      '00000000-0000-0000-0000-000000009099', 'Inválido', 30, 1, 6, 1, 'monthly', 'active'
    )$$,
  '23514',
  null,
  'Plano não permite mais de cinco aparelhos'
);

select has_function(
  'public',
  'create_customer_subscription_transaction',
  array[
    'uuid','uuid','uuid','uuid','uuid','uuid','text','text','timestamp with time zone',
    'bigint','text','text','date','timestamp with time zone','text','text','uuid','text'
  ],
  'RPC de criação central existe'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.create_customer_subscription_transaction(uuid,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,bigint,text,text,date,timestamp with time zone,text,text,uuid,text)',
    'execute'
  ),
  'anon não cria assinatura diretamente'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.create_customer_subscription_transaction(uuid,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,bigint,text,text,date,timestamp with time zone,text,text,uuid,text)',
    'execute'
  ),
  'authenticated não cria assinatura diretamente'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.create_customer_subscription_transaction(uuid,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,bigint,text,text,date,timestamp with time zone,text,text,uuid,text)',
    'execute'
  ),
  'service_role pode criar assinatura'
);

insert into public.panel_sellers (
  id, name, whatsapp, status, credit_balance, can_go_negative
) values
  ('00000000-0000-0000-0000-000000009001', 'Vendedor Assinatura', '551199990001', 'active', 10, false),
  ('00000000-0000-0000-0000-000000009002', 'Segundo Vendedor', '551199990002', 'active', 10, false);

insert into public.panel_customers (
  id, seller_id, name, whatsapp, status
) values (
  '00000000-0000-0000-0000-000000009101',
  '00000000-0000-0000-0000-000000009001',
  'Cliente Assinatura',
  '(11) 99999-9101',
  'active'
);

select throws_ok(
  $$insert into public.panel_customers (
      id, seller_id, name, whatsapp, status
    ) values (
      '00000000-0000-0000-0000-000000009102',
      '00000000-0000-0000-0000-000000009001',
      'Duplicado',
      '11999999101',
      'active'
    )$$,
  '23505',
  null,
  'Mesmo WhatsApp não duplica dentro do vendedor'
);

select lives_ok(
  $$insert into public.panel_customers (
      id, seller_id, name, whatsapp, status
    ) values (
      '00000000-0000-0000-0000-000000009103',
      '00000000-0000-0000-0000-000000009002',
      'Mesmo contato em outra carteira',
      '11999999101',
      'active'
    )$$,
  'Mesmo WhatsApp pode existir em outro vendedor'
);

insert into public.panel_plans (
  id, name, duration_days, credit_cost, max_devices, simultaneous_connections, billing_cycle, status
) values
  ('00000000-0000-0000-0000-000000009201', 'Mensal 2 aparelhos', 30, 2, 2, 2, 'monthly', 'active'),
  ('00000000-0000-0000-0000-000000009202', 'Mensal 3 aparelhos', 30, 4, 3, 2, 'monthly', 'active'),
  ('00000000-0000-0000-0000-000000009203', 'Mensal econômico', 30, 1, 2, 1, 'monthly', 'active');

insert into public.panel_playlists (
  id, name, playlist_url, playlist_type, active, max_connections,
  playlist_cache_status, playlist_cache_path
) values
  ('00000000-0000-0000-0000-000000009301', 'Lista exclusiva', 'https://exclusive.invalid/get.php', 'xtream', true, 5, 'ready', 'tests/exclusive.json.gz'),
  ('00000000-0000-0000-0000-000000009302', 'Lista reserva', 'https://backup.invalid/get.php', 'xtream', true, 5, 'ready', 'tests/backup.json.gz');

insert into public.panel_seller_playlists (seller_id, playlist_id, active) values
  ('00000000-0000-0000-0000-000000009001', '00000000-0000-0000-0000-000000009301', true),
  ('00000000-0000-0000-0000-000000009001', '00000000-0000-0000-0000-000000009302', true);

insert into public.panel_devices (id, device_code, status) values
  ('00000000-0000-0000-0000-000000009401', 'RPTV-SUB-01', 'pending'),
  ('00000000-0000-0000-0000-000000009402', 'RPTV-SUB-02', 'pending'),
  ('00000000-0000-0000-0000-000000009403', 'RPTV-SUB-03', 'pending'),
  ('00000000-0000-0000-0000-000000009404', 'RPTV-SUB-04', 'pending'),
  ('00000000-0000-0000-0000-000000009405', 'RPTV-LAB-01', 'pending');

select lives_ok(
  $$select * from public.create_customer_subscription_transaction(
    '00000000-0000-0000-0000-000000009001',
    '00000000-0000-0000-0000-000000009101',
    '00000000-0000-0000-0000-000000009201',
    '00000000-0000-0000-0000-000000009401',
    '00000000-0000-0000-0000-000000009301',
    '00000000-0000-0000-0000-000000009302',
    'teste',
    'create-key',
    '2099-01-01 00:00:00+00',
    null, null, null, null, null, null, null, null, 'seller'
  )$$,
  'Criação central é aplicada'
);

select is(
  (select credit_balance from public.panel_sellers where id = '00000000-0000-0000-0000-000000009001'),
  8,
  'Plano é cobrado uma única vez'
);

select is(
  (select count(*)::integer from public.panel_subscriptions where customer_id = '00000000-0000-0000-0000-000000009101'),
  1,
  'Uma assinatura é criada para o cliente'
);

select ok(
  (select subscription_id is not null from public.panel_devices where id = '00000000-0000-0000-0000-000000009401'),
  'Primeiro aparelho recebe a assinatura'
);

select is(
  (select count(*)::integer from public.panel_subscription_playlists where active is true and playlist_id in (
    '00000000-0000-0000-0000-000000009301',
    '00000000-0000-0000-0000-000000009302'
  )),
  2,
  'Principal e reserva ficam exclusivas da assinatura'
);

select is(
  (select applied from public.create_customer_subscription_transaction(
    '00000000-0000-0000-0000-000000009001',
    '00000000-0000-0000-0000-000000009101',
    '00000000-0000-0000-0000-000000009201',
    '00000000-0000-0000-0000-000000009401',
    '00000000-0000-0000-0000-000000009301',
    '00000000-0000-0000-0000-000000009302',
    'teste',
    'create-key',
    '2099-01-01 00:00:00+00',
    null, null, null, null, null, null, null, null, 'seller'
  )),
  false,
  'Retry da criação retorna não aplicado'
);

select is(
  (select credit_balance from public.panel_sellers where id = '00000000-0000-0000-0000-000000009001'),
  8,
  'Retry não cobra novamente'
);

select lives_ok(
  $$select * from public.add_subscription_device_transaction(
    (select id from public.panel_subscriptions where customer_id = '00000000-0000-0000-0000-000000009101'),
    '00000000-0000-0000-0000-000000009402',
    'teste',
    'add-second-key'
  )$$,
  'Segundo aparelho é adicionado dentro do limite'
);

select is(
  (select count(*)::integer from public.panel_subscription_devices
    where subscription_id = (select id from public.panel_subscriptions where customer_id = '00000000-0000-0000-0000-000000009101')
      and status = 'active'),
  2,
  'Assinatura possui dois aparelhos ativos'
);

select is(
  (select credit_balance from public.panel_sellers where id = '00000000-0000-0000-0000-000000009001'),
  8,
  'Adicionar aparelho dentro do plano não cobra'
);

select throws_ok(
  $$select * from public.add_subscription_device_transaction(
    (select id from public.panel_subscriptions where customer_id = '00000000-0000-0000-0000-000000009101'),
    '00000000-0000-0000-0000-000000009403',
    'teste',
    'limit-key'
  )$$,
  'P0001',
  'O plano atingiu o limite de aparelhos.',
  'Terceiro aparelho é bloqueado no plano de dois'
);

select lives_ok(
  $$select * from public.replace_subscription_device_transaction(
    (select id from public.panel_subscriptions where customer_id = '00000000-0000-0000-0000-000000009101'),
    '00000000-0000-0000-0000-000000009402',
    '00000000-0000-0000-0000-000000009404',
    'TV substituída',
    'teste',
    'replace-key'
  )$$,
  'Aparelho é substituído sem nova vaga'
);

select is(
  (select status from public.panel_subscription_devices
    where device_id = '00000000-0000-0000-0000-000000009402'),
  'replaced',
  'Aparelho antigo fica revogado como substituído'
);

select is(
  (select status from public.panel_subscription_devices
    where device_id = '00000000-0000-0000-0000-000000009404'),
  'active',
  'Aparelho novo ocupa a vaga'
);

select is(
  (select credit_balance from public.panel_sellers where id = '00000000-0000-0000-0000-000000009001'),
  8,
  'Substituição não cobra créditos'
);

select lives_ok(
  $$select * from public.change_subscription_plan_transaction(
    (select id from public.panel_subscriptions where customer_id = '00000000-0000-0000-0000-000000009101'),
    '00000000-0000-0000-0000-000000009202',
    'upgrade',
    'teste',
    'upgrade-key'
  )$$,
  'Upgrade é aplicado'
);

select is(
  (select credit_balance from public.panel_sellers where id = '00000000-0000-0000-0000-000000009001'),
  6,
  'Upgrade cobra somente a diferença de créditos'
);

select is(
  (select max_devices_snapshot from public.panel_subscriptions where customer_id = '00000000-0000-0000-0000-000000009101'),
  3,
  'Upgrade atualiza o limite congelado da assinatura'
);

select is(
  (select applied from public.change_subscription_plan_transaction(
    (select id from public.panel_subscriptions where customer_id = '00000000-0000-0000-0000-000000009101'),
    '00000000-0000-0000-0000-000000009202',
    'upgrade',
    'teste',
    'upgrade-key'
  )),
  false,
  'Retry do upgrade retorna não aplicado'
);

select is(
  (select credit_balance from public.panel_sellers where id = '00000000-0000-0000-0000-000000009001'),
  6,
  'Retry do upgrade não cobra novamente'
);

select lives_ok(
  $$select * from public.change_subscription_plan_transaction(
    (select id from public.panel_subscriptions where customer_id = '00000000-0000-0000-0000-000000009101'),
    '00000000-0000-0000-0000-000000009203',
    'schedule_downgrade',
    'teste',
    'downgrade-key'
  )$$,
  'Downgrade é agendado'
);

select is(
  (select scheduled_plan_id from public.panel_subscriptions where customer_id = '00000000-0000-0000-0000-000000009101'),
  '00000000-0000-0000-0000-000000009203'::uuid,
  'Plano menor fica agendado para a renovação'
);

select lives_ok(
  $$select * from public.renew_customer_subscription_transaction(
    (select id from public.panel_subscriptions where customer_id = '00000000-0000-0000-0000-000000009101'),
    'teste',
    'renew-key',
    null, null, null, null, null, null, null, 'seller'
  )$$,
  'Renovação central é aplicada'
);

select is(
  (select credit_balance from public.panel_sellers where id = '00000000-0000-0000-0000-000000009001'),
  5,
  'Renovação cobra uma vez o plano agendado'
);

select is(
  (select count(distinct subscription_expires_at)::integer from public.panel_devices
    where subscription_id = (select id from public.panel_subscriptions where customer_id = '00000000-0000-0000-0000-000000009101')),
  1,
  'Todos os aparelhos recebem a mesma validade'
);

select is(
  (select scheduled_plan_id from public.panel_subscriptions where customer_id = '00000000-0000-0000-0000-000000009101'),
  null::uuid,
  'Plano agendado é consumido após a renovação'
);

update public.panel_devices
set is_lab_device = true
where id = '00000000-0000-0000-0000-000000009405';

select lives_ok(
  $$insert into public.panel_lab_sessions (
      source_subscription_id,
      source_device_id,
      lab_device_id,
      duration_minutes,
      reason,
      starts_at,
      expires_at,
      created_by_user_id
    ) values (
      (select id from public.panel_subscriptions where customer_id = '00000000-0000-0000-0000-000000009101'),
      '00000000-0000-0000-0000-000000009401',
      '00000000-0000-0000-0000-000000009405',
      90,
      'Validar cache de séries',
      now(),
      now() + interval '90 minutes',
      '00000000-0000-0000-0000-000000009999'
    )$$,
  'Sessão de laboratório aceita duração escolhida'
);

select throws_ok(
  $$insert into public.panel_lab_sessions (
      source_subscription_id,
      source_device_id,
      lab_device_id,
      duration_minutes,
      reason,
      starts_at,
      expires_at,
      created_by_user_id
    ) values (
      (select id from public.panel_subscriptions where customer_id = '00000000-0000-0000-0000-000000009101'),
      '00000000-0000-0000-0000-000000009401',
      '00000000-0000-0000-0000-000000009405',
      30,
      'Segunda sessão concorrente',
      now(),
      now() + interval '30 minutes',
      '00000000-0000-0000-0000-000000009999'
    )$$,
  '23505',
  null,
  'Um aparelho de laboratório não recebe duas sessões ativas'
);

select * from finish();
rollback;
