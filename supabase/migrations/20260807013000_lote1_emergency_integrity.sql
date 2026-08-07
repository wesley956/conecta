-- Lote 1: segurança de auditoria, restauração de contratos comerciais
-- e bloqueio de exclusões que deixariam aparelhos ativos sem lista.

create or replace function public.audit_sanitize_text(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value is null then null
    else pg_catalog.regexp_replace(
      pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(
          p_value,
          '([?&](username|user|password|pass|token|access_token|authorization|auth|key)=)[^&[:space:]"''}]+',
          E'\\1[redacted]',
          'gi'
        ),
        '([a-z][a-z0-9+.-]*://)[^/@[:space:]]+@',
        E'\\1[redacted]@',
        'gi'
      ),
      '(bearer[[:space:]]+)[a-z0-9._~+/-]+',
      E'\\1[redacted]',
      'gi'
    )
  end;
$$;

create or replace function public.audit_sanitize_jsonb(p_value jsonb)
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
          when pg_catalog.lower(entry.key) ~ '(^|_)(password|passwd|pass|secret|token|access_token|authorization|credential|private_key|api_key|username|user_name|login)($|_)'
            then '"[redacted]"'::jsonb
          else public.audit_sanitize_jsonb(entry.value)
        end
      ),
      '{}'::jsonb
    )
      into v_result
      from pg_catalog.jsonb_each(p_value) as entry;
    return v_result;
  end if;

  if v_type = 'array' then
    select coalesce(pg_catalog.jsonb_agg(public.audit_sanitize_jsonb(item.value)), '[]'::jsonb)
      into v_result
      from pg_catalog.jsonb_array_elements(p_value) as item;
    return v_result;
  end if;

  if v_type = 'string' then
    return pg_catalog.to_jsonb(public.audit_sanitize_text(p_value #>> '{}'));
  end if;

  return p_value;
end;
$$;

create or replace function public.sanitize_panel_audit_log()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.description := public.audit_sanitize_text(new.description);
  new.metadata := public.audit_sanitize_jsonb(coalesce(new.metadata, '{}'::jsonb));
  return new;
end;
$$;

drop trigger if exists panel_audit_logs_sanitize_sensitive_data on public.panel_audit_logs;
create trigger panel_audit_logs_sanitize_sensitive_data
before insert or update of description, metadata on public.panel_audit_logs
for each row execute function public.sanitize_panel_audit_log();

-- Limpa o histórico existente sem apagar eventos, datas ou responsáveis.
update public.panel_audit_logs
   set description = public.audit_sanitize_text(description),
       metadata = public.audit_sanitize_jsonb(coalesce(metadata, '{}'::jsonb));

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
begin
  if p_backup_playlist_id is not null and p_backup_playlist_id = p_playlist_id then
    raise exception using errcode = '22023', message = 'A lista reserva precisa ser diferente da lista principal.';
  end if;

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
  v_playlist_id uuid;
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

  select * into v_device
    from public.panel_devices device
   where device.id = p_device_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Aparelho não encontrado.';
  end if;

  if v_device.status = 'active' and p_primary_playlist_id is null then
    raise exception using errcode = 'P0001', message = 'Um aparelho ativo não pode ficar sem lista principal.';
  end if;

  if p_enforce_seller_ownership then
    select * into v_seller
      from public.panel_sellers seller
     where seller.id = p_seller_id
       and seller.deleted_at is null
     for update;
    if not found or v_seller.status <> 'active' then
      raise exception using errcode = 'P0001', message = 'Vendedor inexistente, bloqueado ou inativo.';
    end if;
    if v_device.seller_id is distinct from p_seller_id then
      raise exception using errcode = 'P0001', message = 'Este aparelho não pertence ao vendedor.';
    end if;
  end if;

  for v_playlist_id in
    select distinct requested.playlist_id
      from pg_catalog.unnest(array[p_primary_playlist_id, p_backup_playlist_id]) as requested(playlist_id)
     where requested.playlist_id is not null
     order by requested.playlist_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('panel-playlist:' || v_playlist_id::text, 0)
    );
    perform public.assert_playlist_commercially_usable_for_device(
      v_playlist_id,
      p_device_id,
      case when v_playlist_id = p_backup_playlist_id then 'Lista reserva' else 'Lista principal' end
    );

    if p_enforce_seller_ownership and not exists (
      select 1
        from public.panel_seller_playlists permission
       where permission.seller_id = p_seller_id
         and permission.playlist_id = v_playlist_id
         and permission.active is true
    ) then
      raise exception using errcode = 'P0001', message = 'Lista não liberada para este vendedor.';
    end if;
  end loop;

  update public.panel_devices
     set playlist_id = p_primary_playlist_id,
         updated_at = pg_catalog.now()
   where id = p_device_id;

  delete from public.panel_device_playlists
   where device_id = p_device_id
     and priority = 2;

  if p_backup_playlist_id is not null then
    insert into public.panel_device_playlists (
      device_id, playlist_id, priority, active, consecutive_failures,
      last_success_at, last_failure_at, cooldown_until, last_error, updated_at
    ) values (
      p_device_id, p_backup_playlist_id, 2, true, 0,
      null, null, null, null, pg_catalog.now()
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
  v_count integer;
  v_codes text[];
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('panel-playlist:' || p_playlist_id::text, 0)
  );

  select
    pg_catalog.count(distinct device.id)::integer,
    coalesce(
      pg_catalog.array_agg(distinct device.device_code order by device.device_code)
        filter (where device.device_code is not null),
      array[]::text[]
    )
    into v_count, v_codes
    from public.panel_devices device
   where device.seller_id = p_seller_id
     and (
       device.playlist_id = p_playlist_id
       or exists (
         select 1 from public.panel_device_playlists assignment
          where assignment.device_id = device.id
            and assignment.playlist_id = p_playlist_id
            and assignment.active is true
       )
     );

  if v_count > 0 then
    return query select false, v_count, v_codes;
    return;
  end if;

  delete from public.panel_seller_playlists
   where seller_id = p_seller_id
     and playlist_id = p_playlist_id;

  return query select true, 0, array[]::text[];
end;
$$;

create or replace function public.inspect_playlist_archive(p_playlist_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_playlist public.panel_playlists%rowtype;
  v_primary jsonb;
  v_reserve jsonb;
  v_blockers jsonb;
  v_seller_links integer;
  v_validation_sessions integer;
begin
  select * into v_playlist
    from public.panel_playlists playlist
   where playlist.id = p_playlist_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Lista não encontrada.';
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'deviceId', device.id,
           'deviceCode', device.device_code,
           'status', device.status,
           'backupPlaylistId', backup.playlist_id
         ) order by device.device_code), '[]'::jsonb)
    into v_primary
    from public.panel_devices device
    left join public.panel_device_playlists backup
      on backup.device_id = device.id
     and backup.priority = 2
     and backup.active is true
     and backup.playlist_id <> p_playlist_id
    left join public.panel_playlists backup_playlist
      on backup_playlist.id = backup.playlist_id
     and backup_playlist.active is true
   where device.playlist_id = p_playlist_id
      or exists (
        select 1 from public.panel_device_playlists primary_assignment
         where primary_assignment.device_id = device.id
           and primary_assignment.playlist_id = p_playlist_id
           and primary_assignment.priority = 1
           and primary_assignment.active is true
      );

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'deviceId', device.id,
           'deviceCode', device.device_code,
           'status', device.status
         ) order by device.device_code), '[]'::jsonb)
    into v_reserve
    from public.panel_device_playlists assignment
    join public.panel_devices device on device.id = assignment.device_id
   where assignment.playlist_id = p_playlist_id
     and assignment.priority = 2
     and assignment.active is true;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'deviceId', device.id,
           'deviceCode', device.device_code,
           'status', device.status
         ) order by device.device_code), '[]'::jsonb)
    into v_blockers
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

  select pg_catalog.count(*)::integer into v_seller_links
    from public.panel_seller_playlists
   where playlist_id = p_playlist_id and active is true;

  select pg_catalog.count(*)::integer into v_validation_sessions
    from public.panel_playlist_validation_sessions
   where playlist_id = p_playlist_id and status = 'active';

  return pg_catalog.jsonb_build_object(
    'playlistId', v_playlist.id,
    'playlistName', v_playlist.name,
    'active', v_playlist.active,
    'primaryDevices', v_primary,
    'reserveDevices', v_reserve,
    'blockingDevices', v_blockers,
    'sellerLinks', v_seller_links,
    'activeValidationSessions', v_validation_sessions,
    'canArchive', pg_catalog.jsonb_array_length(v_blockers) = 0,
    'requiresConfirmation',
      pg_catalog.jsonb_array_length(v_primary) > 0
      or pg_catalog.jsonb_array_length(v_reserve) > 0
      or v_seller_links > 0
      or v_validation_sessions > 0
  );
end;
$$;

create or replace function public.archive_playlist_safe_transaction(
  p_playlist_id uuid,
  p_confirm boolean default false
)
returns table (
  archived boolean,
  requires_confirmation boolean,
  blocking_device_codes text[],
  primary_devices_promoted integer,
  reserve_assignments_removed integer,
  seller_links_disabled integer,
  validation_sessions_revoked integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_playlist public.panel_playlists%rowtype;
  v_blockers text[];
  v_primary_count integer := 0;
  v_reserve_count integer := 0;
  v_seller_count integer := 0;
  v_validation_count integer := 0;
  v_usage_exists boolean := false;
  v_device record;
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

  select coalesce(pg_catalog.array_agg(device.device_code order by device.device_code), array[]::text[])
    into v_blockers
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

  if pg_catalog.cardinality(v_blockers) > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'A lista é principal de aparelho(s) ativo(s) sem reserva: ' || pg_catalog.array_to_string(v_blockers, ', ') || '. Escolha uma substituta ou desative os aparelhos antes de arquivar.';
  end if;

  select exists(
    select 1 from public.panel_device_playlists where playlist_id = p_playlist_id
    union all
    select 1 from public.panel_seller_playlists where playlist_id = p_playlist_id and active is true
    union all
    select 1 from public.panel_playlist_validation_sessions where playlist_id = p_playlist_id and status = 'active'
    limit 1
  ) into v_usage_exists;

  if v_usage_exists and p_confirm is not true then
    return query select false, true, array[]::text[], 0, 0, 0, 0;
    return;
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
     for update of device
  loop
    update public.panel_devices
       set playlist_id = v_device.backup_playlist_id,
           updated_at = pg_catalog.now()
     where id = v_device.id;
    v_primary_count := v_primary_count + 1;
  end loop;

  delete from public.panel_device_playlists
   where playlist_id = p_playlist_id
     and priority = 2;
  get diagnostics v_reserve_count = row_count;

  delete from public.panel_device_playlists
   where playlist_id = p_playlist_id;

  update public.panel_seller_playlists
     set active = false,
         updated_at = pg_catalog.now()
   where playlist_id = p_playlist_id
     and active is true;
  get diagnostics v_seller_count = row_count;

  update public.panel_playlist_validation_sessions
     set status = 'revoked',
         revoked_at = pg_catalog.now(),
         last_error_code = 'PLAYLIST_ARCHIVED',
         last_error_message = 'A lista foi arquivada pelo administrador.',
         updated_at = pg_catalog.now()
   where playlist_id = p_playlist_id
     and status = 'active';
  get diagnostics v_validation_count = row_count;

  update public.panel_playlists
     set active = false,
         archived_at = coalesce(archived_at, pg_catalog.now()),
         playlist_updated_at = pg_catalog.now()
   where id = p_playlist_id;

  return query select
    true,
    false,
    array[]::text[],
    v_primary_count,
    v_reserve_count,
    v_seller_count,
    v_validation_count;
end;
$$;

-- Contrato legado mantido para a função admin-panel atual, agora com arquivamento seguro.
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
  v_result record;
begin
  select * into v_result
    from public.archive_playlist_safe_transaction(p_playlist_id, true);

  return query select
    v_result.archived,
    v_result.primary_devices_promoted,
    0;
end;
$$;

create or replace view public.panel_active_devices_without_playlist
with (security_invoker = true)
as
select
  device.id,
  device.device_code,
  device.client_name,
  device.customer_id,
  device.seller_id,
  device.plan_id,
  device.subscription_expires_at,
  device.updated_at
from public.panel_devices device
where device.status = 'active'
  and device.playlist_id is null
  and not exists (
    select 1 from public.panel_device_playlists assignment
     where assignment.device_id = device.id
       and assignment.priority = 1
       and assignment.active is true
  );

revoke all on function public.apply_device_subscription_complete_transaction(uuid,uuid,uuid,uuid,uuid,timestamptz,text,text,text,uuid,text,boolean) from public, anon, authenticated;
revoke all on function public.set_device_playlists_transaction(uuid,uuid,uuid,uuid,boolean) from public, anon, authenticated;
revoke all on function public.remove_seller_playlist_transaction(uuid,uuid) from public, anon, authenticated;
revoke all on function public.inspect_playlist_archive(uuid) from public, anon, authenticated;
revoke all on function public.archive_playlist_safe_transaction(uuid,boolean) from public, anon, authenticated;
revoke all on function public.delete_playlist_with_reassignment(uuid) from public, anon, authenticated;

grant execute on function public.apply_device_subscription_complete_transaction(uuid,uuid,uuid,uuid,uuid,timestamptz,text,text,text,uuid,text,boolean) to service_role;
grant execute on function public.set_device_playlists_transaction(uuid,uuid,uuid,uuid,boolean) to service_role;
grant execute on function public.remove_seller_playlist_transaction(uuid,uuid) to service_role;
grant execute on function public.inspect_playlist_archive(uuid) to service_role;
grant execute on function public.archive_playlist_safe_transaction(uuid,boolean) to service_role;
grant execute on function public.delete_playlist_with_reassignment(uuid) to service_role;

revoke all on public.panel_active_devices_without_playlist from public, anon, authenticated;
grant select on public.panel_active_devices_without_playlist to service_role;
