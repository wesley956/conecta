create table if not exists public.panel_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'seller')),
  seller_id uuid references public.panel_sellers(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint panel_user_roles_seller_shape check (
    (role = 'admin' and seller_id is null) or
    (role = 'seller' and seller_id is not null)
  )
);

create unique index if not exists panel_user_roles_seller_id_uidx
  on public.panel_user_roles(seller_id)
  where seller_id is not null;

alter table public.panel_user_roles enable row level security;
alter table public.panel_user_roles force row level security;

revoke all on table public.panel_user_roles from public, anon, authenticated;
grant all on table public.panel_user_roles to service_role;

create or replace function public.touch_panel_user_roles_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists panel_user_roles_touch_updated_at
  on public.panel_user_roles;

create trigger panel_user_roles_touch_updated_at
before update on public.panel_user_roles
for each row
execute function public.touch_panel_user_roles_updated_at();

revoke all on function public.touch_panel_user_roles_updated_at()
  from public, anon, authenticated;

grant execute on function public.touch_panel_user_roles_updated_at()
  to service_role;

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

  if p_role is null or p_role not in ('admin', 'seller') then
    raise exception using errcode = '22023', message = 'Papel inválido.';
  end if;

  if not exists (
    select 1 from auth.users where id = p_user_id
  ) then
    raise exception using errcode = 'P0002', message = 'Usuário autenticado não encontrado.';
  end if;

  if p_role = 'admin' and p_seller_id is not null then
    raise exception using errcode = '22023', message = 'Administrador não pode apontar para vendedor.';
  end if;

  if p_role = 'seller' and p_seller_id is null then
    raise exception using errcode = '22023', message = 'Vendedor exige seller_id.';
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

  insert into public.panel_user_roles (
    user_id,
    role,
    seller_id,
    active
  ) values (
    p_user_id,
    p_role,
    p_seller_id,
    v_active
  )
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

create or replace function public.revoke_panel_role(
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'Usuário é obrigatório.';
  end if;

  update public.panel_user_roles
     set active = false,
         updated_at = now()
   where user_id = p_user_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Usuário do painel não encontrado.';
  end if;
end;
$$;

revoke all on function public.revoke_panel_role(uuid)
  from public, anon, authenticated;

grant execute on function public.revoke_panel_role(uuid)
  to service_role;

comment on table public.panel_user_roles is
  'Mapeia usuários autenticados do Supabase Auth para papéis individuais do painel administrativo ou vendedor.';
