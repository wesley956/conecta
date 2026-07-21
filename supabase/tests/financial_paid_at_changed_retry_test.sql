begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(4);

insert into public.panel_sellers (
  id, name, whatsapp, status, credit_balance, can_go_negative
) values (
  '00000000-0000-0000-0000-000000009601',
  'Vendedor Horário Retry',
  '551199996001',
  'active',
  5,
  false
);

insert into public.panel_plans (
  id, name, duration_days, credit_cost, max_devices, status
) values (
  '00000000-0000-0000-0000-000000009602',
  'Plano Horário Retry',
  30,
  1,
  1,
  'active'
);

insert into public.panel_playlists (
  id, name, playlist_url, playlist_type, active
) values (
  '00000000-0000-0000-0000-000000009603',
  'Lista Horário Retry',
  'https://example.invalid/retry-time.m3u',
  'm3u',
  true
);

insert into public.panel_seller_playlists (seller_id, playlist_id, active) values (
  '00000000-0000-0000-0000-000000009601',
  '00000000-0000-0000-0000-000000009603',
  true
);

insert into public.panel_devices (id, device_code, status) values (
  '00000000-0000-0000-0000-000000009604',
  'RPTV-FINTIME',
  'pending'
);

select lives_ok(
  $$select * from public.apply_device_subscription_with_finance(
    '00000000-0000-0000-0000-000000009601',
    '00000000-0000-0000-0000-000000009604',
    '00000000-0000-0000-0000-000000009602',
    '00000000-0000-0000-0000-000000009603',
    null,
    '2099-06-01 23:59:59+00',
    'activation',
    'seller',
    'changed-paid-time-key',
    null,
    'Cliente Horário Retry',
    true,
    2990,
    'paid',
    'pix',
    null,
    '2099-01-01 10:00:00+00',
    null,
    'Venda horário retry',
    null,
    'seller'
  )$$,
  'Primeira tentativa registra o horário recebido'
);

select is(
  (select paid_at from public.panel_financial_records where idempotency_key = 'changed-paid-time-key'),
  '2099-01-01 10:00:00+00'::timestamptz,
  'Primeiro horário é persistido'
);

select is(
  (select applied from public.apply_device_subscription_with_finance(
    '00000000-0000-0000-0000-000000009601',
    '00000000-0000-0000-0000-000000009604',
    '00000000-0000-0000-0000-000000009602',
    '00000000-0000-0000-0000-000000009603',
    null,
    '2099-06-01 23:59:59+00',
    'activation',
    'seller',
    'changed-paid-time-key',
    null,
    'Cliente Horário Retry',
    true,
    2990,
    'paid',
    'pix',
    null,
    '2099-01-01 10:05:00+00',
    null,
    'Venda horário retry',
    null,
    'seller'
  )),
  false,
  'Retry com outro horário reutiliza a operação existente'
);

select is(
  (select paid_at from public.panel_financial_records where idempotency_key = 'changed-paid-time-key'),
  '2099-01-01 10:00:00+00'::timestamptz,
  'Retry não altera o horário original'
);

select * from finish();
rollback;
