do $$
begin
  if to_regprocedure(
    'public.apply_device_subscription_with_finance_impl(uuid,uuid,uuid,uuid,uuid,timestamp with time zone,text,text,text,uuid,text,boolean,bigint,text,text,date,timestamp with time zone,text,text,uuid,text)'
  ) is null then
    alter function public.apply_device_subscription_with_finance(
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
    ) rename to apply_device_subscription_with_finance_impl;
  end if;
end;
$$;

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
  v_stable_paid_at timestamptz := p_paid_at;
begin
  if p_finance_amount_cents is not null
     and p_finance_amount_cents > 0
     and lower(trim(coalesce(p_finance_status, 'pending'))) = 'paid'
     and v_stable_paid_at is null then
    select record.paid_at
      into v_stable_paid_at
      from public.panel_financial_records record
     where record.seller_id = p_seller_id
       and record.idempotency_key = nullif(trim(coalesce(p_idempotency_key, '')), '')
     limit 1;

    v_stable_paid_at := coalesce(v_stable_paid_at, now());
  end if;

  return query
  select *
    from public.apply_device_subscription_with_finance_impl(
      p_seller_id,
      p_device_id,
      p_plan_id,
      p_playlist_id,
      p_backup_playlist_id,
      p_expires_at,
      p_operation_type,
      p_performed_by,
      p_idempotency_key,
      p_customer_id,
      p_client_name,
      p_enforce_seller_ownership,
      p_finance_amount_cents,
      p_finance_status,
      p_payment_method,
      p_due_date,
      v_stable_paid_at,
      p_finance_notes,
      p_finance_description,
      p_created_by_user_id,
      p_created_by_role
    );
end;
$$;

revoke all on function public.apply_device_subscription_with_finance_impl(
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
) from public, anon, authenticated, service_role;

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
  'Entrada pública service_role da transação comercial-financeira. Reutiliza a data de pagamento já registrada em retries idempotentes.';
