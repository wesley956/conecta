begin;

select plan(14);

select has_table('public', 'panel_system_support_profiles', 'Perfil oficial existe');
select has_table('public', 'panel_seller_support_profiles', 'Perfil de vendedor existe');
select has_column('public', 'panel_system_support_profiles', 'enabled', 'Perfil oficial possui chave de visibilidade');
select has_column('public', 'panel_seller_support_profiles', 'show_in_app', 'Perfil de vendedor possui chave de visibilidade');
select has_column('public', 'panel_seller_support_profiles', 'seller_id', 'Perfil de vendedor usa vínculo canônico');
select col_is_pk('public', 'panel_seller_support_profiles', 'seller_id', 'Um perfil por vendedor');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.panel_system_support_profiles'::regclass), 'RLS forçada no suporte oficial');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.panel_seller_support_profiles'::regclass), 'RLS forçada no suporte de vendedor');
select ok(not has_table_privilege('anon', 'public.panel_system_support_profiles', 'select'), 'Anon não lê suporte oficial diretamente');
select ok(not has_table_privilege('authenticated', 'public.panel_system_support_profiles', 'select'), 'Authenticated não lê suporte oficial diretamente');
select ok(not has_table_privilege('anon', 'public.panel_seller_support_profiles', 'select'), 'Anon não enumera perfis de vendedor');
select ok(not has_table_privilege('authenticated', 'public.panel_seller_support_profiles', 'select'), 'Authenticated não enumera perfis de vendedor');
select ok(has_table_privilege('service_role', 'public.panel_system_support_profiles', 'select'), 'Backend lê suporte oficial');
select ok(has_table_privilege('service_role', 'public.panel_seller_support_profiles', 'select'), 'Backend lê suporte de vendedor');

select * from finish();
rollback;
