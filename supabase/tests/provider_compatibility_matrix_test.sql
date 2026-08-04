begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(15);

select has_table('public', 'playlist_provider_attempts', 'Histórico da matriz existe');
select has_column('public', 'playlist_provider_attempts', 'client_event_id', 'Matriz possui evento idempotente');
select has_column('public', 'playlist_provider_attempts', 'strategy_key', 'Matriz identifica a estratégia');
select has_column('public', 'playlist_provider_attempts', 'section', 'Matriz separa as seções');
select has_column('public', 'playlist_provider_attempts', 'host_snapshot', 'Matriz armazena somente o host sanitizado');
select has_column('public', 'playlist_provider_attempts', 'correlation_id', 'Matriz agrupa uma execução completa');
select has_index('public', 'playlist_provider_attempts', 'playlist_provider_attempts_strategy_idx', 'Estratégias possuem índice');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.playlist_provider_attempts'::regclass),
  'RLS está habilitada no histórico da matriz'
);
select ok(not has_table_privilege('anon', 'public.playlist_provider_attempts', 'select'), 'anon não lê a matriz');
select ok(not has_table_privilege('authenticated', 'public.playlist_provider_attempts', 'select'), 'authenticated não lê a matriz');
select ok(has_table_privilege('service_role', 'public.playlist_provider_attempts', 'select'), 'service_role lê a matriz');

insert into public.panel_playlists (id, name, playlist_url, playlist_type, active)
values (
  '00000000-0000-0000-0000-000000009701',
  'Lista matriz',
  'https://provider.invalid/get.php?username=alice&password=secret',
  'xtream',
  true
);
insert into public.panel_devices (id, device_code, status)
values ('00000000-0000-0000-0000-000000009702', 'RPTV-MATRIX', 'active');
insert into public.panel_device_playlists (id, device_id, playlist_id, priority, active)
values (
  '00000000-0000-0000-0000-000000009703',
  '00000000-0000-0000-0000-000000009702',
  '00000000-0000-0000-0000-000000009701',
  1,
  true
);

select lives_ok($test$
  insert into public.playlist_provider_attempts (
    client_event_id, device_id, playlist_id, assignment_id,
    device_code_snapshot, playlist_name_snapshot, phase, section,
    transport, strategy_key, protocol, host_snapshot, port,
    path_snapshot, request_profile, output_format, result,
    http_status, duration_ms, item_count, error_code, correlation_id
  ) values (
    'matrix:test:safe:1',
    '00000000-0000-0000-0000-000000009702',
    '00000000-0000-0000-0000-000000009701',
    '00000000-0000-0000-0000-000000009703',
    'RPTV-MATRIX', 'Lista matriz', 'fast', 'channels',
    'xtream', 'xtream_https_443_auto_channels', 'https',
    'provider.invalid', 443, '/player_api.php', 'IPTVSmartersPro',
    'm3u8', 'failure', 404, 120, 0, 'HTTP_404', 'matrix:test:1'
  )
$test$, 'Registro sanitizado é aceito');

select is(
  (select host_snapshot from public.playlist_provider_attempts where client_event_id = 'matrix:test:safe:1'),
  'provider.invalid',
  'Histórico guarda somente o hostname'
);
select is(
  (select path_snapshot from public.playlist_provider_attempts where client_event_id = 'matrix:test:safe:1'),
  '/player_api.php',
  'Histórico guarda caminho sem query'
);
select ok(
  (select row_to_json(attempt)::text not like '%alice%'
      and row_to_json(attempt)::text not like '%secret%'
   from public.playlist_provider_attempts attempt
   where client_event_id = 'matrix:test:safe:1'),
  'Registro da matriz não contém usuário ou senha'
);
select throws_ok($test$
  insert into public.playlist_provider_attempts (
    client_event_id, device_id, playlist_id, device_code_snapshot,
    phase, section, transport, strategy_key, protocol, host_snapshot, result
  ) values (
    'matrix:test:unsafe:1',
    '00000000-0000-0000-0000-000000009702',
    '00000000-0000-0000-0000-000000009701',
    'RPTV-MATRIX', 'fast', 'channels', 'xtream',
    'unsafe', 'https', 'provider.invalid?username=alice', 'failure'
  )
$test$, null, 'Host com query é bloqueado pelo banco');

select * from finish();
rollback;
