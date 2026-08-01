begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(32);

select has_column('public', 'panel_playback_diagnostics', 'correlation_id', 'Diagnóstico possui correlação');
select has_column('public', 'panel_playback_diagnostics', 'failover_attempt_id', 'Diagnóstico possui tentativa de failover');
select has_column('public', 'panel_playback_diagnostics', 'cache_attempt_id', 'Diagnóstico aponta para tentativa de cache');
select has_column('public', 'panel_device_playlists', 'last_correlation_id', 'Saúde da lista preserva correlação');
select has_column('public', 'panel_device_playlists', 'last_failover_attempt_id', 'Saúde da lista preserva tentativa');
select has_column('public', 'playlist_cache_generation_attempts', 'correlation_id', 'Cache possui correlação segura');
select has_table('public', 'panel_auth_deletion_queue', 'Fila de exclusão Auth existe');
select has_function('public', 'redact_sensitive_text', array['text'], 'Saneador textual existe');
select has_function('public', 'redact_sensitive_jsonb', array['jsonb'], 'Saneador JSON existe');
select has_function('public', 'claim_seller_auth_deletions', array['integer'], 'Claim idempotente da fila existe');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.panel_auth_deletion_queue'::regclass),
  'RLS está habilitada na fila Auth'
);
select ok(not has_table_privilege('anon', 'public.panel_auth_deletion_queue', 'select'), 'anon não lê a fila Auth');
select ok(not has_table_privilege('authenticated', 'public.panel_auth_deletion_queue', 'select'), 'authenticated não lê a fila Auth');
select ok(has_table_privilege('service_role', 'public.panel_auth_deletion_queue', 'select'), 'service_role lê a fila Auth');
select ok(
  not has_function_privilege('anon', 'public.claim_seller_auth_deletions(integer)', 'execute'),
  'anon não reserva exclusões Auth'
);
select ok(
  has_function_privilege('service_role', 'public.claim_seller_auth_deletions(integer)', 'execute'),
  'service_role pode reservar exclusões Auth'
);

select is(
  public.redact_sensitive_text('Falha em https://provider.invalid/get.php?username=alice&password=segredo'),
  'Falha em [URL protegida]',
  'URL completa é removida do diagnóstico'
);
select is(
  public.redact_sensitive_text('username=alice password=segredo token=abc'),
  'username=[protegido] password=[protegido] token=[protegido]',
  'Credenciais rotuladas são removidas'
);
select is(
  public.redact_sensitive_jsonb('{"playlist_url":"https://secret.invalid/a","nested":{"password":"123"}}'::jsonb),
  '{"playlist_url":"[protegido]","nested":{"password":"[protegido]"}}'::jsonb,
  'JSON histórico perde URL e senha'
);

insert into public.panel_audit_logs (action, description, metadata, performed_by)
values (
  'diagnostic.security.test',
  'Abrir https://provider.invalid/live/alice/secret/1.ts',
  '{"username":"alice","note":"token=segredo"}'::jsonb,
  'test'
);
select ok(
  (select description not like '%provider.invalid%'
      and metadata->>'username' = '[protegido]'
      and metadata->>'note' = 'token=[protegido]'
   from public.panel_audit_logs where action = 'diagnostic.security.test'),
  'Trigger saneia novas auditorias'
);

insert into public.panel_playlists (id, name, playlist_url, playlist_type, active)
values (
  '00000000-0000-0000-0000-000000009601',
  'Lista correlação',
  'https://provider.invalid/get.php?username=alice&password=secret',
  'm3u',
  true
);
insert into public.panel_devices (id, device_code, status)
values ('00000000-0000-0000-0000-000000009602', 'RPTV-CORRELATION', 'pending');
insert into public.panel_device_playlists (id, device_id, playlist_id, priority, active)
values (
  '00000000-0000-0000-0000-000000009603',
  '00000000-0000-0000-0000-000000009602',
  '00000000-0000-0000-0000-000000009601',
  1,
  true
);
insert into public.playlist_cache_generation_attempts (
  id, playlist_id, owner_id, lease_expires_at, manifest_path, channels_path,
  movies_path, series_path, error_message, cache_attempts
) values (
  '00000000-0000-0000-0000-000000009604',
  '00000000-0000-0000-0000-000000009601',
  '00000000-0000-0000-0000-000000009605',
  now() + interval '5 minutes',
  'test/manifest.json', 'test/channels.json', 'test/movies.json', 'test/series.json',
  'Falha em https://provider.invalid/get.php?username=alice&password=secret',
  '[{"method":"m3u","error":"password=secret"}]'::jsonb
);
select is(
  (select correlation_id from public.playlist_cache_generation_attempts where id = '00000000-0000-0000-0000-000000009604'),
  'cache:00000000-0000-0000-0000-000000009604',
  'Tentativa de cache recebe correlação estável'
);
select ok(
  (select error_message not like '%provider.invalid%'
      and cache_attempts::text not like '%secret%'
   from public.playlist_cache_generation_attempts where id = '00000000-0000-0000-0000-000000009604'),
  'Tentativa de cache não armazena credenciais'
);

insert into public.panel_playback_diagnostics (
  device_id, playlist_id, device_code_snapshot, content_title,
  error_message, client_event_id
) values (
  '00000000-0000-0000-0000-000000009602',
  '00000000-0000-0000-0000-000000009601',
  'RPTV-CORRELATION',
  'Filme de teste',
  'Erro em https://provider.invalid/movie/alice/secret/42.mp4',
  'smart-tv:webos:diagnostic:1'
);
select is(
  (select correlation_id from public.panel_playback_diagnostics where client_event_id = 'smart-tv:webos:diagnostic:1'),
  'smart-tv:webos:diagnostic:1',
  'Evento do aparelho vira correlação padrão'
);
select ok(
  (select error_message not like '%provider.invalid%'
   from public.panel_playback_diagnostics where client_event_id = 'smart-tv:webos:diagnostic:1'),
  'Diagnóstico novo não guarda URL completa'
);

update public.panel_device_playlists
set
  last_error = 'Falha em https://provider.invalid/live/alice/secret/1.ts',
  last_correlation_id = 'android:correlation:1',
  last_failover_attempt_id = 'android:failover:1',
  last_failure_at = now()
where id = '00000000-0000-0000-0000-000000009603';
select is(
  (select correlation_id from public.panel_playback_diagnostics
   where source = 'playlist_health' and device_id = '00000000-0000-0000-0000-000000009602'
   order by occurred_at desc limit 1),
  'android:correlation:1',
  'Painel liga a falha à correlação do Android'
);
select is(
  (select failover_attempt_id from public.panel_playback_diagnostics
   where source = 'playlist_health' and device_id = '00000000-0000-0000-0000-000000009602'
   order by occurred_at desc limit 1),
  'android:failover:1',
  'Painel liga a falha à tentativa de failover'
);
select is(
  (select cache_attempt_id from public.panel_playback_diagnostics
   where source = 'playlist_health' and device_id = '00000000-0000-0000-0000-000000009602'
   order by occurred_at desc limit 1),
  '00000000-0000-0000-0000-000000009604'::uuid,
  'Painel liga a falha à tentativa de cache'
);

insert into auth.users (id, aud, role, email)
values ('00000000-0000-0000-0000-000000009610', 'authenticated', 'authenticated', 'cleanup-test@example.com');
insert into public.panel_sellers (id, name, whatsapp, status, credit_balance)
values ('00000000-0000-0000-0000-000000009611', 'Vendedor Cleanup', '551100009611', 'active', 0);
insert into public.panel_user_roles (user_id, role, seller_id, active)
values (
  '00000000-0000-0000-0000-000000009610',
  'seller',
  '00000000-0000-0000-0000-000000009611',
  false
);
update public.panel_sellers
set
  status = 'inactive',
  deleted_at = now(),
  deletion_reason = 'temporary_access_not_renewed'
where id = '00000000-0000-0000-0000-000000009611';
select is(
  (select count(*)::integer from public.panel_auth_deletion_queue where auth_user_id = '00000000-0000-0000-0000-000000009610'),
  1,
  'Autoexclusão cria uma única entrada na fila Auth'
);
select ok(
  (select not_before between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour'
   from public.panel_auth_deletion_queue where auth_user_id = '00000000-0000-0000-0000-000000009610'),
  'Usuário Auth ganha mais sete dias de recuperação'
);
select is(
  (select count(*)::integer from public.claim_seller_auth_deletions(25)),
  0,
  'Fila não libera exclusão antes da janela adicional'
);
update public.panel_auth_deletion_queue
set not_before = now() - interval '1 minute'
where auth_user_id = '00000000-0000-0000-0000-000000009610';
select is(
  (select auth_user_id from public.claim_seller_auth_deletions(25)),
  '00000000-0000-0000-0000-000000009610'::uuid,
  'Fila vencida é reservada pelo worker'
);
select ok(
  (select status = 'processing' and attempts = 1
   from public.panel_auth_deletion_queue where auth_user_id = '00000000-0000-0000-0000-000000009610'),
  'Claim é registrado para permitir retry idempotente'
);

select * from finish();
rollback;
