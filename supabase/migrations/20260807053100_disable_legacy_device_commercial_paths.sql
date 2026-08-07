-- Lote 2: bloqueia RPCs antigas como portas comerciais independentes.
-- Elas continuam presentes apenas para compatibilidade de esquema, mas somente
-- seller-device-flow pode alcançar o núcleo de cobrança/assinatura.

alter function public.apply_device_subscription_transaction(
  uuid,uuid,uuid,uuid,timestamptz,text,text,text,uuid,text,boolean
) rename to apply_device_subscription_transaction_legacy_core;

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
returns table(
  applied boolean,
  ledger_id uuid,
  balance_before integer,
  balance_after integer,
  device_status text,
  subscription_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(p_performed_by, '') not like 'seller-device-flow:%' then
    raise exception using errcode = 'P0001',
      message = 'Operação comercial legada desativada. Use seller-device-flow.';
  end if;

  return query
  select * from public.apply_device_subscription_transaction_legacy_core(
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
end;
$$;

revoke all on function public.apply_device_subscription_transaction(
  uuid,uuid,uuid,uuid,timestamptz,text,text,text,uuid,text,boolean
) from public, anon, authenticated;
grant execute on function public.apply_device_subscription_transaction(
  uuid,uuid,uuid,uuid,timestamptz,text,text,text,uuid,text,boolean
) to service_role;

revoke all on function public.apply_device_subscription_transaction_legacy_core(
  uuid,uuid,uuid,uuid,timestamptz,text,text,text,uuid,text,boolean
) from public, anon, authenticated;
grant execute on function public.apply_device_subscription_transaction_legacy_core(
  uuid,uuid,uuid,uuid,timestamptz,text,text,text,uuid,text,boolean
) to service_role;

alter function public.change_device_playlists_transaction(
  uuid,uuid,uuid,uuid,text,text,text
) rename to change_device_playlists_transaction_legacy_core;

create or replace function public.change_device_playlists_transaction(
  p_seller_id uuid,
  p_device_id uuid,
  p_primary_playlist_id uuid,
  p_backup_playlist_id uuid,
  p_reason text,
  p_performed_by text,
  p_idempotency_key text
)
returns table(
  applied boolean,
  primary_playlist_id uuid,
  backup_playlist_id uuid,
  confirmation_status text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001',
    message = 'Troca comercial de listas legada desativada. Use seller-device-flow.';
end;
$$;

revoke all on function public.change_device_playlists_transaction(
  uuid,uuid,uuid,uuid,text,text,text
) from public, anon, authenticated;
grant execute on function public.change_device_playlists_transaction(
  uuid,uuid,uuid,uuid,text,text,text
) to service_role;
revoke all on function public.change_device_playlists_transaction_legacy_core(
  uuid,uuid,uuid,uuid,text,text,text
) from public, anon, authenticated;
grant execute on function public.change_device_playlists_transaction_legacy_core(
  uuid,uuid,uuid,uuid,text,text,text
) to service_role;

-- A edição avulsa de uma posição de lista era a última porta paralela do módulo
-- de assinaturas legado. A reparação de integridade do Lote 1 usa outra RPC
-- (set_device_playlists_transaction) e permanece disponível para o ADM.
do $guard$
begin
  if to_regprocedure('public.replace_device_playlist_transaction(uuid,smallint,uuid,text,text,uuid,text)') is not null then
    execute $sql$
      create or replace function public.replace_device_playlist_transaction(
        p_device_id uuid,
        p_priority smallint,
        p_candidate_playlist_id uuid,
        p_reason text,
        p_performed_by text,
        p_performed_by_user_id uuid,
        p_idempotency_key text
      )
      returns table(
        applied boolean,
        old_playlist_id uuid,
        new_playlist_id uuid,
        playlist_priority smallint
      )
      language plpgsql
      security definer
      set search_path = ''
      as $function$
      begin
        raise exception using errcode = 'P0001',
          message = 'Edição comercial de lista legada desativada. Use seller-device-flow.';
      end;
      $function$;
    $sql$;
  end if;
end;
$guard$;
