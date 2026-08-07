-- Lote 4: dados de UX da ativação sem quebrar a transação canônica do Lote 2.

alter table public.panel_customers
  add column if not exists notes text;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'panel_customers_notes_length_check'
       and conrelid = 'public.panel_customers'::regclass
  ) then
    alter table public.panel_customers
      add constraint panel_customers_notes_length_check
      check (notes is null or char_length(notes) <= 1000);
  end if;
end
$$;

create or replace function public.seller_device_flow_transaction_v4(
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
  p_customer_notes text default null,
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
  v_operation text := lower(trim(coalesce(p_operation_type, '')));
  v_notes text := nullif(trim(coalesce(p_customer_notes, '')), '');
  v_effective_expiry timestamptz := p_expires_at;
  v_plan_days integer;
  v_baseline timestamptz;
  v_target_date date;
  v_result jsonb;
  v_customer_id uuid;
begin
  if v_notes is not null and char_length(v_notes) > 1000 then
    raise exception using errcode = '22023', message = 'A observação do cliente deve ter no máximo 1000 caracteres.';
  end if;

  if v_operation <> 'activation' and v_notes is not null then
    raise exception using errcode = '22023', message = 'Renovação e troca de listas não alteram a observação do cliente.';
  end if;

  -- Compatibilidade com formulários antigos que transformavam uma data sem hora
  -- em 23:59:59.999 UTC. A intenção sempre foi "fim daquele dia no Brasil".
  if v_operation in ('activation', 'renewal')
     and v_effective_expiry is not null
     and to_char(v_effective_expiry at time zone 'UTC', 'HH24:MI:SS.MS') = '23:59:59.999' then
    v_target_date := (v_effective_expiry at time zone 'UTC')::date;
    v_effective_expiry := (
      ((v_target_date + 1)::timestamp at time zone 'America/Sao_Paulo')
      - interval '1 millisecond'
    );
  end if;

  if v_operation in ('activation', 'renewal') and v_effective_expiry is null then
    select greatest(1, coalesce(plan.duration_days, 30))
      into v_plan_days
      from public.panel_plans plan
     where plan.id = p_plan_id
       and plan.status = 'active';

    if not found then
      raise exception using errcode = 'P0001', message = 'Plano inexistente ou inativo.';
    end if;

    if v_operation = 'activation' then
      v_target_date := (pg_catalog.now() at time zone 'America/Sao_Paulo')::date + v_plan_days;
    else
      select greatest(
        pg_catalog.now(),
        coalesce(device.subscription_expires_at, pg_catalog.now())
      )
        into v_baseline
        from public.panel_devices device
       where device.id = p_device_id;

      if not found then
        raise exception using errcode = 'P0002', message = 'Aparelho não encontrado.';
      end if;

      v_target_date := (v_baseline at time zone 'America/Sao_Paulo')::date + v_plan_days;
    end if;

    v_effective_expiry := (
      ((v_target_date + 1)::timestamp at time zone 'America/Sao_Paulo')
      - interval '1 millisecond'
    );
  end if;

  v_result := public.seller_device_flow_transaction(
    p_seller_id => p_seller_id,
    p_device_id => p_device_id,
    p_operation_type => p_operation_type,
    p_idempotency_key => p_idempotency_key,
    p_plan_id => p_plan_id,
    p_primary_playlist_id => p_primary_playlist_id,
    p_backup_playlist_id => p_backup_playlist_id,
    p_expires_at => v_effective_expiry,
    p_customer_id => p_customer_id,
    p_customer_name => p_customer_name,
    p_customer_whatsapp => p_customer_whatsapp,
    p_reason => p_reason,
    p_performed_by => p_performed_by,
    p_performed_by_user_id => p_performed_by_user_id
  );

  if v_operation = 'activation' and v_notes is not null then
    v_customer_id := nullif(v_result ->> 'customerId', '')::uuid;
    if v_customer_id is not null then
      update public.panel_customers
         set notes = v_notes,
             updated_at = pg_catalog.now()
       where id = v_customer_id
         and seller_id = p_seller_id;
    end if;
  end if;

  return v_result || pg_catalog.jsonb_build_object(
    'timeZone', 'America/Sao_Paulo',
    'expiresAt', coalesce(v_result -> 'expiresAt', to_jsonb(v_effective_expiry)),
    'customerNotesSaved', v_operation = 'activation' and v_notes is not null
  );
end;
$$;

revoke all on function public.seller_device_flow_transaction_v4(
  uuid,uuid,text,text,uuid,uuid,uuid,timestamptz,uuid,text,text,text,text,text,uuid
) from public, anon, authenticated;

grant execute on function public.seller_device_flow_transaction_v4(
  uuid,uuid,text,text,uuid,uuid,uuid,timestamptz,uuid,text,text,text,text,text,uuid
) to service_role;

notify pgrst, 'reload schema';
