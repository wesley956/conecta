set lock_timeout = '5s';
set statement_timeout = '30s';

alter table public.panel_device_commercial_operations
  add column if not exists device_code_snapshot text;

update public.panel_device_commercial_operations operation
set device_code_snapshot = device.device_code
from public.panel_devices device
where operation.device_id = device.id
  and operation.device_code_snapshot is null;

create or replace function public.set_device_commercial_operation_snapshot()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.device_code_snapshot is null and new.device_id is not null then
    select device.device_code
      into new.device_code_snapshot
      from public.panel_devices device
     where device.id = new.device_id;
  end if;

  return new;
end;
$$;

revoke all on function public.set_device_commercial_operation_snapshot() from public, anon, authenticated;
grant execute on function public.set_device_commercial_operation_snapshot() to service_role;

drop trigger if exists panel_device_commercial_operations_snapshot on public.panel_device_commercial_operations;
create trigger panel_device_commercial_operations_snapshot
before insert or update of device_id on public.panel_device_commercial_operations
for each row execute function public.set_device_commercial_operation_snapshot();

alter table public.panel_device_commercial_operations
  alter column device_id drop not null;

alter table public.panel_device_commercial_operations
  drop constraint if exists panel_device_commercial_operations_device_id_fkey;

alter table public.panel_device_commercial_operations
  add constraint panel_device_commercial_operations_device_id_fkey
  foreign key (device_id)
  references public.panel_devices(id)
  on delete set null;

alter table public.panel_device_commercial_operations
  drop constraint if exists panel_device_commercial_operations_device_history_check;

alter table public.panel_device_commercial_operations
  add constraint panel_device_commercial_operations_device_history_check
  check (device_id is not null or device_code_snapshot is not null);
