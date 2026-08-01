-- Consolida as operações comerciais que ainda eram compostas no Edge Runtime.
-- Cada RPC abaixo executa em uma única transação Postgres e usa a mesma trava
-- consultiva por playlist para serializar ativação, troca, remoção e exclusão.

create or replace function public.apply_device_subscription_complete_transaction(
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
  p_enforce_seller_ownership boolean default true
)
returns table (
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
declare
  v_subscription record;
  v_lock_playlist_id uuid;
begin
  if p_backup_playlist_id is not null and p_backup_playlist_id = p_playlist_id then
    raise exception using errcode = '22023', message = 'A lista reserva precisa ser diferente da lista principal.';
  end if;

  for v_lock_playlist_id in
    select distinct playlist_id
    from unnest(array[p_playlist_id, p_backup_playlist_id]) as requested(playlist_id)
    where playlist_id is not null
    order by playlist_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('panel-playlist:' || v_lock_playlist_id::text, 0)
    );
  end loop;

  select *
    into v_subscription
    from public.apply_device_subscription_with_finance(
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
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      'system'
    );

  return query
  select
    v_subscription.applied,
    v_subscription.ledger_id,
    v_subscription.balance_before,
    v_subscription.balance_after,
    v_subscription.device_status,
    v_subscription.subscription_expires_at;
end;
$$;

create or replace function public.set_device_playlists_transaction(
  p_device_id uuid,
  p_primary_playlist_id uuid,
  p_backup_playlist_id uuid,
  p_seller_id uuid default null,
  p_enforce_seller_ownership boolean default false
)
returns table (
  applied boolean,
  primary_playlist_id uuid,
  backup_playlist_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device public.panel_devices%rowtype;
  v_seller public.panel_sellers%rowtype;
  v_playlist public.panel_playlists%rowtype;
  v_lock_playlist_id uuid;
begin
  if p_backup_playlist_id is not null and p_primary_playlist_id is null then
    raise exception using errcode = '22023', message = 'Uma lista reserva exige uma lista principal.';
  end if;
  if p_backup_playlist_id is not null and p_backup_playlist_id = p_primary_playlist_id then
    raise exception using errcode = '22023', message = 'A lista reserva precisa ser diferente da lista principal.';
  end if;
  if p_enforce_seller_ownership and p_seller_id is null then
    raise exception using errcode = '22023', message = 'Vendedor é obrigatório para validar a propriedade.';
  end if;

  for v_lock_playlist_id in
    select distinct playlist_id
    from unnest(array[p_primary_playlist_id, p_backup_playlist_id]) as requested(playlist_id)
    where playlist_id is not null
    order by playlist_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('panel-playlist:' || v_lock_playlist_id::text, 0)
    );
  end loop;

  if p_enforce_seller_ownership then
    select *
      into v_seller
      from public.panel_sellers seller
     where seller.id = p_seller_id
     for update;
    if not found or v_seller.status <> 'active' then
      raise exception using errcode = 'P0001', message = 'Vendedor inexistente, bloqueado ou inativo.';
    end if;
  end if;

  select *
    into v_device
    from public.panel_devices device
   where device.id = p_device_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Aparelho não encontrado.';
  end if;
  if p_enforce_seller_ownership and v_device.seller_id is distinct from p_seller_id then
    raise exception using errcode = 'P0001', message = 'Este aparelho não pertence ao vendedor.';
  end if;

  for v_lock_playlist_id in
    select distinct playlist_id
    from unnest(array[p_primary_playlist_id, p_backup_playlist_id]) as requested(playlist_id)
    where playlist_id is not null
    order by playlist_id
  loop
    select *
      into v_playlist
      from public.panel_playlists playlist
     where playlist.id = v_lock_playlist_id
     for share;
    if not found or v_playlist.active is not true then
      raise exception using errcode = 'P0001', message = 'Lista inexistente ou inativa.';
    end if;

    if p_enforce_seller_ownership and not exists (
      select 1
        from public.panel_seller_playlists permission
       where permission.seller_id = p_seller_id
         and permission.playlist_id = v_lock_playlist_id
         and permission.active is true
    ) then
      raise exception using errcode = 'P0001', message = 'Lista não liberada para este vendedor.';
    end if;
  end loop;

  update public.panel_devices device
     set playlist_id = p_primary_playlist_id,
         updated_at = pg_catalog.now()
   where device.id = p_device_id;

  delete from public.panel_device_playlists assignment
   where assignment.device_id = p_device_id
     and assignment.priority = 2;

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
      pg_catalog.now()
    );
  end if;

  return query select true, p_primary_playlist_id, p_backup_playlist_id;
end;
$$;

create or replace function public.remove_seller_playlist_transaction(
  p_seller_id uuid,
  p_playlist_id uuid
)
returns table (
  removed boolean,
  devices_count integer,
  device_codes text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seller public.panel_sellers%rowtype;
  v_permission public.panel_seller_playlists%rowtype;
  v_devices_count integer := 0;
  v_device_codes text[] := array[]::text[];
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('panel-playlist:' || p_playlist_id::text, 0)
  );

  select *
    into v_seller
    from public.panel_sellers seller
   where seller.id = p_seller_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Vendedor não encontrado.';
  end if;

  select *
    into v_permission
    from public.panel_seller_playlists permission
   where permission.seller_id = p_seller_id
     and permission.playlist_id = p_playlist_id
     and permission.active is true
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Esta lista não pertence a este vendedor.';
  end if;

  perform 1
    from public.panel_devices device
   where device.seller_id = p_seller_id
   order by device.id
   for update;

  select
    pg_catalog.count(distinct device.id)::integer,
    coalesce(
      pg_catalog.array_agg(distinct device.device_code order by device.device_code)
        filter (where device.device_code is not null),
      array[]::text[]
    )
    into v_devices_count, v_device_codes
    from public.panel_devices device
   where device.seller_id = p_seller_id
     and (
       device.playlist_id = p_playlist_id
       or exists (
         select 1
           from public.panel_device_playlists assignment
          where assignment.device_id = device.id
            and assignment.playlist_id = p_playlist_id
            and assignment.active is true
       )
     );

  if v_devices_count > 0 then
    return query select false, v_devices_count, v_device_codes;
    return;
  end if;

  delete from public.panel_seller_playlists permission
   where permission.id = v_permission.id;

  return query select true, 0, array[]::text[];
end;
$$;

create or replace function public.delete_playlist_with_reassignment(
  p_playlist_id uuid
)
returns table (
  deleted boolean,
  devices_reassigned integer,
  subscriptions_reassigned integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_playlist public.panel_playlists%rowtype;
  v_device record;
  v_subscription record;
  v_has_subscription_domain boolean;
  v_devices_reassigned integer := 0;
  v_subscriptions_reassigned integer := 0;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('panel-playlist:' || p_playlist_id::text, 0)
  );

  select *
    into v_playlist
    from public.panel_playlists playlist
   where playlist.id = p_playlist_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Lista não encontrada.';
  end if;

  -- Instalações legadas ainda podem operar somente com os vínculos por aparelho.
  -- O domínio de assinaturas é opcional e não deve ser criado implicitamente por
  -- esta migration de consistência comercial.
  v_has_subscription_domain :=
    pg_catalog.to_regclass('public.panel_subscriptions') is not null
    and pg_catalog.to_regclass('public.panel_subscription_playlists') is not null;

  perform 1
    from public.panel_devices device
   where device.playlist_id = p_playlist_id
      or exists (
        select 1
          from public.panel_device_playlists assignment
         where assignment.device_id = device.id
           and assignment.playlist_id = p_playlist_id
      )
   order by device.id
   for update;

  if v_has_subscription_domain then
    perform 1
      from public.panel_subscriptions subscription
     where exists (
       select 1
         from public.panel_subscription_playlists assignment
        where assignment.subscription_id = subscription.id
          and assignment.playlist_id = p_playlist_id
     )
     order by subscription.id
     for update;

    if exists (
      select 1
        from public.panel_subscription_playlists primary_assignment
       where primary_assignment.playlist_id = p_playlist_id
         and primary_assignment.priority = 1
         and primary_assignment.active is true
         and not exists (
           select 1
             from public.panel_subscription_playlists backup_assignment
            where backup_assignment.subscription_id = primary_assignment.subscription_id
              and backup_assignment.priority = 2
              and backup_assignment.active is true
         )
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'A lista é principal de uma assinatura sem reserva e não pode ser excluída.';
    end if;
  end if;

  for v_device in
    select
      device.id,
      backup_assignment.playlist_id as backup_playlist_id
    from public.panel_devices device
    left join public.panel_device_playlists backup_assignment
      on backup_assignment.device_id = device.id
     and backup_assignment.priority = 2
     and backup_assignment.active is true
     and backup_assignment.playlist_id <> p_playlist_id
   where device.playlist_id = p_playlist_id
      or exists (
        select 1
          from public.panel_device_playlists primary_assignment
         where primary_assignment.device_id = device.id
           and primary_assignment.playlist_id = p_playlist_id
           and primary_assignment.priority = 1
           and primary_assignment.active is true
      )
   order by device.id
  loop
    update public.panel_devices device
       set playlist_id = v_device.backup_playlist_id,
           updated_at = pg_catalog.now()
     where device.id = v_device.id;
    v_devices_reassigned := v_devices_reassigned + 1;
  end loop;

  if v_has_subscription_domain then
    for v_subscription in
      select
        primary_assignment.subscription_id,
        backup_assignment.id as backup_assignment_id
      from public.panel_subscription_playlists primary_assignment
      join public.panel_subscription_playlists backup_assignment
        on backup_assignment.subscription_id = primary_assignment.subscription_id
       and backup_assignment.priority = 2
       and backup_assignment.active is true
     where primary_assignment.playlist_id = p_playlist_id
       and primary_assignment.priority = 1
       and primary_assignment.active is true
     order by primary_assignment.subscription_id
    loop
      update public.panel_subscription_playlists assignment
         set active = false,
             archived_at = pg_catalog.now(),
             archived_reason = 'playlist_deleted',
             updated_at = pg_catalog.now()
       where assignment.subscription_id = v_subscription.subscription_id
         and assignment.playlist_id = p_playlist_id
         and assignment.active is true;

      update public.panel_subscription_playlists assignment
         set priority = 1,
             updated_at = pg_catalog.now()
       where assignment.id = v_subscription.backup_assignment_id;

      v_subscriptions_reassigned := v_subscriptions_reassigned + 1;
    end loop;

    delete from public.panel_subscription_playlists assignment
     where assignment.playlist_id = p_playlist_id;
  end if;

  delete from public.panel_playlists playlist
   where playlist.id = p_playlist_id;

  return query select true, v_devices_reassigned, v_subscriptions_reassigned;
end;
$$;

-- O fluxo financeiro e o domínio de assinaturas já chamavam uma função única.
-- Esta substituição acrescenta a mesma trava por playlist antes do código legado,
-- impedindo corrida com exclusão sem alterar o contrato público da RPC.
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
set search_path = ''
as $$
declare
  v_stable_paid_at timestamptz;
  v_lock_playlist_id uuid;
  v_existing_ledger_id uuid;
  v_current_backup_playlist_id uuid;
begin
  for v_lock_playlist_id in
    select distinct playlist_id
    from unnest(array[p_playlist_id, p_backup_playlist_id]) as requested(playlist_id)
    where playlist_id is not null
    order by playlist_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('panel-playlist:' || v_lock_playlist_id::text, 0)
    );
  end loop;

  select ledger.id
    into v_existing_ledger_id
    from public.panel_credit_ledger ledger
   where ledger.seller_id = p_seller_id
     and ledger.idempotency_key = nullif(pg_catalog.btrim(coalesce(p_idempotency_key, '')), '')
   limit 1;

  if found then
    select assignment.playlist_id
      into v_current_backup_playlist_id
      from public.panel_device_playlists assignment
     where assignment.device_id = p_device_id
       and assignment.priority = 2
       and assignment.active is true
     limit 1;

    if v_current_backup_playlist_id is distinct from p_backup_playlist_id then
      raise exception using
        errcode = '23505',
        message = 'Chave de idempotência já utilizada com outra lista reserva.';
    end if;
  end if;

  if p_finance_amount_cents is not null
     and p_finance_amount_cents > 0
     and pg_catalog.lower(pg_catalog.btrim(coalesce(p_finance_status, 'pending'))) = 'paid' then
    select record.paid_at
      into v_stable_paid_at
      from public.panel_financial_records record
     where record.seller_id = p_seller_id
       and record.idempotency_key = nullif(pg_catalog.btrim(coalesce(p_idempotency_key, '')), '')
     limit 1;

    v_stable_paid_at := coalesce(v_stable_paid_at, p_paid_at, pg_catalog.now());
  else
    v_stable_paid_at := p_paid_at;
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

revoke all on function public.apply_device_subscription_complete_transaction(
  uuid, uuid, uuid, uuid, uuid, timestamptz, text, text, text, uuid, text, boolean
) from public, anon, authenticated;
revoke all on function public.set_device_playlists_transaction(
  uuid, uuid, uuid, uuid, boolean
) from public, anon, authenticated;
revoke all on function public.remove_seller_playlist_transaction(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.delete_playlist_with_reassignment(uuid)
  from public, anon, authenticated;
revoke all on function public.apply_device_subscription_with_finance(
  uuid, uuid, uuid, uuid, uuid, timestamptz, text, text, text, uuid, text,
  boolean, bigint, text, text, date, timestamptz, text, text, uuid, text
) from public, anon, authenticated;

grant execute on function public.apply_device_subscription_complete_transaction(
  uuid, uuid, uuid, uuid, uuid, timestamptz, text, text, text, uuid, text, boolean
) to service_role;
grant execute on function public.set_device_playlists_transaction(
  uuid, uuid, uuid, uuid, boolean
) to service_role;
grant execute on function public.remove_seller_playlist_transaction(uuid, uuid)
  to service_role;
grant execute on function public.delete_playlist_with_reassignment(uuid)
  to service_role;
grant execute on function public.apply_device_subscription_with_finance(
  uuid, uuid, uuid, uuid, uuid, timestamptz, text, text, text, uuid, text,
  boolean, bigint, text, text, date, timestamptz, text, text, uuid, text
) to service_role;

comment on function public.apply_device_subscription_complete_transaction(
  uuid, uuid, uuid, uuid, uuid, timestamptz, text, text, text, uuid, text, boolean
) is 'Ativa ou renova, debita um único lote lógico e grava principal/reserva na mesma transação idempotente.';
comment on function public.set_device_playlists_transaction(uuid, uuid, uuid, uuid, boolean)
  is 'Troca o par principal/reserva de um aparelho sem janela intermediária entre delete e insert.';
comment on function public.remove_seller_playlist_transaction(uuid, uuid)
  is 'Remove a permissão da lista somente se nenhum aparelho do vendedor a utiliza no instante serializado.';
comment on function public.delete_playlist_with_reassignment(uuid)
  is 'Exclui uma lista globalmente e promove reservas de aparelhos/assinaturas na mesma transação.';
