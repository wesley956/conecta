-- Lote 2: uma única transação para ativação, renovação e troca de listas.
-- A Edge Function seller-device-flow é a única porta comercial externa; esta
-- função é o contrato transacional interno e permanece exclusiva do service_role.

create table if not exists public.panel_device_commercial_operations (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.panel_sellers(id) on delete restrict,
  device_id uuid not null references public.panel_devices(id) on delete restrict,
  operation_type text not null check (operation_type in ('activation', 'renewal', 'change_playlists')),
  idempotency_key text not null,
  operation_fingerprint text not null,
  result jsonb not null default '{}'::jsonb,
  performed_by text not null,
  performed_by_user_id uuid,
  created_at timestamptz not null default now(),
  unique (seller_id, idempotency_key)
);

create index if not exists panel_device_commercial_operations_device_idx
  on public.panel_device_commercial_operations(device_id, created_at desc);

alter table public.panel_device_commercial_operations enable row level security;
alter table public.panel_device_commercial_operations force row level security;
revoke all on public.panel_device_commercial_operations from public, anon, authenticated;
grant all on public.panel_device_commercial_operations to service_role;

-- Remover uma reserva também é uma revisão comercial legítima.
alter table public.panel_device_playlist_revisions
  alter column new_playlist_id drop not null;

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
declare
  v_seller public.panel_sellers%rowtype;
  v_device public.panel_devices%rowtype;
  v_plan public.panel_plans%rowtype;
  v_customer public.panel_customers%rowtype;
  v_subscription record;
  v_existing public.panel_device_commercial_operations%rowtype;
  v_existing_finance public.panel_financial_records%rowtype;
  v_operation text := lower(trim(coalesce(p_operation_type, '')));
  v_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  v_performed_by text := nullif(trim(coalesce(p_performed_by, '')), '');
  v_customer_name text := nullif(trim(coalesce(p_customer_name, '')), '');
  v_customer_whatsapp text := pg_catalog.regexp_replace(coalesce(p_customer_whatsapp, ''), '[^0-9]', '', 'g');
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_primary_id uuid;
  v_backup_id uuid;
  v_old_primary uuid;
  v_old_backup uuid;
  v_effective_expiry timestamptz;
  v_primary_status text;
  v_backup_status text;
  v_confirmation_status text;
  v_fingerprint text;
  v_result jsonb;
  v_finance_id uuid;
  v_sale_price bigint;
  v_finance_fingerprint text;
  v_created_by_role text;
  v_lock_playlist_id uuid;
begin
  if p_seller_id is null or p_device_id is null then
    raise exception using errcode = '22023', message = 'Vendedor e aparelho são obrigatórios.';
  end if;
  if v_operation not in ('activation', 'renewal', 'change_playlists') then
    raise exception using errcode = '22023', message = 'Operação comercial inválida.';
  end if;
  if v_idempotency_key is null or length(v_idempotency_key) > 200 then
    raise exception using errcode = '22023', message = 'Chave de idempotência obrigatória e limitada a 200 caracteres.';
  end if;
  if v_performed_by is null then
    raise exception using errcode = '22023', message = 'Responsável pela operação é obrigatório.';
  end if;

  -- O fingerprint usa somente a intenção enviada. Assim um retry com validade
  -- automática continua idempotente mesmo depois de o aparelho ter sido ativado.
  v_fingerprint := case v_operation
    when 'activation' then concat_ws('|', 'seller-device-flow-v2', v_operation, p_device_id,
      coalesce(p_plan_id::text, ''), coalesce(p_primary_playlist_id::text, ''),
      coalesce(p_backup_playlist_id::text, ''), coalesce(p_expires_at::text, 'auto'),
      coalesce(p_customer_id::text, ''), coalesce(v_customer_name, ''), v_customer_whatsapp)
    when 'renewal' then concat_ws('|', 'seller-device-flow-v2', v_operation, p_device_id,
      coalesce(p_plan_id::text, ''), coalesce(p_expires_at::text, 'auto'))
    else concat_ws('|', 'seller-device-flow-v2', v_operation, p_device_id,
      coalesce(p_primary_playlist_id::text, ''), coalesce(p_backup_playlist_id::text, ''))
  end;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('seller-device-flow:' || p_seller_id::text || ':' || v_idempotency_key, 0)
  );

  select operation.* into v_existing
    from public.panel_device_commercial_operations operation
   where operation.seller_id = p_seller_id
     and operation.idempotency_key = v_idempotency_key
   limit 1;
  if found then
    if v_existing.operation_fingerprint is distinct from v_fingerprint then
      raise exception using errcode = '23505', message = 'Chave de idempotência já utilizada em outra operação.';
    end if;
    return v_existing.result || pg_catalog.jsonb_build_object('applied', false, 'idempotentReplay', true);
  end if;

  select seller.* into v_seller
    from public.panel_sellers seller
   where seller.id = p_seller_id
     and seller.deleted_at is null
   for update;
  if not found or v_seller.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'Vendedor bloqueado, inativo ou não encontrado.';
  end if;

  select device.* into v_device
    from public.panel_devices device
   where device.id = p_device_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Aparelho não encontrado.';
  end if;
  if coalesce(v_device.is_playlist_validation_device, false) then
    raise exception using errcode = 'P0001', message = 'Este aparelho está reservado para diagnóstico administrativo.';
  end if;

  if v_operation = 'activation' then
    if v_device.seller_id is not null and v_device.seller_id <> p_seller_id then
      raise exception using errcode = 'P0001', message = 'Este aparelho pertence a outro vendedor.';
    end if;
    if v_device.status = 'active' then
      raise exception using errcode = 'P0001', message = 'O aparelho já está ativo. Use renovação.';
    end if;
  else
    if v_device.seller_id is distinct from p_seller_id then
      raise exception using errcode = 'P0001', message = 'Este aparelho não pertence ao vendedor informado.';
    end if;
    if v_device.status <> 'active' then
      raise exception using errcode = 'P0001', message = 'A operação exige um aparelho ativo.';
    end if;
  end if;

  select assignment.playlist_id into v_old_primary
    from public.panel_device_playlists assignment
   where assignment.device_id = p_device_id
     and assignment.priority = 1
     and assignment.active is true
   limit 1;
  v_old_primary := coalesce(v_old_primary, v_device.playlist_id);

  select assignment.playlist_id into v_old_backup
    from public.panel_device_playlists assignment
   where assignment.device_id = p_device_id
     and assignment.priority = 2
     and assignment.active is true
   limit 1;

  if v_operation = 'renewal' then
    if p_customer_id is not null or nullif(trim(coalesce(p_customer_name, '')), '') is not null
       or nullif(trim(coalesce(p_customer_whatsapp, '')), '') is not null
       or p_primary_playlist_id is not null or p_backup_playlist_id is not null then
      raise exception using errcode = '22023', message = 'Renovação altera somente plano, validade e crédito. Cliente e listas são preservados.';
    end if;
    v_primary_id := v_old_primary;
    v_backup_id := v_old_backup;
    if v_primary_id is null then
      raise exception using errcode = 'P0001', message = 'O aparelho ativo não possui lista principal. Corrija as listas antes de renovar.';
    end if;
  elsif v_operation = 'change_playlists' then
    if p_plan_id is not null or p_expires_at is not null or p_customer_id is not null
       or nullif(trim(coalesce(p_customer_name, '')), '') is not null
       or nullif(trim(coalesce(p_customer_whatsapp, '')), '') is not null then
      raise exception using errcode = '22023', message = 'Alterar listas não muda cliente, plano, validade ou crédito.';
    end if;
    v_primary_id := p_primary_playlist_id;
    v_backup_id := p_backup_playlist_id;
    if v_primary_id is null then
      raise exception using errcode = '22023', message = 'Lista principal é obrigatória.';
    end if;
  else
    v_primary_id := p_primary_playlist_id;
    v_backup_id := p_backup_playlist_id;
    if p_plan_id is null or v_primary_id is null then
      raise exception using errcode = '22023', message = 'Plano e lista principal são obrigatórios para ativar.';
    end if;
  end if;

  if v_backup_id is not null and v_backup_id = v_primary_id then
    raise exception using errcode = '22023', message = 'A lista reserva deve ser diferente da principal.';
  end if;

  if v_operation in ('activation', 'renewal') then
    select plan.* into v_plan
      from public.panel_plans plan
     where plan.id = p_plan_id
       and plan.status = 'active'
     for share;
    if not found then
      raise exception using errcode = 'P0001', message = 'Plano inexistente ou inativo.';
    end if;

    if v_operation = 'activation' then
      v_effective_expiry := coalesce(
        p_expires_at,
        pg_catalog.date_trunc('day', pg_catalog.now() + pg_catalog.make_interval(days => greatest(1, coalesce(v_plan.duration_days, 30))))
          + interval '1 day - 1 millisecond'
      );
      if v_effective_expiry <= pg_catalog.now() then
        raise exception using errcode = '22023', message = 'A validade da ativação precisa estar no futuro.';
      end if;
    else
      v_effective_expiry := coalesce(
        p_expires_at,
        pg_catalog.date_trunc(
          'day',
          greatest(pg_catalog.now(), coalesce(v_device.subscription_expires_at, pg_catalog.now()))
            + pg_catalog.make_interval(days => greatest(1, coalesce(v_plan.duration_days, 30)))
        ) + interval '1 day - 1 millisecond'
      );
      if v_effective_expiry <= greatest(pg_catalog.now(), coalesce(v_device.subscription_expires_at, pg_catalog.now())) then
        raise exception using errcode = '22023', message = 'A renovação precisa ampliar a validade atual.';
      end if;
    end if;
  end if;

  for v_lock_playlist_id in
    select distinct requested.playlist_id
      from pg_catalog.unnest(array[v_primary_id, v_backup_id]) as requested(playlist_id)
     where requested.playlist_id is not null
     order by requested.playlist_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('panel-playlist:' || v_lock_playlist_id::text, 0)
    );
    if not exists (
      select 1 from public.panel_seller_playlists permission
       where permission.seller_id = p_seller_id
         and permission.playlist_id = v_lock_playlist_id
         and permission.active is true
    ) then
      raise exception using errcode = 'P0001', message = 'Lista não liberada para este vendedor.';
    end if;
    perform public.assert_playlist_commercially_usable_for_device(
      v_lock_playlist_id,
      p_device_id,
      case when v_lock_playlist_id = v_backup_id then 'Lista reserva' else 'Lista principal' end
    );
  end loop;

  if v_operation = 'activation' then
    if p_customer_id is not null then
      select customer.* into v_customer
        from public.panel_customers customer
       where customer.id = p_customer_id
         and customer.seller_id = p_seller_id
       for update;
      if not found then
        raise exception using errcode = 'P0001', message = 'Cliente não pertence a este vendedor.';
      end if;
      v_customer_name := v_customer.name;
    else
      if v_customer_name is null or length(v_customer_whatsapp) < 10 or length(v_customer_whatsapp) > 15 then
        raise exception using errcode = '22023', message = 'Informe nome e WhatsApp válidos para o cliente.';
      end if;
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('seller-customer:' || p_seller_id::text || ':' || v_customer_whatsapp, 0)
      );
      select customer.* into v_customer
        from public.panel_customers customer
       where customer.seller_id = p_seller_id
         and pg_catalog.regexp_replace(coalesce(customer.whatsapp, ''), '[^0-9]', '', 'g') = v_customer_whatsapp
       limit 1
       for update;
      if found then
        update public.panel_customers
           set name = v_customer_name,
               whatsapp = v_customer_whatsapp,
               status = 'active',
               updated_at = pg_catalog.now()
         where id = v_customer.id
         returning * into v_customer;
      else
        insert into public.panel_customers(seller_id, name, whatsapp, status, updated_at)
        values(p_seller_id, v_customer_name, v_customer_whatsapp, 'active', pg_catalog.now())
        returning * into v_customer;
      end if;
    end if;
  end if;

  if v_operation in ('activation', 'renewal') then
    select * into v_subscription
      from public.apply_device_subscription_transaction(
        p_seller_id,
        p_device_id,
        p_plan_id,
        v_primary_id,
        v_effective_expiry,
        v_operation,
        v_performed_by,
        v_idempotency_key,
        case when v_operation = 'activation' then v_customer.id else v_device.customer_id end,
        case when v_operation = 'activation' then v_customer_name else v_device.client_name end,
        true
      );

    if v_operation = 'activation' then
      insert into public.panel_device_playlists(
        device_id, playlist_id, priority, active, consecutive_failures,
        last_success_at, last_failure_at, cooldown_until, last_error, updated_at
      ) values(
        p_device_id, v_primary_id, 1, true, 0,
        null, null, null, null, pg_catalog.now()
      ) on conflict on constraint panel_device_playlists_device_id_priority_key do update
        set playlist_id = excluded.playlist_id,
            active = true,
            consecutive_failures = 0,
            last_success_at = null,
            last_failure_at = null,
            cooldown_until = null,
            last_error = null,
            updated_at = pg_catalog.now();

      if v_backup_id is null then
        delete from public.panel_device_playlists where device_id = p_device_id and priority = 2;
      else
        insert into public.panel_device_playlists(
          device_id, playlist_id, priority, active, consecutive_failures,
          last_success_at, last_failure_at, cooldown_until, last_error, updated_at
        ) values(
          p_device_id, v_backup_id, 2, true, 0,
          null, null, null, null, pg_catalog.now()
        ) on conflict on constraint panel_device_playlists_device_id_priority_key do update
          set playlist_id = excluded.playlist_id,
              active = true,
              consecutive_failures = 0,
              last_success_at = null,
              last_failure_at = null,
              cooldown_until = null,
              last_error = null,
              updated_at = pg_catalog.now();
      end if;
    end if;

    select price.default_sale_price_cents into v_sale_price
      from public.panel_seller_plan_prices price
     where price.seller_id = p_seller_id
       and price.plan_id = p_plan_id
       and price.active is true
     limit 1;

    if coalesce(v_sale_price, 0) > 0 then
      v_created_by_role := case
        when v_performed_by like 'seller:%' then 'seller'
        when v_performed_by like 'admin:%' or v_performed_by like 'owner:%' then 'admin'
        else 'system'
      end;
      v_finance_fingerprint := concat_ws('|', 'seller-device-flow-finance-v2', v_operation,
        p_device_id, p_seller_id, p_plan_id, v_sale_price);

      select record.* into v_existing_finance
        from public.panel_financial_records record
       where record.seller_id = p_seller_id
         and record.idempotency_key = v_idempotency_key
       limit 1;
      if found then
        if v_existing_finance.operation_fingerprint is distinct from v_finance_fingerprint then
          raise exception using errcode = '23505', message = 'Chave de idempotência financeira já utilizada em outra operação.';
        end if;
        v_finance_id := v_existing_finance.id;
      else
        insert into public.panel_financial_records(
          record_type, source, category, seller_id, customer_id, device_id, plan_id,
          seller_name_snapshot, customer_name_snapshot, device_code_snapshot, plan_name_snapshot,
          description, amount_cents, payment_method, status, reference_date,
          idempotency_key, operation_fingerprint, created_by_user_id, created_by_role, financial_scope
        ) values(
          'income',
          case when v_operation = 'activation' then 'device_activation' else 'device_renewal' end,
          'subscription_sale',
          p_seller_id,
          case when v_operation = 'activation' then v_customer.id else v_device.customer_id end,
          p_device_id,
          p_plan_id,
          v_seller.name,
          case when v_operation = 'activation' then v_customer_name else v_device.client_name end,
          v_device.device_code,
          v_plan.name,
          pg_catalog.format('%s do aparelho %s — plano %s',
            case when v_operation = 'activation' then 'Ativação' else 'Renovação' end,
            coalesce(v_device.device_code, p_device_id::text), v_plan.name),
          v_sale_price,
          'pix',
          'pending',
          current_date,
          v_idempotency_key,
          v_finance_fingerprint,
          p_performed_by_user_id,
          v_created_by_role,
          'seller_private'
        ) returning id into v_finance_id;
      end if;
    end if;

    select playlist.playlist_qualification_status into v_primary_status
      from public.panel_playlists playlist where playlist.id = v_primary_id;
    if v_backup_id is not null then
      select playlist.playlist_qualification_status into v_backup_status
        from public.panel_playlists playlist where playlist.id = v_backup_id;
    end if;
    v_confirmation_status := case
      when v_primary_status in ('ready_cache', 'ready_direct')
       and coalesce(v_backup_status, 'ready_cache') in ('ready_cache', 'ready_direct') then 'confirmed'
      else 'awaiting_app_confirmation'
    end;

    insert into public.panel_audit_logs(action, entity_type, entity_id, description, metadata)
    values(
      case when v_operation = 'activation' then 'device.activated_canonical' else 'device.renewed_canonical' end,
      'device',
      p_device_id,
      case when v_operation = 'activation'
        then 'Aparelho ativado pelo fluxo comercial canônico.'
        else 'Aparelho renovado pelo fluxo comercial canônico; cliente e listas preservados.' end,
      pg_catalog.jsonb_build_object(
        'sellerId', p_seller_id,
        'planId', p_plan_id,
        'customerId', case when v_operation = 'activation' then v_customer.id else v_device.customer_id end,
        'primaryPlaylistId', v_primary_id,
        'backupPlaylistId', v_backup_id,
        'expiresAt', v_effective_expiry,
        'ledgerId', v_subscription.ledger_id,
        'financeRecordId', v_finance_id,
        'performedBy', v_performed_by,
        'performedByUserId', p_performed_by_user_id
      )
    );

    v_result := pg_catalog.jsonb_build_object(
      'applied', coalesce(v_subscription.applied, true),
      'operationType', v_operation,
      'deviceId', p_device_id,
      'deviceCode', v_device.device_code,
      'sellerId', p_seller_id,
      'customerId', case when v_operation = 'activation' then v_customer.id else v_device.customer_id end,
      'planId', p_plan_id,
      'primaryPlaylistId', v_primary_id,
      'backupPlaylistId', v_backup_id,
      'expiresAt', v_effective_expiry,
      'ledgerId', v_subscription.ledger_id,
      'financeRecordId', v_finance_id,
      'balanceBefore', v_subscription.balance_before,
      'balanceAfter', v_subscription.balance_after,
      'confirmationStatus', v_confirmation_status
    );
  else
    update public.panel_devices
       set playlist_id = v_primary_id,
           updated_at = pg_catalog.now()
     where id = p_device_id;

    insert into public.panel_device_playlists(
      device_id, playlist_id, priority, active, consecutive_failures,
      last_success_at, last_failure_at, cooldown_until, last_error, updated_at
    ) values(
      p_device_id, v_primary_id, 1, true, 0,
      null, null, null, null, pg_catalog.now()
    ) on conflict on constraint panel_device_playlists_device_id_priority_key do update
      set playlist_id = excluded.playlist_id,
          active = true,
          consecutive_failures = 0,
          last_success_at = null,
          last_failure_at = null,
          cooldown_until = null,
          last_error = null,
          updated_at = pg_catalog.now();

    if v_backup_id is null then
      delete from public.panel_device_playlists where device_id = p_device_id and priority = 2;
    else
      insert into public.panel_device_playlists(
        device_id, playlist_id, priority, active, consecutive_failures,
        last_success_at, last_failure_at, cooldown_until, last_error, updated_at
      ) values(
        p_device_id, v_backup_id, 2, true, 0,
        null, null, null, null, pg_catalog.now()
      ) on conflict on constraint panel_device_playlists_device_id_priority_key do update
        set playlist_id = excluded.playlist_id,
            active = true,
            consecutive_failures = 0,
            last_success_at = null,
            last_failure_at = null,
            cooldown_until = null,
            last_error = null,
            updated_at = pg_catalog.now();
    end if;

    if v_old_primary is distinct from v_primary_id then
      insert into public.panel_device_playlist_revisions(
        device_id, seller_id, priority, previous_playlist_id, new_playlist_id,
        reason, performed_by, performed_by_user_id
      ) values(
        p_device_id, p_seller_id, 1, v_old_primary, v_primary_id,
        coalesce(v_reason, 'Alteração da lista principal pelo fluxo comercial canônico'),
        v_performed_by, p_performed_by_user_id
      );
    end if;
    if v_old_backup is distinct from v_backup_id then
      insert into public.panel_device_playlist_revisions(
        device_id, seller_id, priority, previous_playlist_id, new_playlist_id,
        reason, performed_by, performed_by_user_id
      ) values(
        p_device_id, p_seller_id, 2, v_old_backup, v_backup_id,
        coalesce(v_reason, 'Alteração da lista reserva pelo fluxo comercial canônico'),
        v_performed_by, p_performed_by_user_id
      );
    end if;

    select playlist.playlist_qualification_status into v_primary_status
      from public.panel_playlists playlist where playlist.id = v_primary_id;
    if v_backup_id is not null then
      select playlist.playlist_qualification_status into v_backup_status
        from public.panel_playlists playlist where playlist.id = v_backup_id;
    end if;
    v_confirmation_status := case
      when v_primary_status in ('ready_cache', 'ready_direct')
       and coalesce(v_backup_status, 'ready_cache') in ('ready_cache', 'ready_direct') then 'confirmed'
      else 'awaiting_app_confirmation'
    end;

    insert into public.panel_audit_logs(action, entity_type, entity_id, description, metadata)
    values(
      'device.playlists_changed_canonical',
      'device',
      p_device_id,
      'Listas alteradas pelo fluxo comercial canônico sem crédito, plano ou validade.',
      pg_catalog.jsonb_build_object(
        'sellerId', p_seller_id,
        'oldPrimaryPlaylistId', v_old_primary,
        'newPrimaryPlaylistId', v_primary_id,
        'oldBackupPlaylistId', v_old_backup,
        'newBackupPlaylistId', v_backup_id,
        'reason', v_reason,
        'performedBy', v_performed_by,
        'performedByUserId', p_performed_by_user_id
      )
    );

    v_result := pg_catalog.jsonb_build_object(
      'applied', true,
      'operationType', v_operation,
      'deviceId', p_device_id,
      'deviceCode', v_device.device_code,
      'sellerId', p_seller_id,
      'customerId', v_device.customer_id,
      'planId', v_device.plan_id,
      'primaryPlaylistId', v_primary_id,
      'backupPlaylistId', v_backup_id,
      'expiresAt', v_device.subscription_expires_at,
      'ledgerId', null,
      'financeRecordId', null,
      'balanceBefore', v_seller.credit_balance,
      'balanceAfter', v_seller.credit_balance,
      'confirmationStatus', v_confirmation_status
    );
  end if;

  insert into public.panel_device_commercial_operations(
    seller_id, device_id, operation_type, idempotency_key,
    operation_fingerprint, result, performed_by, performed_by_user_id
  ) values(
    p_seller_id, p_device_id, v_operation, v_idempotency_key,
    v_fingerprint, v_result, v_performed_by, p_performed_by_user_id
  );

  return v_result;
end;
$$;

revoke all on function public.seller_device_flow_transaction(
  uuid,uuid,text,text,uuid,uuid,uuid,timestamptz,uuid,text,text,text,text,uuid
) from public, anon, authenticated;
grant execute on function public.seller_device_flow_transaction(
  uuid,uuid,text,text,uuid,uuid,uuid,timestamptz,uuid,text,text,text,text,uuid
) to service_role;
