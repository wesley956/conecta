begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(24);

select has_column('public', 'panel_sellers', 'access_expires_at', 'Vendedor possui vencimento de acesso');
select has_column('public', 'panel_sellers', 'auto_delete_after_expiry', 'Exclusão automática pode ser configurada');
select has_column('public', 'panel_sellers', 'auto_delete_grace_hours', 'Tolerância é configurável');
select has_column('public', 'panel_sellers', 'blocked_at', 'Bloqueio automático é registrado');
select has_column('public', 'panel_sellers', 'scheduled_deletion_at', 'Exclusão pode ser agendada');
select has_column('public', 'panel_sellers', 'deleted_at', 'Exclusão lógica preserva histórico');

select has_function(
  'public',
  'configure_seller_temporary_access',
  array['uuid', 'integer', 'boolean', 'integer'],
  'RPC de renovação e validade existe'
);
select has_function(
  'public',
  'process_seller_temporary_access_lifecycle',
  array[]::text[],
  'Processador automático existe'
);

select ok(
  not has_function_privilege('anon', 'public.configure_seller_temporary_access(uuid,integer,boolean,integer)', 'execute'),
  'anon não altera validade de vendedor'
);
select ok(
  not has_function_privilege('authenticated', 'public.configure_seller_temporary_access(uuid,integer,boolean,integer)', 'execute'),
  'usuário autenticado não altera validade diretamente'
);
select ok(
  not has_function_privilege('anon', 'public.process_seller_temporary_access_lifecycle()', 'execute'),
  'anon não executa o processador automático'
);
select ok(
  not has_function_privilege('authenticated', 'public.process_seller_temporary_access_lifecycle()', 'execute'),
  'usuário autenticado não executa o processador automático'
);

insert into public.panel_sellers (
  id, name, whatsapp, status, credit_balance, can_go_negative,
  access_expires_at, auto_delete_after_expiry, auto_delete_grace_hours
) values (
  '00000000-0000-0000-0000-000000008001',
  'Vendedor Temporário Vencido',
  '551199998001',
  'active',
  0,
  false,
  now() - interval '1 hour',
  true,
  36
);

select lives_ok(
  $$select public.process_seller_temporary_access_lifecycle()$$,
  'Processador bloqueia contas vencidas'
);
select is(
  (select status from public.panel_sellers where id = '00000000-0000-0000-0000-000000008001'),
  'blocked',
  'Conta vencida fica bloqueada'
);
select ok(
  (select scheduled_deletion_at > now() from public.panel_sellers where id = '00000000-0000-0000-0000-000000008001'),
  'Exclusão fica agendada depois da tolerância'
);

update public.panel_sellers
set scheduled_deletion_at = now() - interval '1 minute'
where id = '00000000-0000-0000-0000-000000008001';

select lives_ok(
  $$select public.process_seller_temporary_access_lifecycle()$$,
  'Processador exclui logicamente conta não renovada'
);
select is(
  (select status from public.panel_sellers where id = '00000000-0000-0000-0000-000000008001'),
  'inactive',
  'Conta excluída deixa de ficar ativa'
);
select ok(
  (select deleted_at is not null from public.panel_sellers where id = '00000000-0000-0000-0000-000000008001'),
  'Exclusão lógica mantém registro e marca a data'
);
select is(
  (select count(*)::integer from public.panel_audit_logs where entity_id = '00000000-0000-0000-0000-000000008001'),
  2,
  'Bloqueio e exclusão automáticos entram na auditoria'
);

insert into public.panel_sellers (
  id, name, whatsapp, status, credit_balance, can_go_negative
) values (
  '00000000-0000-0000-0000-000000008002',
  'Vendedor para Renovação',
  '551199998002',
  'blocked',
  0,
  false
);

select throws_ok(
  $$select * from public.configure_seller_temporary_access(
    '00000000-0000-0000-0000-000000008002', 24, false, null
  )$$,
  '22023',
  'A tolerância deve ficar entre 1 e 720 horas.',
  'Tolerância nula é recusada'
);
select throws_ok(
  $$select * from public.configure_seller_temporary_access(
    '00000000-0000-0000-0000-000000008002', null, true, 36
  )$$,
  '22023',
  'Conta sem vencimento não pode ser excluída automaticamente.',
  'Exclusão automática exige vencimento'
);

select lives_ok(
  $$select * from public.configure_seller_temporary_access(
    '00000000-0000-0000-0000-000000008002', 24, true, 36
  )$$,
  'Administrador pode renovar por 24 horas'
);
select ok(
  (select status = 'active' and access_expires_at between now() + interval '23 hours' and now() + interval '25 hours'
   from public.panel_sellers where id = '00000000-0000-0000-0000-000000008002'),
  'Renovação reativa e aplica a nova validade'
);
select ok(
  (select auto_delete_after_expiry and auto_delete_grace_hours = 36
   from public.panel_sellers where id = '00000000-0000-0000-0000-000000008002'),
  'Renovação preserva a política de exclusão configurada'
);

select * from finish();
rollback;
