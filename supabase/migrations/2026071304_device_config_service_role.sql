-- A Edge Function device-config consulta a playlist vinculada ao aparelho.
-- A service_role ignora RLS, mas ainda precisa do privilégio SQL de leitura.

grant select
  on table public.panel_playlists
  to service_role;
