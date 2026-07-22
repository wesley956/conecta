-- Compatibilidade com cadastros antigos de plano e correção do lint da renovação.

alter table public.panel_plans
  alter column billing_cycle set default 'custom';

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
  select subscription_record.*
  into v_subscription
  from public.panel_subscriptions subscription_record
  where subscription_record.id = p_subscription_id
  for update;

  if not found or v_subscription.status in ('cancelled', 'needs_review') then
    raise exception using errcode = 'P0001', message = 'Assinatura não pode ser renovada neste estado.';
  end if;

  select plan_record.*
  into v_plan
  from public.panel_plans plan_record
  where plan_record.id = coalesce(v_subscription.scheduled_plan_id, v_subscription.plan_id)
  for share;

  if not found or v_plan.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'Plano da renovação inexistente ou inativo.';
  end if;

  select count(*)
  into v_active_devices
  from public.panel_subscription_devices subscription_device
  where subscription_device.subscription_id = p_subscription_id
    and subscription_device.status = 'active';

  if v_active_devices = 0 then
    raise exception using errcode = 'P0001', message = 'Assinatura sem aparelho ativo.';
  end if;

  if v_active_devices > v_plan.max_devices then
    raise exception using errcode = 'P0001', message = 'Plano agendado não comporta os aparelhos ativos.';
  end if;

  select subscription_device.device_id
  into v_primary_device
  from public.panel_subscription_devices subscription_device
  where subscription_device.subscription_id = p_subscription_id
    and subscription_device.status = 'active'
  order by subscription_device.assigned_at asc
  limit 1;

  select subscription_playlist.playlist_id
  into v_primary_playlist
  from public.panel_subscription_playlists subscription_playlist
  where subscription_playlist.subscription_id = p_subscription_id
    and subscription_playlist.active is true
    and subscription_playlist.priority = 1;

  select subscription_playlist.playlist_id
  into v_backup_playlist
  from public.panel_subscription_playlists subscription_playlist
  where subscription_playlist.subscription_id = p_subscription_id
    and subscription_playlist.active is true
    and subscription_playlist.priority = 2;

  if v_primary_playlist is null then
    raise exception using errcode = 'P0001', message = 'Assinatura sem lista principal exclusiva.';
  end if;

  v_fingerprint := concat_ws('|', 'renew-subscription-v1', p_subscription_id, v_plan.id);

  select operation_record.*
  into v_existing
  from public.panel_subscription_operations operation_record
  where operation_record.seller_id = v_subscription.seller_id
    and operation_record.idempotency_key = p_idempotency_key
  limit 1;

  if found then
    if v_existing.operation_fingerprint <> v_fingerprint then
      raise exception using errcode = '23505', message = 'Chave de idempotência usada em outra operação.';
    end if;

    return query
    select
      false,
      p_subscription_id,
      nullif(v_existing.result->>'finance_record_id', '')::uuid,
      coalesce((v_existing.result->>'balance_after')::integer, 0),
      (v_existing.result->>'expires_at')::timestamptz;
    return;
  end if;

  v_new_expiry := greatest(now(), v_subscription.expires_at)
    + make_interval(days => v_plan.duration_days);

  select *
  into v_legacy
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
    (select customer_record.name
      from public.panel_customers customer_record
      where customer_record.id = v_subscription.customer_id),
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

  update public.panel_subscriptions subscription_record
  set plan_id = v_plan.id,
      scheduled_plan_id = null,
      status = 'active',
      expires_at = v_new_expiry,
      plan_name_snapshot = v_plan.name,
      duration_days_snapshot = v_plan.duration_days,
      max_devices_snapshot = v_plan.max_devices,
      simultaneous_connections_snapshot = v_plan.simultaneous_connections,
      credit_cost_snapshot = v_plan.credit_cost
  where subscription_record.id = p_subscription_id;

  update public.panel_devices device_record
  set plan_id = v_plan.id,
      status = 'active',
      subscription_expires_at = v_new_expiry,
      updated_at = now()
  where device_record.subscription_id = p_subscription_id;

  if v_legacy.finance_record_id is not null then
    update public.panel_financial_records financial_record
    set subscription_id = p_subscription_id
    where financial_record.id = v_legacy.finance_record_id;
  end if;

  insert into public.panel_subscription_operations (
    seller_id,
    subscription_id,
    operation_type,
    idempotency_key,
    operation_fingerprint,
    result,
    performed_by
  ) values (
    v_subscription.seller_id,
    p_subscription_id,
    'renewal',
    p_idempotency_key,
    v_fingerprint,
    jsonb_build_object(
      'finance_record_id', v_legacy.finance_record_id,
      'balance_after', v_legacy.balance_after,
      'expires_at', v_new_expiry
    ),
    p_performed_by
  );

  return query
  select
    true,
    p_subscription_id,
    v_legacy.finance_record_id,
    v_legacy.balance_after,
    v_new_expiry;
end;
$$;

revoke all on function public.renew_customer_subscription_transaction(
  uuid, text, text, bigint, text, text, date, timestamptz, text, uuid, text
) from public, anon, authenticated;

grant execute on function public.renew_customer_subscription_transaction(
  uuid, text, text, bigint, text, text, date, timestamptz, text, uuid, text
) to service_role;
