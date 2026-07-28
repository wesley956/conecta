create table if not exists public.panel_review_accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  provider text not null default 'lg' check (provider in ('lg')),
  name text not null,
  active boolean not null default true,
  expires_at timestamptz not null,
  max_devices integer not null default 5 check (max_devices between 1 and 10),
  seller_id uuid references public.panel_sellers(id) on delete set null,
  customer_id uuid references public.panel_customers(id) on delete set null,
  plan_id uuid references public.panel_plans(id) on delete set null,
  playlist_id uuid references public.panel_playlists(id) on delete set null,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.panel_review_devices (
  id uuid primary key default gen_random_uuid(),
  review_account_id uuid not null references public.panel_review_accounts(id) on delete cascade,
  device_id uuid not null unique references public.panel_devices(id) on delete cascade,
  activated_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (review_account_id, device_id)
);

create index if not exists panel_review_accounts_provider_active_idx
  on public.panel_review_accounts(provider, active, expires_at);

create index if not exists panel_review_devices_account_active_idx
  on public.panel_review_devices(review_account_id, revoked_at, activated_at desc);

alter table public.panel_review_accounts enable row level security;
alter table public.panel_review_devices enable row level security;

revoke all on table public.panel_review_accounts from public, anon, authenticated;
revoke all on table public.panel_review_devices from public, anon, authenticated;

grant all on table public.panel_review_accounts to service_role;
grant all on table public.panel_review_devices to service_role;

comment on table public.panel_review_accounts is
  'Contas temporárias e isoladas para homologação oficial de lojas de Smart TV.';
comment on table public.panel_review_devices is
  'Aparelhos ativados por contas oficiais de homologação, separados do fluxo comercial.';
