-- O catálogo direto do Lote 1 existe no Android nativo. LG webOS e Samsung
-- Tizen continuam usando o cache JSON protegido e não podem consumir crédito
-- com uma lista somente direta até receberem um cliente equivalente.

create or replace function public.assert_playlist_commercially_usable_for_device(
  p_playlist_id uuid,
  p_device_id uuid,
  p_label text default 'Lista'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_playlist public.panel_playlists%rowtype;
  v_device_type text;
begin
  perform public.assert_playlist_commercially_usable(p_playlist_id, p_label);

  select playlist.*
  into v_playlist
  from public.panel_playlists playlist
  where playlist.id = p_playlist_id;

  select lower(coalesce(device.device_type, ''))
  into v_device_type
  from public.panel_devices device
  where device.id = p_device_id;

  if v_playlist.playlist_qualification_status = 'ready_direct'
     and v_device_type not in ('android', 'androidtv') then
    raise exception using
      errcode = 'P0001',
      message = coalesce(nullif(trim(p_label), ''), 'Lista')
        || ' utiliza acesso direto, que nesta etapa está homologado somente para Android.';
  end if;
end;
$$;

create or replace function public.enforce_device_primary_playlist_qualification()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_requires_check boolean := false;
begin
  if new.status <> 'active' or new.playlist_id is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_requires_check := true;
  else
    v_requires_check :=
      old.status is distinct from new.status
      or old.playlist_id is distinct from new.playlist_id
      or (
        new.subscription_expires_at is not null
        and (
          old.subscription_expires_at is null
          or new.subscription_expires_at > old.subscription_expires_at
        )
      );
  end if;

  if v_requires_check then
    perform public.assert_playlist_commercially_usable_for_device(
      new.playlist_id,
      new.id,
      'Lista principal'
    );
  end if;
  return new;
end;
$$;

create or replace function public.enforce_device_assignment_playlist_qualification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.active is true and (
    tg_op = 'INSERT'
    or old.active is distinct from new.active
    or old.playlist_id is distinct from new.playlist_id
  ) then
    perform public.assert_playlist_commercially_usable_for_device(
      new.playlist_id,
      new.device_id,
      case when new.priority = 2 then 'Lista reserva' else 'Lista principal' end
    );
  end if;
  return new;
end;
$$;

create or replace function public.enforce_playlist_validation_device_capability()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_device_type text;
begin
  select lower(coalesce(device.device_type, ''))
  into v_device_type
  from public.panel_devices device
  where device.id = new.device_id;

  if v_device_type not in ('android', 'androidtv') then
    raise exception using
      errcode = 'P0001',
      message = 'A homologação de acesso direto exige um aparelho Android nesta etapa.';
  end if;
  return new;
end;
$$;

drop trigger if exists panel_playlist_validation_device_capability_guard
  on public.panel_playlist_validation_sessions;
create trigger panel_playlist_validation_device_capability_guard
before insert or update of device_id
on public.panel_playlist_validation_sessions
for each row execute function public.enforce_playlist_validation_device_capability();

revoke all on function public.assert_playlist_commercially_usable_for_device(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.assert_playlist_commercially_usable_for_device(uuid, uuid, text)
  to service_role;
