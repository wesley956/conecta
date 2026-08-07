-- Lote 2: preserva a RPC histórica para composição interna e pgTAP, mas uma
-- Edge Function não pode mais usá-la como caminho comercial alternativo.
-- O reparo administrativo do Lote 1 usa explicitamente o núcleo separado.

alter function public.set_device_playlists_transaction(
  uuid,uuid,uuid,uuid,boolean
) rename to set_device_playlists_transaction_legacy_core;

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
  from public.set_device_playlists_transaction_legacy_core(
    p_device_id,
    p_primary_playlist_id,
    p_backup_playlist_id,
    null,
    false
  );
$$;

create or replace function public.set_device_playlists_transaction(
  p_device_id uuid,
  p_primary_playlist_id uuid,
  p_backup_playlist_id uuid,
  p_seller_id uuid default null,
  p_enforce_seller_ownership boolean default false
)
returns table(applied boolean, primary_playlist_id uuid, backup_playlist_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_role text := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    nullif((coalesce(nullif(pg_catalog.current_setting('request.jwt.claims', true), ''), '{}'))::jsonb ->> 'role', ''),
    ''
  );
begin
  if v_request_role = 'service_role' then
    raise exception using errcode = 'P0001',
      message = 'Troca de listas por RPC genérica desativada. Use seller-device-flow; para reparo administrativo use a operação de integridade.';
  end if;

  return query
  select * from public.set_device_playlists_transaction_legacy_core(
    p_device_id,
    p_primary_playlist_id,
    p_backup_playlist_id,
    p_seller_id,
    p_enforce_seller_ownership
  );
end;
$$;

revoke all on function public.set_device_playlists_transaction(uuid,uuid,uuid,uuid,boolean)
  from public, anon, authenticated;
grant execute on function public.set_device_playlists_transaction(uuid,uuid,uuid,uuid,boolean)
  to service_role;

revoke all on function public.set_device_playlists_transaction_legacy_core(uuid,uuid,uuid,uuid,boolean)
  from public, anon, authenticated;
grant execute on function public.set_device_playlists_transaction_legacy_core(uuid,uuid,uuid,uuid,boolean)
  to service_role;

revoke all on function public.repair_device_playlists_transaction(uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.repair_device_playlists_transaction(uuid,uuid,uuid)
  to service_role;
