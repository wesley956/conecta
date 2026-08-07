-- Lote 2: a consolidação é aplicada nas portas de entrada (Edge Functions e UI),
-- sem interceptar mutações internas legítimas do banco. O reparo administrativo
-- do Lote 1 ganha um nome explícito para não ser confundido com troca comercial.

create or replace function public.repair_device_playlists_transaction(
  p_device_id uuid,
  p_primary_playlist_id uuid,
  p_backup_playlist_id uuid
)
returns table(applied boolean, primary_playlist_id uuid, backup_playlist_id uuid)
language sql
security definer
set search_path = ''
as $$
  select *
  from public.set_device_playlists_transaction(
    p_device_id,
    p_primary_playlist_id,
    p_backup_playlist_id,
    null,
    false
  );
$$;

revoke all on function public.repair_device_playlists_transaction(uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.repair_device_playlists_transaction(uuid,uuid,uuid)
  to service_role;
