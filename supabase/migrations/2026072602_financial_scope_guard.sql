create or replace function public.enforce_panel_financial_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.source = 'credit_sale' then
    new.financial_scope := 'company';
  elsif new.created_by_role = 'seller' or new.source in ('device_activation', 'device_renewal') then
    new.financial_scope := 'seller_private';
  else
    new.financial_scope := 'company';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_panel_financial_scope() from public, anon, authenticated;
grant execute on function public.enforce_panel_financial_scope() to service_role;

drop trigger if exists panel_financial_records_scope_guard on public.panel_financial_records;
create trigger panel_financial_records_scope_guard
before insert or update of source, created_by_role, financial_scope
on public.panel_financial_records
for each row execute function public.enforce_panel_financial_scope();

update public.panel_financial_records
set financial_scope = case
  when source = 'credit_sale' then 'company'
  when created_by_role = 'seller' or source in ('device_activation', 'device_renewal') then 'seller_private'
  else 'company'
end;
