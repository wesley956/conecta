begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(39);

select has_table('public', 'playlist_cache_generation_attempts', 'Tentativas de cache são persistidas');
select has_table('public', 'playlist_cache_generation_leases', 'Leases por playlist existem');
select has_column('public', 'panel_playlists', 'playlist_cache_active_attempt_id', 'Playlist aponta para a tentativa ativa');
select has_column('public', 'panel_playlists', 'playlist_cache_manifest_sha256', 'Manifest publicado possui SHA-256');

select has_function(
  'public',
  'claim_playlist_cache_generation',
  array['uuid', 'uuid', 'integer'],
  'RPC de claim por playlist existe'
);
select has_function(
  'public',
  'heartbeat_playlist_cache_generation',
  array['uuid', 'uuid', 'uuid', 'text', 'integer'],
  'RPC de heartbeat renovável existe'
);
select has_function(
  'public',
  'complete_playlist_cache_generation',
  array['uuid', 'uuid', 'uuid', 'timestamp with time zone', 'text', 'integer', 'bigint', 'text', 'bigint', 'jsonb', 'jsonb'],
  'RPC de publicação atômica existe'
);
select has_function(
  'public',
  'fail_playlist_cache_generation',
  array['uuid', 'uuid', 'uuid', 'text', 'text', 'text', 'jsonb'],
  'RPC de falha preservando cache existe'
);
select has_function(
  'public',
  'reconcile_playlist_cache_generation_leases',
  array[]::text[],
  'Reconciliador de leases abandonados existe'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.playlist_cache_generation_attempts'::regclass),
  'RLS está habilitada nas tentativas'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.playlist_cache_generation_leases'::regclass),
  'RLS está habilitada nos leases'
);
select ok(not has_table_privilege('anon', 'public.playlist_cache_generation_attempts', 'select'), 'anon não lê tentativas');
select ok(not has_table_privilege('authenticated', 'public.playlist_cache_generation_leases', 'select'), 'authenticated não lê leases');
select ok(has_table_privilege('service_role', 'public.playlist_cache_generation_attempts', 'select'), 'service_role lê tentativas');
select ok(
  not has_function_privilege('anon', 'public.claim_playlist_cache_generation(uuid,uuid,integer)', 'execute'),
  'anon não reserva geração'
);
select ok(
  not has_function_privilege('authenticated', 'public.claim_playlist_cache_generation(uuid,uuid,integer)', 'execute'),
  'authenticated não reserva geração'
);
select ok(
  has_function_privilege('service_role', 'public.claim_playlist_cache_generation(uuid,uuid,integer)', 'execute'),
  'service_role reserva geração'
);

insert into public.panel_playlists (
  id,
  name,
  playlist_url,
  playlist_type,
  active,
  playlist_updated_at,
  playlist_cache_status,
  playlist_cache_manifest_path,
  playlist_cache_channels_path,
  playlist_cache_movies_path,
  playlist_cache_series_path,
  playlist_cache_item_count
) values
  (
    '00000000-0000-0000-0000-000000009101',
    'Lista com cache anterior',
    'https://cache-test.invalid/ready.m3u',
    'm3u',
    true,
    '2026-08-01 00:00:00+00',
    'ready',
    'legacy/manifest.json',
    'legacy/channels.json',
    'legacy/movies.json',
    'legacy/series.json',
    10
  ),
  (
    '00000000-0000-0000-0000-000000009102',
    'Lista sem cache',
    'https://cache-test.invalid/missing.m3u',
    'm3u',
    true,
    '2026-08-01 00:00:00+00',
    'missing',
    null,
    null,
    null,
    null,
    0
  );

select is(
  (select acquired from public.claim_playlist_cache_generation(
    '00000000-0000-0000-0000-000000009101',
    '00000000-0000-0000-0000-000000009201',
    180
  )),
  true,
  'Primeiro worker reserva a lista'
);
select is(
  (select playlist_cache_status from public.panel_playlists where id = '00000000-0000-0000-0000-000000009101'),
  'ready',
  'Cache anterior continua pronto durante o refresh'
);
select is(
  (select acquired from public.claim_playlist_cache_generation(
    '00000000-0000-0000-0000-000000009101',
    '00000000-0000-0000-0000-000000009202',
    180
  )),
  false,
  'Segundo worker da mesma lista observa a tentativa ativa'
);
select is(
  (select acquired from public.claim_playlist_cache_generation(
    '00000000-0000-0000-0000-000000009102',
    '00000000-0000-0000-0000-000000009202',
    180
  )),
  true,
  'Outra lista pode gerar cache ao mesmo tempo'
);
select is(
  (select count(*)::integer from public.playlist_cache_generation_leases),
  2,
  'Duas playlists diferentes possuem leases independentes'
);
select is(
  (select renewed from public.heartbeat_playlist_cache_generation(
    '00000000-0000-0000-0000-000000009101',
    (select attempt_id from public.playlist_cache_generation_leases where playlist_id = '00000000-0000-0000-0000-000000009101'),
    '00000000-0000-0000-0000-000000009201',
    'upload_channels',
    180
  )),
  true,
  'Heartbeat renova o lease correto'
);
select is(
  (select published from public.complete_playlist_cache_generation(
    '00000000-0000-0000-0000-000000009101',
    (select attempt_id from public.playlist_cache_generation_leases where playlist_id = '00000000-0000-0000-0000-000000009101'),
    '00000000-0000-0000-0000-000000009201',
    '2026-08-01 00:05:00+00',
    'cache-v2',
    30,
    400::bigint,
    repeat('a', 64),
    100::bigint,
    '[]'::jsonb,
    '{"channels":{"bytes":100},"movies":{"bytes":100},"series":{"bytes":100}}'::jsonb
  )),
  true,
  'Publicação com lease válido troca os ponteiros atomicamente'
);
select is(
  (select playlist_cache_status from public.panel_playlists where id = '00000000-0000-0000-0000-000000009101'),
  'ready',
  'Playlist publicada fica pronta'
);
select is(
  (select playlist_cache_manifest_sha256 from public.panel_playlists where id = '00000000-0000-0000-0000-000000009101'),
  repeat('a', 64),
  'SHA-256 do manifest é persistido'
);
select is(
  (select playlist_cache_active_attempt_id from public.panel_playlists where id = '00000000-0000-0000-0000-000000009101'),
  null::uuid,
  'Publicação libera a tentativa ativa'
);
select is(
  (select status from public.playlist_cache_generation_attempts
   where playlist_id = '00000000-0000-0000-0000-000000009101'
   order by started_at desc limit 1),
  'ready',
  'Tentativa publicada entra no histórico'
);
select is(
  (select acquired from public.claim_playlist_cache_generation(
    '00000000-0000-0000-0000-000000009101',
    '00000000-0000-0000-0000-000000009203',
    180
  )),
  true,
  'Um novo refresh pode começar depois da publicação'
);
select is(
  (select playlist_cache_status from public.panel_playlists where id = '00000000-0000-0000-0000-000000009101'),
  'ready',
  'Novo refresh não remove a última versão válida'
);

update public.playlist_cache_generation_leases
set
  acquired_at = now() - interval '10 minutes',
  lease_expires_at = now() - interval '1 minute'
where playlist_id in (
  '00000000-0000-0000-0000-000000009101',
  '00000000-0000-0000-0000-000000009102'
);

select lives_ok(
  $$select public.reconcile_playlist_cache_generation_leases()$$,
  'Reconciliador processa leases vencidos'
);
select is(
  (select playlist_cache_status from public.panel_playlists where id = '00000000-0000-0000-0000-000000009101'),
  'ready',
  'Reconciliador preserva o cache anterior válido'
);
select is(
  (select status from public.playlist_cache_generation_attempts
   where playlist_id = '00000000-0000-0000-0000-000000009101'
   order by started_at desc limit 1),
  'abandoned',
  'Tentativa sem heartbeat fica abandonada'
);
select is(
  (select playlist_cache_status from public.panel_playlists where id = '00000000-0000-0000-0000-000000009102'),
  'error',
  'Lista sem versão anterior sai de building após o lease vencer'
);
select is(
  (select count(*)::integer from public.playlist_cache_generation_leases),
  0,
  'Leases vencidos são removidos'
);
select is(
  (select acquired from public.claim_playlist_cache_generation(
    '00000000-0000-0000-0000-000000009102',
    '00000000-0000-0000-0000-000000009204',
    180
  )),
  true,
  'Lista reconciliada pode tentar novamente'
);
select is(
  public.fail_playlist_cache_generation(
    '00000000-0000-0000-0000-000000009102',
    (select attempt_id from public.playlist_cache_generation_leases where playlist_id = '00000000-0000-0000-0000-000000009102'),
    '00000000-0000-0000-0000-000000009204',
    'CACHE_TEST_FAILURE',
    'Falha sintética segura',
    'blocked',
    '[]'::jsonb
  ),
  true,
  'Falha encerra a tentativa que possui o lease'
);
select is(
  (select playlist_cache_error_code from public.panel_playlists where id = '00000000-0000-0000-0000-000000009102'),
  'CACHE_TEST_FAILURE',
  'Falha sem cache anterior fica visível com código estável'
);
select is(
  (select status from public.playlist_cache_generation_attempts
   where playlist_id = '00000000-0000-0000-0000-000000009102'
   order by started_at desc limit 1),
  'failed',
  'Histórico registra a tentativa com falha'
);

select * from finish();
rollback;
