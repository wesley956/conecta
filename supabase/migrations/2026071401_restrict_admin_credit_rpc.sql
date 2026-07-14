revoke all on function public.admin_update_device_with_credit(
  uuid,
  jsonb,
  text,
  integer,
  text,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.admin_update_device_with_credit(
  uuid,
  jsonb,
  text,
  integer,
  text,
  text,
  text
) to service_role;
