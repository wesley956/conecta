begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(24);

select has_function(
  'public',
  'delete_seller_account_transaction',
  array['uuid','uuid','text'],
  'RPC transacional de exclusão lógica existe'
);
select ok(
  not has_function_privilege('anon', 'public.delete_seller_account_transaction(uuid,uuid,text)', 'execute'),
  'anon não exclui vendedor diretamente'
);
select ok(
  not has_function_privilege('authenticated', 'public.delete_seller_account_transaction(uuid,uuid,text)', 'execute'),
  'usuário autenticado não exclui vendedor diretamente'
);
select ok(
  has_function_privilege('service_role', 'public.delete_seller_account_transaction(uuid,uuid,text)', 'execute'),
  'somente o servidor executa a exclusão lógica'
);

select has_check(
  'public', 'panel_sellers', 'panel_sellers_legacy_access_token_retired_check',
  'Token legado de vendedor não pode voltar a receber valor'
);
select has_check(
  'public', 'panel_sellers', 'panel_sellers_public_code_retired_check',
  'Código público legado não pode voltar a receber valor'
);

select ok(
  to_regprocedure('public.panel_finance_scope_for_role(text)') is null
  or exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'panel_finance_scope_for_role'
       and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=%'
  ),
  'Helper financeiro, quando existir, possui search_path fixo'
);

select ok(
  not has_function_privilege('anon', 'public.apply_known_playlist_server_profile_after_primary_change()', 'execute'),
  'anon não chama helper interno de mudança de endpoint'
);
select ok(
  not has_function_privilege('authenticated', 'public.apply_known_playlist_server_profile_after_primary_change()', 'execute'),
  'authenticated não chama helper interno de mudança de endpoint'
);
select ok(
  not has_function_privilege('anon', 'public.apply_known_playlist_server_profile_after_profile_insert()', 'execute'),
  'anon não chama helper interno de perfil de conexão'
);
select ok(
  not has_function_privilege('authenticated', 'public.apply_known_playlist_server_profile_after_profile_insert()', 'execute'),
  'authenticated não chama helper interno de perfil de conexão'
);
select ok(
  not has_function_privilege('anon', 'public.learn_playlist_server_profile()', 'execute'),
  'anon não chama helper interno de aprendizado'
);
select ok(
  not has_function_privilege('authenticated', 'public.learn_playlist_server_profile()', 'execute'),
  'authenticated não chama helper interno de aprendizado'
);

insert into public.panel_sellers(
  id, name, whatsapp, email, status, credit_balance, can_go_negative
) values (
  '00000000-0000-0000-0000-000000009501',
  'Vendedor Lote 5',
  '551199995001',
  'lote5@example.invalid',
  'active',
  17,
  false
);

insert into public.panel_plans(id, name, duration_days, credit_cost, max_devices, status)
values (
  '00000000-0000-0000-0000-000000009502',
  'Plano Lote 5',
  30,
  1,
  1,
  'active'
);

insert into public.panel_playlists(id, name, playlist_url, playlist_type, active)
values (
  '00000000-0000-0000-0000-000000009503',
  'Lista Lote 5',
  'https://example.invalid/lote5.m3u',
  'm3u',
  true
);

insert into public.panel_seller_playlists(seller_id, playlist_id, active)
values (
  '00000000-0000-0000-0000-000000009501',
  '00000000-0000-0000-0000-000000009503',
  true
);

insert into public.panel_seller_plan_prices(seller_id, plan_id, default_sale_price_cents, active)
values (
  '00000000-0000-0000-0000-000000009501',
  '00000000-0000-0000-0000-000000009502',
  1990,
  true
);

insert into public.panel_customers(id, name, whatsapp, seller_id, status)
values (
  '00000000-0000-0000-0000-000000009504',
  'Cliente Lote 5',
  '551199995004',
  '00000000-0000-0000-0000-000000009501',
  'active'
);

insert into public.panel_devices(
  id, device_code, device_uuid, client_name, status, seller_id, customer_id, plan_id, playlist_id
) values (
  '00000000-0000-0000-0000-000000009505',
  'RPTV-L5TEST',
  'lote5-device-uuid',
  'Cliente Lote 5',
  'active',
  '00000000-0000-0000-0000-000000009501',
  '00000000-0000-0000-0000-000000009504',
  '00000000-0000-0000-0000-000000009502',
  '00000000-0000-0000-0000-000000009503'
);

insert into public.panel_credit_ledger(seller_id, amount, type, description, balance_after, performed_by)
values (
  '00000000-0000-0000-0000-000000009501',
  17,
  'manual_add',
  'Histórico preservado do Lote 5',
  17,
  'test'
);

select lives_ok(
  $$select public.delete_seller_account_transaction(
    '00000000-0000-0000-0000-000000009501',
    null,
    'pgtap_lote5'
  )$$,
  'Exclusão lógica executa em uma única transação'
);

select is(
  (select count(*)::integer from public.panel_sellers where id = '00000000-0000-0000-0000-000000009501'),
  1,
  'Registro comercial do vendedor é preservado'
);
select ok(
  (select status = 'inactive' and deleted_at is not null and deletion_reason = 'pgtap_lote5'
     from public.panel_sellers where id = '00000000-0000-0000-0000-000000009501'),
  'Vendedor fica inativo e excluído logicamente'
);
select ok(
  (select access_token is null and public_code is null
     from public.panel_sellers where id = '00000000-0000-0000-0000-000000009501'),
  'Credenciais legadas permanecem nulas após exclusão'
);
select ok(
  (select seller_id is null from public.panel_devices where id = '00000000-0000-0000-0000-000000009505'),
  'Aparelho é apenas desvinculado do vendedor'
);
select ok(
  (select seller_id is null from public.panel_customers where id = '00000000-0000-0000-0000-000000009504'),
  'Cliente é apenas desvinculado do vendedor'
);
select ok(
  not (select active from public.panel_seller_playlists
       where seller_id = '00000000-0000-0000-0000-000000009501'
         and playlist_id = '00000000-0000-0000-0000-000000009503'),
  'Permissão de lista do vendedor é desativada'
);
select ok(
  not (select active from public.panel_seller_plan_prices
       where seller_id = '00000000-0000-0000-0000-000000009501'
         and plan_id = '00000000-0000-0000-0000-000000009502'),
  'Preço privado do vendedor é desativado'
);
select is(
  (select count(*)::integer from public.panel_credit_ledger where seller_id = '00000000-0000-0000-0000-000000009501'),
  1,
  'Histórico de créditos não é apagado'
);
select is(
  (select count(*)::integer from public.panel_audit_logs
    where entity_id = '00000000-0000-0000-0000-000000009501'
      and action = 'seller.deleted_logically'),
  1,
  'Exclusão lógica é auditada'
);
select throws_ok(
  $$select public.delete_seller_account_transaction(
    '00000000-0000-0000-0000-000000009501', null, 'segunda_tentativa'
  )$$,
  'P0001',
  'Vendedor já foi excluído.',
  'Exclusão repetida não altera novamente o histórico'
);

select * from finish();
rollback;
