begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(4);

insert into public.panel_sellers (
  id, name, whatsapp, status, credit_balance, can_go_negative
) values (
  '00000000-0000-0000-0000-000000009501',
  'Vendedor Retry Financeiro',
  '551199995001',
  'active',
  5,
  false
);

insert into public.panel_plans (
  id, name, duration_days, credit_cost, max_devices, status
) values (
  '00000000-0000-0000-0000-000000009502',
  'Plano Retry Financeiro',
  30,
  1,
  1,
  'active'
);

insert into public.panel_playlists (
  id, name, playlist_url, playlist_type, active
) values (
  '00000000-0000-0000-0000-000000009503',
  'Lista Retry Financeiro',
  'https://example.invalid/retry.m3u',
  'm3u',
  true
);

insert into public.panel_seller_playlists (seller_id, playlist_id, active) values (
  '00000000-0000-0000-0000-000000009501',
  '00000000-0000-0000-0000-000000009503',
  true
);

insert into public.panel_devices (id, device_code, status) values (
  '00000000-0000-0000-0000-000000009504',
  'RPTV-FINRETRY',
  'pending'
);

select lives_ok(
  $$select * from public.apply_device_subscription_with_finance(
    '00000000-0000-0000-0000-000000009501',
    '00000000-0000-0000-0000-000000009504',
    '00000000-0000-0000-0000-000000009502',
    '00000000-0000-0000-0000-000000009503',
    null,
    '2099-05-01 23:59:59+00',
    'activation',
    'seller',
    'paid-without-time-key',
    null,
    'Cliente Retry',
    true,
    3990,
    'paid',
    'pix',
    null,
    null,
    null,
    'Venda retry',
    null,
    'seller'
  )$$,
  'Pagamento sem horário explícito é processado'
);

select ok(
  (select paid_at is not null from public.panel_financial_records where idempotency_key = 'paid-without-time-key'),
  'Servidor define a data de pagamento'
);

select is(
  (select applied from public.apply_device_subscription_with_finance(
    '00000000-0000-0000-0000-000000009501',
    '00000000-0000-0000-0000-000000009504',
    '00000000-0000-0000-0000-000000009502',
    '00000000-0000-0000-0000-000000009503',
    null,
    '2099-05-01 23:59:59+00',
    'activation',
    'seller',
    'paid-without-time-key',
    null,
    'Cliente Retry',
    true,
    3990,
    'paid',
    'pix',
    null,
    null,
    null,
    'Venda retry',
    null,
    'seller'
  )),
  false,
  'Retry sem horário explícito reutiliza o pagamento existente'
);

select is(
  (select count(*)::integer from public.panel_financial_records where idempotency_key = 'paid-without-time-key'),
  1,
  'Retry sem horário não duplica receita'
);

select * from finish();
rollback;
