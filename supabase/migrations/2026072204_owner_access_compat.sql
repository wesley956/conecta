-- Marca exclusiva de proprietário sem obrigar endpoints antigos a reconhecerem
-- imediatamente o novo papel owner. Permite uma migração operacional gradual.

create table if not exists public.panel_owner_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.panel_owner_access (user_id, active)
select role_record.user_id, true
from public.panel_user_roles role_record
where role_record.role = 'owner'
  and role_record.active is true
on conflict (user_id) do update
  set active = true,
      updated_at = now();

insert into public.panel_owner_access (user_id, active)
select role_record.user_id, true
from public.panel_user_roles role_record
where role_record.role = 'admin'
  and role_record.active is true
  and not exists (
    select 1 from public.panel_owner_access owner_record where owner_record.active is true
  )
order by role_record.created_at asc, role_record.user_id asc
limit 1
on conflict (user_id) do update
  set active = true,
      updated_at = now();

create unique index if not exists panel_owner_access_single_active_uidx
  on public.panel_owner_access ((active))
  where active is true;

alter table public.panel_owner_access enable row level security;
alter table public.panel_owner_access force row level security;
revoke all on table public.panel_owner_access from public, anon, authenticated;
grant all on table public.panel_owner_access to service_role;

comment on table public.panel_owner_access is
  'Conta única autorizada a usar o laboratório, mesmo durante compatibilidade com endpoints administrativos antigos.';
