-- A Edge Function device-activate utiliza a chave service_role.
-- RLS é ignorado pela service_role, mas os privilégios SQL continuam obrigatórios.

grant select, insert, update
  on table public.panel_devices
  to service_role;

grant select, insert, update
  on table public.panel_customers
  to service_role;

grant select
  on table public.panel_sellers
  to service_role;
