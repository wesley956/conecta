create table if not exists public.panel_system_support_profiles (
  id smallint primary key default 1 check (id = 1),
  display_name text not null default 'Suporte Roneca Player TV',
  whatsapp text,
  email text,
  support_text text,
  business_hours text,
  contact_url text,
  enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint panel_system_support_display_name_length check (char_length(display_name) between 1 and 120),
  constraint panel_system_support_whatsapp_length check (whatsapp is null or char_length(whatsapp) between 8 and 20),
  constraint panel_system_support_email_length check (email is null or char_length(email) <= 254),
  constraint panel_system_support_text_length check (support_text is null or char_length(support_text) <= 280),
  constraint panel_system_support_hours_length check (business_hours is null or char_length(business_hours) <= 160),
  constraint panel_system_support_url_length check (contact_url is null or char_length(contact_url) <= 2048)
);

create table if not exists public.panel_seller_support_profiles (
  seller_id uuid primary key references public.panel_sellers(id) on delete cascade,
  display_name text not null,
  whatsapp text,
  email text,
  support_text text,
  business_hours text,
  contact_url text,
  show_in_app boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint panel_seller_support_display_name_length check (char_length(display_name) between 1 and 120),
  constraint panel_seller_support_whatsapp_length check (whatsapp is null or char_length(whatsapp) between 8 and 20),
  constraint panel_seller_support_email_length check (email is null or char_length(email) <= 254),
  constraint panel_seller_support_text_length check (support_text is null or char_length(support_text) <= 280),
  constraint panel_seller_support_hours_length check (business_hours is null or char_length(business_hours) <= 160),
  constraint panel_seller_support_url_length check (contact_url is null or char_length(contact_url) <= 2048)
);

alter table public.panel_system_support_profiles enable row level security;
alter table public.panel_system_support_profiles force row level security;
alter table public.panel_seller_support_profiles enable row level security;
alter table public.panel_seller_support_profiles force row level security;

revoke all on table public.panel_system_support_profiles from public, anon, authenticated;
revoke all on table public.panel_seller_support_profiles from public, anon, authenticated;
grant all on table public.panel_system_support_profiles to service_role;
grant all on table public.panel_seller_support_profiles to service_role;

create or replace function public.touch_panel_support_profile_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists panel_system_support_profile_touch_updated_at
  on public.panel_system_support_profiles;
create trigger panel_system_support_profile_touch_updated_at
before update on public.panel_system_support_profiles
for each row execute function public.touch_panel_support_profile_updated_at();

drop trigger if exists panel_seller_support_profile_touch_updated_at
  on public.panel_seller_support_profiles;
create trigger panel_seller_support_profile_touch_updated_at
before update on public.panel_seller_support_profiles
for each row execute function public.touch_panel_support_profile_updated_at();

revoke all on function public.touch_panel_support_profile_updated_at()
  from public, anon, authenticated;
grant execute on function public.touch_panel_support_profile_updated_at()
  to service_role;

comment on table public.panel_system_support_profiles is
  'Perfil público único de ajuda oficial, acessível aos apps somente por contrato backend resolvido.';
comment on table public.panel_seller_support_profiles is
  'Perfil público de suporte do vendedor, isolado por seller_id e exposto aos apps somente após resolução backend.';

insert into public.panel_system_support_profiles (id, enabled)
values (1, false)
on conflict (id) do nothing;
