begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(18);

select has_table('public', 'panel_playlist_diagnostics', 'Tabela de diagnósticos progressivos existe');
select has_table('public', 'panel_playlist_diagnostic_tasks', 'Tabela de tarefas para Android existe');
select has_column('public', 'panel_playlist_diagnostics', 'server_steps', 'Diagnóstico guarda etapas do servidor');
select has_column('public', 'panel_playlist_diagnostics', 'device_steps', 'Diagnóstico guarda etapas do aparelho');
select has_column('public', 'panel_playlist_diagnostics', 'comparison', 'Diagnóstico guarda comparação saneada');
select has_column('public', 'panel_playlist_diagnostic_tasks', 'requested_checks', 'Tarefa limita testes solicitados');
select has_column('public', 'panel_playlist_diagnostic_tasks', 'result', 'Tarefa guarda somente resultados técnicos');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.panel_playlist_diagnostics'::regclass),
  'RLS está habilitada nos diagnósticos'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.panel_playlist_diagnostic_tasks'::regclass),
  'RLS está habilitada nas tarefas'
);
select ok(not has_table_privilege('anon', 'public.panel_playlist_diagnostics', 'select'), 'anon não lê diagnósticos');
select ok(not has_table_privilege('authenticated', 'public.panel_playlist_diagnostics', 'select'), 'authenticated não lê diagnósticos diretamente');
select ok(not has_table_privilege('anon', 'public.panel_playlist_diagnostic_tasks', 'select'), 'anon não lê tarefas');
select ok(not has_table_privilege('authenticated', 'public.panel_playlist_diagnostic_tasks', 'select'), 'authenticated não lê tarefas diretamente');
select ok(has_table_privilege('service_role', 'public.panel_playlist_diagnostics', 'select'), 'service_role lê diagnósticos');
select ok(has_table_privilege('service_role', 'public.panel_playlist_diagnostic_tasks', 'select'), 'service_role lê tarefas');

insert into public.panel_playlists (id, name, playlist_url, playlist_type, active)
values (
  '00000000-0000-0000-0000-000000009701',
  'Lista diagnóstico progressivo',
  'https://provider.invalid/base/get.php?username=alice&password=secret',
  'xtream',
  true
);
insert into public.panel_devices (id, device_code, status, device_type, app_version)
values (
  '00000000-0000-0000-0000-000000009702',
  'RPTV-DIAG01',
  'active',
  'androidtv',
  '2.5.0'
);
insert into public.panel_playlist_diagnostics (
  id, playlist_id, requested_by_role, status, classification, strategy,
  server_steps, summary
) values (
  '00000000-0000-0000-0000-000000009703',
  '00000000-0000-0000-0000-000000009701',
  'owner',
  'waiting_device',
  'SERVER_UNAVAILABLE',
  'retry',
  '[{"step":5,"key":"head","origin":"server","status":"timeout","code":"TIMEOUT"}]'::jsonb,
  'Servidor não confirmou o provedor.'
);
insert into public.panel_playlist_diagnostic_tasks (
  id, diagnostic_id, playlist_id, device_id, status, requested_checks
) values (
  '00000000-0000-0000-0000-000000009704',
  '00000000-0000-0000-0000-000000009703',
  '00000000-0000-0000-0000-000000009701',
  '00000000-0000-0000-0000-000000009702',
  'waiting_device',
  '["head","auth","playback"]'::jsonb
);

select is(
  (select status from public.panel_playlist_diagnostic_tasks where id = '00000000-0000-0000-0000-000000009704'),
  'waiting_device',
  'Tarefa nasce aguardando Android'
);
select ok(
  (select expires_at between now() + interval '9 minutes' and now() + interval '11 minutes'
   from public.panel_playlist_diagnostic_tasks where id = '00000000-0000-0000-0000-000000009704'),
  'Tarefa expira em aproximadamente dez minutos'
);
select is(
  (select jsonb_array_length(requested_checks) from public.panel_playlist_diagnostic_tasks
   where id = '00000000-0000-0000-0000-000000009704'),
  3,
  'Tarefa contém somente os três testes técnicos permitidos'
);

delete from public.panel_playlists where id = '00000000-0000-0000-0000-000000009701';
select ok(
  not exists (
    select 1 from public.panel_playlist_diagnostics
    where id = '00000000-0000-0000-0000-000000009703'
  ) and not exists (
    select 1 from public.panel_playlist_diagnostic_tasks
    where id = '00000000-0000-0000-0000-000000009704'
  ),
  'Excluir a lista remove diagnóstico e tarefa por cascata'
);

select * from finish();
rollback;
