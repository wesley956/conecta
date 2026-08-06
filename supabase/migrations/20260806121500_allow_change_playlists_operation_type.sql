-- Mantém compatibilidade com a operação antiga e libera a nova troca de listas sem renovação.
alter table public.panel_device_playlist_operations
  drop constraint if exists panel_device_playlist_operations_operation_type_check;

alter table public.panel_device_playlist_operations
  add constraint panel_device_playlist_operations_operation_type_check
  check (operation_type in ('replace_playlist', 'change_playlists'));
