-- Lote 2: defesa em profundidade. Mesmo com service_role, mudanças comerciais
-- sensíveis no aparelho exigem o contexto seller-device-flow. O reparo de
-- integridade possui um contexto separado e não pode alterar plano/validade.

alter function public.seller_device_flow_transaction(
  uuid,uuid,text,text,uuid,uuid,uuid,timestamptz,uuid,text,text,text,text,uuid
) rename to seller_device_flow_transaction_core;

create or replace function public.seller_device_flow_transaction(
  p_seller_id uuid,
  p_device_id uuid,
  p_operation_type text,
  p_idempotency_key text,
  p_plan_id uuid default null,
  p_primary_playlist_id uuid default null,
  p_backup_playlist_id uuid default null,
  p_expires_at timestamptz default null,
  p_customer_id uuid default null,
  p_customer_name text default null,
  p_customer_whatsapp text default null,
  p_reason text default null,
  p_performed_by text default 'system',
  p_performed_by_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.set_config('roneca.device_commercial_context', 'canonical', true);
  return public.seller_device_flow_transaction_core(
    p_seller_id, p_device_id, p_operation_type, p_idempotency_key,
    p_plan_id, p_primary_playlist_id, p_backup_playlist_id, p_expires_at,
    p_customer_id, p_customer_name, p_customer_whatsapp, p_reason,
    p_performed_by, p_performed_by_user_id
  );
end;
$$;

revoke all on function public.seller_device_flow_transaction(
  uuid,uuid,text,text,uuid,uuid,uuid,timestamptz,uuid,text,text,text,text,uuid
) from public, anon, authenticated;
grant execute on function public.seller_device_flow_transaction(
  uuid,uuid,text,text,uuid,uuid,uuid,timestamptz,uuid,text,text,text,text,uuid
) to service_role;
revoke all on function public.seller_device_flow_transaction_core(
  uuid,uuid,text,text,uuid,uuid,uuid,timestamptz,uuid,text,text,text,text,uuid
) from public, anon, authenticated;
grant execute on function public.seller_device_flow_transaction_core(
  uuid,uuid,text,text,uuid,uuid,uuid,timestamptz,uuid,text,text,text,text,uuid
) to service_role;

alter function public.set_device_playlists_transaction(
  uuid,uuid,uuid,uuid,boolean
) rename to set_device_playlists_transaction_legacy_core;

create or replace function public.repair_device_playlists_transaction(
  p_device_id uuid,
  p_primary_playlist_id uuid,
  p_backup_playlist_id uuid
)
returns table(applied boolean, primary_playlist_id uuid, backup_playlist_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.set_config('roneca.device_commercial_context', 'repair', true);
  return query select * from public.set_device_playlists_transaction_legacy_core(
    p_device_id,
    p_primary_playlist_id,
    p_backup_playlist_id,
    null,
    false
  );
end;
$$;

create or replace function public.set_device_playlists_transaction(
  p_device_id uuid,
  p_primary_playlist_id uuid,
  p_backup_playlist_id uuid,
  p_seller_id uuid default null,
  p_enforce_seller_ownership boolean default false
)
returns table(applied boolean, primary_playlist_id uuid, backup_playlist_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001',
    message = 'Troca de listas por RPC genérica desativada. Use seller-device-flow; para reparo administrativo use a operação de integridade.';
end;
$$;

revoke all on function public.set_device_playlists_transaction(uuid,uuid,uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.set_device_playlists_transaction(uuid,uuid,uuid,uuid,boolean) to service_role;
revoke all on function public.set_device_playlists_transaction_legacy_core(uuid,uuid,uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.set_device_playlists_transaction_legacy_core(uuid,uuid,uuid,uuid,boolean) to service_role;
revoke all on function public.repair_device_playlists_transaction(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.repair_device_playlists_transaction(uuid,uuid,uuid) to service_role;

create or replace function public.enforce_canonical_device_commercial_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_context text := coalesce(pg_catalog.current_setting('roneca.device_commercial_context', true), '');
begin
  if v_context = 'canonical' then return new; end if;

  if v_context = 'repair' then
    if new.plan_id is distinct from old.plan_id
       or new.subscription_expires_at is distinct from old.subscription_expires_at
       or (old.status <> 'active' and new.status = 'active') then
      raise exception using errcode = 'P0001', message = 'Reparo de listas não pode alterar plano, validade ou ativação.';
    end if;
    return new;
  end if;

  if new.plan_id is distinct from old.plan_id then
    raise exception using errcode = 'P0001', message = 'Alteração de plano exige seller-device-flow.';
  end if;
  if new.subscription_expires_at is distinct from old.subscription_expires_at then
    raise exception using errcode = 'P0001', message = 'Alteração de validade exige seller-device-flow.';
  end if;
  if old.status <> 'active' and new.status = 'active' then
    raise exception using errcode = 'P0001', message = 'Ativação exige seller-device-flow.';
  end if;
  if old.status = 'active' and new.playlist_id is distinct from old.playlist_id then
    raise exception using errcode = 'P0001', message = 'Troca comercial de lista exige seller-device-flow.';
  end if;
  return new;
end;
$$;

drop trigger if exists panel_devices_canonical_commercial_guard on public.panel_devices;
create trigger panel_devices_canonical_commercial_guard
before update of status, plan_id, playlist_id, subscription_expires_at on public.panel_devices
for each row execute function public.enforce_canonical_device_commercial_mutation();
