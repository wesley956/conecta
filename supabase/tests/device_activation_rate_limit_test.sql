begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(8);

select has_table(
  'public',
  'device_activation_rate_limits',
  'Armazenamento persistente de limites de ativação existe'
);

select has_function(
  'public',
  'consume_device_activation_rate_limit',
  array['text', 'integer', 'integer', 'jsonb'],
  'RPC atômica de limitação existe'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.consume_device_activation_rate_limit(text,integer,integer,jsonb)',
    'execute'
  ),
  'anon não pode manipular o limitador'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.consume_device_activation_rate_limit(text,integer,integer,jsonb)',
    'execute'
  ),
  'authenticated não pode manipular o limitador'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.consume_device_activation_rate_limit(text,integer,integer,jsonb)',
    'execute'
  ),
  'service_role pode consumir o limitador'
);

select ok(
  public.consume_device_activation_rate_limit(repeat('a', 64), 2, 3600, '{}'::jsonb),
  'primeira tentativa é permitida'
);

select ok(
  public.consume_device_activation_rate_limit(repeat('a', 64), 2, 3600, '{}'::jsonb),
  'segunda tentativa é permitida'
);

select ok(
  not public.consume_device_activation_rate_limit(repeat('a', 64), 2, 3600, '{}'::jsonb),
  'tentativa acima do limite é bloqueada'
);

select * from finish();
rollback;
