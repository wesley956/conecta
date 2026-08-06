-- Permite homologar uma lista em um aparelho pendente que já pertence ao mesmo vendedor.
-- O aparelho continua sem cliente, plano, lista ou validade e volta automaticamente
-- ao fluxo comercial quando o teste termina com sucesso, falha ou revogação.

alter table public.panel_devices
  drop constraint if exists panel_devices_playlist_validation_isolation_check;

alter table public.panel_devices
  add constraint panel_devices_playlist_validation_isolation_check
  check (
    is_playlist_validation_device is not true
    or (
      status = 'pending'
      and customer_id is null
      and playlist_id is null
      and plan_id is null
      and subscription_expires_at is null
    )
  );

create or replace function public.start_playlist_validation_session(
  p_playlist_id uuid,
  p_device_id uuid,
  p_duration_minutes integer default 15,
  p_created_by_user_id uuid default null
)
returns table (
  session_id uuid,
  playlist_id uuid,
  device_id uuid,
  status text,
  starts_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_playlist public.panel_playlists%rowtype;
  v_device public.panel_devices%rowtype;
  v_session public.panel_playlist_validation_sessions%rowtype;
  v_now timestamptz := now();
begin
  if p_duration_minutes is null or p_duration_minutes not between 2 and 60 then
    raise exception using errcode = '22023', message = 'A validação deve durar entre 2 e 60 minutos.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('playlist-validation:' || p_playlist_id::text, 0)
  );

  update public.panel_playlist_validation_sessions session
  set status = 'expired', updated_at = v_now
  where session.status = 'active'
    and session.expires_at <= v_now;

  select * into v_playlist
  from public.panel_playlists playlist
  where playlist.id = p_playlist_id
  for update;
  if not found or v_playlist.active is not true then
    raise exception using errcode = 'P0002', message = 'Lista ativa não encontrada.';
  end if;
  if v_playlist.playlist_access_mode <> 'direct'
     or v_playlist.playlist_qualification_status not in ('awaiting_device_test', 'retryable_error') then
    raise exception using errcode = 'P0001', message = 'Esta lista não está aguardando validação direta.';
  end if;

  select * into v_device
  from public.panel_devices device
  where device.id = p_device_id
  for update;
  if not found or v_device.is_playlist_validation_device is not true then
    raise exception using errcode = 'P0001', message = 'O aparelho escolhido não está marcado para validação de listas.';
  end if;
  if v_device.status <> 'pending'
     or v_device.customer_id is not null
     or v_device.playlist_id is not null
     or v_device.plan_id is not null
     or v_device.subscription_expires_at is not null then
    raise exception using errcode = 'P0001', message = 'Use um aparelho pendente e sem cliente, plano, lista ou validade comercial.';
  end if;
  if v_device.device_credential_hash is null then
    raise exception using errcode = 'P0001', message = 'O aparelho de validação ainda não possui credencial segura.';
  end if;
  if v_device.seller_id is not null and not exists (
    select 1
    from public.panel_seller_playlists link
    where link.seller_id = v_device.seller_id
      and link.playlist_id = p_playlist_id
      and link.active is true
  ) then
    raise exception using errcode = 'P0001', message = 'A lista não pertence ao vendedor vinculado ao aparelho.';
  end if;

  update public.panel_playlist_validation_sessions session
  set status = 'revoked', revoked_at = v_now, updated_at = v_now
  where session.status = 'active'
    and (session.device_id = p_device_id or session.playlist_id = p_playlist_id);

  insert into public.panel_playlist_validation_sessions (
    playlist_id,
    device_id,
    status,
    starts_at,
    expires_at,
    created_by_user_id,
    updated_at
  ) values (
    p_playlist_id,
    p_device_id,
    'active',
    v_now,
    v_now + make_interval(mins => p_duration_minutes),
    p_created_by_user_id,
    v_now
  ) returning * into v_session;

  update public.panel_playlists playlist
  set
    playlist_qualification_status = 'awaiting_device_test',
    playlist_qualification_code = 'DEVICE_TEST_ACTIVE',
    playlist_qualification_message = 'Teste direto iniciado. Atualize o aplicativo no aparelho de validação.',
    playlist_qualification_updated_at = v_now
  where playlist.id = p_playlist_id;

  return query select
    v_session.id,
    v_session.playlist_id,
    v_session.device_id,
    v_session.status,
    v_session.starts_at,
    v_session.expires_at;
end;
$$;

create or replace function public.mark_playlist_direct_success(
  p_playlist_id uuid,
  p_device_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authorized boolean := false;
  v_now timestamptz := now();
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('playlist-validation:' || p_playlist_id::text, 0)
  );

  select exists (
    select 1
    from public.panel_playlist_validation_sessions session
    where session.playlist_id = p_playlist_id
      and session.device_id = p_device_id
      and session.status = 'active'
      and session.expires_at > v_now
  ) or exists (
    select 1
    from public.panel_devices device
    where device.id = p_device_id
      and device.status = 'active'
      and (
        device.playlist_id = p_playlist_id
        or exists (
          select 1
          from public.panel_device_playlists assignment
          where assignment.device_id = device.id
            and assignment.playlist_id = p_playlist_id
            and assignment.active is true
        )
      )
  ) into v_authorized;

  if not v_authorized then
    return false;
  end if;

  update public.panel_playlist_validation_sessions session
  set
    status = 'succeeded',
    succeeded_at = v_now,
    updated_at = v_now,
    last_error_code = null,
    last_error_message = null
  where session.playlist_id = p_playlist_id
    and session.device_id = p_device_id
    and session.status = 'active';

  update public.panel_playlists playlist
  set
    playlist_access_mode = 'direct',
    playlist_qualification_status = 'ready_direct',
    playlist_qualification_code = 'DIRECT_DEVICE_CONFIRMED',
    playlist_qualification_message = 'O acesso direto foi confirmado por um aparelho autorizado.',
    playlist_qualification_updated_at = v_now,
    playlist_qualified_at = v_now,
    playlist_direct_confirmed_at = v_now,
    playlist_direct_confirmed_device_id = p_device_id
  where playlist.id = p_playlist_id
    and playlist.active is true;

  update public.panel_devices device
  set is_playlist_validation_device = false,
      updated_at = v_now
  where device.id = p_device_id
    and device.seller_id is not null
    and device.is_playlist_validation_device is true;

  return found;
end;
$$;

create or replace function public.mark_playlist_validation_failure(
  p_playlist_id uuid,
  p_device_id uuid,
  p_error_code text,
  p_error_message text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_message text := coalesce(
    public.safe_playlist_qualification_message(p_error_message),
    'O aparelho não conseguiu confirmar a lista.'
  );
begin
  update public.panel_playlist_validation_sessions session
  set
    status = 'failed',
    failed_at = v_now,
    updated_at = v_now,
    last_error_code = left(coalesce(nullif(trim(p_error_code), ''), 'DEVICE_TEST_FAILED'), 80),
    last_error_message = v_message
  where session.playlist_id = p_playlist_id
    and session.device_id = p_device_id
    and session.status = 'active';

  if not found then
    return false;
  end if;

  update public.panel_playlists playlist
  set
    playlist_qualification_status = 'awaiting_device_test',
    playlist_qualification_code = 'DEVICE_TEST_FAILED',
    playlist_qualification_message = 'O teste no aparelho falhou. Revise o diagnóstico e tente novamente.',
    playlist_qualification_updated_at = v_now,
    playlist_qualified_at = null
  where playlist.id = p_playlist_id
    and playlist.playlist_qualification_status <> 'ready_direct';

  update public.panel_devices device
  set is_playlist_validation_device = false,
      updated_at = v_now
  where device.id = p_device_id
    and device.seller_id is not null
    and device.is_playlist_validation_device is true;

  return true;
end;
$$;

create or replace function public.revoke_playlist_validation_session(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device_id uuid;
begin
  update public.panel_playlist_validation_sessions session
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where session.id = p_session_id
    and session.status = 'active'
  returning session.device_id into v_device_id;

  if not found then
    return false;
  end if;

  update public.panel_devices device
  set is_playlist_validation_device = false,
      updated_at = now()
  where device.id = v_device_id
    and device.seller_id is not null
    and device.is_playlist_validation_device is true;

  return true;
end;
$$;

revoke all on function public.start_playlist_validation_session(uuid, uuid, integer, uuid) from public, anon, authenticated;
revoke all on function public.mark_playlist_direct_success(uuid, uuid) from public, anon, authenticated;
revoke all on function public.mark_playlist_validation_failure(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.revoke_playlist_validation_session(uuid) from public, anon, authenticated;

grant execute on function public.start_playlist_validation_session(uuid, uuid, integer, uuid) to service_role;
grant execute on function public.mark_playlist_direct_success(uuid, uuid) to service_role;
grant execute on function public.mark_playlist_validation_failure(uuid, uuid, text, text) to service_role;
grant execute on function public.revoke_playlist_validation_session(uuid) to service_role;
