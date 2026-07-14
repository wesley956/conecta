begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(22);

select has_table('public', 'panel_user_roles', 'Tabela de papéis do painel existe');
select has_function(
  'public',
  'assign_panel_role',
  array['uuid', 'text', 'uuid', 'boolean'],
  'RPC de atribuição de papel existe'
);
select has_function(
  'public',
  'revoke_panel_role',
  array['uuid'],
  'RPC de revogação de papel existe'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.panel_user_roles'::regclass),
  'RLS está habilitada em panel_user_roles'
);
select ok(
  (select relforcerowsecurity from pg_class where oid = 'public.panel_user_roles'::regclass),
  'RLS está forçada em panel_user_roles'
);

select ok(not has_table_privilege('anon', 'public.panel_user_roles', 'select'), 'anon não pode ler papéis');
select ok(not has_table_privilege('authenticated', 'public.panel_user_roles', 'select'), 'authenticated não pode ler papéis diretamente');
select ok(not has_table_privilege('anon', 'public.panel_user_roles', 'insert'), 'anon não pode criar papéis');
select ok(not has_table_privilege('authenticated', 'public.panel_user_roles', 'update'), 'authenticated não pode alterar papéis');
select ok(has_table_privilege('service_role', 'public.panel_user_roles', 'select'), 'service_role pode consultar papéis');

select ok(
  not has_function_privilege('anon', 'public.assign_panel_role(uuid,text,uuid,boolean)', 'execute'),
  'anon não pode atribuir papel'
);
select ok(
  not has_function_privilege('authenticated', 'public.assign_panel_role(uuid,text,uuid,boolean)', 'execute'),
  'authenticated não pode atribuir papel'
);
select ok(
  has_function_privilege('service_role', 'public.assign_panel_role(uuid,text,uuid,boolean)', 'execute'),
  'service_role pode atribuir papel'
);
select ok(
  not has_function_privilege('authenticated', 'public.revoke_panel_role(uuid)', 'execute'),
  'authenticated não pode revogar papel'
);
select ok(
  has_function_privilege('service_role', 'public.revoke_panel_role(uuid)', 'execute'),
  'service_role pode revogar papel'
);

insert into auth.users (id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000101', 'authenticated', 'authenticated', 'admin-test@example.com'),
  ('00000000-0000-0000-0000-000000000102', 'authenticated', 'authenticated', 'seller-test@example.com'),
  ('00000000-0000-0000-0000-000000000103', 'authenticated', 'authenticated', 'duplicate-test@example.com');

insert into public.panel_sellers (id, name, whatsapp, email)
values (
  '00000000-0000-0000-0000-000000000201',
  'Vendedor de Teste',
  '5511999999999',
  'seller-test@example.com'
);

select lives_ok(
  $$select public.assign_panel_role(
    '00000000-0000-0000-0000-000000000101',
    'admin',
    null,
    true
  )$$,
  'Atribui papel de administrador'
);

select results_eq(
  $$select role, seller_id, active from public.panel_user_roles
    where user_id = '00000000-0000-0000-0000-000000000101'$$,
  $$values ('admin'::text, null::uuid, true)$$,
  'Administrador fica ativo e sem seller_id'
);

select lives_ok(
  $$select public.assign_panel_role(
    '00000000-0000-0000-0000-000000000102',
    'seller',
    '00000000-0000-0000-0000-000000000201',
    true
  )$$,
  'Atribui papel de vendedor'
);

select results_eq(
  $$select role, seller_id, active from public.panel_user_roles
    where user_id = '00000000-0000-0000-0000-000000000102'$$,
  $$values (
    'seller'::text,
    '00000000-0000-0000-0000-000000000201'::uuid,
    true
  )$$,
  'Vendedor fica vinculado ao seller_id correto'
);

select throws_ok(
  $$select public.assign_panel_role(
    '00000000-0000-0000-0000-000000000103',
    'seller',
    '00000000-0000-0000-0000-000000000201',
    true
  )$$,
  '23505',
  'Este vendedor já está vinculado a outro usuário.',
  'Impede que dois usuários compartilhem o mesmo vendedor'
);

select lives_ok(
  $$select public.revoke_panel_role('00000000-0000-0000-0000-000000000102')$$,
  'Revoga o acesso do vendedor'
);

select is(
  (select active from public.panel_user_roles
    where user_id = '00000000-0000-0000-0000-000000000102'),
  false,
  'Revogação desativa o papel'
);

select * from finish();
rollback;
