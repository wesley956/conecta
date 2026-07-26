alter table public.panel_sellers
  add column if not exists financial_credit_limit_cents bigint not null default 0,
  add column if not exists allow_credit_purchases_on_terms boolean not null default false;

alter table public.panel_financial_records
  add column if not exists financial_scope text not null default 'company';

alter table public.panel_financial_records
  drop constraint if exists panel_financial_records_scope_check;

alter table public.panel_financial_records
  add constraint panel_financial_records_scope_check
  check (financial_scope in ('company', 'seller_private'));

update public.panel_financial_records
   set financial_scope = case
     when created_by_role = 'seller' or source in ('device_activation', 'device_renewal') then 'seller_private'
     else 'company'
   end;

create table if not exists public.panel_credit_packages (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  credits integer not null check (credits > 0),
  price_cents bigint not null check (price_cents >= 0),
  validity_days integer not null default 60 check (validity_days between 1 and 365),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.panel_credit_packages (code, name, credits, price_cents, validity_days, sort_order)
values
  ('AVULSO_10', 'Pacote Avulso', 10, 3000, 60, 10),
  ('INTERMEDIARIO_25', 'Pacote Intermediário', 25, 3750, 60, 20),
  ('BASICO_50', 'Plano Básico', 50, 5000, 60, 30)
on conflict (code) do update set
  name = excluded.name,
  credits = excluded.credits,
  price_cents = excluded.price_cents,
  validity_days = excluded.validity_days,
  sort_order = excluded.sort_order,
  active = true,
  updated_at = now();

create table if not exists public.panel_credit_orders (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.panel_sellers(id) on delete restrict,
  package_id uuid references public.panel_credit_packages(id) on delete set null,
  package_name_snapshot text not null,
  package_code_snapshot text not null,
  package_quantity integer not null default 1 check (package_quantity > 0),
  credits_total integer not null check (credits_total > 0),
  unit_package_price_cents bigint not null check (unit_package_price_cents >= 0),
  total_amount_cents bigint not null check (total_amount_cents >= 0),
  payment_method text not null default 'pix',
  payment_status text not null default 'pending',
  release_policy text not null default 'after_payment',
  credits_status text not null default 'waiting_payment',
  due_date date,
  paid_at timestamptz,
  released_at timestamptz,
  expires_at timestamptz,
  notes text,
  idempotency_key text not null,
  created_by_user_id uuid,
  created_by_role text not null default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint panel_credit_orders_payment_check check (payment_status in ('paid','pending','overdue','cancelled')),
  constraint panel_credit_orders_release_check check (release_policy in ('immediate','after_payment')),
  constraint panel_credit_orders_credits_status_check check (credits_status in ('waiting_payment','released','expired','cancelled')),
  constraint panel_credit_orders_payment_method_check check (payment_method in ('pix','cash','card','bank_transfer','boleto','other')),
  constraint panel_credit_orders_role_check check (created_by_role in ('owner','admin','system')),
  unique (seller_id, idempotency_key)
);

create index if not exists panel_credit_orders_seller_idx on public.panel_credit_orders(seller_id, created_at desc);
create index if not exists panel_credit_orders_status_idx on public.panel_credit_orders(payment_status, due_date);

create table if not exists public.panel_credit_lots (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.panel_sellers(id) on delete restrict,
  order_id uuid references public.panel_credit_orders(id) on delete restrict,
  credits_granted integer not null check (credits_granted > 0),
  credits_remaining integer not null check (credits_remaining >= 0),
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active','consumed','expired','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists panel_credit_lots_fifo_idx on public.panel_credit_lots(seller_id, expires_at, created_at) where status = 'active';

alter table public.panel_credit_packages enable row level security;
alter table public.panel_credit_packages force row level security;
alter table public.panel_credit_orders enable row level security;
alter table public.panel_credit_orders force row level security;
alter table public.panel_credit_lots enable row level security;
alter table public.panel_credit_lots force row level security;

revoke all on public.panel_credit_packages, public.panel_credit_orders, public.panel_credit_lots from public, anon, authenticated;
grant all on public.panel_credit_packages, public.panel_credit_orders, public.panel_credit_lots to service_role;

create or replace function public.release_credit_order(p_order_id uuid)
returns public.panel_credit_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.panel_credit_orders%rowtype;
  v_balance integer;
begin
  select * into v_order from public.panel_credit_orders where id = p_order_id for update;
  if not found then raise exception 'Pedido de créditos não encontrado.'; end if;
  if v_order.credits_status = 'released' then return v_order; end if;
  if v_order.payment_status = 'cancelled' then raise exception 'Pedido cancelado não pode liberar créditos.'; end if;

  update public.panel_sellers
     set credit_balance = credit_balance + v_order.credits_total,
         updated_at = now()
   where id = v_order.seller_id
   returning credit_balance into v_balance;

  insert into public.panel_credit_ledger (
    seller_id, amount, type, reference_id, description, balance_after,
    performed_by, idempotency_key, operation_fingerprint, seller_name_snapshot
  )
  select
    v_order.seller_id,
    v_order.credits_total,
    'credit_purchase',
    v_order.id,
    format('%s pacote(s) %s — %s créditos', v_order.package_quantity, v_order.package_name_snapshot, v_order.credits_total),
    v_balance,
    'admin',
    'credit-order:' || v_order.id::text,
    'credit-order-v1|' || v_order.id::text,
    seller.name
  from public.panel_sellers seller where seller.id = v_order.seller_id
  on conflict do nothing;

  insert into public.panel_credit_lots (seller_id, order_id, credits_granted, credits_remaining, expires_at)
  values (v_order.seller_id, v_order.id, v_order.credits_total, v_order.credits_total,
          coalesce(v_order.expires_at, now() + interval '60 days'))
  on conflict do nothing;

  update public.panel_credit_orders
     set credits_status = 'released', released_at = coalesce(released_at, now()),
         expires_at = coalesce(expires_at, now() + interval '60 days'), updated_at = now()
   where id = v_order.id
   returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.release_credit_order(uuid) from public, anon, authenticated;
grant execute on function public.release_credit_order(uuid) to service_role;

create or replace function public.create_credit_package_order(
  p_seller_id uuid,
  p_package_id uuid,
  p_package_quantity integer,
  p_payment_status text,
  p_payment_method text,
  p_release_policy text,
  p_due_date date,
  p_notes text,
  p_idempotency_key text,
  p_created_by_user_id uuid,
  p_created_by_role text
)
returns public.panel_credit_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller public.panel_sellers%rowtype;
  v_package public.panel_credit_packages%rowtype;
  v_order public.panel_credit_orders%rowtype;
  v_quantity integer := greatest(1, coalesce(p_package_quantity, 1));
  v_total bigint;
  v_open_debt bigint;
  v_status text := lower(coalesce(p_payment_status, 'pending'));
  v_release text := lower(coalesce(p_release_policy, 'after_payment'));
begin
  select * into v_seller from public.panel_sellers where id = p_seller_id for update;
  if not found or v_seller.status <> 'active' then raise exception 'Vendedor inexistente ou inativo.'; end if;
  select * into v_package from public.panel_credit_packages where id = p_package_id and active is true;
  if not found then raise exception 'Pacote de créditos indisponível.'; end if;
  if v_status not in ('paid','pending') then raise exception 'Status inicial inválido.'; end if;
  if v_release not in ('immediate','after_payment') then raise exception 'Política de liberação inválida.'; end if;
  if v_status = 'pending' and not v_seller.allow_credit_purchases_on_terms then
    raise exception 'Este vendedor não está autorizado a comprar a prazo.';
  end if;

  v_total := v_package.price_cents * v_quantity;
  select coalesce(sum(total_amount_cents), 0) into v_open_debt
    from public.panel_credit_orders
   where seller_id = p_seller_id and payment_status in ('pending','overdue');
  if v_status = 'pending' and v_seller.financial_credit_limit_cents > 0
     and v_open_debt + v_total > v_seller.financial_credit_limit_cents then
    raise exception 'A compra ultrapassa o limite financeiro do vendedor.';
  end if;

  select * into v_order from public.panel_credit_orders
   where seller_id = p_seller_id and idempotency_key = p_idempotency_key;
  if found then return v_order; end if;

  insert into public.panel_credit_orders (
    seller_id, package_id, package_name_snapshot, package_code_snapshot,
    package_quantity, credits_total, unit_package_price_cents, total_amount_cents,
    payment_method, payment_status, release_policy, credits_status, due_date,
    paid_at, expires_at, notes, idempotency_key, created_by_user_id, created_by_role
  ) values (
    p_seller_id, v_package.id, v_package.name, v_package.code,
    v_quantity, v_package.credits * v_quantity, v_package.price_cents, v_total,
    lower(coalesce(p_payment_method,'pix')), v_status, v_release,
    case when v_status = 'paid' or v_release = 'immediate' then 'released' else 'waiting_payment' end,
    p_due_date, case when v_status = 'paid' then now() else null end,
    now() + make_interval(days => v_package.validity_days), nullif(trim(p_notes), ''),
    p_idempotency_key, p_created_by_user_id,
    case when p_created_by_role in ('owner','admin') then p_created_by_role else 'admin' end
  ) returning * into v_order;

  insert into public.panel_financial_records (
    record_type, source, category, seller_id, seller_name_snapshot, description,
    amount_cents, payment_method, status, due_date, paid_at, reference_date,
    notes, idempotency_key, created_by_user_id, created_by_role, financial_scope
  ) values (
    'income', 'credit_sale', 'credit_sale', v_order.seller_id, v_seller.name,
    format('%s pacote(s) %s — %s créditos', v_order.package_quantity, v_order.package_name_snapshot, v_order.credits_total),
    v_order.total_amount_cents, v_order.payment_method, v_order.payment_status,
    v_order.due_date, v_order.paid_at, current_date, v_order.notes,
    'credit-order-finance:' || v_order.id::text, p_created_by_user_id,
    case when p_created_by_role in ('owner','admin') then p_created_by_role else 'admin' end,
    'company'
  );

  if v_status = 'paid' or v_release = 'immediate' then
    v_order := public.release_credit_order(v_order.id);
  end if;
  return v_order;
end;
$$;

revoke all on function public.create_credit_package_order(uuid,uuid,integer,text,text,text,date,text,text,uuid,text) from public, anon, authenticated;
grant execute on function public.create_credit_package_order(uuid,uuid,integer,text,text,text,date,text,text,uuid,text) to service_role;

create or replace function public.expire_credit_lots(p_seller_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot public.panel_credit_lots%rowtype;
  v_count integer := 0;
  v_balance integer;
begin
  for v_lot in
    select * from public.panel_credit_lots
     where status = 'active' and credits_remaining > 0 and expires_at <= now()
       and (p_seller_id is null or seller_id = p_seller_id)
     order by expires_at for update
  loop
    update public.panel_sellers
       set credit_balance = greatest(0, credit_balance - v_lot.credits_remaining), updated_at = now()
     where id = v_lot.seller_id returning credit_balance into v_balance;
    insert into public.panel_credit_ledger (
      seller_id, amount, type, reference_id, description, balance_after, performed_by,
      idempotency_key, operation_fingerprint
    ) values (
      v_lot.seller_id, -v_lot.credits_remaining, 'expiration', v_lot.id,
      'Expiração de créditos após 60 dias', v_balance, 'system',
      'credit-expiration:' || v_lot.id::text, 'credit-expiration-v1|' || v_lot.id::text
    ) on conflict do nothing;
    update public.panel_credit_lots set credits_remaining = 0, status = 'expired', updated_at = now() where id = v_lot.id;
    update public.panel_credit_orders set credits_status = 'expired', updated_at = now() where id = v_lot.order_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.expire_credit_lots(uuid) from public, anon, authenticated;
grant execute on function public.expire_credit_lots(uuid) to service_role;
