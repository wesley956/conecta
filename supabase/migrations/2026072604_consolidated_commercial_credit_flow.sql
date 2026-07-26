create table if not exists public.panel_seller_plan_prices (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.panel_sellers(id) on delete cascade,
  plan_id uuid not null references public.panel_plans(id) on delete cascade,
  default_sale_price_cents bigint not null check (default_sale_price_cents > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (seller_id, plan_id)
);

create index if not exists panel_seller_plan_prices_seller_idx
  on public.panel_seller_plan_prices(seller_id, active, updated_at desc);

alter table public.panel_seller_plan_prices enable row level security;
alter table public.panel_seller_plan_prices force row level security;
revoke all on public.panel_seller_plan_prices from public, anon, authenticated;
grant all on public.panel_seller_plan_prices to service_role;

insert into public.panel_seller_plan_prices (
  seller_id,
  plan_id,
  default_sale_price_cents,
  active,
  updated_at
)
select distinct on (record.seller_id, record.plan_id)
  record.seller_id,
  record.plan_id,
  record.amount_cents,
  true,
  coalesce(record.updated_at, record.created_at, now())
from public.panel_financial_records record
where record.financial_scope = 'seller_private'
  and record.record_type = 'income'
  and record.source in ('device_activation', 'device_renewal')
  and record.seller_id is not null
  and record.plan_id is not null
  and record.amount_cents > 0
order by record.seller_id, record.plan_id, record.reference_date desc, record.created_at desc
on conflict (seller_id, plan_id) do nothing;

create or replace function public.set_panel_seller_plan_price_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_panel_seller_plan_price_updated_at() from public, anon, authenticated;
grant execute on function public.set_panel_seller_plan_price_updated_at() to service_role;

drop trigger if exists panel_seller_plan_prices_updated_at on public.panel_seller_plan_prices;
create trigger panel_seller_plan_prices_updated_at
before update on public.panel_seller_plan_prices
for each row execute function public.set_panel_seller_plan_price_updated_at();

create or replace function public.apply_device_subscription_transaction(
  p_seller_id uuid,
  p_device_id uuid,
  p_plan_id uuid,
  p_playlist_id uuid,
  p_expires_at timestamptz,
  p_operation_type text,
  p_performed_by text,
  p_idempotency_key text,
  p_customer_id uuid default null,
  p_client_name text default null,
  p_enforce_seller_ownership boolean default true
)
returns table (
  applied boolean,
  ledger_id uuid,
  balance_before integer,
  balance_after integer,
  device_status text,
  subscription_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller public.panel_sellers%rowtype;
  v_device public.panel_devices%rowtype;
  v_plan public.panel_plans%rowtype;
  v_playlist public.panel_playlists%rowtype;
  v_existing_ledger public.panel_credit_ledger%rowtype;
  v_lot public.panel_credit_lots%rowtype;
  v_ledger_id uuid;
  v_cost integer;
  v_balance_before integer;
  v_balance_after integer;
  v_remaining_cost integer;
  v_lot_take integer;
  v_description text;
  v_idempotency_key text;
  v_operation_fingerprint text;
begin
  if p_seller_id is null or p_device_id is null then
    raise exception using errcode = '22023', message = 'Vendedor e aparelho são obrigatórios.';
  end if;

  if p_plan_id is null or p_playlist_id is null then
    raise exception using errcode = '22023', message = 'Plano e lista são obrigatórios.';
  end if;

  if p_expires_at is null or p_expires_at <= now() then
    raise exception using errcode = '22023', message = 'A data de expiração deve estar no futuro.';
  end if;

  if p_operation_type not in ('activation', 'renewal') then
    raise exception using errcode = '22023', message = 'Operação deve ser activation ou renewal.';
  end if;

  if nullif(trim(coalesce(p_performed_by, '')), '') is null then
    raise exception using errcode = '22023', message = 'Identificação do responsável pela operação é obrigatória.';
  end if;

  v_idempotency_key := nullif(trim(coalesce(p_idempotency_key, '')), '');
  if v_idempotency_key is null then
    raise exception using errcode = '22023', message = 'Chave de idempotência é obrigatória.';
  end if;
  if length(v_idempotency_key) > 200 then
    raise exception using errcode = '22023', message = 'A chave de idempotência excede 200 caracteres.';
  end if;

  perform public.expire_credit_lots(p_seller_id);

  select * into v_seller
    from public.panel_sellers
   where id = p_seller_id
   for update;
  if not found then raise exception using errcode = 'P0002', message = 'Vendedor não encontrado.'; end if;
  if v_seller.status <> 'active' then raise exception using errcode = 'P0001', message = 'Vendedor bloqueado ou inativo.'; end if;

  select * into v_device
    from public.panel_devices
   where id = p_device_id
   for update;
  if not found then raise exception using errcode = 'P0002', message = 'Aparelho não encontrado.'; end if;

  if p_enforce_seller_ownership and v_device.seller_id is not null and v_device.seller_id <> p_seller_id then
    raise exception using errcode = 'P0001', message = 'Este aparelho pertence a outro vendedor.';
  end if;

  select * into v_plan
    from public.panel_plans
   where id = p_plan_id
   for share;
  if not found or v_plan.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'Plano inexistente ou inativo.';
  end if;

  select * into v_playlist
    from public.panel_playlists
   where id = p_playlist_id
   for share;
  if not found or v_playlist.active is not true then
    raise exception using errcode = 'P0001', message = 'Lista inexistente ou inativa.';
  end if;

  if p_enforce_seller_ownership and not exists (
    select 1 from public.panel_seller_playlists permission
     where permission.seller_id = p_seller_id
       and permission.playlist_id = p_playlist_id
       and permission.active is true
  ) then
    raise exception using errcode = 'P0001', message = 'Lista não liberada para este vendedor.';
  end if;

  v_cost := greatest(1, coalesce(v_plan.credit_cost, 1));
  v_operation_fingerprint := concat_ws(
    '|',
    'device-subscription-v1',
    p_operation_type,
    p_device_id::text,
    p_plan_id::text,
    p_playlist_id::text,
    p_expires_at::text,
    coalesce(p_customer_id::text, ''),
    coalesce(nullif(trim(p_client_name), ''), ''),
    p_enforce_seller_ownership::text,
    v_cost::text
  );

  select * into v_existing_ledger
    from public.panel_credit_ledger
   where seller_id = p_seller_id
     and idempotency_key = v_idempotency_key
   limit 1;

  if found then
    if v_existing_ledger.operation_fingerprint is distinct from v_operation_fingerprint then
      raise exception using errcode = '23505', message = 'Chave de idempotência já utilizada em outra operação.';
    end if;
    return query select false, v_existing_ledger.id,
      coalesce(v_existing_ledger.balance_after, v_seller.credit_balance),
      coalesce(v_existing_ledger.balance_after, v_seller.credit_balance),
      v_device.status, v_device.subscription_expires_at;
    return;
  end if;

  if p_operation_type = 'activation' and v_device.status = 'active' then
    raise exception using errcode = 'P0001', message = 'Aparelho já está ativo. Use renovação.';
  end if;
  if p_operation_type = 'renewal' and v_device.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'Somente aparelhos ativos podem ser renovados.';
  end if;
  if p_operation_type = 'renewal'
     and p_expires_at <= greatest(now(), coalesce(v_device.subscription_expires_at, now())) then
    raise exception using errcode = '22023', message = 'A renovação deve ampliar a data atual de expiração.';
  end if;

  v_balance_before := coalesce(v_seller.credit_balance, 0);
  v_balance_after := v_balance_before - v_cost;
  if v_balance_after < 0 and coalesce(v_seller.can_go_negative, false) is false then
    raise exception using errcode = 'P0001', message = format(
      'Saldo insuficiente. Saldo atual: %s. Custo: %s.', v_balance_before, v_cost
    );
  end if;

  v_remaining_cost := v_cost;
  for v_lot in
    select * from public.panel_credit_lots
     where seller_id = p_seller_id
       and status = 'active'
       and credits_remaining > 0
       and expires_at > now()
     order by expires_at, created_at
     for update
  loop
    exit when v_remaining_cost <= 0;
    v_lot_take := least(v_remaining_cost, v_lot.credits_remaining);
    update public.panel_credit_lots
       set credits_remaining = credits_remaining - v_lot_take,
           status = case when credits_remaining - v_lot_take = 0 then 'consumed' else status end,
           updated_at = now()
     where id = v_lot.id;
    v_remaining_cost := v_remaining_cost - v_lot_take;
  end loop;

  v_description := format(
    '%s do aparelho %s — plano %s',
    case when p_operation_type = 'activation' then 'Ativação' else 'Renovação' end,
    coalesce(v_device.device_code, p_device_id::text),
    v_plan.name
  );

  update public.panel_sellers
     set credit_balance = v_balance_after,
         updated_at = now()
   where id = p_seller_id;

  update public.panel_devices
     set seller_id = p_seller_id,
         customer_id = coalesce(p_customer_id, customer_id),
         client_name = coalesce(nullif(trim(p_client_name), ''), client_name),
         plan_id = p_plan_id,
         playlist_id = p_playlist_id,
         status = 'active',
         subscription_expires_at = p_expires_at,
         updated_at = now()
   where id = p_device_id;

  insert into public.panel_credit_ledger (
    seller_id, amount, type, reference_id, description, balance_after,
    performed_by, idempotency_key, operation_fingerprint
  ) values (
    p_seller_id, -v_cost, p_operation_type, p_device_id, v_description,
    v_balance_after, p_performed_by, v_idempotency_key, v_operation_fingerprint
  ) returning id into v_ledger_id;

  return query select true, v_ledger_id, v_balance_before, v_balance_after, 'active'::text, p_expires_at;
end;
$$;

revoke all on function public.apply_device_subscription_transaction(
  uuid, uuid, uuid, uuid, timestamptz, text, text, text, uuid, text, boolean
) from public, anon, authenticated;
grant execute on function public.apply_device_subscription_transaction(
  uuid, uuid, uuid, uuid, timestamptz, text, text, text, uuid, text, boolean
) to service_role;

comment on table public.panel_seller_plan_prices is
  'Preço particular padrão escolhido por cada vendedor para cada plano. Não pertence ao financeiro administrativo.';
comment on function public.apply_device_subscription_transaction(
  uuid, uuid, uuid, uuid, timestamptz, text, text, text, uuid, text, boolean
) is
  'Mantém a ativação existente e passa a consumir primeiro os lotes de crédito com vencimento mais próximo, preservando o saldo legado.';
