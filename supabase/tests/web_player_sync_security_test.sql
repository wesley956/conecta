begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(18);

select ok(to_regclass('public.web_player_library_favorites') is not null, 'favorites canônicos existem');
select ok(to_regclass('public.web_player_library_progress') is not null, 'progresso canônico existe');
select ok(to_regclass('public.web_player_library_preferences') is not null, 'preferências canônicas existem');
select ok(to_regclass('public.web_player_diagnostics') is not null, 'diagnóstico Web existe');
select ok(to_regclass('public.web_player_rate_events') is not null, 'rate events existem');
select ok(to_regclass('public.web_player_admin_audit') is not null, 'auditoria Web do painel existe');

select ok((select relrowsecurity from pg_class where oid='public.web_player_library_favorites'::regclass), 'favorites com RLS');
select ok((select relrowsecurity from pg_class where oid='public.web_player_library_progress'::regclass), 'progresso com RLS');
select ok((select relrowsecurity from pg_class where oid='public.web_player_diagnostics'::regclass), 'diagnóstico com RLS');
select ok(not has_table_privilege('anon','public.web_player_library_favorites','select'), 'anon não lê favoritos diretamente');
select ok(not has_table_privilege('authenticated','public.web_player_library_progress','select'), 'authenticated não lê progresso diretamente');
select ok(not has_table_privilege('anon','public.web_player_diagnostics','insert'), 'anon não injeta diagnóstico direto');
select ok(not has_table_privilege('authenticated','public.web_player_admin_audit','select'), 'authenticated não lê auditoria diretamente');

select ok(has_function_privilege('service_role','public.web_player_set_favorite(text,text,text,boolean)'::regprocedure,'execute'), 'service_role grava favorito via RPC');
select ok(not has_function_privilege('anon','public.web_player_set_favorite(text,text,text,boolean)'::regprocedure,'execute'), 'anon não grava favorito via RPC');
select ok(has_function_privilege('service_role','public.web_player_set_progress(text,text,text,bigint,bigint)'::regprocedure,'execute'), 'service_role grava progresso via RPC');
select ok(not has_function_privilege('authenticated','public.web_player_set_progress(text,text,text,bigint,bigint)'::regprocedure,'execute'), 'authenticated não grava progresso via RPC');

select is(
  (select count(*)::integer from information_schema.columns
   where table_schema='public'
     and table_name in ('web_player_library_favorites','web_player_library_progress','web_player_library_preferences')
     and column_name ~ '(url|token|credential|password|pin)'),
  0,
  'biblioteca canônica não possui colunas de URL/token/credencial/PIN'
);

select * from finish();
rollback;
