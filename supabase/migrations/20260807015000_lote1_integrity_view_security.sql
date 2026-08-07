-- A view de pendências é exclusivamente operacional e só pode ser consultada pelo backend service_role.
alter view public.panel_active_devices_without_playlist set (security_invoker = false);
revoke all on public.panel_active_devices_without_playlist from public, anon, authenticated;
grant select on public.panel_active_devices_without_playlist to service_role;

comment on view public.panel_active_devices_without_playlist is
  'Aparelhos ativos sem lista principal; leitura exclusiva do backend administrativo.';
comment on function public.inspect_playlist_archive(uuid) is
  'Lote 1: calcula impacto antes de arquivar lista.';
comment on function public.archive_playlist_safe_transaction(uuid,boolean) is
  'Lote 1: arquiva lista com promoção segura e bloqueio de aparelhos ativos sem reserva.';
