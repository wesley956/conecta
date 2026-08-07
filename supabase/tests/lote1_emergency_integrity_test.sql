begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

select has_function('public', 'audit_sanitize_jsonb', array['jsonb'], 'Sanitizador central de auditoria existe');
select has_function('public', 'inspect_playlist_archive', array['uuid'], 'Prévia segura de arquivamento existe');
select has_function('public', 'archive_playlist_safe_transaction', array['uuid', 'boolean'], 'Arquivamento seguro existe');
select has_view('public', 'panel_active_devices_without_playlist', 'Pendências de aparelho sem lista possuem fonte operacional');

insert into public.panel_audit_logs(action, entity_type, description, metadata)
values (
  'test.sensitive',
  'test',
  'Falha em https://example.test/get.php?username=usuario-secreto&password=senha-secreta&token=token-secreto',
  jsonb_build_object(
    'playlistUrl', 'https://example.test/get.php?username=usuario-secreto&password=senha-secreta',
    'updates', jsonb_build_object(
      'access_token', 'token-secreto',
      'playlist_url', 'https://example.test/live?username=usuario-secreto&password=senha-secreta'
    )
  )
);

select ok(
  (select description not like '%senha-secreta%'
     from public.panel_audit_logs
    where action = 'test.sensitive'
    order by created_at desc limit 1),
  'Descrição de auditoria não conserva senha'
);
select ok(
  (select metadata::text not like '%usuario-secreto%'
     from public.panel_audit_logs
    where action = 'test.sensitive'
    order by created_at desc limit 1),
  'Metadados de auditoria não conservam usuário'
);
select ok(
  (select metadata::text not like '%token-secreto%'
     from public.panel_audit_logs
    where action = 'test.sensitive'
    order by created_at desc limit 1),
  'Metadados de auditoria não conservam token'
);
select ok(
  (select metadata::text like '%[protegido]%'
     from public.panel_audit_logs
    where action = 'test.sensitive'
    order by created_at desc limit 1),
  'Auditoria sinaliza o conteúdo removido'
);

insert into public.panel_sellers(id, name, whatsapp, status, credit_balance, can_go_negative)
values ('10000000-0000-0000-0000-000000000001', 'Lote 1', '551100000001', 'active', 10, false);

insert into public.panel_playlists(
  id, name, playlist_url, playlist_type, active,
  playlist_cache_status, playlist_qualification_status
) values
  ('10000000-0000-0000-0000-000000000101', 'Principal Lote 1', 'https://example.test/main.m3u', 'm3u', true, 'ready', 'ready_cache'),
  ('10000000-0000-0000-0000-000000000102', 'Reserva Lote 1', 'https://example.test/backup.m3u', 'm3u', true, 'ready', 'ready_cache');

insert into public.panel_seller_playlists(seller_id, playlist_id, active)
values
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000101', true),
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000102', true);

insert into public.panel_devices(
  id, device_code, status, seller_id, playlist_id, device_type
) values (
  '10000000-0000-0000-0000-000000000201',
  'RPTV-L1SAFE',
  'active',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000101',
  'androidtv'
);

select throws_like(
  $$select * from public.archive_playlist_safe_transaction(
    '10000000-0000-0000-0000-000000000101', true
  )$$,
  '%sem reserva%',
  'Lista principal de aparelho ativo sem reserva não pode ser arquivada'
);

insert into public.panel_device_playlists(device_id, playlist_id, priority, active)
values (
  '10000000-0000-0000-0000-000000000201',
  '10000000-0000-0000-0000-000000000102',
  2,
  true
);

select is(
  (select requires_confirmation from public.archive_playlist_safe_transaction(
    '10000000-0000-0000-0000-000000000101', false
  )),
  true,
  'Lista em uso exige confirmação antes do arquivamento'
);

select lives_ok(
  $$select * from public.archive_playlist_safe_transaction(
    '10000000-0000-0000-0000-000000000101', true
  )$$,
  'Lista com reserva pode ser arquivada atomicamente'
);

select is(
  (select playlist_id from public.panel_devices where id = '10000000-0000-0000-0000-000000000201'),
  '10000000-0000-0000-0000-000000000102'::uuid,
  'Reserva é promovida para principal'
);
select is(
  (select active from public.panel_playlists where id = '10000000-0000-0000-0000-000000000101'),
  false,
  'Lista excluída comercialmente é arquivada, não destruída'
);
select is(
  (select active from public.panel_seller_playlists
    where seller_id = '10000000-0000-0000-0000-000000000001'
      and playlist_id = '10000000-0000-0000-0000-000000000101'),
  false,
  'Vínculo comercial da lista arquivada é desativado'
);

insert into public.panel_devices(id, device_code, status, seller_id, device_type)
values (
  '10000000-0000-0000-0000-000000000202',
  'RPTV-L1PEND',
  'active',
  '10000000-0000-0000-0000-000000000001',
  'androidtv'
);

select is(
  (select count(*)::integer from public.panel_active_devices_without_playlist
    where id = '10000000-0000-0000-0000-000000000202'),
  1,
  'Aparelho ativo sem lista aparece como pendência operacional'
);

select * from finish();
rollback;
