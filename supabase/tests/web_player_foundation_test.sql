begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(10);

select ok(
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='panel_devices' and column_name='web_access_enabled'),
  'panel_devices possui controle explícito de acesso Web'
);

select ok(
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='panel_devices' and column_name='web_pin_hash'),
  'panel_devices possui somente campo de hash para o PIN Web'
);

select ok(
  to_regclass('public.web_player_sessions') is not null,
  'web_player_sessions existe'
);

select ok(
  to_regclass('public.web_player_login_attempts') is not null,
  'web_player_login_attempts existe'
);

select ok(
  coalesce((select relrowsecurity from pg_class where oid='public.web_player_sessions'::regclass), false),
  'RLS está habilitado em web_player_sessions'
);

select ok(
  coalesce((select relrowsecurity from pg_class where oid='public.web_player_login_attempts'::regclass), false),
  'RLS está habilitado em web_player_login_attempts'
);

select ok(
  not has_table_privilege('anon', 'public.web_player_sessions', 'select'),
  'anon não lê sessões Web diretamente'
);

select ok(
  not has_table_privilege('authenticated', 'public.web_player_sessions', 'select'),
  'authenticated não lê sessões Web diretamente'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.web_player_create_session(uuid,text,text,timestamp with time zone,timestamp with time zone,text,text)'::regprocedure,
    'execute'
  ),
  'anon não cria web_session diretamente'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.web_player_create_session(uuid,text,text,timestamp with time zone,timestamp with time zone,text,text)'::regprocedure,
    'execute'
  ),
  'somente backend service_role possui o caminho de criação de web_session'
);

select * from finish();
rollback;
