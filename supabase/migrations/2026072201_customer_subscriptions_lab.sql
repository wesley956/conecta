-- Assinaturas centrais por cliente, listas exclusivas e laboratório temporário.
-- Mantém as colunas antigas de panel_devices/panel_device_playlists como camada de
-- compatibilidade durante a migração, sem desligar aparelhos existentes.

-- Proprietário é um papel separado de administrador. Na instalação atual existe
-- uma única conta administrativa; ela é promovida de forma determinística.
alter table public.panel_user_roles
  drop constraint if exists panel_user_roles_role_check;
alter table public.panel_user_roles
  drop constraint if exists panel_user_roles_seller_shape;

alter table public.panel_user_roles
  add constraint panel_user_roles_role_check
  check (role in ('owner', 'admin', 'seller'));

alter table public.panel_user_roles
  add constraint panel_user_roles_seller_shape check (
    (role in ('owner', 'admin') and seller_id is null) or
    (role = 'seller' and seller_id is not null)
  );

with first_admin as (
  select user_id
  from public.panel_user_roles
  where role = 'admin' and active is true
  order by created_at asc, user_id asc
  limit 1
)
update public.panel_user_roles role_record
set role = 'owner', updated_at = now()
where role_record.user_id = (select user_id from first_admin)
  and not exists (
    select 1 from public.panel_user_roles where role = 'owner' and active is true
  );

-- Identidade de cliente passa a ser isolada por vendedor + WhatsApp normalizado.
alter table public.panel_customers
  add column if not exists whatsapp_normalized text;

update public.panel_customers
set whatsapp_normalized = regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g')
where whatsapp_normalized is null
   or whatsapp_normalized is distinct from regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g');

alter table public.panel_customers
  alter column whatsapp_normalized set not null;

alter table public.panel_customers
  add constraint panel_customers_whatsapp_normalized_check
  check (length(whatsapp_normalized) between 8 and 20) not valid;

alter table public.panel_customers
  validate constraint panel_customers_whatsapp_normalized_check;

create or replace function public.normalize_panel_customer_whatsapp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.whatsapp_normalized := regexp_replace(coalesce(new.whatsapp, ''), '\D', '', 'g');
  if length(new.whatsapp_normalized) not between 8 and 20 then
    raise exception using errcode = '22023', message = 'WhatsApp do cliente é inválido.';
  end if;
  return new;
end;
$$;

revoke all on function public.normalize_panel_customer_whatsapp() from public, anon, authenticated;
grant execute on function public.normalize_panel_customer_whatsapp() to service_role;

drop trigger if exists panel_customers_normalize_whatsapp on public.panel_customers;
create trigger panel_customers_normalize_whatsapp
before insert or update of whatsapp on public.panel_customers
for each row execute function public.normalize_panel_customer_whatsapp();

create unique index if not exists panel_customers_seller_whatsapp_uidx
  on public.panel_customers (
    coalesce(seller_id, '00000000-0000-0000-0000-000000000000'::uuid),
    whatsapp_normalized
  );

-- Catálogo de planos: aparelhos registrados e conexões simultâneas são limites distintos.
alter table public.panel_plans
  add column if not exists billing_cycle text,
  add column if not exists simultaneous_connections integer not null default 1;

update public.panel_plans
set billing_cycle = case
  when duration_days between 27 and 32 then 'monthly'
  when duration_days between 85 and 95 then 'quarterly'
  when duration_days between 175 and 190 then 'semiannual'
  when duration_days between 360 and 370 then 'annual'
  else 'custom'
end
where billing_cycle is null;

alter table public.panel_plans
  alter column billing_cycle set not null;

alter table public.panel_plans
  drop constraint if exists panel_plans_max_devices_check;
alter table public.panel_plans
  add constraint panel_plans_max_devices_check check (max_devices between 1 and 5);
alter table public.panel_plans
  add constraint panel_plans_simultaneous_connections_check
  check (simultaneous_connections between 1 and 5 and simultaneous_connections <= max_devices);
alter table public.panel_plans
  add constraint panel_plans_billing_cycle_check
  check (billing_cycle in ('monthly', 'quarterly', 'semiannual', 'annual', 'custom'));

-- Capacidade informada pelo provedor e fingerprint opaco da origem.
alter table public.panel_playlists
  add column if not exists max_connections integer not null default 1,
  add column if not exists source_fingerprint text,
  add column if not exists archived_at timestamptz;

alter table public.panel_playlists
  add constraint panel_playlists_max_connections_check
  check (max_connections between 1 and 50);

create unique index if not exists panel_playlists_source_fingerprint_uidx
  on public.panel_playlists(source_fingerprint)
  where source_fingerprint is not null and active is true;

create table if not exists public.panel_subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.panel_customers(id) on delete restrict,
  seller_id uuid not null references public.panel_sellers(id) on delete restrict,
  plan_id uuid not null references public.panel_plans(id) on delete restrict,
  scheduled_plan_id uuid references public.panel_plans(id) on delete set null,
  status text not null default 'active'
    check (status in ('pending', 'active', 'suspended', 'expired', 'cancelled', 'needs_review')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  plan_name_snapshot text not null,
  duration_days_snapshot integer not null check (duration_days_snapshot > 0),
  max_devices_snapshot integer not null check (max_devices_snapshot between 1 and 5),
  simultaneous_connections_snapshot integer not null
    check (simultaneous_connections_snapshot between 1 and 5),
  credit_cost_snapshot integer not null check (credit_cost_snapshot >= 0),
  activation_idempotency_key text,
  legacy_device_id uuid references public.panel_devices(id) on delete set null,
  created_by_user_id uuid,
  created_by_role text not null default 'system'
    check (created_by_role in ('owner', 'admin', 'seller', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint panel_subscriptions_dates_check check (expires_at > starts_at),
  constraint panel_subscriptions_connections_shape check (
    simultaneous_connections_snapshot <= max_devices_snapshot
  )
);

create unique index if not exists panel_subscriptions_activation_idempotency_uidx
  on public.panel_subscriptions(seller_id, activation_idempotency_key)
  where activation_idempotency_key is not null;
create index if not exists panel_subscriptions_customer_idx
  on public.panel_subscriptions(customer_id, status, expires_at desc);
create index if not exists panel_subscriptions_seller_idx
  on public.panel_subscriptions(seller_id, status, expires_at desc);
create index if not exists panel_subscriptions_expiry_idx
  on public.panel_subscriptions(status, expires_at);

create table if not exists public.panel_subscription_devices (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.panel_subscriptions(id) on delete cascade,
  device_id uuid not null references public.panel_devices(id) on delete restrict,
  status text not null default 'active'
    check (status in ('active', 'revoked', 'replaced')),
  assigned_at timestamptz not null default now(),
  revoked_at timestamptz,
  replaced_by_device_id uuid references public.panel_devices(id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint panel_subscription_devices_revoked_shape check (
    (status = 'active' and revoked_at is null) or
    (status <> 'active' and revoked_at is not null)
  )
);

create unique index if not exists panel_subscription_devices_active_device_uidx
  on public.panel_subscription_devices(device_id)
  where status = 'active';
create unique index if not exists panel_subscription_devices_active_pair_uidx
  on public.panel_subscription_devices(subscription_id, device_id)
  where status = 'active';
create index if not exists panel_subscription_devices_subscription_idx
  on public.panel_subscription_devices(subscription_id, status, assigned_at);

create table if not exists public.panel_subscription_playlists (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.panel_subscriptions(id) on delete cascade,
  playlist_id uuid not null references public.panel_playlists(id) on delete restrict,
  priority smallint not null check (priority in (1, 2)),
  active boolean not null default true,
  assigned_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint panel_subscription_playlists_active_shape check (
    (active is true and archived_at is null) or active is false
  )
);

create unique index if not exists panel_subscription_playlists_priority_uidx
  on public.panel_subscription_playlists(subscription_id, priority)
  where active is true;
create unique index if not exists panel_subscription_playlists_exclusive_uidx
  on public.panel_subscription_playlists(playlist_id)
  where active is true;
create index if not exists panel_subscription_playlists_subscription_idx
  on public.panel_subscription_playlists(subscription_id, active, priority);

create table if not exists public.panel_subscription_conflicts (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references public.panel_subscriptions(id) on delete cascade,
  device_id uuid references public.panel_devices(id) on delete cascade,
  playlist_id uuid references public.panel_playlists(id) on delete set null,
  conflict_type text not null
    check (conflict_type in ('shared_playlist', 'missing_customer', 'missing_plan', 'tenant_mismatch')),
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'resolved', 'ignored')),
  resolved_at timestamptz,
  resolved_by_user_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists panel_subscription_conflicts_open_idx
  on public.panel_subscription_conflicts(status, conflict_type, created_at desc);

alter table public.panel_devices
  add column if not exists subscription_id uuid references public.panel_subscriptions(id) on delete set null,
  add column if not exists is_lab_device boolean not null default false;

create index if not exists panel_devices_subscription_idx
  on public.panel_devices(subscription_id);
create index if not exists panel_devices_lab_idx
  on public.panel_devices(is_lab_device)
  where is_lab_device is true;

alter table public.panel_financial_records
  add column if not exists subscription_id uuid references public.panel_subscriptions(id) on delete set null;
create index if not exists panel_financial_records_subscription_idx
  on public.panel_financial_records(subscription_id, reference_date desc);

create table if not exists public.panel_subscription_operations (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.panel_sellers(id) on delete restrict,
  subscription_id uuid references public.panel_subscriptions(id) on delete cascade,
  operation_type text not null
    check (operation_type in ('add_device', 'replace_device', 'upgrade', 'schedule_downgrade', 'renewal')),
  idempotency_key text not null,
  operation_fingerprint text not null,
  result jsonb not null default '{}'::jsonb,
  performed_by text not null,
  created_at timestamptz not null default now(),
  unique (seller_id, idempotency_key)
);

create table if not exists public.panel_lab_sessions (
  id uuid primary key default gen_random_uuid(),
  source_subscription_id uuid not null references public.panel_subscriptions(id) on delete cascade,
  source_device_id uuid references public.panel_devices(id) on delete set null,
  lab_device_id uuid not null references public.panel_devices(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  duration_minutes integer not null check (duration_minutes between 1 and 43200),
  reason text not null check (length(trim(reason)) between 3 and 500),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint panel_lab_sessions_dates_check check (expires_at > starts_at),
  constraint panel_lab_sessions_status_shape check (
    (status = 'active' and revoked_at is null) or status <> 'active'
  )
);

create unique index if not exists panel_lab_sessions_active_device_uidx
  on public.panel_lab_sessions(lab_device_id)
  where status = 'active';
create index if not exists panel_lab_sessions_expiry_idx
  on public.panel_lab_sessions(status, expires_at);
create index if not exists panel_lab_sessions_source_idx
  on public.panel_lab_sessions(source_subscription_id, created_at desc);

-- Timestamps padronizados.
create or replace function public.touch_subscription_domain_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.touch_subscription_domain_updated_at() from public, anon, authenticated;
grant execute on function public.touch_subscription_domain_updated_at() to service_role;

drop trigger if exists panel_subscriptions_touch_updated_at on public.panel_subscriptions;
create trigger panel_subscriptions_touch_updated_at
before update on public.panel_subscriptions
for each row execute function public.touch_subscription_domain_updated_at();

drop trigger if exists panel_subscription_devices_touch_updated_at on public.panel_subscription_devices;
create trigger panel_subscription_devices_touch_updated_at
before update on public.panel_subscription_devices
for each row execute function public.touch_subscription_domain_updated_at();

drop trigger if exists panel_subscription_playlists_touch_updated_at on public.panel_subscription_playlists;
create trigger panel_subscription_playlists_touch_updated_at
before update on public.panel_subscription_playlists
for each row execute function public.touch_subscription_domain_updated_at();

drop trigger if exists panel_lab_sessions_touch_updated_at on public.panel_lab_sessions;
create trigger panel_lab_sessions_touch_updated_at
before update on public.panel_lab_sessions
for each row execute function public.touch_subscription_domain_updated_at();

-- Migração conservadora: um registro de assinatura por aparelho antigo. Aparelhos
-- que compartilham lista permanecem funcionando na camada antiga e são enviados
-- para revisão, em vez de terem a lista removida silenciosamente.
insert into public.panel_subscriptions (
  customer_id,
  seller_id,
  plan_id,
  status,
  starts_at,
  expires_at,
  plan_name_snapshot,
  duration_days_snapshot,
  max_devices_snapshot,
  simultaneous_connections_snapshot,
  credit_cost_snapshot,
  legacy_device_id,
  created_by_role,
  metadata
)
select
  device.customer_id,
  device.seller_id,
  device.plan_id,
  case
    when exists (
      select 1
      from public.panel_device_playlists assignment
      join public.panel_device_playlists other_assignment
        on other_assignment.playlist_id = assignment.playlist_id
       and other_assignment.device_id <> assignment.device_id
       and other_assignment.active is true
      where assignment.device_id = device.id
        and assignment.active is true
    ) then 'needs_review'
    when device.subscription_expires_at <= now() then 'expired'
    when device.status = 'active' then 'active'
    else 'needs_review'
  end,
  device.created_at,
  greatest(
    coalesce(device.subscription_expires_at, device.created_at + make_interval(days => plan.duration_days)),
    device.created_at + interval '1 minute'
  ),
  plan.name,
  plan.duration_days,
  least(5, greatest(1, plan.max_devices)),
  least(least(5, greatest(1, plan.max_devices)), greatest(1, coalesce(plan.simultaneous_connections, 1))),
  greatest(0, plan.credit_cost),
  device.id,
  'system',
  jsonb_build_object('migration', 'legacy-device-v1')
from public.panel_devices device
join public.panel_plans plan on plan.id = device.plan_id
where device.customer_id is not null
  and device.seller_id is not null
  and device.plan_id is not null
  and not exists (
    select 1 from public.panel_subscriptions existing where existing.legacy_device_id = device.id
  );

insert into public.panel_subscription_devices (
  subscription_id,
  device_id,
  status,
  assigned_at
)
select subscription.id, subscription.legacy_device_id, 'active', subscription.starts_at
from public.panel_subscriptions subscription
where subscription.legacy_device_id is not null
on conflict do nothing;

update public.panel_devices device
set subscription_id = subscription.id,
    updated_at = now()
from public.panel_subscriptions subscription
where subscription.legacy_device_id = device.id
  and device.subscription_id is distinct from subscription.id;

insert into public.panel_subscription_playlists (
  subscription_id,
  playlist_id,
  priority,
  active,
  assigned_at
)
select
  subscription.id,
  assignment.playlist_id,
  assignment.priority,
  true,
  assignment.created_at
from public.panel_subscriptions subscription
join public.panel_device_playlists assignment
  on assignment.device_id = subscription.legacy_device_id
 and assignment.active is true
where not exists (
  select 1
  from public.panel_device_playlists other_assignment
  where other_assignment.playlist_id = assignment.playlist_id
    and other_assignment.device_id <> assignment.device_id
    and other_assignment.active is true
)
on conflict do nothing;

insert into public.panel_subscription_conflicts (
  subscription_id,
  device_id,
  playlist_id,
  conflict_type,
  details
)
select distinct
  subscription.id,
  assignment.device_id,
  assignment.playlist_id,
  'shared_playlist',
  jsonb_build_object(
    'message', 'Lista antiga vinculada a mais de um aparelho. O funcionamento legado foi preservado para revisão manual.',
    'migration', 'legacy-device-v1'
  )
from public.panel_subscriptions subscription
join public.panel_device_playlists assignment
  on assignment.device_id = subscription.legacy_device_id
 and assignment.active is true
where exists (
  select 1
  from public.panel_device_playlists other_assignment
  where other_assignment.playlist_id = assignment.playlist_id
    and other_assignment.device_id <> assignment.device_id
    and other_assignment.active is true
)
and not exists (
  select 1 from public.panel_subscription_conflicts existing
  where existing.subscription_id = subscription.id
    and existing.playlist_id = assignment.playlist_id
    and existing.conflict_type = 'shared_playlist'
);

-- Criação atômica da assinatura. Reutiliza a transação financeira já existente.
create or replace function public.create_customer_subscription_transaction(
  p_seller_id uuid,
  p_customer_id uuid,
  p_plan_id uuid,
  p_device_id uuid,
  p_primary_playlist_id uuid,
  p_backup_playlist_id uuid,
  p_performed_by text,
  p_idempotency_key text,
  p_expires_at timestamptz default null,
  p_finance_amount_cents bigint default null,
  p_finance_status text default null,
  p_payment_method text default null,
  p_due_date date default null,
  p_paid_at timestamptz default null,
  p_finance_notes text default null,
  p_finance_description text default null,
  p_created_by_user_id uuid default null,
  p_created_by_role text default 'system'
)
returns table (
  applied boolean,
  subscription_id uuid,
  ledger_id uuid,
  finance_record_id uuid,
  balance_before integer,
  balance_after integer,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller public.panel_sellers%rowtype;
  v_customer public.panel_customers%rowtype;
  v_plan public.panel_plans%rowtype;
  v_device public.panel_devices%rowtype;
  v_primary public.panel_playlists%rowtype;
  v_backup public.panel_playlists%rowtype;
  v_existing public.panel_subscriptions%rowtype;
  v_legacy record;
  v_subscription_id uuid;
  v_expires_at timestamptz;
  v_role text := lower(trim(coalesce(p_created_by_role, 'system')));
begin
  if nullif(trim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'Chave de idempotência é obrigatória.';
  end if;

  select * into v_existing
  from public.panel_subscriptions
  where seller_id = p_seller_id and activation_idempotency_key = p_idempotency_key
  limit 1;

  if found then
    return query select false, v_existing.id, null::uuid, null::uuid,
      coalesce((select credit_balance from public.panel_sellers where id = p_seller_id), 0),
      coalesce((select credit_balance from public.panel_sellers where id = p_seller_id), 0),
      v_existing.expires_at;
    return;
  end if;

  select * into v_seller from public.panel_sellers where id = p_seller_id for update;
  if not found or v_seller.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'Vendedor inexistente, bloqueado ou inativo.';
  end if;

  select * into v_customer from public.panel_customers where id = p_customer_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Cliente não encontrado.'; end if;
  if v_customer.seller_id is distinct from p_seller_id then
    raise exception using errcode = 'P0001', message = 'Cliente não pertence a este vendedor.';
  end if;

  select * into v_plan from public.panel_plans where id = p_plan_id for share;
  if not found or v_plan.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'Plano inexistente ou inativo.';
  end if;
  if v_plan.max_devices not between 1 and 5 then
    raise exception using errcode = '22023', message = 'Plano precisa permitir de um a cinco aparelhos.';
  end if;

  select * into v_device from public.panel_devices where id = p_device_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Aparelho não encontrado.'; end if;
  if v_device.subscription_id is not null or exists (
    select 1 from public.panel_subscription_devices where device_id = p_device_id and status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'Aparelho já pertence a uma assinatura.';
  end if;
  if v_device.seller_id is not null and v_device.seller_id <> p_seller_id then
    raise exception using errcode = 'P0001', message = 'Aparelho pertence a outro vendedor.';
  end if;

  select * into v_primary from public.panel_playlists where id = p_primary_playlist_id for share;
  if not found or v_primary.active is not true then
    raise exception using errcode = 'P0001', message = 'Lista principal inexistente ou inativa.';
  end if;
  if v_primary.max_connections < v_plan.simultaneous_connections then
    raise exception using errcode = 'P0001', message = 'A lista principal não suporta as conexões simultâneas do plano.';
  end if;
  if exists (
    select 1 from public.panel_subscription_playlists
    where playlist_id = p_primary_playlist_id and active is true
  ) then
    raise exception using errcode = '23505', message = 'Esta lista já pertence a outra assinatura.';
  end if;
  if exists (
    select 1 from public.panel_device_playlists
    where playlist_id = p_primary_playlist_id and active is true and device_id <> p_device_id
  ) then
    raise exception using errcode = '23505', message = 'Esta lista ainda possui vínculos antigos em outros aparelhos e precisa ser revisada.';
  end if;

  if not exists (
    select 1 from public.panel_seller_playlists
    where seller_id = p_seller_id and playlist_id = p_primary_playlist_id and active is true
  ) then
    raise exception using errcode = 'P0001', message = 'Lista principal não liberada para este vendedor.';
  end if;

  if p_backup_playlist_id is not null then
    if p_backup_playlist_id = p_primary_playlist_id then
      raise exception using errcode = '22023', message = 'Lista reserva deve ser diferente da principal.';
    end if;
    select * into v_backup from public.panel_playlists where id = p_backup_playlist_id for share;
    if not found or v_backup.active is not true then
      raise exception using errcode = 'P0001', message = 'Lista reserva inexistente ou inativa.';
    end if;
    if v_backup.max_connections < v_plan.simultaneous_connections then
      raise exception using errcode = 'P0001', message = 'A lista reserva não suporta as conexões simultâneas do plano.';
    end if;
    if exists (
      select 1 from public.panel_subscription_playlists
      where playlist_id = p_backup_playlist_id and active is true
    ) or exists (
      select 1 from public.panel_device_playlists
      where playlist_id = p_backup_playlist_id and active is true and device_id <> p_device_id
    ) then
      raise exception using errcode = '23505', message = 'A lista reserva já está vinculada a outra assinatura ou aparelho antigo.';
    end if;
    if not exists (
      select 1 from public.panel_seller_playlists
      where seller_id = p_seller_id and playlist_id = p_backup_playlist_id and active is true
    ) then
      raise exception using errcode = 'P0001', message = 'Lista reserva não liberada para este vendedor.';
    end if;
  end if;

  if v_role not in ('owner', 'admin', 'seller', 'system') then
    raise exception using errcode = '22023', message = 'Papel responsável inválido.';
  end if;

  v_expires_at := coalesce(p_expires_at, now() + make_interval(days => v_plan.duration_days));
  if v_expires_at <= now() then
    raise exception using errcode = '22023', message = 'A validade precisa estar no futuro.';
  end if;

  select * into v_legacy
  from public.apply_device_subscription_with_finance(
    p_seller_id,
    p_device_id,
    p_plan_id,
    p_primary_playlist_id,
    p_backup_playlist_id,
    v_expires_at,
    'activation',
    p_performed_by,
    p_idempotency_key,
    p_customer_id,
    v_customer.name,
    true,
    p_finance_amount_cents,
    p_finance_status,
    p_payment_method,
    p_due_date,
    p_paid_at,
    p_finance_notes,
    p_finance_description,
    p_created_by_user_id,
    v_role
  );

  insert into public.panel_subscriptions (
    customer_id,
    seller_id,
    plan_id,
    status,
    starts_at,
    expires_at,
    plan_name_snapshot,
    duration_days_snapshot,
    max_devices_snapshot,
    simultaneous_connections_snapshot,
    credit_cost_snapshot,
    activation_idempotency_key,
    created_by_user_id,
    created_by_role
  ) values (
    p_customer_id,
    p_seller_id,
    p_plan_id,
    'active',
    now(),
    v_expires_at,
    v_plan.name,
    v_plan.duration_days,
    v_plan.max_devices,
    v_plan.simultaneous_connections,
    v_plan.credit_cost,
    p_idempotency_key,
    p_created_by_user_id,
    v_role
  ) returning id into v_subscription_id;

  insert into public.panel_subscription_devices (subscription_id, device_id, status)
  values (v_subscription_id, p_device_id, 'active');

  insert into public.panel_subscription_playlists (subscription_id, playlist_id, priority, active)
  values (v_subscription_id, p_primary_playlist_id, 1, true);

  if p_backup_playlist_id is not null then
    insert into public.panel_subscription_playlists (subscription_id, playlist_id, priority, active)
    values (v_subscription_id, p_backup_playlist_id, 2, true);
  end if;

  update public.panel_devices
  set subscription_id = v_subscription_id, updated_at = now()
  where id = p_device_id;

  if v_legacy.finance_record_id is not null then
    update public.panel_financial_records
    set subscription_id = v_subscription_id
    where id = v_legacy.finance_record_id;
  end if;

  return query select true, v_subscription_id, v_legacy.ledger_id,
    v_legacy.finance_record_id, v_legacy.balance_before, v_legacy.balance_after, v_expires_at;
end;
$$;

-- Adiciona aparelho dentro do limite comprado, sem nova cobrança.
create or replace function public.add_subscription_device_transaction(
  p_subscription_id uuid,
  p_device_id uuid,
  p_performed_by text,
  p_idempotency_key text
)
returns table (applied boolean, active_devices integer, max_devices integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription public.panel_subscriptions%rowtype;
  v_device public.panel_devices%rowtype;
  v_count integer;
  v_fingerprint text;
  v_existing public.panel_subscription_operations%rowtype;
begin
  select * into v_subscription from public.panel_subscriptions where id = p_subscription_id for update;
  if not found or v_subscription.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'Assinatura inexistente ou inativa.';
  end if;

  v_fingerprint := concat_ws('|', 'add-device-v1', p_subscription_id, p_device_id);
  select * into v_existing from public.panel_subscription_operations
  where seller_id = v_subscription.seller_id and idempotency_key = p_idempotency_key limit 1;
  if found then
    if v_existing.operation_fingerprint <> v_fingerprint then
      raise exception using errcode = '23505', message = 'Chave de idempotência usada em outra operação.';
    end if;
    select count(*) into v_count from public.panel_subscription_devices
    where subscription_id = p_subscription_id and status = 'active';
    return query select false, v_count, v_subscription.max_devices_snapshot;
    return;
  end if;

  select count(*) into v_count from public.panel_subscription_devices
  where subscription_id = p_subscription_id and status = 'active';
  if v_count >= v_subscription.max_devices_snapshot then
    raise exception using errcode = 'P0001', message = 'O plano atingiu o limite de aparelhos.';
  end if;

  select * into v_device from public.panel_devices where id = p_device_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Aparelho não encontrado.'; end if;
  if v_device.subscription_id is not null or exists (
    select 1 from public.panel_subscription_devices where device_id = p_device_id and status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'Aparelho já pertence a uma assinatura.';
  end if;
  if v_device.seller_id is not null and v_device.seller_id <> v_subscription.seller_id then
    raise exception using errcode = 'P0001', message = 'Aparelho pertence a outro vendedor.';
  end if;

  insert into public.panel_subscription_devices (subscription_id, device_id, status)
  values (p_subscription_id, p_device_id, 'active');

  update public.panel_devices
  set subscription_id = p_subscription_id,
      seller_id = v_subscription.seller_id,
      customer_id = v_subscription.customer_id,
      plan_id = v_subscription.plan_id,
      status = 'active',
      subscription_expires_at = v_subscription.expires_at,
      playlist_id = (
        select playlist_id from public.panel_subscription_playlists
        where subscription_id = p_subscription_id and active is true and priority = 1
      ),
      updated_at = now()
  where id = p_device_id;

  delete from public.panel_device_playlists where device_id = p_device_id;
  insert into public.panel_device_playlists (device_id, playlist_id, priority, active)
  select p_device_id, playlist_id, priority, true
  from public.panel_subscription_playlists
  where subscription_id = p_subscription_id and active is true;

  insert into public.panel_subscription_operations (
    seller_id, subscription_id, operation_type, idempotency_key,
    operation_fingerprint, result, performed_by
  ) values (
    v_subscription.seller_id, p_subscription_id, 'add_device', p_idempotency_key,
    v_fingerprint, jsonb_build_object('device_id', p_device_id), p_performed_by
  );

  return query select true, v_count + 1, v_subscription.max_devices_snapshot;
end;
$$;

-- Troca um aparelho sem custo, revogando o anterior.
create or replace function public.replace_subscription_device_transaction(
  p_subscription_id uuid,
  p_old_device_id uuid,
  p_new_device_id uuid,
  p_reason text,
  p_performed_by text,
  p_idempotency_key text
)
returns table (applied boolean, old_device_id uuid, new_device_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription public.panel_subscriptions%rowtype;
  v_new_device public.panel_devices%rowtype;
  v_fingerprint text;
  v_existing public.panel_subscription_operations%rowtype;
begin
  if p_old_device_id = p_new_device_id then
    raise exception using errcode = '22023', message = 'O aparelho novo precisa ser diferente do antigo.';
  end if;

  select * into v_subscription from public.panel_subscriptions where id = p_subscription_id for update;
  if not found or v_subscription.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'Assinatura inexistente ou inativa.';
  end if;

  v_fingerprint := concat_ws('|', 'replace-device-v1', p_subscription_id, p_old_device_id, p_new_device_id);
  select * into v_existing from public.panel_subscription_operations
  where seller_id = v_subscription.seller_id and idempotency_key = p_idempotency_key limit 1;
  if found then
    if v_existing.operation_fingerprint <> v_fingerprint then
      raise exception using errcode = '23505', message = 'Chave de idempotência usada em outra operação.';
    end if;
    return query select false, p_old_device_id, p_new_device_id;
    return;
  end if;

  if not exists (
    select 1 from public.panel_subscription_devices
    where subscription_id = p_subscription_id and device_id = p_old_device_id and status = 'active'
    for update
  ) then
    raise exception using errcode = 'P0001', message = 'Aparelho antigo não está ativo nesta assinatura.';
  end if;

  select * into v_new_device from public.panel_devices where id = p_new_device_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Novo aparelho não encontrado.'; end if;
  if v_new_device.subscription_id is not null or exists (
    select 1 from public.panel_subscription_devices where device_id = p_new_device_id and status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'Novo aparelho já pertence a uma assinatura.';
  end if;

  update public.panel_subscription_devices
  set status = 'replaced', revoked_at = now(), replaced_by_device_id = p_new_device_id,
      reason = nullif(trim(coalesce(p_reason, '')), ''), updated_at = now()
  where subscription_id = p_subscription_id and device_id = p_old_device_id and status = 'active';

  insert into public.panel_subscription_devices (subscription_id, device_id, status)
  values (p_subscription_id, p_new_device_id, 'active');

  update public.panel_devices
  set subscription_id = null, status = 'inactive', updated_at = now()
  where id = p_old_device_id;
  delete from public.panel_device_playlists where device_id = p_old_device_id;

  update public.panel_devices
  set subscription_id = p_subscription_id,
      seller_id = v_subscription.seller_id,
      customer_id = v_subscription.customer_id,
      plan_id = v_subscription.plan_id,
      status = 'active',
      subscription_expires_at = v_subscription.expires_at,
      playlist_id = (
        select playlist_id from public.panel_subscription_playlists
        where subscription_id = p_subscription_id and active is true and priority = 1
      ),
      updated_at = now()
  where id = p_new_device_id;

  delete from public.panel_device_playlists where device_id = p_new_device_id;
  insert into public.panel_device_playlists (device_id, playlist_id, priority, active)
  select p_new_device_id, playlist_id, priority, true
  from public.panel_subscription_playlists
  where subscription_id = p_subscription_id and active is true;

  insert into public.panel_subscription_operations (
    seller_id, subscription_id, operation_type, idempotency_key,
    operation_fingerprint, result, performed_by
  ) values (
    v_subscription.seller_id, p_subscription_id, 'replace_device', p_idempotency_key,
    v_fingerprint,
    jsonb_build_object('old_device_id', p_old_device_id, 'new_device_id', p_new_device_id),
    p_performed_by
  );

  return query select true, p_old_device_id, p_new_device_id;
end;
$$;

-- Upgrade imediato ou downgrade agendado.
create or replace function public.change_subscription_plan_transaction(
  p_subscription_id uuid,
  p_new_plan_id uuid,
  p_mode text,
  p_performed_by text,
  p_idempotency_key text
)
returns table (applied boolean, charged_credits integer, balance_after integer, scheduled boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription public.panel_subscriptions%rowtype;
  v_plan public.panel_plans%rowtype;
  v_seller public.panel_sellers%rowtype;
  v_active_devices integer;
  v_charge integer;
  v_balance integer;
  v_mode text := lower(trim(coalesce(p_mode, '')));
  v_fingerprint text;
  v_existing public.panel_subscription_operations%rowtype;
begin
  select * into v_subscription from public.panel_subscriptions where id = p_subscription_id for update;
  if not found or v_subscription.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'Assinatura inexistente ou inativa.';
  end if;
  select * into v_plan from public.panel_plans where id = p_new_plan_id for share;
  if not found or v_plan.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'Novo plano inexistente ou inativo.';
  end if;
  select count(*) into v_active_devices from public.panel_subscription_devices
  where subscription_id = p_subscription_id and status = 'active';
  if v_plan.max_devices < v_active_devices then
    raise exception using errcode = 'P0001', message = 'O novo plano não comporta os aparelhos ativos.';
  end if;

  if exists (
    select 1 from public.panel_subscription_playlists assignment
    join public.panel_playlists playlist on playlist.id = assignment.playlist_id
    where assignment.subscription_id = p_subscription_id
      and assignment.active is true
      and playlist.max_connections < v_plan.simultaneous_connections
  ) then
    raise exception using errcode = 'P0001', message = 'Uma das listas não suporta as conexões simultâneas do novo plano.';
  end if;

  if v_mode not in ('upgrade', 'schedule_downgrade') then
    raise exception using errcode = '22023', message = 'Modo de alteração de plano inválido.';
  end if;

  v_fingerprint := concat_ws('|', 'change-plan-v1', p_subscription_id, p_new_plan_id, v_mode);
  select * into v_existing from public.panel_subscription_operations
  where seller_id = v_subscription.seller_id and idempotency_key = p_idempotency_key limit 1;
  if found then
    if v_existing.operation_fingerprint <> v_fingerprint then
      raise exception using errcode = '23505', message = 'Chave de idempotência usada em outra operação.';
    end if;
    return query select false,
      coalesce((v_existing.result->>'charged_credits')::integer, 0),
      coalesce((v_existing.result->>'balance_after')::integer, 0),
      coalesce((v_existing.result->>'scheduled')::boolean, false);
    return;
  end if;

  if v_mode = 'schedule_downgrade' then
    update public.panel_subscriptions set scheduled_plan_id = p_new_plan_id where id = p_subscription_id;
    insert into public.panel_subscription_operations (
      seller_id, subscription_id, operation_type, idempotency_key,
      operation_fingerprint, result, performed_by
    ) values (
      v_subscription.seller_id, p_subscription_id, 'schedule_downgrade', p_idempotency_key,
      v_fingerprint, jsonb_build_object('charged_credits', 0, 'balance_after', 0, 'scheduled', true), p_performed_by
    );
    return query select true, 0, 0, true;
    return;
  end if;

  if v_plan.max_devices < v_subscription.max_devices_snapshot
     and v_plan.simultaneous_connections <= v_subscription.simultaneous_connections_snapshot then
    raise exception using errcode = 'P0001', message = 'Redução de plano deve ser agendada para a próxima renovação.';
  end if;

  v_charge := greatest(0, v_plan.credit_cost - v_subscription.credit_cost_snapshot);
  select * into v_seller from public.panel_sellers where id = v_subscription.seller_id for update;
  v_balance := v_seller.credit_balance - v_charge;
  if v_balance < 0 and v_seller.can_go_negative is false then
    raise exception using errcode = 'P0001', message = 'Saldo insuficiente para o upgrade.';
  end if;

  update public.panel_sellers set credit_balance = v_balance, updated_at = now()
  where id = v_seller.id;

  if v_charge > 0 then
    insert into public.panel_credit_ledger (
      seller_id, amount, type, reference_id, description, balance_after,
      performed_by, idempotency_key, operation_fingerprint
    ) values (
      v_seller.id, -v_charge, 'manual_remove', p_subscription_id,
      format('Upgrade da assinatura para o plano %s', v_plan.name), v_balance,
      p_performed_by, 'subscription-upgrade:' || p_idempotency_key, v_fingerprint
    );
  end if;

  update public.panel_subscriptions
  set plan_id = v_plan.id,
      scheduled_plan_id = null,
      plan_name_snapshot = v_plan.name,
      duration_days_snapshot = v_plan.duration_days,
      max_devices_snapshot = v_plan.max_devices,
      simultaneous_connections_snapshot = v_plan.simultaneous_connections,
      credit_cost_snapshot = v_plan.credit_cost
  where id = p_subscription_id;

  update public.panel_devices
  set plan_id = v_plan.id, updated_at = now()
  where subscription_id = p_subscription_id;

  insert into public.panel_subscription_operations (
    seller_id, subscription_id, operation_type, idempotency_key,
    operation_fingerprint, result, performed_by
  ) values (
    v_subscription.seller_id, p_subscription_id, 'upgrade', p_idempotency_key,
    v_fingerprint,
    jsonb_build_object('charged_credits', v_charge, 'balance_after', v_balance, 'scheduled', false),
    p_performed_by
  );

  return query select true, v_charge, v_balance, false;
end;
$$;

-- Renovação central: cobra uma vez e estende todos os aparelhos da assinatura.
create or replace function public.renew_customer_subscription_transaction(
  p_subscription_id uuid,
  p_performed_by text,
  p_idempotency_key text,
  p_finance_amount_cents bigint default null,
  p_finance_status text default null,
  p_payment_method text default null,
  p_due_date date default null,
  p_paid_at timestamptz default null,
  p_finance_notes text default null,
  p_created_by_user_id uuid default null,
  p_created_by_role text default 'system'
)
returns table (
  applied boolean,
  subscription_id uuid,
  finance_record_id uuid,
  balance_after integer,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription public.panel_subscriptions%rowtype;
  v_plan public.panel_plans%rowtype;
  v_primary_device uuid;
  v_primary_playlist uuid;
  v_backup_playlist uuid;
  v_new_expiry timestamptz;
  v_active_devices integer;
  v_legacy record;
  v_fingerprint text;
  v_existing public.panel_subscription_operations%rowtype;
begin
  select * into v_subscription from public.panel_subscriptions where id = p_subscription_id for update;
  if not found or v_subscription.status in ('cancelled', 'needs_review') then
    raise exception using errcode = 'P0001', message = 'Assinatura não pode ser renovada neste estado.';
  end if;

  select * into v_plan from public.panel_plans
  where id = coalesce(v_subscription.scheduled_plan_id, v_subscription.plan_id)
  for share;
  if not found or v_plan.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'Plano da renovação inexistente ou inativo.';
  end if;

  select count(*) into v_active_devices from public.panel_subscription_devices
  where subscription_id = p_subscription_id and status = 'active';
  if v_active_devices = 0 then
    raise exception using errcode = 'P0001', message = 'Assinatura sem aparelho ativo.';
  end if;
  if v_active_devices > v_plan.max_devices then
    raise exception using errcode = 'P0001', message = 'Plano agendado não comporta os aparelhos ativos.';
  end if;

  select device_id into v_primary_device
  from public.panel_subscription_devices
  where subscription_id = p_subscription_id and status = 'active'
  order by assigned_at asc limit 1;
  select playlist_id into v_primary_playlist
  from public.panel_subscription_playlists
  where subscription_id = p_subscription_id and active is true and priority = 1;
  select playlist_id into v_backup_playlist
  from public.panel_subscription_playlists
  where subscription_id = p_subscription_id and active is true and priority = 2;
  if v_primary_playlist is null then
    raise exception using errcode = 'P0001', message = 'Assinatura sem lista principal exclusiva.';
  end if;

  v_fingerprint := concat_ws('|', 'renew-subscription-v1', p_subscription_id, v_plan.id);
  select * into v_existing from public.panel_subscription_operations
  where seller_id = v_subscription.seller_id and idempotency_key = p_idempotency_key limit 1;
  if found then
    if v_existing.operation_fingerprint <> v_fingerprint then
      raise exception using errcode = '23505', message = 'Chave de idempotência usada em outra operação.';
    end if;
    return query select false, p_subscription_id,
      nullif(v_existing.result->>'finance_record_id', '')::uuid,
      coalesce((v_existing.result->>'balance_after')::integer, 0),
      (v_existing.result->>'expires_at')::timestamptz;
    return;
  end if;

  v_new_expiry := greatest(now(), v_subscription.expires_at) + make_interval(days => v_plan.duration_days);

  select * into v_legacy
  from public.apply_device_subscription_with_finance(
    v_subscription.seller_id,
    v_primary_device,
    v_plan.id,
    v_primary_playlist,
    v_backup_playlist,
    v_new_expiry,
    'renewal',
    p_performed_by,
    'subscription-renewal:' || p_idempotency_key,
    v_subscription.customer_id,
    (select name from public.panel_customers where id = v_subscription.customer_id),
    true,
    p_finance_amount_cents,
    p_finance_status,
    p_payment_method,
    p_due_date,
    p_paid_at,
    p_finance_notes,
    format('Renovação da assinatura — %s', v_plan.name),
    p_created_by_user_id,
    p_created_by_role
  );

  update public.panel_subscriptions
  set plan_id = v_plan.id,
      scheduled_plan_id = null,
      status = 'active',
      expires_at = v_new_expiry,
      plan_name_snapshot = v_plan.name,
      duration_days_snapshot = v_plan.duration_days,
      max_devices_snapshot = v_plan.max_devices,
      simultaneous_connections_snapshot = v_plan.simultaneous_connections,
      credit_cost_snapshot = v_plan.credit_cost
  where id = p_subscription_id;

  update public.panel_devices
  set plan_id = v_plan.id,
      status = 'active',
      subscription_expires_at = v_new_expiry,
      updated_at = now()
  where subscription_id = p_subscription_id;

  if v_legacy.finance_record_id is not null then
    update public.panel_financial_records
    set subscription_id = p_subscription_id
    where id = v_legacy.finance_record_id;
  end if;

  insert into public.panel_subscription_operations (
    seller_id, subscription_id, operation_type, idempotency_key,
    operation_fingerprint, result, performed_by
  ) values (
    v_subscription.seller_id, p_subscription_id, 'renewal', p_idempotency_key,
    v_fingerprint,
    jsonb_build_object(
      'finance_record_id', v_legacy.finance_record_id,
      'balance_after', v_legacy.balance_after,
      'expires_at', v_new_expiry
    ),
    p_performed_by
  );

  return query select true, p_subscription_id, v_legacy.finance_record_id,
    v_legacy.balance_after, v_new_expiry;
end;
$$;

-- RLS fechado: toda operação passa pelas Edge Functions autenticadas.
alter table public.panel_subscriptions enable row level security;
alter table public.panel_subscriptions force row level security;
alter table public.panel_subscription_devices enable row level security;
alter table public.panel_subscription_devices force row level security;
alter table public.panel_subscription_playlists enable row level security;
alter table public.panel_subscription_playlists force row level security;
alter table public.panel_subscription_conflicts enable row level security;
alter table public.panel_subscription_conflicts force row level security;
alter table public.panel_subscription_operations enable row level security;
alter table public.panel_subscription_operations force row level security;
alter table public.panel_lab_sessions enable row level security;
alter table public.panel_lab_sessions force row level security;

revoke all on table public.panel_subscriptions from public, anon, authenticated;
revoke all on table public.panel_subscription_devices from public, anon, authenticated;
revoke all on table public.panel_subscription_playlists from public, anon, authenticated;
revoke all on table public.panel_subscription_conflicts from public, anon, authenticated;
revoke all on table public.panel_subscription_operations from public, anon, authenticated;
revoke all on table public.panel_lab_sessions from public, anon, authenticated;

grant all on table public.panel_subscriptions to service_role;
grant all on table public.panel_subscription_devices to service_role;
grant all on table public.panel_subscription_playlists to service_role;
grant all on table public.panel_subscription_conflicts to service_role;
grant all on table public.panel_subscription_operations to service_role;
grant all on table public.panel_lab_sessions to service_role;

revoke all on function public.create_customer_subscription_transaction(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, timestamptz,
  bigint, text, text, date, timestamptz, text, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.create_customer_subscription_transaction(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, timestamptz,
  bigint, text, text, date, timestamptz, text, text, uuid, text
) to service_role;

revoke all on function public.add_subscription_device_transaction(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.add_subscription_device_transaction(uuid, uuid, text, text)
  to service_role;

revoke all on function public.replace_subscription_device_transaction(uuid, uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.replace_subscription_device_transaction(uuid, uuid, uuid, text, text, text)
  to service_role;

revoke all on function public.change_subscription_plan_transaction(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.change_subscription_plan_transaction(uuid, uuid, text, text, text)
  to service_role;

revoke all on function public.renew_customer_subscription_transaction(
  uuid, text, text, bigint, text, text, date, timestamptz, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.renew_customer_subscription_transaction(
  uuid, text, text, bigint, text, text, date, timestamptz, text, uuid, text
) to service_role;

comment on table public.panel_subscriptions is
  'Assinatura comercial central do cliente, com snapshot do plano, validade única e até cinco aparelhos.';
comment on table public.panel_lab_sessions is
  'Sessões temporárias e auditadas que permitem ao proprietário testar uma assinatura em aparelho de laboratório.';
