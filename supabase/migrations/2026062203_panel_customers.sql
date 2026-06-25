create table if not exists public.panel_customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  whatsapp text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.panel_devices
  add column if not exists customer_id uuid references public.panel_customers(id) on delete set null;

create index if not exists panel_customers_name_idx
  on public.panel_customers(name);

create index if not exists panel_customers_whatsapp_idx
  on public.panel_customers(whatsapp);

create index if not exists panel_devices_customer_id_idx
  on public.panel_devices(customer_id);

alter table public.panel_customers enable row level security;
