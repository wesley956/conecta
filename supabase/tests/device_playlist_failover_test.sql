begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(15);

select has_table('public', 'panel_device_playlists', 'Relação de listas por aparelho existe');
select has_column('public', 'panel_device_playlists', 'priority', 'Relação possui prioridade');
select has_column('public', 'panel_device_playlists', 'cooldown_until', 'Relação possui cooldown de failover');
select has_column('public', 'panel_credit_ledger', 'seller_name_snapshot', 'Extrato preserva nome do vendedor');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.panel_device_playlists'::regclass),
  'RLS está habilitada nas listas por aparelho'
);
select ok(
  (select relforcerowsecurity from pg_class where oid = 'public.panel_device_playlists'::regclass),
  'RLS está forçada nas listas por aparelho'
);
select ok(not has_table_privilege('anon', 'public.panel_device_playlists', 'select'), 'anon não lê as relações');
select ok(not has_table_privilege('authenticated', 'public.panel_device_playlists', 'select'), 'authenticated não lê as relações');
select ok(has_table_privilege('service_role', 'public.panel_device_playlists', 'select'), 'service_role lê as relações');

insert into public.panel_sellers (id, name, whatsapp, status, credit_balance)
values ('00000000-0000-0000-0000-000000004001', 'Vendedor preservado', '551100004001', 'active', 3);

insert into public.panel_playlists (id, name, playlist_url, playlist_type, active)
values
  ('00000000-0000-0000-0000-000000004101', 'Lista principal', 'https://example.invalid/primary.m3u', 'm3u', true),
  ('00000000-0000-0000-0000-000000004102', 'Lista reserva', 'https://example.invalid/backup.m3u', 'm3u', true);

insert into public.panel_devices (id, device_code, status)
values ('00000000-0000-0000-0000-000000004201', 'RPTV-FAILOVER', 'pending');

update public.panel_devices
set playlist_id = '00000000-0000-0000-0000-000000004101'
where id = '00000000-0000-0000-0000-000000004201';

select is(
  (select playlist_id from public.panel_device_playlists
    where device_id = '00000000-0000-0000-0000-000000004201' and priority = 1),
  '00000000-0000-0000-0000-000000004101'::uuid,
  'Atualizar playlist legada sincroniza a lista principal'
);

select lives_ok(
  $$insert into public.panel_device_playlists (device_id, playlist_id, priority)
    values (
      '00000000-0000-0000-0000-000000004201',
      '00000000-0000-0000-0000-000000004102',
      2
    )$$,
  'Uma lista reserva diferente pode ser vinculada'
);

select throws_ok(
  $$insert into public.panel_device_playlists (device_id, playlist_id, priority)
    values (
      '00000000-0000-0000-0000-000000004201',
      '00000000-0000-0000-0000-000000004101',
      2
    )$$,
  '23505',
  'duplicate key value violates unique constraint "panel_device_playlists_device_id_priority_key"',
  'Não aceita duas listas na mesma prioridade'
);

update public.panel_devices
set playlist_id = '00000000-0000-0000-0000-000000004102'
where id = '00000000-0000-0000-0000-000000004201';

select results_eq(
  $$select playlist_id, priority from public.panel_device_playlists
    where device_id = '00000000-0000-0000-0000-000000004201'
    order by priority$$,
  $$values ('00000000-0000-0000-0000-000000004102'::uuid, 1::smallint)$$,
  'Promover a reserva remove duplicidade e a torna principal'
);

insert into public.panel_credit_ledger (
  seller_id, amount, type, description, balance_after, performed_by
) values (
  '00000000-0000-0000-0000-000000004001', -1, 'activation', 'Teste de preservação', 2, 'test'
);

delete from public.panel_sellers where id = '00000000-0000-0000-0000-000000004001';

select is(
  (select seller_id from public.panel_credit_ledger where description = 'Teste de preservação'),
  null::uuid,
  'Excluir vendedor mantém o extrato e limpa apenas a referência'
);
select is(
  (select seller_name_snapshot from public.panel_credit_ledger where description = 'Teste de preservação'),
  'Vendedor preservado',
  'Excluir vendedor mantém o nome histórico no extrato'
);

select * from finish();
rollback;
