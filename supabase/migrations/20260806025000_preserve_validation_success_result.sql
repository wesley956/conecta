-- Preserva o resultado da promoção da lista antes de devolver ao fluxo normal
-- um aparelho de validação vinculado a vendedor.

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
  v_promoted boolean := false;
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
  v_promoted := found;

  update public.panel_devices device
  set is_playlist_validation_device = false,
      updated_at = v_now
  where device.id = p_device_id
    and device.seller_id is not null
    and device.is_playlist_validation_device is true;

  return v_promoted;
end;
$$;

revoke all on function public.mark_playlist_direct_success(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mark_playlist_direct_success(uuid, uuid) to service_role;
