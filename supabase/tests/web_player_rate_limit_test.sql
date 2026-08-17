begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(4);

select ok(
  has_function_privilege(
    'service_role',
    'public.web_player_take_rate_limit(text,text,integer,integer)'::regprocedure,
    'execute'
  ),
  'service_role pode adquirir quota Web'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.web_player_take_rate_limit(text,text,integer,integer)'::regprocedure,
    'execute'
  ),
  'anon não pode chamar a RPC de rate limit diretamente'
);

select ok(
  public.web_player_take_rate_limit('catalog', repeat('a', 64), 1, 60),
  'primeira chamada adquire quota'
);

select ok(
  not public.web_player_take_rate_limit('catalog', repeat('a', 64), 1, 60),
  'segunda chamada no mesmo bucket+sujeito é negada atomicamente'
);

select * from finish();
rollback;
