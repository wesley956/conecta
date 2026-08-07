-- Lote 2: seller-device-flow identifica o executor no campo performed_by, mas
-- a transação financeira histórica só reconhecia prefixos seller:/admin:.
-- Para não duplicar a regra comercial, normalizamos o papel pelo user_id
-- autenticado no momento da gravação do financeiro privado.

create or replace function public.normalize_canonical_finance_created_by_role()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_role text;
begin
  if new.financial_scope = 'seller_private'
     and new.source in ('device_activation', 'device_renewal')
     and new.created_by_user_id is not null
     and coalesce(new.created_by_role, 'system') = 'system' then
    select role
      into v_role
      from public.panel_user_roles
     where user_id = new.created_by_user_id
       and active is true
     limit 1;

    if v_role in ('owner', 'admin', 'seller') then
      new.created_by_role := v_role;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists normalize_canonical_finance_created_by_role_trigger
  on public.panel_financial_records;

create trigger normalize_canonical_finance_created_by_role_trigger
before insert or update of created_by_user_id, created_by_role, source, financial_scope
on public.panel_financial_records
for each row
execute function public.normalize_canonical_finance_created_by_role();

revoke all on function public.normalize_canonical_finance_created_by_role()
  from public, anon, authenticated;
grant execute on function public.normalize_canonical_finance_created_by_role()
  to service_role;
