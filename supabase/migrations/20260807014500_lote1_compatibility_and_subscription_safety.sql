-- Compatibiliza o Lote 1 com as garantias de segurança e consistência já existentes.

create or replace function public.redact_sensitive_text(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value is null then null
    else pg_catalog.regexp_replace(
      pg_catalog.regexp_replace(
        p_value,
        '([a-z][a-z0-9+.-]*://)[^[:space:]"''<>]+',
        '[URL protegida]',
        'gi'
      ),
      '((username|user|password|passwd|pass|token|access_token|authorization|credential|secret|api_key)[[:space:]]*=[[:space:]]*)[^[:space:]&;,"''}]+',
      E'\\1[protegido]',
      'gi'
    )
  end;
$$;

create or replace function public.redact_sensitive_jsonb(p_value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_type text;
  v_result jsonb;
begin
  if p_value is null then
    return '{}'::jsonb;
  end if;

  v_type := pg_catalog.jsonb_typeof(p_value);

  if v_type = 'object' then
    select coalesce(
      pg_catalog.jsonb_object_agg(
        entry.key,
        case
          when pg_catalog.lower(entry.key) ~ '(^|_)(password|passwd|pass|secret|token|access_token|authorization|credential|private_key|api_key|username|user_name|login|playlist_url|playlisturl|source_url)($|_)'
            then '"[protegido]"'::jsonb
          else public.redact_sensitive_jsonb(entry.value)
        end
      ),
      '{}'::jsonb
    )
      into v_result
      from pg_catalog.jsonb_each(p_value) as entry;
    return v_result;
  end if;

  if v_type = 'array' then
    select coalesce(pg_catalog.jsonb_agg(public.redact_sensitive_jsonb(item.value)), '[]'::jsonb)
      into v_result
      from pg_catalog.jsonb_array_elements(p_value) as item;
    return v_result;
  end if;

  if v_type = 'string' then
    return pg_catalog.to_jsonb(public.redact_sensitive_text(p_value #>> '{}'));
  end if;

  return p_value;
end;
$$;

create or replace function public.audit_sanitize_text(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select public.redact_sensitive_text(p_value);
$$;

create or replace function public.audit_sanitize_jsonb(p_value jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select public.redact_sensitive_jsonb(p_value);
$$;

create or replace function public.sanitize_panel_audit_log()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.description := public.redact_sensitive_text(new.description);
  new.metadata := public.redact_sensitive_jsonb(coalesce(new.metadata, '{}'::jsonb));
  return new;
end;
$$;

drop trigger if exists panel_audit_logs_sanitize_sensitive_data on public.panel_audit_logs;
drop trigger if exists sanitize_panel_audit_log_trigger on public.panel_audit_logs;
create trigger sanitize_panel_audit_log_trigger
before insert or update of description, metadata on public.panel_audit_logs
for each row execute function public.sanitize_panel_audit_log();

update public.panel_audit_logs
   set description = public.redact_sensitive_text(description),
       metadata = public.redact_sensitive_jsonb(coalesce(metadata, '{}'::jsonb));

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
  v_result record;
  v_lock_playlist_id uuid;
begin
  if p_backup_playlist_id is not null and p_backup_playlist_id = p_playlist_id then
    raise exception using errcode = '22023', message = 'A lista reserva precisa ser diferente da lista principal.';
  end if;

  for v_lock_playlist_id in
    select distinct requested.playlist_id
      from pg_catalog.unnest(array[p_playlist_id, p_backup_playlist_id]) as requested(playlist_id)
     where requested.playlist_id is not null
     order by requested.playlist_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('panel-playlist:' || v_lock_playlist_id::text, 0)
    );
  end loop;

  select * into v_result
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

  return query select
    v_result.applied,
    v_result.ledger_id,
    v_result.balance_before,
    v_result.balance_after,
    v_result.device_status,
    v_result.subscription_expires_at;
end;
$$;

create or replace function public.delete_playlist_with_reassignment(p_playlist_id uuid)
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
  v_blocking_devices text[];
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('panel-playlist:' || p_playlist_id::text, 0)
  );

  select * into v_playlist
    from public.panel_playlists playlist
   where playlist.id = p_playlist_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Lista não encontrada.';
  end if;

  v_has_subscription_domain :=
    pg_catalog.to_regclass('public.panel_subscriptions') is not null
    and pg_catalog.to_regclass('public.panel_subscription_playlists') is not null;

  perform 1
    from public.panel_devices device
   where device.playlist_id = p_playlist_id
      or exists (
        select 1 from public.panel_device_playlists assignment
         where assignment.device_id = device.id
           and assignment.playlist_id = p_playlist_id
      )
   order by device.id
   for update;

  select coalesce(pg_catalog.array_agg(device.device_code order by device.device_code), array[]::text[])
    into v_blocking_devices
    from public.panel_devices device
   where device.status = 'active'
     and (
       device.playlist_id = p_playlist_id
       or exists (
         select 1 from public.panel_device_playlists primary_assignment
          where primary_assignment.device_id = device.id
            and primary_assignment.playlist_id = p_playlist_id
            and primary_assignment.priority = 1
            and primary_assignment.active is true
       )
     )
     and not exists (
       select 1
         from public.panel_device_playlists backup_assignment
         join public.panel_playlists backup_playlist
           on backup_playlist.id = backup_assignment.playlist_id
          and backup_playlist.active is true
        where backup_assignment.device_id = device.id
          and backup_assignment.priority = 2
          and backup_assignment.active is true
          and backup_assignment.playlist_id <> p_playlist_id
     );

  if pg_catalog.cardinality(v_blocking_devices) > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'A lista é principal de aparelho(s) ativo(s) sem reserva: ' || pg_catalog.array_to_string(v_blocking_devices, ', ') || '.';
  end if;

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
              and backup_assignment.playlist_id <> p_playlist_id
         )
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'A lista é principal de uma assinatura sem reserva e não pode ser excluída.';
    end if;
  end if;

  for v_device in
    select device.id, backup_assignment.playlist_id as backup_playlist_id
      from public.panel_devices device
      join public.panel_device_playlists backup_assignment
        on backup_assignment.device_id = device.id
       and backup_assignment.priority = 2
       and backup_assignment.active is true
       and backup_assignment.playlist_id <> p_playlist_id
      join public.panel_playlists backup_playlist
        on backup_playlist.id = backup_assignment.playlist_id
       and backup_playlist.active is true
     where device.playlist_id = p_playlist_id
        or exists (
          select 1 from public.panel_device_playlists primary_assignment
           where primary_assignment.device_id = device.id
             and primary_assignment.playlist_id = p_playlist_id
             and primary_assignment.priority = 1
             and primary_assignment.active is true
        )
     order by device.id
  loop
    update public.panel_devices
       set playlist_id = v_device.backup_playlist_id,
           updated_at = pg_catalog.now()
     where id = v_device.id;
    v_devices_reassigned := v_devices_reassigned + 1;
  end loop;

  if v_has_subscription_domain then
    for v_subscription in
      select primary_assignment.subscription_id,
             backup_assignment.id as backup_assignment_id
        from public.panel_subscription_playlists primary_assignment
        join public.panel_subscription_playlists backup_assignment
          on backup_assignment.subscription_id = primary_assignment.subscription_id
         and backup_assignment.priority = 2
         and backup_assignment.active is true
         and backup_assignment.playlist_id <> p_playlist_id
       where primary_assignment.playlist_id = p_playlist_id
         and primary_assignment.priority = 1
         and primary_assignment.active is true
       order by primary_assignment.subscription_id
    loop
      update public.panel_subscription_playlists
         set active = false,
             archived_at = pg_catalog.now(),
             archived_reason = 'playlist_deleted',
             updated_at = pg_catalog.now()
       where subscription_id = v_subscription.subscription_id
         and playlist_id = p_playlist_id
         and active is true;

      update public.panel_subscription_playlists
         set priority = 1,
             updated_at = pg_catalog.now()
       where id = v_subscription.backup_assignment_id;

      v_subscriptions_reassigned := v_subscriptions_reassigned + 1;
    end loop;

    delete from public.panel_subscription_playlists
     where playlist_id = p_playlist_id;
  end if;

  delete from public.panel_playlists
   where id = p_playlist_id;

  return query select true, v_devices_reassigned, v_subscriptions_reassigned;
end;
$$;

revoke all on function public.redact_sensitive_text(text) from public, anon, authenticated;
revoke all on function public.redact_sensitive_jsonb(jsonb) from public, anon, authenticated;
revoke all on function public.apply_device_subscription_complete_transaction(uuid,uuid,uuid,uuid,uuid,timestamptz,text,text,text,uuid,text,boolean) from public, anon, authenticated;
revoke all on function public.delete_playlist_with_reassignment(uuid) from public, anon, authenticated;

grant execute on function public.redact_sensitive_text(text) to service_role;
grant execute on function public.redact_sensitive_jsonb(jsonb) to service_role;
grant execute on function public.apply_device_subscription_complete_transaction(uuid,uuid,uuid,uuid,uuid,timestamptz,text,text,text,uuid,text,boolean) to service_role;
grant execute on function public.delete_playlist_with_reassignment(uuid) to service_role;
