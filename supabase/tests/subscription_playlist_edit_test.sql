begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(20);

select has_table('public', 'panel_playlist_revisions', 'Histórico de troca de listas existe');
select has_function(
  'public',
  'replace_subscription_playlist_transaction',
  array['uuid', 'smallint', 'uuid', 'text', 'text', 'uuid', 'text'],
  'RPC de troca segura de lista existe'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.replace_subscription_playlist_transaction(uuid,smallint,uuid,text,text,uuid,text)',
    'execute'
  ),
  'anon não troca lista diretamente'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.replace_subscription_playlist_transaction(uuid,smallint,uuid,text,text,uuid,text)',
    'execute'
  ),
  'authenticated não troca lista diretamente'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.replace_subscription_playlist_transaction(uuid,smallint,uuid,text,text,uuid,text)',
    'execute'
  ),
  'service_role pode trocar lista'
);

insert into public.panel_sellers (
  id, name, whatsapp, status, credit_balance, can_go_negative
) values (
  '00000000-0000-0000-0000-000000008001',
  'Vendedor edição',
  '551199980001',
  'active',
  25,
  false
);

insert into public.panel_customers (
  id, seller_id, name, whatsapp, status
) values (
  '00000000-0000-0000-0000-000000008101',
  '00000000-0000-0000-0000-000000008001',
  'Cliente edição',
  '551199988101',
  'active'
);

insert into public.panel_plans (
  id, name, duration_days, credit_cost, max_devices,
  simultaneous_connections, billing_cycle, status
) values (
  '00000000-0000-0000-0000-000000008201',
  'Mensal dois aparelhos',
  30,
  2,
  2,
  2,
  'monthly',
  'active'
);

insert into public.panel_playlists (
  id, name, playlist_url, playlist_type, active, max_connections,
  playlist_cache_status, playlist_cache_path, playlist_cache_item_count
) values
  (
    '00000000-0000-0000-0000-000000008301',
    'Lista principal antiga',
    'https://old-edit.invalid/get.php?username=old&password=old',
    'xtream',
    true,
    2,
    'ready',
    'tests/old-edit.json',
    10
  ),
  (
    '00000000-0000-0000-0000-000000008302',
    'Lista principal nova',
    'https://new-edit.invalid/get.php?username=new&password=new',
    'xtream',
    true,
    3,
    'ready',
    'tests/new-edit.json',
    20
  ),
  (
    '00000000-0000-0000-0000-000000008303',
    'Lista reserva nova',
    'https://backup-edit.invalid/get.php?username=backup&password=backup',
    'xtream',
    true,
    3,
    'ready',
    'tests/backup-edit.json',
    20
  ),
  (
    '00000000-0000-0000-0000-000000008304',
    'Lista sem conexões',
    'https://low-edit.invalid/get.php?username=low&password=low',
    'xtream',
    true,
    1,
    'ready',
    'tests/low-edit.json',
    20
  ),
  (
    '00000000-0000-0000-0000-000000008305',
    'Lista sem cache',
    'https://cache-edit.invalid/get.php?username=cache&password=cache',
    'xtream',
    true,
    3,
    'error',
    null,
    0
  ),
  (
    '00000000-0000-0000-0000-000000008306',
    'Lista não liberada',
    'https://permission-edit.invalid/get.php?username=x&password=y',
    'xtream',
    true,
    3,
    'ready',
    'tests/permission-edit.json',
    20
  );

insert into public.panel_seller_playlists (seller_id, playlist_id, active) values
  ('00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008301', true),
  ('00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008302', true),
  ('00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008303', true),
  ('00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008304', true),
  ('00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008305', true);

insert into public.panel_devices (
  id, device_code, seller_id, customer_id, plan_id, status,
  subscription_expires_at, playlist_id
) values
  (
    '00000000-0000-0000-0000-000000008401',
    'RPTV-EDIT-01',
    '00000000-0000-0000-0000-000000008001',
    '00000000-0000-0000-0000-000000008101',
    '00000000-0000-0000-0000-000000008201',
    'active',
    '2099-01-01 00:00:00+00',
    '00000000-0000-0000-0000-000000008301'
  ),
  (
    '00000000-0000-0000-0000-000000008402',
    'RPTV-EDIT-02',
    '00000000-0000-0000-0000-000000008001',
    '00000000-0000-0000-0000-000000008101',
    '00000000-0000-0000-0000-000000008201',
    'active',
    '2099-01-01 00:00:00+00',
    '00000000-0000-0000-0000-000000008301'
  );

insert into public.panel_subscriptions (
  id, customer_id, seller_id, plan_id, status, starts_at, expires_at,
  plan_name_snapshot, duration_days_snapshot, max_devices_snapshot,
  simultaneous_connections_snapshot, credit_cost_snapshot, created_by_role
) values (
  '00000000-0000-0000-0000-000000008501',
  '00000000-0000-0000-0000-000000008101',
  '00000000-0000-0000-0000-000000008001',
  '00000000-0000-0000-0000-000000008201',
  'active',
  now(),
  '2099-01-01 00:00:00+00',
  'Mensal dois aparelhos',
  30,
  2,
  2,
  2,
  'system'
);

update public.panel_devices
set subscription_id = '00000000-0000-0000-0000-000000008501'
where id in (
  '00000000-0000-0000-0000-000000008401',
  '00000000-0000-0000-0000-000000008402'
);

insert into public.panel_subscription_devices (subscription_id, device_id, status) values
  ('00000000-0000-0000-0000-000000008501', '00000000-0000-0000-0000-000000008401', 'active'),
  ('00000000-0000-0000-0000-000000008501', '00000000-0000-0000-0000-000000008402', 'active');

insert into public.panel_subscription_playlists (
  subscription_id, playlist_id, priority, active
) values (
  '00000000-0000-0000-0000-000000008501',
  '00000000-0000-0000-0000-000000008301',
  1,
  true
);

select lives_ok(
  $$select * from public.replace_subscription_playlist_transaction(
    '00000000-0000-0000-0000-000000008501',
    1,
    '00000000-0000-0000-0000-000000008302',
    'Corrigir credenciais digitadas',
    'teste',
    null,
    'edit-primary-key'
  )$$,
  'Lista principal pronta é aplicada'
);

select is(
  (select playlist_id from public.panel_subscription_playlists
    where subscription_id = '00000000-0000-0000-0000-000000008501'
      and priority = 1 and active is true),
  '00000000-0000-0000-0000-000000008302'::uuid,
  'Assinatura aponta para a nova lista principal'
);

select is(
  (select count(*)::integer from public.panel_subscription_playlists
    where subscription_id = '00000000-0000-0000-0000-000000008501'
      and priority = 1 and active is false and archived_at is not null),
  1,
  'Vínculo anterior é arquivado com histórico'
);

select is(
  (select count(*)::integer from public.panel_devices
    where subscription_id = '00000000-0000-0000-0000-000000008501'
      and playlist_id = '00000000-0000-0000-0000-000000008302'),
  2,
  'Todos os aparelhos recebem a nova lista principal'
);

select is(
  (select count(*)::integer from public.panel_device_playlists
    where device_id in (
      '00000000-0000-0000-0000-000000008401',
      '00000000-0000-0000-0000-000000008402'
    ) and priority = 1
      and playlist_id = '00000000-0000-0000-0000-000000008302'
      and active is true),
  2,
  'Compatibilidade antiga também recebe a nova lista principal'
);

select is(
  (select active from public.panel_playlists where id = '00000000-0000-0000-0000-000000008301'),
  false,
  'Lista antiga sem outros vínculos é arquivada'
);

select is(
  (select count(*)::integer from public.panel_playlist_revisions
    where subscription_id = '00000000-0000-0000-0000-000000008501'),
  1,
  'Troca gera revisão auditável'
);

select is(
  (select credit_balance from public.panel_sellers where id = '00000000-0000-0000-0000-000000008001'),
  25,
  'Editar lista não cobra créditos'
);

select is(
  (select applied from public.replace_subscription_playlist_transaction(
    '00000000-0000-0000-0000-000000008501',
    1,
    '00000000-0000-0000-0000-000000008302',
    'Corrigir credenciais digitadas',
    'teste',
    null,
    'edit-primary-key'
  )),
  false,
  'Retry da mesma operação não reaplica a troca'
);

select is(
  (select count(*)::integer from public.panel_playlist_revisions
    where subscription_id = '00000000-0000-0000-0000-000000008501'),
  1,
  'Retry não duplica o histórico'
);

select lives_ok(
  $$select * from public.replace_subscription_playlist_transaction(
    '00000000-0000-0000-0000-000000008501',
    2,
    '00000000-0000-0000-0000-000000008303',
    'Adicionar redundância',
    'teste',
    null,
    'add-backup-key'
  )$$,
  'Lista reserva pode ser adicionada depois da ativação'
);

select is(
  (select count(*)::integer from public.panel_device_playlists
    where device_id in (
      '00000000-0000-0000-0000-000000008401',
      '00000000-0000-0000-0000-000000008402'
    ) and priority = 2
      and playlist_id = '00000000-0000-0000-0000-000000008303'
      and active is true),
  2,
  'Lista reserva é atualizada nos dois aparelhos'
);

select throws_ok(
  $$select * from public.replace_subscription_playlist_transaction(
    '00000000-0000-0000-0000-000000008501',
    1,
    '00000000-0000-0000-0000-000000008304',
    'Lista com poucas conexões',
    'teste',
    null,
    'low-connections-key'
  )$$,
  'P0001',
  'A nova lista não suporta as conexões simultâneas do plano.',
  'Lista com menos conexões que o plano é recusada'
);

select throws_ok(
  $$select * from public.replace_subscription_playlist_transaction(
    '00000000-0000-0000-0000-000000008501',
    1,
    '00000000-0000-0000-0000-000000008305',
    'Lista sem cache válido',
    'teste',
    null,
    'missing-cache-key'
  )$$,
  'P0001',
  'A nova lista ainda não possui cache válido.',
  'Lista sem cache pronto é recusada'
);

select throws_ok(
  $$select * from public.replace_subscription_playlist_transaction(
    '00000000-0000-0000-0000-000000008501',
    1,
    '00000000-0000-0000-0000-000000008306',
    'Lista sem permissão do vendedor',
    'teste',
    null,
    'permission-key'
  )$$,
  'P0001',
  'A nova lista não está liberada para o vendedor da assinatura.',
  'Lista fora da carteira do vendedor é recusada'
);

select is(
  (select playlist_id from public.panel_subscription_playlists
    where subscription_id = '00000000-0000-0000-0000-000000008501'
      and priority = 1 and active is true),
  '00000000-0000-0000-0000-000000008302'::uuid,
  'Falhas de validação preservam a lista principal válida'
);

select is(
  (select count(*)::integer from public.panel_audit_logs
    where action = 'subscription.playlist_replaced'
      and entity_id = '00000000-0000-0000-0000-000000008501'),
  2,
  'Principal e reserva geram auditoria sem credenciais'
);

select is(
  (select count(*)::integer from public.panel_subscription_operations
    where subscription_id = '00000000-0000-0000-0000-000000008501'
      and operation_type = 'replace_playlist'),
  2,
  'Operações bem-sucedidas ficam idempotentes'
);

select * from finish();
rollback;
