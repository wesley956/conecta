begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(4);

insert into public.panel_playlists (
  id,name,playlist_url,playlist_type,active,playlist_access_mode,
  playlist_cache_status,playlist_cache_item_count
) values (
  '00000000-0000-0000-0000-00000000d101',
  'L3 Device Learning',
  'http://device-learn.test:8080/player_api.php?username=cliente&password=segredo',
  'xtream',true,'direct','error',0
);

insert into public.panel_playlist_endpoints (
  id,playlist_id,endpoint_type,label,endpoint_url,protocol,host,port,path,
  output_format,priority,is_primary,active,source_fingerprint,masked_preview
) values (
  '00000000-0000-0000-0000-00000000d201',
  '00000000-0000-0000-0000-00000000d101',
  'xtream','Xtream','http://device-learn.test:8080/player_api.php?username=cliente&password=segredo',
  'http','device-learn.test',8080,'/player_api.php','mpegts',1,true,true,repeat('d',64),
  'http://device-learn.test:8080/player_api.php?username=••••&password=••••'
);
update public.panel_playlists
set primary_endpoint_id='00000000-0000-0000-0000-00000000d201'
where id='00000000-0000-0000-0000-00000000d101';

insert into public.panel_playlist_connection_profiles (
  playlist_id,request_headers,request_method,timeout_ms,retry_count,follow_redirects
) values (
  '00000000-0000-0000-0000-00000000d101',
  '{"User-Agent":"Roneca-L3-Agent","Accept":"application/json","Authorization":"Bearer secreto","Cookie":"sid=segredo"}'::jsonb,
  'GET',28000,2,true
);

insert into public.panel_sellers (id,name,whatsapp,status,credit_balance,can_go_negative)
values ('00000000-0000-0000-0000-00000000d401','L3 Device Seller','5511999999999','active',5,false);
insert into public.panel_seller_playlists (seller_id,playlist_id,active)
values ('00000000-0000-0000-0000-00000000d401','00000000-0000-0000-0000-00000000d101',true);
insert into public.panel_devices (
  id,device_code,device_type,status,seller_id,playlist_id,device_credential_hash
) values (
  '00000000-0000-0000-0000-00000000d501','RPTV-L3DEV2','androidtv','active',
  '00000000-0000-0000-0000-00000000d401','00000000-0000-0000-0000-00000000d101',repeat('e',64)
);

insert into public.playlist_provider_attempts (
  client_event_id,device_id,playlist_id,device_code_snapshot,playlist_name_snapshot,
  platform,app_version,phase,section,transport,strategy_key,protocol,host_snapshot,
  port,path_snapshot,request_profile,output_format,result,http_status,duration_ms,item_count
) values (
  'lote3-device-success-0001',
  '00000000-0000-0000-0000-00000000d501',
  '00000000-0000-0000-0000-00000000d101',
  'RPTV-L3DEV2','L3 Device Learning','androidtv','2.7.1','fast','channels','xtream',
  'xtream_http_8080_mpegts_channels_iptvsmarterspro','http','device-learn.test',8080,
  '/player_api.php','iptvsmarterspro','mpegts','success',200,95,120
);

select ok(
  exists(select 1 from public.panel_playlist_server_profiles where host='device-learn.test'),
  'Sucesso real do aparelho aprende perfil técnico do servidor'
);
select is(
  (select strategy_key from public.panel_playlist_server_profiles where host='device-learn.test' limit 1),
  'xtream_http_8080_mpegts_channels_iptvsmarterspro',
  'Estratégia vencedora do aparelho é armazenada no perfil técnico'
);
select ok(
  not exists(
    select 1
    from public.panel_playlist_server_profiles profile,
         lateral jsonb_object_keys(profile.safe_headers) header
    where profile.host='device-learn.test'
      and lower(header) in ('authorization','cookie','proxy-authorization','x-api-key')
  ),
  'Aprendizado pelo aparelho não copia headers sensíveis'
);

insert into public.playlist_provider_attempts (
  client_event_id,device_id,playlist_id,device_code_snapshot,playlist_name_snapshot,
  platform,app_version,phase,section,transport,strategy_key,protocol,host_snapshot,
  port,path_snapshot,result,http_status,duration_ms,item_count
) values (
  'lote3-cache-success-0002',
  '00000000-0000-0000-0000-00000000d501',
  '00000000-0000-0000-0000-00000000d101',
  'RPTV-L3DEV2','L3 Device Learning','androidtv','2.7.1','fast','channels','cache',
  'cache_https_443_auto_channels_ronecaplaytv-native','https','cache-only-l3.test',443,
  '/storage/v1/object/sign/playlist-cache/example/channels.json','success',200,20,120
);

select ok(
  not exists(select 1 from public.panel_playlist_server_profiles where host='cache-only-l3.test'),
  'Sucesso do cache é ignorado e não vira perfil de servidor do fornecedor'
);

select * from finish();
rollback;
