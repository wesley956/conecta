create table if not exists public.panel_sellers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  whatsapp text not null,
  email text,
  status text not null default 'active'
    check (status in ('active', 'blocked', 'inactive')),
  credit_balance integer not null default 0
    check (credit_balance >= 0),
  can_go_negative boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.panel_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  duration_days integer not null,
  credit_cost integer not null default 1,
  max_devices integer not null default 1,
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.panel_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.panel_sellers(id) on delete restrict,
  amount integer not null,
  type text not null
    check (type in ('purchase', 'activation', 'renewal', 'refund', 'manual_add', 'manual_remove')),
  reference_id uuid,
  description text,
  balance_after integer not null,
  performed_by text,
  created_at timestamptz not null default now()
);

alter table public.panel_customers
  add column if not exists seller_id uuid references public.panel_sellers(id) on delete set null,
  add column if not exists status text not null default 'active'
    check (status in ('active', 'blocked', 'inactive'));

alter table public.panel_devices
  add column if not exists seller_id uuid references public.panel_sellers(id) on delete set null,
  add column if not exists plan_id uuid references public.panel_plans(id) on delete set null;

alter table public.panel_audit_logs
  add column if not exists performed_by text,
  add column if not exists performed_ip text;

create index if not exists panel_sellers_status_idx
  on public.panel_sellers(status);

create index if not exists panel_credit_ledger_seller_idx
  on public.panel_credit_ledger(seller_id, created_at desc);

create index if not exists panel_customers_seller_idx
  on public.panel_customers(seller_id);

create index if not exists panel_devices_seller_idx
  on public.panel_devices(seller_id);

create index if not exists panel_devices_plan_idx
  on public.panel_devices(plan_id);

alter table public.panel_sellers enable row level security;
alter table public.panel_plans enable row level security;
alter table public.panel_credit_ledger enable row level security;
