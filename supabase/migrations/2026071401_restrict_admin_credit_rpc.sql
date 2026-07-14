do $$
begin
  if to_regprocedure(
    'public.admin_update_device_with_credit(uuid,jsonb,text,integer,text,text,text)'
  ) is not null then
    execute 'revoke all on function public.admin_update_device_with_credit(uuid,jsonb,text,integer,text,text,text) from public, anon, authenticated';
    execute 'grant execute on function public.admin_update_device_with_credit(uuid,jsonb,text,integer,text,text,text) to service_role';
  end if;
end;
$$;
