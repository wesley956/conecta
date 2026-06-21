alter table public.panel_devices
  add column if not exists device_type text default 'androidtv',
  add column if not exists app_version text,
  add column if not exists last_ip text;

create unique index if not exists panel_devices_device_uuid_unique_idx
  on public.panel_devices(device_uuid)
  where device_uuid is not null;
