-- Compatibilidade do papel owner com funções e registros já existentes.

alter table public.panel_financial_records
  drop constraint if exists panel_financial_records_role_check;
alter table public.panel_financial_records
  add constraint panel_financial_records_role_check
  check (created_by_role in ('owner', 'admin', 'seller', 'system'));

create or replace function public.assign_panel_role(
  p_user_id uuid,
  p_role text,
  p_seller_id uuid default null,
  p_active boolean default true
)
returns public.panel_user_roles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.panel_user_roles;
  v_active boolean := coalesce(p_active, true);
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'Usuário é obrigatório.';
  end if;

  if p_role is null or p_role not in ('owner', 'admin', 'seller') then
    raise exception using errcode = '22023', message = 'Papel inválido.';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception using errcode = 'P0002', message = 'Usuário autenticado não encontrado.';
  end if;

  if p_role in ('owner', 'admin') and p_seller_id is not null then
    raise exception using errcode = '22023', message = 'Proprietário ou administrador não pode apontar para vendedor.';
  end if;

  if p_role = 'seller' and p_seller_id is null then
    raise exception using errcode = '22023', message = 'Vendedor exige seller_id.';
  end if;

  if p_role = 'owner' and exists (
    select 1
    from public.panel_user_roles
    where role = 'owner'
      and active is true
      and user_id <> p_user_id
  ) then
    raise exception using errcode = '23505', message = 'Já existe um proprietário ativo do painel.';
  end if;

  if p_seller_id is not null and not exists (
    select 1 from public.panel_sellers where id = p_seller_id
  ) then
    raise exception using errcode = 'P0002', message = 'Vendedor não encontrado.';
  end if;

  if p_seller_id is not null and exists (
    select 1
    from public.panel_user_roles
    where seller_id = p_seller_id
      and user_id <> p_user_id
  ) then
    raise exception using errcode = '23505', message = 'Este vendedor já está vinculado a outro usuário.';
  end if;

  insert into public.panel_user_roles (user_id, role, seller_id, active)
  values (p_user_id, p_role, p_seller_id, v_active)
  on conflict (user_id) do update
    set role = excluded.role,
        seller_id = excluded.seller_id,
        active = excluded.active,
        updated_at = now()
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.assign_panel_role(uuid, text, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.assign_panel_role(uuid, text, uuid, boolean)
  to service_role;

create unique index if not exists panel_user_roles_single_active_owner_uidx
  on public.panel_user_roles ((role))
  where role = 'owner' and active is true;

comment on column public.panel_user_roles.role is
  'owner é a única conta com acesso ao laboratório; admin gerencia a operação; seller acessa apenas a própria carteira.';
