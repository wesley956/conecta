-- Mantém cobrança, ativação e vínculo das listas na mesma transação.
create or replace function public.activate_device_provisional_transaction(
  p_seller_id uuid,
  p_device_id uuid,
  p_plan_id uuid,
  p_primary_playlist_id uuid,
  p_backup_playlist_id uuid,
  p_expires_at timestamptz,
  p_customer_id uuid,
  p_client_name text,
  p_performed_by text,
  p_idempotency_key text
)
returns table(
  applied boolean,
  ledger_id uuid,
  balance_before integer,
  balance_after integer,
  device_status text,
  subscription_expires_at timestamptz,
  confirmation_status text
)
language plpgsql security definer set search_path to 'public' as $$
declare
  v_subscription record;
  v_assignment record;
begin
  select * into v_subscription
    from public.apply_device_subscription_transaction(
      p_seller_id,
      p_device_id,
      p_plan_id,
      p_primary_playlist_id,
      p_expires_at,
      'activation',
      p_performed_by,
      p_idempotency_key,
      p_customer_id,
      p_client_name,
      true
    );

  select * into v_assignment
    from public.change_device_playlists_transaction(
      p_seller_id,
      p_device_id,
      p_primary_playlist_id,
      p_backup_playlist_id,
      'Listas definidas pelo assistente de ativação',
      p_performed_by,
      p_idempotency_key || ':playlists'
    );

  return query select
    v_subscription.applied,
    v_subscription.ledger_id,
    v_subscription.balance_before,
    v_subscription.balance_after,
    v_subscription.device_status,
    v_subscription.subscription_expires_at,
    v_assignment.confirmation_status;
end;$$;

revoke all on function public.activate_device_provisional_transaction(uuid,uuid,uuid,uuid,uuid,timestamptz,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.activate_device_provisional_transaction(uuid,uuid,uuid,uuid,uuid,timestamptz,uuid,text,text,text) to service_role;
