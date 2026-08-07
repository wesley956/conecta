begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(17);

select has_column('public', 'panel_customers', 'notes', 'Cliente possui observação opcional');

select has_function(
  'public',
  'seller_device_flow_transaction_v4',
  array[
    'uuid','uuid','text','text','uuid','uuid','uuid','timestamp with time zone',
    'uuid','text','text','text','text','text','uuid'
  ],
  'RPC comercial v4 existe'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.seller_device_flow_transaction_v4(uuid,uuid,text,text,uuid,uuid,uuid,timestamp with time zone,uuid,text,text,text,text,text,uuid)',
    'execute'
  ),
  'authenticated não executa a transação v4 diretamente'
);

insert into public.panel_sellers(id, name, whatsapp, status, credit_balance, can_go_negative)
values ('40000000-0000-4000-8000-000000000001', 'Vendedor UX', '551199991111', 'active', 10, false);

insert into public.panel_plans(id, name, duration_days, credit_cost, max_devices, status)
values ('40000000-0000-4000-8000-000000000101', 'Plano UX 30', 30, 1, 1, 'active');

insert into public.panel_playlists(
  id, name, playlist_url, playlist_type, active,
  playlist_access_mode, playlist_cache_status, playlist_cache_item_count, playlist_cache_updated_at
) values (
  '40000000-0000-4000-8000-000000000201', 'Lista UX', 'https://ux.invalid/list.m3u', 'm3u', true,
  'server_cache', 'ready', 25, now()
);

insert into public.panel_seller_playlists(seller_id, playlist_id, active)
values ('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000201', true);

insert into public.panel_devices(id, device_code, status)
values
  ('40000000-0000-4000-8000-000000000401', 'RPTV-UX001', 'pending'),
  ('40000000-0000-4000-8000-000000000402', 'RPTV-UX002', 'pending');

select lives_ok(
  $$select public.seller_device_flow_transaction_v4(
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000401',
    'activation', 'lote4-activation-1',
    '40000000-0000-4000-8000-000000000101',
    '40000000-0000-4000-8000-000000000201',
    null, null, null,
    'Cliente UX', '11988887777', 'TV da sala · cliente prefere atendimento à noite',
    null, 'seller-device-flow:seller:test', null
  )$$,
  'Ativação v4 aceita observação opcional e validade automática'
);

select is(
  (select notes from public.panel_customers where seller_id = '40000000-0000-4000-8000-000000000001' and whatsapp = '11988887777'),
  'TV da sala · cliente prefere atendimento à noite',
  'Observação é salva no mesmo cliente criado pela ativação'
);

select is(
  to_char(
    (select subscription_expires_at from public.panel_devices where id = '40000000-0000-4000-8000-000000000401') at time zone 'America/Sao_Paulo',
    'HH24:MI:SS.MS'
  ),
  '23:59:59.999',
  'Validade automática termina exatamente às 23:59:59.999 em São Paulo'
);

select is(
  ((select subscription_expires_at from public.panel_devices where id = '40000000-0000-4000-8000-000000000401') at time zone 'America/Sao_Paulo')::date,
  (now() at time zone 'America/Sao_Paulo')::date + 30,
  'Validade automática soma os 30 dias usando o calendário de São Paulo'
);

select is(
  (select credit_balance from public.panel_sellers where id = '40000000-0000-4000-8000-000000000001'),
  9,
  'Ativação v4 consome somente um crédito'
);

select lives_ok(
  $$select public.seller_device_flow_transaction_v4(
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000401',
    'renewal', 'lote4-renewal-1',
    '40000000-0000-4000-8000-000000000101',
    null, null, '2099-04-01 23:59:59.999+00',
    null, null, null, null,
    null, 'seller-device-flow:seller:test', null
  )$$,
  'Renovação v4 aceita a data legada do ADM e a normaliza'
);

select is(
  to_char(
    (select subscription_expires_at from public.panel_devices where id = '40000000-0000-4000-8000-000000000401') at time zone 'America/Sao_Paulo',
    'YYYY-MM-DD HH24:MI:SS.MS'
  ),
  '2099-04-01 23:59:59.999',
  'Data legada 23:59Z vira fim do mesmo dia em America/Sao_Paulo'
);

select is(
  (select notes from public.panel_customers where seller_id = '40000000-0000-4000-8000-000000000001' and whatsapp = '11988887777'),
  'TV da sala · cliente prefere atendimento à noite',
  'Renovação preserva a observação do cliente'
);

select throws_ok(
  $$select public.seller_device_flow_transaction_v4(
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000401',
    'renewal', 'lote4-renewal-note-invalid',
    '40000000-0000-4000-8000-000000000101',
    null, null, '2099-05-01 02:59:59.999+00',
    null, null, null, 'não pode mudar na renovação',
    null, 'seller-device-flow:seller:test', null
  )$$,
  '22023',
  'Renovação e troca de listas não alteram a observação do cliente.',
  'Renovação não pode alterar observação'
);

select throws_ok(
  $$select public.seller_device_flow_transaction_v4(
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000402',
    'activation', 'lote4-long-note',
    '40000000-0000-4000-8000-000000000101',
    '40000000-0000-4000-8000-000000000201',
    null, null, null,
    'Cliente Inválido', '11977776666', repeat('x', 1001),
    null, 'seller-device-flow:seller:test', null
  )$$,
  '22023',
  'A observação do cliente deve ter no máximo 1000 caracteres.',
  'Observação acima do limite interrompe a transação'
);

select is(
  (select status from public.panel_devices where id = '40000000-0000-4000-8000-000000000402'),
  'pending',
  'Falha de observação mantém o aparelho pendente'
);

select is(
  (select count(*)::integer from public.panel_customers where whatsapp = '11977776666'),
  0,
  'Falha de observação não cria cliente parcial'
);

select is(
  (select credit_balance from public.panel_sellers where id = '40000000-0000-4000-8000-000000000001'),
  8,
  'Falha de observação não consome crédito adicional'
);

select is(
  public.seller_device_flow_transaction_v4(
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000401',
    'renewal', 'lote4-renewal-1',
    '40000000-0000-4000-8000-000000000101',
    null, null, '2099-04-01 23:59:59.999+00',
    null, null, null, null,
    null, 'seller-device-flow:seller:test', null
  )->>'timeZone',
  'America/Sao_Paulo',
  'Replay idempotente mantém o fuso oficial no resultado'
);

select * from finish();
rollback;
