begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(18);

insert into public.panel_playlists (
  id, name, playlist_url, playlist_type, active, playlist_access_mode,
  playlist_cache_status, playlist_cache_item_count, playlist_cache_error_code, playlist_cache_error
) values
  ('00000000-0000-0000-0000-00000000c101','L3 Gerando','http://l3-generating.test/get.php?username=a&password=b','xtream',true,'server_cache','missing',0,null,null),
  ('00000000-0000-0000-0000-00000000c102','L3 Cache','http://l3-cache.test/list.m3u','m3u',true,'server_cache','ready',25,null,null),
  ('00000000-0000-0000-0000-00000000c103','L3 Aguardando','http://l3-await.test/get.php?username=a&password=b','xtream',true,'direct','error',0,'DATACENTER_BLOCKED','Datacenter sem acesso.'),
  ('00000000-0000-0000-0000-00000000c104','L3 Confirmada','http://l3-direct.test/get.php?username=a&password=b','xtream',true,'direct','error',0,'DATACENTER_BLOCKED','Datacenter sem acesso.'),
  ('00000000-0000-0000-0000-00000000c105','L3 Falha','http://l3-failed.test/get.php?username=a&password=b','xtream',true,'direct','error',0,'DATACENTER_BLOCKED','Datacenter sem acesso.'),
  ('00000000-0000-0000-0000-00000000c106','L3 Bloqueada','http://l3-blocked.test/get.php?username=a&password=b','xtream',true,'blocked','error',0,'INVALID_CREDENTIALS','Credenciais inválidas.'),
  ('00000000-0000-0000-0000-00000000c107','L3 Arquivada','http://l3-archived.test/list.m3u','m3u',false,'server_cache','missing',0,null,null);

update public.panel_playlists
set playlist_qualification_status='ready_direct',
    playlist_qualification_code='DIRECT_DEVICE_CONFIRMED',
    playlist_direct_confirmed_at=now(),
    playlist_qualified_at=now()
where id='00000000-0000-0000-0000-00000000c104';

update public.panel_playlists
set playlist_qualification_status='awaiting_device_test',
    playlist_qualification_code='DEVICE_TEST_FAILED',
    playlist_qualification_message='Falha do aparelho.'
where id='00000000-0000-0000-0000-00000000c105';

update public.panel_playlists
set archived_at=now(), active=false
where id='00000000-0000-0000-0000-00000000c107';

select is((select lifecycle_status from public.get_playlist_lifecycle_decision('00000000-0000-0000-0000-00000000c101')), 'generating_cache', 'Lista em processamento aparece como Gerando cache');
select is((select lifecycle_status from public.get_playlist_lifecycle_decision('00000000-0000-0000-0000-00000000c102')), 'ready_cache', 'Cache pronto usa o estado oficial Pronta com cache');
select is((select lifecycle_status from public.get_playlist_lifecycle_decision('00000000-0000-0000-0000-00000000c103')), 'awaiting_device_confirmation', 'Bloqueio de datacenter vira confirmação automática no aparelho');
select is((select lifecycle_status from public.get_playlist_lifecycle_decision('00000000-0000-0000-0000-00000000c104')), 'confirmed_by_device', 'Sucesso direto usa Confirmada pelo aparelho');
select is((select lifecycle_status from public.get_playlist_lifecycle_decision('00000000-0000-0000-0000-00000000c105')), 'device_failed', 'Falha real usa Falhou no aparelho');
select is((select lifecycle_status from public.get_playlist_lifecycle_decision('00000000-0000-0000-0000-00000000c106')), 'blocked', 'Credencial inválida permanece Bloqueada');
select is((select lifecycle_status from public.get_playlist_lifecycle_decision('00000000-0000-0000-0000-00000000c107')), 'archived', 'Lista arquivada usa o estado Arquivada');

select is((select android_status from public.get_playlist_lifecycle_decision('00000000-0000-0000-0000-00000000c103')), 'provisional', 'Android aceita provisoriamente lista não confirmada pelo servidor');
select is((select lg_status from public.get_playlist_lifecycle_decision('00000000-0000-0000-0000-00000000c103')), 'unavailable', 'LG não recebe lista sem cache');
select is((select samsung_status from public.get_playlist_lifecycle_decision('00000000-0000-0000-0000-00000000c102')), 'available_by_cache', 'Samsung recebe lista com cache pronto');
select is((select lg_status from public.get_playlist_lifecycle_decision('00000000-0000-0000-0000-00000000c102')), 'available_by_cache', 'LG recebe lista com cache pronto');

insert into public.panel_playlist_endpoints (
  id, playlist_id, endpoint_type, label, endpoint_url, protocol, host, port, path,
  output_format, priority, is_primary, active, source_fingerprint, masked_preview
) values (
  '00000000-0000-0000-0000-00000000c201',
  '00000000-0000-0000-0000-00000000c103',
  'xtream','Xtream principal','http://shared-l3.test:8080/player_api.php?username=secret&password=secret',
  'http','shared-l3.test',8080,'/player_api.php','json',1,true,true,repeat('a',64),'http://shared-l3.test:8080/player_api.php?username=••••&password=••••'
);
update public.panel_playlists set primary_endpoint_id='00000000-0000-0000-0000-00000000c201' where id='00000000-0000-0000-0000-00000000c103';
insert into public.panel_playlist_connection_profiles (
  playlist_id, request_headers, request_method, timeout_ms, retry_count, follow_redirects
) values (
  '00000000-0000-0000-0000-00000000c103',
  '{"User-Agent":"L3-Test-Agent","Accept":"application/json","Authorization":"Bearer secret","Cookie":"session=secret"}'::jsonb,
  'GET',32000,2,true
);
insert into public.panel_playlist_test_runs (
  id, playlist_id, endpoint_id, stage, result, strategy_key, protocol, host_snapshot,
  port, path_snapshot, http_status, duration_ms, response_bytes, item_count, tls_mode
) values (
  '00000000-0000-0000-0000-00000000c301',
  '00000000-0000-0000-0000-00000000c103',
  '00000000-0000-0000-0000-00000000c201',
  'connection','success','xtream:strict','http','shared-l3.test',8080,'/player_api.php',200,120,512,null,'strict'
);

select ok(exists(select 1 from public.panel_playlist_server_profiles where host='shared-l3.test' and success_count=1), 'Sucesso aprende um perfil técnico por servidor');
select ok(not exists(select 1 from public.panel_playlist_server_profiles profile, lateral jsonb_object_keys(profile.safe_headers) key where profile.host='shared-l3.test' and lower(key) in ('authorization','cookie')), 'Perfil compartilhado nunca guarda Authorization ou Cookie');
select is((select safe_headers->>'user-agent' from public.panel_playlist_server_profiles where host='shared-l3.test' limit 1), 'L3-Test-Agent', 'Perfil reaproveita apenas header seguro');

insert into public.panel_playlists (
  id, name, playlist_url, playlist_type, active, playlist_access_mode,
  playlist_cache_status, playlist_cache_item_count, playlist_cache_error_code, playlist_cache_error
) values (
  '00000000-0000-0000-0000-00000000c108','L3 Mesmo Servidor','http://shared-l3.test:8080/player_api.php?username=other&password=other','xtream',true,'direct','error',0,'DATACENTER_BLOCKED','Datacenter sem acesso.'
);
insert into public.panel_playlist_endpoints (
  id, playlist_id, endpoint_type, label, endpoint_url, protocol, host, port, path,
  output_format, priority, is_primary, active, source_fingerprint, masked_preview
) values (
  '00000000-0000-0000-0000-00000000c202',
  '00000000-0000-0000-0000-00000000c108',
  'xtream','Xtream principal','http://shared-l3.test:8080/player_api.php?username=other&password=other',
  'http','shared-l3.test',8080,'/player_api.php','json',1,true,true,repeat('b',64),'http://shared-l3.test:8080/player_api.php?username=••••&password=••••'
);
update public.panel_playlists set primary_endpoint_id='00000000-0000-0000-0000-00000000c202' where id='00000000-0000-0000-0000-00000000c108';
insert into public.panel_playlist_connection_profiles (playlist_id)
values ('00000000-0000-0000-0000-00000000c108');

select is((select request_headers->>'user-agent' from public.panel_playlist_connection_profiles where playlist_id='00000000-0000-0000-0000-00000000c108'), 'L3-Test-Agent', 'Nova conta no mesmo servidor reaproveita o perfil técnico conhecido');
select is((select timeout_ms from public.panel_playlist_connection_profiles where playlist_id='00000000-0000-0000-0000-00000000c108'), 32000, 'Timeout vencedor é reaproveitado no mesmo servidor');

insert into public.panel_sellers (id,name,whatsapp,status,credit_balance,can_go_negative)
values ('00000000-0000-0000-0000-00000000c401','L3 Seller','5511999999999','active',5,false);
insert into public.panel_seller_playlists (seller_id,playlist_id,active)
values ('00000000-0000-0000-0000-00000000c401','00000000-0000-0000-0000-00000000c103',true);
insert into public.panel_devices (
  id,device_code,device_type,status,seller_id,playlist_id,device_credential_hash
) values (
  '00000000-0000-0000-0000-00000000c501','RPTV-L3DEV1','androidtv','active',
  '00000000-0000-0000-0000-00000000c401','00000000-0000-0000-0000-00000000c103',repeat('c',64)
);

select ok(public.mark_playlist_validation_failure('00000000-0000-0000-0000-00000000c103','00000000-0000-0000-0000-00000000c501','PLAYBACK_FAILED','Falha controlada'), 'O próprio aparelho comercial pode registrar falha de confirmação');
select is((select lifecycle_status from public.get_playlist_lifecycle_decision('00000000-0000-0000-0000-00000000c103')), 'device_failed', 'Falha do aparelho comercial aparece no estado oficial');

select * from finish();
rollback;
