-- RPC transacional para atualizar aparelho e, quando necessário,
-- debitar crédito do vendedor + registrar ledger na mesma transação.
--
-- Objetivo:
-- - evitar corrida de crédito;
-- - evitar debitar crédito sem atualizar aparelho;
-- - evitar atualizar aparelho sem registrar ledger;
-- - respeitar can_go_negative.

create or replace function public.admin_update_device_with_credit(
  p_device_id uuid,
  p_updates jsonb default '{}'::jsonb,
  p_charge_type text default null,
  p_credit_cost integer default null,
  p_plan_name text default null,
  p_customer_name text default null,
  p_performed_by text default 'admin'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device public.panel_devices%rowtype;
  v_updated_device public.panel_devices%rowtype;
  v_seller public.panel_sellers%rowtype;
  v_next_seller_id uuid;
  v_cost integer;
  v_balance_before integer;
  v_balance_after integer;
  v_description text;
  v_credit_consumption jsonb := null;
begin
  if p_device_id is null then
    raise exception 'ID do aparelho é obrigatório.';
  end if;

  if p_updates is null then
    p_updates := '{}'::jsonb;
  end if;

  if jsonb_typeof(p_updates) <> 'object' then
    raise exception 'p_updates precisa ser um objeto JSON.';
  end if;

  select *
    into v_device
    from public.panel_devices
   where id = p_device_id
   for update;

  if not found then
    raise exception 'Aparelho não encontrado.';
  end if;

  v_next_seller_id :=
    case
      when p_updates ? 'seller_id'
        then nullif(p_updates ->> 'seller_id', '')::uuid
      else v_device.seller_id
    end;

  if p_charge_type is not null then
    if p_charge_type not in ('activation', 'renewal') then
      raise exception 'Tipo de cobrança inválido: %', p_charge_type;
    end if;

    if v_next_seller_id is null then
      raise exception 'Escolha um vendedor para consumir crédito.';
    end if;

    v_cost := greatest(1, coalesce(p_credit_cost, 1));

    select *
      into v_seller
      from public.panel_sellers
     where id = v_next_seller_id
     for update;

    if not found then
      raise exception 'Vendedor não encontrado.';
    end if;

    if v_seller.status <> 'active' then
      raise exception 'Vendedor bloqueado ou inativo. Não é possível consumir crédito.';
    end if;

    if exists (
      select 1
        from public.panel_credit_ledger
       where seller_id = v_next_seller_id
         and reference_id = p_device_id
         and type = p_charge_type
         and created_at >= now() - interval '15 seconds'
       limit 1
    ) then
      raise exception 'Operação duplicada detectada. Aguarde alguns segundos antes de tentar novamente.';
    end if;

    v_balance_before := coalesce(v_seller.credit_balance, 0);
    v_balance_after := v_balance_before - v_cost;

    if v_balance_after < 0 and coalesce(v_seller.can_go_negative, false) <> true then
      raise exception 'Saldo insuficiente para %. Saldo atual: %. Custo: %.',
        v_seller.name,
        v_balance_before,
        v_cost;
    end if;

    v_description :=
      case
        when p_charge_type = 'activation' then 'Ativação'
        else 'Renovação'
      end
      || ' do aparelho '
      || coalesce(v_device.device_code, p_device_id::text)
      || case
          when nullif(p_customer_name, '') is not null
            then ' — cliente ' || p_customer_name
          else ''
         end
      || case
          when nullif(p_plan_name, '') is not null
            then ' — plano ' || p_plan_name
          else ''
         end;

    update public.panel_sellers
       set credit_balance = v_balance_after,
           updated_at = now()
     where id = v_next_seller_id;

    insert into public.panel_credit_ledger (
      seller_id,
      amount,
      type,
      reference_id,
      description,
      balance_after,
      performed_by
    )
    values (
      v_next_seller_id,
      -v_cost,
      p_charge_type,
      p_device_id,
      v_description,
      v_balance_after,
      coalesce(nullif(p_performed_by, ''), 'admin')
    );

    v_credit_consumption := jsonb_build_object(
      'sellerId', v_next_seller_id,
      'sellerName', v_seller.name,
      'amount', -v_cost,
      'balanceBefore', v_balance_before,
      'balanceAfter', v_balance_after,
      'type', p_charge_type,
      'description', v_description
    );
  end if;

  update public.panel_devices
     set status =
           case
             when p_updates ? 'status' then nullif(p_updates ->> 'status', '')
             else v_device.status
           end,
         client_name =
           case
             when p_updates ? 'client_name' then nullif(p_updates ->> 'client_name', '')
             else v_device.client_name
           end,
         customer_id =
           case
             when p_updates ? 'customer_id' then nullif(p_updates ->> 'customer_id', '')::uuid
             else v_device.customer_id
           end,
         seller_id = v_next_seller_id,
         plan_id =
           case
             when p_updates ? 'plan_id' then nullif(p_updates ->> 'plan_id', '')::uuid
             else v_device.plan_id
           end,
         playlist_id =
           case
             when p_updates ? 'playlist_id' then nullif(p_updates ->> 'playlist_id', '')::uuid
             else v_device.playlist_id
           end,
         subscription_expires_at =
           case
             when p_updates ? 'subscription_expires_at' then nullif(p_updates ->> 'subscription_expires_at', '')::timestamptz
             else v_device.subscription_expires_at
           end,
         updated_at = now()
   where id = p_device_id
   returning *
    into v_updated_device;

  return jsonb_build_object(
    'ok', true,
    'deviceId', v_updated_device.id,
    'deviceCode', v_updated_device.device_code,
    'status', v_updated_device.status,
    'sellerId', v_updated_device.seller_id,
    'planId', v_updated_device.plan_id,
    'playlistId', v_updated_device.playlist_id,
    'expiresAt', v_updated_device.subscription_expires_at,
    'creditConsumption', v_credit_consumption
  );
end;
$$;

revoke all on function public.admin_update_device_with_credit(
  uuid,
  jsonb,
  text,
  integer,
  text,
  text,
  text
) from public;

grant execute on function public.admin_update_device_with_credit(
  uuid,
  jsonb,
  text,
  integer,
  text,
  text,
  text
) to service_role;

comment on function public.admin_update_device_with_credit(
  uuid,
  jsonb,
  text,
  integer,
  text,
  text,
  text
) is 'Atualiza aparelho e consome crédito do vendedor atomicamente, com lock de aparelho e vendedor.';
