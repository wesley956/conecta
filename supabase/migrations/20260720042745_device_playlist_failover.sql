-- Relação ordenada entre aparelhos e listas. Mantém playlist_id em panel_devices
-- como compatibilidade com versões antigas do painel e do APK.
create table if not exists public.panel_device_playlists (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.panel_devices(id) on delete cascade,
  playlist_id uuid not null references public.panel_playlists(id) on delete cascade,
  priority smallint not null check (priority in (1, 2)),
  active boolean not null default true,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  cooldown_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (device_id, priority),
  unique (device_id, playlist_id)
);

create index if not exists panel_device_playlists_device_idx
  on public.panel_device_playlists(device_id, active, priority);

create index if not exists panel_device_playlists_playlist_idx
  on public.panel_device_playlists(playlist_id);

alter table public.panel_device_playlists enable row level security;
alter table public.panel_device_playlists force row level security;

revoke all on table public.panel_device_playlists from public, anon, authenticated;
grant all on table public.panel_device_playlists to service_role;

insert into public.panel_device_playlists (device_id, playlist_id, priority, active)
select id, playlist_id, 1, true
from public.panel_devices
where playlist_id is not null
on conflict (device_id, priority) do update
set playlist_id = excluded.playlist_id,
    active = true,
    updated_at = now();

create or replace function public.sync_primary_device_playlist()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.playlist_id is not distinct from old.playlist_id then
    return new;
  end if;

  delete from public.panel_device_playlists
   where device_id = new.id
     and priority = 1;

  if new.playlist_id is not null then
    delete from public.panel_device_playlists
     where device_id = new.id
       and playlist_id = new.playlist_id;

    insert into public.panel_device_playlists (
      device_id,
      playlist_id,
      priority,
      active,
      consecutive_failures,
      last_error,
      cooldown_until,
      updated_at
    ) values (
      new.id,
      new.playlist_id,
      1,
      true,
      0,
      null,
      null,
      now()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists panel_devices_sync_primary_playlist
  on public.panel_devices;

create trigger panel_devices_sync_primary_playlist
after update of playlist_id on public.panel_devices
for each row
execute function public.sync_primary_device_playlist();

revoke all on function public.sync_primary_device_playlist()
  from public, anon, authenticated;
grant execute on function public.sync_primary_device_playlist()
  to service_role;

-- Preserva o histórico financeiro ao excluir um vendedor.
alter table public.panel_credit_ledger
  add column if not exists seller_name_snapshot text;

update public.panel_credit_ledger ledger
set seller_name_snapshot = seller.name
from public.panel_sellers seller
where seller.id = ledger.seller_id
  and ledger.seller_name_snapshot is null;

alter table public.panel_credit_ledger
  alter column seller_id drop not null;

alter table public.panel_credit_ledger
  drop constraint if exists panel_credit_ledger_seller_id_fkey;

alter table public.panel_credit_ledger
  add constraint panel_credit_ledger_seller_id_fkey
  foreign key (seller_id)
  references public.panel_sellers(id)
  on delete set null;

create or replace function public.capture_credit_ledger_seller_name()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.seller_name_snapshot is null and new.seller_id is not null then
    select name
      into new.seller_name_snapshot
      from public.panel_sellers
     where id = new.seller_id;
  end if;

  return new;
end;
$$;

drop trigger if exists panel_credit_ledger_capture_seller_name
  on public.panel_credit_ledger;

create trigger panel_credit_ledger_capture_seller_name
before insert or update of seller_id on public.panel_credit_ledger
for each row
execute function public.capture_credit_ledger_seller_name();

revoke all on function public.capture_credit_ledger_seller_name()
  from public, anon, authenticated;
grant execute on function public.capture_credit_ledger_seller_name()
  to service_role;
