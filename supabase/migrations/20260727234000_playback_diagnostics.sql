create table if not exists public.panel_playback_diagnostics (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.panel_devices(id) on delete cascade,
  seller_id uuid references public.panel_sellers(id) on delete set null,
  playlist_id uuid references public.panel_playlists(id) on delete set null,
  device_code_snapshot text not null,
  client_name_snapshot text,
  seller_name_snapshot text,
  playlist_name_snapshot text,
  platform text,
  app_version text,
  content_type text not null default 'unknown'
    check (content_type in ('channel', 'movie', 'series', 'episode', 'unknown')),
  content_title text,
  season_number integer,
  episode_number integer,
  position_ms bigint,
  duration_ms bigint,
  error_code text,
  error_message text not null,
  severity text not null default 'high'
    check (severity in ('low', 'medium', 'high', 'critical')),
  probable_source text not null default 'unknown'
    check (probable_source in ('content', 'network', 'playlist', 'app', 'device', 'unknown')),
  recovery_action text,
  recovered boolean not null default false,
  player_exited boolean not null default false,
  backup_available boolean not null default false,
  retry_count integer not null default 0 check (retry_count >= 0),
  status text not null default 'open'
    check (status in ('open', 'investigating', 'resolved', 'ignored')),
  admin_notes text,
  seller_acknowledged_at timestamptz,
  occurred_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  source text not null default 'playlist_health',
  client_event_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists panel_playback_diagnostics_occurred_idx
  on public.panel_playback_diagnostics (occurred_at desc);
create index if not exists panel_playback_diagnostics_seller_occurred_idx
  on public.panel_playback_diagnostics (seller_id, occurred_at desc);
create index if not exists panel_playback_diagnostics_device_occurred_idx
  on public.panel_playback_diagnostics (device_id, occurred_at desc);
create index if not exists panel_playback_diagnostics_status_idx
  on public.panel_playback_diagnostics (status, severity, occurred_at desc);
create index if not exists panel_playback_diagnostics_playlist_idx
  on public.panel_playback_diagnostics (playlist_id, occurred_at desc);

alter table public.panel_playback_diagnostics enable row level security;
revoke all on table public.panel_playback_diagnostics from anon, authenticated;
grant all on table public.panel_playback_diagnostics to service_role;

create or replace function public.capture_panel_playback_health()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_device_code text;
  v_client_name text;
  v_seller_id uuid;
  v_seller_name text;
  v_playlist_name text;
  v_platform text;
  v_app_version text;
  v_backup_available boolean := false;
  v_event_id text;
begin
  if new.last_failure_at is distinct from old.last_failure_at and new.last_failure_at is not null then
    select
      d.device_code,
      coalesce(c.name, d.client_name),
      d.seller_id,
      s.name,
      p.name,
      d.device_type,
      d.app_version
    into
      v_device_code,
      v_client_name,
      v_seller_id,
      v_seller_name,
      v_playlist_name,
      v_platform,
      v_app_version
    from public.panel_devices d
    left join public.panel_customers c on c.id = d.customer_id
    left join public.panel_sellers s on s.id = d.seller_id
    left join public.panel_playlists p on p.id = new.playlist_id
    where d.id = new.device_id;

    select exists (
      select 1
      from public.panel_device_playlists backup
      join public.panel_playlists backup_playlist on backup_playlist.id = backup.playlist_id
      where backup.device_id = new.device_id
        and backup.active = true
        and backup_playlist.active = true
        and backup.priority > new.priority
    ) into v_backup_available;

    v_event_id := 'health:' || new.id::text || ':' ||
      floor(extract(epoch from new.last_failure_at) * 1000)::bigint::text;

    insert into public.panel_playback_diagnostics (
      device_id,
      seller_id,
      playlist_id,
      device_code_snapshot,
      client_name_snapshot,
      seller_name_snapshot,
      playlist_name_snapshot,
      platform,
      app_version,
      content_type,
      content_title,
      error_code,
      error_message,
      severity,
      probable_source,
      recovery_action,
      recovered,
      player_exited,
      backup_available,
      retry_count,
      status,
      occurred_at,
      source,
      client_event_id
    ) values (
      new.device_id,
      v_seller_id,
      new.playlist_id,
      coalesce(v_device_code, 'Aparelho não identificado'),
      v_client_name,
      v_seller_name,
      v_playlist_name,
      v_platform,
      v_app_version,
      'unknown',
      'Conteúdo não identificado',
      'PLAYBACK_TIMEOUT',
      coalesce(nullif(new.last_error, ''), 'Falha terminal de reprodução.'),
      'high',
      'unknown',
      case
        when v_backup_available then 'Lista reserva solicitada após falha terminal.'
        else 'Reprodução interrompida sem lista reserva disponível.'
      end,
      false,
      true,
      v_backup_available,
      greatest(coalesce(new.consecutive_failures, 1), 1),
      'open',
      new.last_failure_at,
      'playlist_health',
      v_event_id
    )
    on conflict (client_event_id) do nothing;
  end if;

  if new.last_success_at is distinct from old.last_success_at and new.last_success_at is not null then
    update public.panel_playback_diagnostics
    set
      recovered = true,
      recovery_action = coalesce(recovery_action, 'Reprodução estabilizada automaticamente.'),
      status = case when status = 'open' then 'resolved' else status end,
      resolved_at = coalesce(resolved_at, new.last_success_at),
      updated_at = now()
    where id = (
      select diagnostic.id
      from public.panel_playback_diagnostics diagnostic
      where diagnostic.device_id = new.device_id
        and diagnostic.playlist_id = new.playlist_id
        and diagnostic.recovered = false
      order by diagnostic.occurred_at desc
      limit 1
    );
  end if;

  return new;
end;
$$;

revoke all on function public.capture_panel_playback_health() from public, anon, authenticated;
grant execute on function public.capture_panel_playback_health() to service_role;

drop trigger if exists capture_panel_playback_health_trigger on public.panel_device_playlists;
create trigger capture_panel_playback_health_trigger
after update of last_failure_at, last_success_at on public.panel_device_playlists
for each row
execute function public.capture_panel_playback_health();

insert into public.panel_playback_diagnostics (
  device_id,
  seller_id,
  playlist_id,
  device_code_snapshot,
  client_name_snapshot,
  seller_name_snapshot,
  playlist_name_snapshot,
  platform,
  app_version,
  content_type,
  content_title,
  error_code,
  error_message,
  severity,
  probable_source,
  recovery_action,
  recovered,
  player_exited,
  backup_available,
  retry_count,
  status,
  occurred_at,
  source,
  client_event_id
)
select
  assignment.device_id,
  device.seller_id,
  assignment.playlist_id,
  device.device_code,
  coalesce(customer.name, device.client_name),
  seller.name,
  playlist.name,
  device.device_type,
  device.app_version,
  'unknown',
  'Conteúdo não identificado (registro anterior)',
  'PLAYBACK_TIMEOUT',
  coalesce(nullif(assignment.last_error, ''), 'Falha terminal de reprodução.'),
  'high',
  'unknown',
  case
    when exists (
      select 1
      from public.panel_device_playlists backup
      join public.panel_playlists backup_playlist on backup_playlist.id = backup.playlist_id
      where backup.device_id = assignment.device_id
        and backup.active = true
        and backup_playlist.active = true
        and backup.priority > assignment.priority
    ) then 'Lista reserva solicitada após falha terminal.'
    else 'Reprodução interrompida sem lista reserva disponível.'
  end,
  assignment.last_success_at is not null and assignment.last_success_at > assignment.last_failure_at,
  true,
  exists (
    select 1
    from public.panel_device_playlists backup
    join public.panel_playlists backup_playlist on backup_playlist.id = backup.playlist_id
    where backup.device_id = assignment.device_id
      and backup.active = true
      and backup_playlist.active = true
      and backup.priority > assignment.priority
  ),
  greatest(coalesce(assignment.consecutive_failures, 1), 1),
  case
    when assignment.last_success_at is not null and assignment.last_success_at > assignment.last_failure_at then 'resolved'
    else 'open'
  end,
  assignment.last_failure_at,
  'legacy_playlist_health',
  'legacy-health:' || assignment.id::text || ':' ||
    floor(extract(epoch from assignment.last_failure_at) * 1000)::bigint::text
from public.panel_device_playlists assignment
join public.panel_devices device on device.id = assignment.device_id
left join public.panel_customers customer on customer.id = device.customer_id
left join public.panel_sellers seller on seller.id = device.seller_id
left join public.panel_playlists playlist on playlist.id = assignment.playlist_id
where assignment.last_failure_at is not null
on conflict (client_event_id) do nothing;
