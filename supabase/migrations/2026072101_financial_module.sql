create table if not exists public.panel_financial_records (
  id uuid primary key default gen_random_uuid(),
  record_type text not null,
  source text not null default 'manual',
  category text not null,
  seller_id uuid references public.panel_sellers(id) on delete set null,
  customer_id uuid references public.panel_customers(id) on delete set null,
  device_id uuid references public.panel_devices(id) on delete set null,
  plan_id uuid references public.panel_plans(id) on delete set null,
  seller_name_snapshot text,
  customer_name_snapshot text,
  device_code_snapshot text,
  plan_name_snapshot text,
  description text not null,
  amount_cents bigint not null,
  currency text not null default 'BRL',
  payment_method text not null default 'pix',
  status text not null default 'pending',
  due_date date,
  paid_at timestamptz,
  reference_date date not null default current_date,
  notes text,
  idempotency_key text,
  operation_fingerprint text,
  created_by_user_id uuid,
  created_by_role text not null default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint panel_financial_records_type_check
    check (record_type in ('income', 'expense')),
  constraint panel_financial_records_source_check
    check (source in ('manual', 'device_activation', 'device_renewal', 'credit_sale')),
  constraint panel_financial_records_amount_check
    check (amount_cents > 0),
  constraint panel_financial_records_currency_check
    check (currency = 'BRL'),
  constraint panel_financial_records_payment_method_check
    check (payment_method in ('pix', 'cash', 'card', 'bank_transfer', 'boleto', 'other')),
  constraint panel_financial_records_status_check
    check (status in ('paid', 'pending', 'overdue', 'cancelled')),
  constraint panel_financial_records_role_check
    check (created_by_role in ('admin', 'seller', 'system')),
  constraint panel_financial_records_paid_at_check
    check ((status = 'paid' and paid_at is not null) or status <> 'paid')
);

create index if not exists panel_financial_records_reference_idx
  on public.panel_financial_records(reference_date desc, created_at desc);

create index if not exists panel_financial_records_status_due_idx
  on public.panel_financial_records(status, due_date);

create index if not exists panel_financial_records_seller_idx
  on public.panel_financial_records(seller_id, reference_date desc);

create index if not exists panel_financial_records_customer_idx
  on public.panel_financial_records(customer_id, reference_date desc);

create unique index if not exists panel_financial_records_idempotency_idx
  on public.panel_financial_records(seller_id, idempotency_key)
  where idempotency_key is not null;

alter table public.panel_financial_records enable row level security;
alter table public.panel_financial_records force row level security;

revoke all on table public.panel_financial_records from public, anon, authenticated;
grant all on table public.panel_financial_records to service_role;

create or replace function public.set_panel_financial_record_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_panel_financial_record_updated_at() from public, anon, authenticated;
grant execute on function public.set_panel_financial_record_updated_at() to service_role;

drop trigger if exists panel_financial_records_updated_at on public.panel_financial_records;
create trigger panel_financial_records_updated_at
before update on public.panel_financial_records
for each row execute function public.set_panel_financial_record_updated_at();

create or replace function public.apply_device_subscription_with_finance(
  p_seller_id uuid,
  p_device_id uuid,
  p_plan_id uuid,
  p_playlist_id uuid,
  p_backup_playlist_id uuid,
  p_expires_at timestamptz,
  p_operation_type text,
  p_performed_by text,
  p_idempotency_key text,
  p_customer_id uuid default null,
  p_client_name text default null,
  p_enforce_seller_ownership boolean default true,
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
  ledger_id uuid,
  finance_record_id uuid,
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
  v_subscription record;
  v_device public.panel_devices%rowtype;
  v_plan public.panel_plans%rowtype;
  v_seller public.panel_sellers%rowtype;
  v_customer public.panel_customers%rowtype;
  v_backup public.panel_playlists%rowtype;
  v_existing_finance public.panel_financial_records%rowtype;
  v_finance_id uuid;
  v_finance_status text;
  v_payment_method text;
  v_paid_at timestamptz;
  v_finance_description text;
  v_finance_fingerprint text;
begin
  select *
    into v_subscription
    from public.apply_device_subscription_transaction(
      p_seller_id,
      p_device_id,
      p_plan_id,
      p_playlist_id,
      p_expires_at,
      p_operation_type,
      p_performed_by,
      p_idempotency_key,
      p_customer_id,
      p_client_name,
      p_enforce_seller_ownership
    );

  select * into v_device from public.panel_devices where id = p_device_id;
  select * into v_plan from public.panel_plans where id = p_plan_id;
  select * into v_seller from public.panel_sellers where id = p_seller_id;

  if p_customer_id is not null then
    select * into v_customer from public.panel_customers where id = p_customer_id;
  end if;

  if p_backup_playlist_id is not null then
    if p_backup_playlist_id = p_playlist_id then
      raise exception using errcode = '22023', message = 'A lista reserva precisa ser diferente da lista principal.';
    end if;

    select *
      into v_backup
      from public.panel_playlists
     where id = p_backup_playlist_id
     for share;

    if not found or v_backup.active is not true then
      raise exception using errcode = 'P0001', message = 'Lista reserva inexistente ou inativa.';
    end if;

    if p_enforce_seller_ownership and not exists (
      select 1
        from public.panel_seller_playlists permission
       where permission.seller_id = p_seller_id
         and permission.playlist_id = p_backup_playlist_id
         and permission.active is true
    ) then
      raise exception using errcode = 'P0001', message = 'Lista reserva não liberada para este vendedor.';
    end if;
  end if;

  delete from public.panel_device_playlists
   where device_id = p_device_id
     and priority = 2;

  if p_backup_playlist_id is not null then
    insert into public.panel_device_playlists (
      device_id,
      playlist_id,
      priority,
      active,
      consecutive_failures,
      cooldown_until,
      last_error,
      updated_at
    ) values (
      p_device_id,
      p_backup_playlist_id,
      2,
      true,
      0,
      null,
      null,
      now()
    );
  end if;

  if p_finance_amount_cents is not null and p_finance_amount_cents > 0 then
    v_finance_status := lower(trim(coalesce(p_finance_status, 'pending')));
    if v_finance_status not in ('paid', 'pending', 'overdue', 'cancelled') then
      raise exception using errcode = '22023', message = 'Status financeiro inválido.';
    end if;

    if v_finance_status = 'pending' and p_due_date is not null and p_due_date < current_date then
      v_finance_status := 'overdue';
    end if;

    v_payment_method := lower(trim(coalesce(p_payment_method, 'pix')));
    if v_payment_method not in ('pix', 'cash', 'card', 'bank_transfer', 'boleto', 'other') then
      raise exception using errcode = '22023', message = 'Forma de pagamento inválida.';
    end if;

    v_paid_at := case
      when v_finance_status = 'paid' then coalesce(p_paid_at, now())
      else null
    end;

    v_finance_description := coalesce(
      nullif(trim(p_finance_description), ''),
      format(
        '%s do aparelho %s — plano %s',
        case when p_operation_type = 'activation' then 'Ativação' else 'Renovação' end,
        coalesce(v_device.device_code, p_device_id::text),
        coalesce(v_plan.name, 'Sem plano')
      )
    );

    v_finance_fingerprint := concat_ws(
      '|',
      'device-finance-v1',
      p_operation_type,
      p_device_id::text,
      p_seller_id::text,
      p_plan_id::text,
      p_playlist_id::text,
      p_finance_amount_cents::text,
      v_finance_status,
      v_payment_method,
      coalesce(p_due_date::text, ''),
      coalesce(v_paid_at::text, ''),
      coalesce(nullif(trim(p_finance_notes), ''), '')
    );

    select *
      into v_existing_finance
      from public.panel_financial_records
     where seller_id = p_seller_id
       and idempotency_key = nullif(trim(p_idempotency_key), '')
     limit 1;

    if found then
      if v_existing_finance.operation_fingerprint is distinct from v_finance_fingerprint then
        raise exception using errcode = '23505', message = 'Chave de idempotência financeira já utilizada em outra operação.';
      end if;
      v_finance_id := v_existing_finance.id;
    else
      insert into public.panel_financial_records (
        record_type,
        source,
        category,
        seller_id,
        customer_id,
        device_id,
        plan_id,
        seller_name_snapshot,
        customer_name_snapshot,
        device_code_snapshot,
        plan_name_snapshot,
        description,
        amount_cents,
        payment_method,
        status,
        due_date,
        paid_at,
        reference_date,
        notes,
        idempotency_key,
        operation_fingerprint,
        created_by_user_id,
        created_by_role
      ) values (
        'income',
        case when p_operation_type = 'activation' then 'device_activation' else 'device_renewal' end,
        'subscription_sale',
        p_seller_id,
        p_customer_id,
        p_device_id,
        p_plan_id,
        v_seller.name,
        coalesce(v_customer.name, nullif(trim(p_client_name), ''), v_device.client_name),
        v_device.device_code,
        v_plan.name,
        v_finance_description,
        p_finance_amount_cents,
        v_payment_method,
        v_finance_status,
        p_due_date,
        v_paid_at,
        coalesce(v_paid_at::date, current_date),
        nullif(trim(p_finance_notes), ''),
        nullif(trim(p_idempotency_key), ''),
        v_finance_fingerprint,
        p_created_by_user_id,
        case when p_created_by_role in ('admin', 'seller', 'system') then p_created_by_role else 'system' end
      )
      returning id into v_finance_id;
    end if;
  end if;

  return query
  select
    v_subscription.applied,
    v_subscription.ledger_id,
    v_finance_id,
    v_subscription.balance_before,
    v_subscription.balance_after,
    v_subscription.device_status,
    v_subscription.subscription_expires_at;
end;
$$;

revoke all on function public.apply_device_subscription_with_finance(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  timestamptz,
  text,
  text,
  text,
  uuid,
  text,
  boolean,
  bigint,
  text,
  text,
  date,
  timestamptz,
  text,
  text,
  uuid,
  text
) from public, anon, authenticated;

grant execute on function public.apply_device_subscription_with_finance(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  timestamptz,
  text,
  text,
  text,
  uuid,
  text,
  boolean,
  bigint,
  text,
  text,
  date,
  timestamptz,
  text,
  text,
  uuid,
  text
) to service_role;

comment on table public.panel_financial_records is
  'Receitas e despesas operacionais em reais, separadas do extrato de créditos dos vendedores.';

comment on function public.apply_device_subscription_with_finance(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  timestamptz,
  text,
  text,
  text,
  uuid,
  text,
  boolean,
  bigint,
  text,
  text,
  date,
  timestamptz,
  text,
  text,
  uuid,
  text
) is
  'Ativa ou renova aparelho, debita créditos, atualiza lista reserva e registra a venda financeira na mesma transação idempotente.';
