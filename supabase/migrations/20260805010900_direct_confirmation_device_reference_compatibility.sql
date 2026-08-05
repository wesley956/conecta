-- Mantém a integridade da referência do aparelho usado para homologação direta
-- sem expor uma segunda relação automática entre panel_playlists e panel_devices.
-- Isso preserva consultas legadas do PostgREST que usam panel_devices.playlist_id.

alter table public.panel_playlists
  drop constraint if exists panel_playlists_playlist_direct_confirmed_device_id_fkey;

create or replace function public.validate_playlist_direct_confirmation_device()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.playlist_direct_confirmed_device_id is not null
     and not exists (
       select 1
       from public.panel_devices device
       where device.id = new.playlist_direct_confirmed_device_id
     ) then
    raise exception using
      errcode = '23503',
      message = 'O aparelho informado para confirmação direta não existe.';
  end if;
  return new;
end;
$$;

drop trigger if exists panel_playlists_direct_confirmation_device_guard
  on public.panel_playlists;
create trigger panel_playlists_direct_confirmation_device_guard
before insert or update of playlist_direct_confirmed_device_id
on public.panel_playlists
for each row execute function public.validate_playlist_direct_confirmation_device();

create or replace function public.clear_deleted_direct_confirmation_device()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.panel_playlists playlist
  set playlist_direct_confirmed_device_id = null
  where playlist.playlist_direct_confirmed_device_id = old.id;
  return old;
end;
$$;

drop trigger if exists panel_devices_clear_direct_confirmation_reference
  on public.panel_devices;
create trigger panel_devices_clear_direct_confirmation_reference
after delete on public.panel_devices
for each row execute function public.clear_deleted_direct_confirmation_device();

revoke all on function public.validate_playlist_direct_confirmation_device()
  from public, anon, authenticated;
revoke all on function public.clear_deleted_direct_confirmation_device()
  from public, anon, authenticated;

grant execute on function public.validate_playlist_direct_confirmation_device()
  to service_role;
grant execute on function public.clear_deleted_direct_confirmation_device()
  to service_role;

notify pgrst, 'reload schema';
