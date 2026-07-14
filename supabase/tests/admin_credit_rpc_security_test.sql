begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(3);

select ok(
  not has_function_privilege(
    'anon',
    'public.admin_update_device_with_credit(uuid,jsonb,text,integer,text,text,text)',
    'execute'
  ),
  'anon não pode executar a RPC administrativa de crédito'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.admin_update_device_with_credit(uuid,jsonb,text,integer,text,text,text)',
    'execute'
  ),
  'authenticated não pode executar a RPC administrativa de crédito'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.admin_update_device_with_credit(uuid,jsonb,text,integer,text,text,text)',
    'execute'
  ),
  'service_role pode executar a RPC administrativa de crédito'
);

select * from finish();
rollback;
