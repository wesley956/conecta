begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(3);

select ok(
  case
    when to_regprocedure('public.admin_update_device_with_credit(uuid,jsonb,text,integer,text,text,text)') is null
      then true
    else not has_function_privilege(
      'anon',
      to_regprocedure('public.admin_update_device_with_credit(uuid,jsonb,text,integer,text,text,text)')::oid,
      'execute'
    )
  end,
  'anon não pode executar a RPC administrativa de crédito quando ela existir'
);

select ok(
  case
    when to_regprocedure('public.admin_update_device_with_credit(uuid,jsonb,text,integer,text,text,text)') is null
      then true
    else not has_function_privilege(
      'authenticated',
      to_regprocedure('public.admin_update_device_with_credit(uuid,jsonb,text,integer,text,text,text)')::oid,
      'execute'
    )
  end,
  'authenticated não pode executar a RPC administrativa de crédito quando ela existir'
);

select ok(
  case
    when to_regprocedure('public.admin_update_device_with_credit(uuid,jsonb,text,integer,text,text,text)') is null
      then true
    else has_function_privilege(
      'service_role',
      to_regprocedure('public.admin_update_device_with_credit(uuid,jsonb,text,integer,text,text,text)')::oid,
      'execute'
    )
  end,
  'service_role pode executar a RPC administrativa de crédito quando ela existir'
);

select * from finish();
rollback;
