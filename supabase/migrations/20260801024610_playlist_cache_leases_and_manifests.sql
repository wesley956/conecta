alter table public.panel_playlists
  add column if not exists playlist_cache_manifest_sha256 text,
  add column if not exists playlist_cache_manifest_size_bytes bigint,
  add column if not exists playlist_cache_active_attempt_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'panel_playlists_cache_manifest_sha256_check'
      and conrelid = 'public.panel_playlists'::regclass
  ) then
    alter table public.panel_playlists
      add constraint panel_playlists_cache_manifest_sha256_check
      check (
        playlist_cache_manifest_sha256 is null
        or playlist_cache_manifest_sha256 ~ '^[0-9a-f]{64}$'
      );
  end if;
end
$$;

create table if not exists public.playlist_cache_generation_attempts (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.panel_playlists(id) on delete cascade,
  owner_id uuid not null,
  source_updated_at timestamptz,
  status text not null default 'building',
  phase text not null default 'claimed',
  lease_expires_at timestamptz not null,
  heartbeat_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  manifest_path text not null,
  channels_path text not null,
  movies_path text not null,
  series_path text not null,
  manifest_sha256 text,
  manifest_size_bytes bigint,
  item_count integer,
  size_bytes bigint,
  version text,
  parts jsonb not null default '{}'::jsonb,
  cache_attempts jsonb not null default '[]'::jsonb,
  error_code text,
  error_message text,
  objects_deleted_at timestamptz,
  constraint playlist_cache_generation_attempts_status_check
    check (status in ('building', 'ready', 'failed', 'abandoned', 'stale')),
  constraint playlist_cache_generation_attempts_phase_check
    check (char_length(phase) between 1 and 64),
  constraint playlist_cache_generation_attempts_sha256_check
    check (manifest_sha256 is null or manifest_sha256 ~ '^[0-9a-f]{64}$'),
  constraint playlist_cache_generation_attempts_counts_check
    check (
      (item_count is null or item_count >= 0)
      and (size_bytes is null or size_bytes >= 0)
      and (manifest_size_bytes is null or manifest_size_bytes >= 0)
    )
);

create table if not exists public.playlist_cache_generation_leases (
  playlist_id uuid primary key references public.panel_playlists(id) on delete cascade,
  attempt_id uuid not null unique references public.playlist_cache_generation_attempts(id) on delete cascade,
  owner_id uuid not null,
  acquired_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  lease_expires_at timestamptz not null,
  constraint playlist_cache_generation_leases_expiry_check
    check (lease_expires_at > acquired_at)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'panel_playlists_cache_active_attempt_fkey'
      and conrelid = 'public.panel_playlists'::regclass
  ) then
    alter table public.panel_playlists
      add constraint panel_playlists_cache_active_attempt_fkey
      foreign key (playlist_cache_active_attempt_id)
      references public.playlist_cache_generation_attempts(id)
      on delete set null;
  end if;
end
$$;

create unique index if not exists playlist_cache_attempts_one_building_per_playlist_idx
  on public.playlist_cache_generation_attempts (playlist_id)
  where status = 'building';

create index if not exists playlist_cache_attempts_history_idx
  on public.playlist_cache_generation_attempts (playlist_id, finished_at desc, started_at desc);

create index if not exists playlist_cache_attempts_cleanup_idx
  on public.playlist_cache_generation_attempts (playlist_id, status, finished_at)
  where objects_deleted_at is null;

create index if not exists playlist_cache_leases_expiry_idx
  on public.playlist_cache_generation_leases (lease_expires_at);

alter table public.playlist_cache_generation_attempts enable row level security;
alter table public.playlist_cache_generation_attempts force row level security;
alter table public.playlist_cache_generation_leases enable row level security;
alter table public.playlist_cache_generation_leases force row level security;

revoke all on table public.playlist_cache_generation_attempts from public, anon, authenticated;
revoke all on table public.playlist_cache_generation_leases from public, anon, authenticated;
grant select, insert, update, delete on table public.playlist_cache_generation_attempts to service_role;
grant select, insert, update, delete on table public.playlist_cache_generation_leases to service_role;

create or replace function public.claim_playlist_cache_generation(
  p_playlist_id uuid,
  p_owner_id uuid,
  p_lease_seconds integer default 180
)
returns table (
  acquired boolean,
  attempt_id uuid,
  lease_expires_at timestamptz,
  manifest_path text,
  channels_path text,
  movies_path text,
  series_path text
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_playlist public.panel_playlists%rowtype;
  v_lease public.playlist_cache_generation_leases%rowtype;
  v_attempt public.playlist_cache_generation_attempts%rowtype;
  v_attempt_id uuid := gen_random_uuid();
  v_expires_at timestamptz;
  v_has_cache boolean;
  v_prefix text;
begin
  if p_playlist_id is null or p_owner_id is null then
    raise exception using errcode = '22023', message = 'Playlist e proprietário do lease são obrigatórios.';
  end if;
  if p_lease_seconds is null or p_lease_seconds not between 60 and 900 then
    raise exception using errcode = '22023', message = 'O lease deve ficar entre 60 e 900 segundos.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_playlist_id::text, 881731));

  select playlist.*
  into v_playlist
  from public.panel_playlists as playlist
  where playlist.id = p_playlist_id
    and playlist.active is true
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Playlist ativa não encontrada.';
  end if;

  v_has_cache := v_playlist.playlist_cache_manifest_path is not null
    and v_playlist.playlist_cache_channels_path is not null
    and v_playlist.playlist_cache_movies_path is not null
    and v_playlist.playlist_cache_series_path is not null
    and coalesce(v_playlist.playlist_cache_item_count, 0) > 0;

  select lease.*
  into v_lease
  from public.playlist_cache_generation_leases as lease
  where lease.playlist_id = p_playlist_id
  for update;

  if found and v_lease.lease_expires_at > now() then
    select attempt.*
    into v_attempt
    from public.playlist_cache_generation_attempts as attempt
    where attempt.id = v_lease.attempt_id;

    return query select
      false,
      v_lease.attempt_id,
      v_lease.lease_expires_at,
      v_attempt.manifest_path,
      v_attempt.channels_path,
      v_attempt.movies_path,
      v_attempt.series_path;
    return;
  end if;

  if found then
    update public.playlist_cache_generation_attempts as attempt
    set
      status = 'abandoned',
      phase = 'lease_expired',
      finished_at = now(),
      error_code = 'CACHE_LEASE_EXPIRED',
      error_message = 'A geração anterior perdeu o lease e foi reconciliada.'
    where attempt.id = v_lease.attempt_id
      and attempt.status = 'building';

    delete from public.playlist_cache_generation_leases as lease
    where lease.playlist_id = p_playlist_id
      and lease.attempt_id = v_lease.attempt_id;

    update public.panel_playlists as playlist
    set
      playlist_cache_active_attempt_id = null,
      playlist_cache_status = case when v_has_cache then 'ready' else 'error' end,
      playlist_cache_error = case when v_has_cache then null else 'A geração anterior foi interrompida. Tente novamente.' end,
      playlist_cache_error_code = case when v_has_cache then null else 'CACHE_LEASE_EXPIRED' end,
      playlist_access_mode = case when v_has_cache then 'server_cache' else 'blocked' end
    where playlist.id = p_playlist_id
      and playlist.playlist_cache_active_attempt_id = v_lease.attempt_id;
  end if;

  with abandoned as (
    update public.playlist_cache_generation_attempts as attempt
    set
      status = 'abandoned',
      phase = 'lease_missing',
      finished_at = now(),
      error_code = 'CACHE_LEASE_MISSING',
      error_message = 'A tentativa ativa não possuía um lease válido.'
    where attempt.playlist_id = p_playlist_id
      and attempt.status = 'building'
      and not exists (
        select 1
        from public.playlist_cache_generation_leases as lease
        where lease.attempt_id = attempt.id
      )
    returning attempt.id
  )
  update public.panel_playlists as playlist
  set
    playlist_cache_active_attempt_id = null,
    playlist_cache_status = case when v_has_cache then 'ready' else 'error' end,
    playlist_cache_error = case when v_has_cache then null else 'A tentativa anterior foi interrompida. Tente novamente.' end,
    playlist_cache_error_code = case when v_has_cache then null else 'CACHE_LEASE_MISSING' end,
    playlist_access_mode = case when v_has_cache then 'server_cache' else 'blocked' end
  where playlist.id = p_playlist_id
    and playlist.playlist_cache_active_attempt_id in (select abandoned.id from abandoned);

  v_expires_at := now() + make_interval(secs => p_lease_seconds);
  v_prefix := p_playlist_id::text || '/' || v_attempt_id::text;

  insert into public.playlist_cache_generation_attempts (
    id,
    playlist_id,
    owner_id,
    source_updated_at,
    status,
    phase,
    lease_expires_at,
    heartbeat_at,
    manifest_path,
    channels_path,
    movies_path,
    series_path
  ) values (
    v_attempt_id,
    p_playlist_id,
    p_owner_id,
    v_playlist.playlist_updated_at,
    'building',
    'claimed',
    v_expires_at,
    now(),
    v_prefix || '/manifest.json',
    v_prefix || '/channels.json',
    v_prefix || '/movies.json',
    v_prefix || '/series.json'
  );

  insert into public.playlist_cache_generation_leases (
    playlist_id,
    attempt_id,
    owner_id,
    acquired_at,
    heartbeat_at,
    lease_expires_at
  ) values (
    p_playlist_id,
    v_attempt_id,
    p_owner_id,
    now(),
    now(),
    v_expires_at
  );

  update public.panel_playlists as playlist
  set
    playlist_cache_active_attempt_id = v_attempt_id,
    playlist_cache_status = case when v_has_cache then 'ready' else 'building' end,
    playlist_cache_error = null,
    playlist_cache_error_code = null,
    playlist_cache_attempts = '[]'::jsonb,
    playlist_access_mode = 'server_cache'
  where playlist.id = p_playlist_id;

  select attempt.*
  into v_attempt
  from public.playlist_cache_generation_attempts as attempt
  where attempt.id = v_attempt_id;

  return query select
    true,
    v_attempt_id,
    v_expires_at,
    v_attempt.manifest_path,
    v_attempt.channels_path,
    v_attempt.movies_path,
    v_attempt.series_path;
end;
$$;

create or replace function public.heartbeat_playlist_cache_generation(
  p_playlist_id uuid,
  p_attempt_id uuid,
  p_owner_id uuid,
  p_phase text,
  p_lease_seconds integer default 180
)
returns table (
  renewed boolean,
  lease_expires_at timestamptz
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_expires_at timestamptz;
  v_renewed boolean := false;
begin
  if p_playlist_id is null or p_attempt_id is null or p_owner_id is null then
    raise exception using errcode = '22023', message = 'Playlist, tentativa e proprietário são obrigatórios.';
  end if;
  if p_lease_seconds is null or p_lease_seconds not between 60 and 900 then
    raise exception using errcode = '22023', message = 'O lease deve ficar entre 60 e 900 segundos.';
  end if;
  if p_phase is null or char_length(trim(p_phase)) not between 1 and 64 then
    raise exception using errcode = '22023', message = 'A fase do processamento é inválida.';
  end if;

  v_expires_at := now() + make_interval(secs => p_lease_seconds);

  update public.playlist_cache_generation_leases as lease
  set
    heartbeat_at = now(),
    lease_expires_at = v_expires_at
  where lease.playlist_id = p_playlist_id
    and lease.attempt_id = p_attempt_id
    and lease.owner_id = p_owner_id
    and lease.lease_expires_at > now();

  v_renewed := found;

  if v_renewed then
    update public.playlist_cache_generation_attempts as attempt
    set
      phase = trim(p_phase),
      heartbeat_at = now(),
      lease_expires_at = v_expires_at
    where attempt.id = p_attempt_id
      and attempt.playlist_id = p_playlist_id
      and attempt.owner_id = p_owner_id
      and attempt.status = 'building';
  else
    v_expires_at := null;
  end if;

  return query select v_renewed, v_expires_at;
end;
$$;

create or replace function public.complete_playlist_cache_generation(
  p_playlist_id uuid,
  p_attempt_id uuid,
  p_owner_id uuid,
  p_generated_at timestamptz,
  p_version text,
  p_item_count integer,
  p_size_bytes bigint,
  p_manifest_sha256 text,
  p_manifest_size_bytes bigint,
  p_cache_attempts jsonb,
  p_parts jsonb
)
returns table (
  published boolean,
  reason text
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_playlist public.panel_playlists%rowtype;
  v_attempt public.playlist_cache_generation_attempts%rowtype;
  v_lease public.playlist_cache_generation_leases%rowtype;
  v_has_cache boolean;
begin
  if p_playlist_id is null or p_attempt_id is null or p_owner_id is null then
    raise exception using errcode = '22023', message = 'Playlist, tentativa e proprietário são obrigatórios.';
  end if;
  if p_generated_at is null or nullif(trim(p_version), '') is null then
    raise exception using errcode = '22023', message = 'Versão e data da geração são obrigatórias.';
  end if;
  if p_item_count is null or p_item_count < 1 or p_size_bytes is null or p_size_bytes < 1 then
    raise exception using errcode = '22023', message = 'A geração precisa conter itens e bytes válidos.';
  end if;
  if p_manifest_sha256 is null or p_manifest_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'O SHA-256 do manifest é inválido.';
  end if;
  if p_manifest_size_bytes is null or p_manifest_size_bytes < 1 then
    raise exception using errcode = '22023', message = 'O tamanho do manifest é inválido.';
  end if;
  if coalesce(jsonb_typeof(p_cache_attempts), '') <> 'array'
     or coalesce(jsonb_typeof(p_parts), '') <> 'object' then
    raise exception using errcode = '22023', message = 'Metadados da geração são inválidos.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_playlist_id::text, 881731));

  select playlist.*
  into v_playlist
  from public.panel_playlists as playlist
  where playlist.id = p_playlist_id
  for update;

  select attempt.*
  into v_attempt
  from public.playlist_cache_generation_attempts as attempt
  where attempt.id = p_attempt_id
    and attempt.playlist_id = p_playlist_id
    and attempt.owner_id = p_owner_id
  for update;

  select lease.*
  into v_lease
  from public.playlist_cache_generation_leases as lease
  where lease.playlist_id = p_playlist_id
    and lease.attempt_id = p_attempt_id
    and lease.owner_id = p_owner_id
  for update;

  if v_playlist.id is null or v_attempt.id is null or v_lease.attempt_id is null
     or v_lease.lease_expires_at <= now() then
    return query select false, 'lease_lost'::text;
    return;
  end if;

  v_has_cache := v_playlist.playlist_cache_manifest_path is not null
    and v_playlist.playlist_cache_channels_path is not null
    and v_playlist.playlist_cache_movies_path is not null
    and v_playlist.playlist_cache_series_path is not null
    and coalesce(v_playlist.playlist_cache_item_count, 0) > 0;

  if v_playlist.playlist_updated_at is distinct from v_attempt.source_updated_at then
    update public.playlist_cache_generation_attempts as attempt
    set
      status = 'stale',
      phase = 'source_changed',
      finished_at = now(),
      error_code = 'CACHE_SOURCE_CHANGED',
      error_message = 'A origem foi alterada durante a geração.'
    where attempt.id = p_attempt_id;

    delete from public.playlist_cache_generation_leases as lease
    where lease.playlist_id = p_playlist_id
      and lease.attempt_id = p_attempt_id;

    update public.panel_playlists as playlist
    set
      playlist_cache_active_attempt_id = null,
      playlist_cache_status = case when v_has_cache then 'ready' else 'missing' end,
      playlist_cache_error = case when v_has_cache then null else 'A lista mudou durante a geração. Gere o cache novamente.' end,
      playlist_cache_error_code = case when v_has_cache then null else 'CACHE_SOURCE_CHANGED' end,
      playlist_access_mode = 'server_cache'
    where playlist.id = p_playlist_id
      and playlist.playlist_cache_active_attempt_id = p_attempt_id;

    return query select false, 'source_changed'::text;
    return;
  end if;

  update public.panel_playlists as playlist
  set
    playlist_cache_status = 'ready',
    playlist_cache_path = v_attempt.manifest_path,
    playlist_cache_manifest_path = v_attempt.manifest_path,
    playlist_cache_channels_path = v_attempt.channels_path,
    playlist_cache_movies_path = v_attempt.movies_path,
    playlist_cache_series_path = v_attempt.series_path,
    playlist_cache_version = trim(p_version),
    playlist_cache_updated_at = p_generated_at,
    playlist_cache_item_count = p_item_count,
    playlist_cache_size_bytes = least(p_size_bytes, 2147483647)::integer,
    playlist_cache_manifest_sha256 = p_manifest_sha256,
    playlist_cache_manifest_size_bytes = p_manifest_size_bytes,
    playlist_cache_active_attempt_id = null,
    playlist_cache_error = null,
    playlist_cache_error_code = null,
    playlist_cache_attempts = p_cache_attempts,
    playlist_access_mode = 'server_cache'
  where playlist.id = p_playlist_id
    and playlist.playlist_cache_active_attempt_id = p_attempt_id;

  if not found then
    update public.playlist_cache_generation_attempts as attempt
    set
      status = 'stale',
      phase = 'attempt_replaced',
      finished_at = now(),
      error_code = 'CACHE_ATTEMPT_REPLACED',
      error_message = 'Outra tentativa assumiu a publicação desta playlist.'
    where attempt.id = p_attempt_id
      and attempt.status = 'building';

    delete from public.playlist_cache_generation_leases as lease
    where lease.playlist_id = p_playlist_id
      and lease.attempt_id = p_attempt_id
      and lease.owner_id = p_owner_id;

    return query select false, 'attempt_replaced'::text;
    return;
  end if;

  update public.playlist_cache_generation_attempts as attempt
  set
    status = 'ready',
    phase = 'published',
    heartbeat_at = now(),
    finished_at = now(),
    manifest_sha256 = p_manifest_sha256,
    manifest_size_bytes = p_manifest_size_bytes,
    item_count = p_item_count,
    size_bytes = p_size_bytes,
    version = trim(p_version),
    parts = p_parts,
    cache_attempts = p_cache_attempts,
    error_code = null,
    error_message = null
  where attempt.id = p_attempt_id;

  delete from public.playlist_cache_generation_leases as lease
  where lease.playlist_id = p_playlist_id
    and lease.attempt_id = p_attempt_id
    and lease.owner_id = p_owner_id;

  return query select true, 'published'::text;
end;
$$;

create or replace function public.fail_playlist_cache_generation(
  p_playlist_id uuid,
  p_attempt_id uuid,
  p_owner_id uuid,
  p_error_code text,
  p_error_message text,
  p_access_mode text,
  p_cache_attempts jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_playlist public.panel_playlists%rowtype;
  v_lease public.playlist_cache_generation_leases%rowtype;
  v_has_cache boolean;
  v_error_code text := left(coalesce(nullif(trim(p_error_code), ''), 'CACHE_BUILD_FAILED'), 80);
  v_error_message text := left(coalesce(nullif(trim(p_error_message), ''), 'Falha ao gerar o cache.'), 500);
  v_access_mode text := case
    when p_access_mode in ('server_cache', 'direct', 'blocked') then p_access_mode
    else 'blocked'
  end;
begin
  if p_playlist_id is null or p_attempt_id is null or p_owner_id is null then
    raise exception using errcode = '22023', message = 'Playlist, tentativa e proprietário são obrigatórios.';
  end if;
  if coalesce(jsonb_typeof(p_cache_attempts), '') <> 'array' then
    raise exception using errcode = '22023', message = 'As tentativas do cache são inválidas.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_playlist_id::text, 881731));

  select lease.*
  into v_lease
  from public.playlist_cache_generation_leases as lease
  where lease.playlist_id = p_playlist_id
    and lease.attempt_id = p_attempt_id
    and lease.owner_id = p_owner_id
  for update;

  if not found then
    return false;
  end if;

  select playlist.*
  into v_playlist
  from public.panel_playlists as playlist
  where playlist.id = p_playlist_id
  for update;

  v_has_cache := v_playlist.playlist_cache_manifest_path is not null
    and v_playlist.playlist_cache_channels_path is not null
    and v_playlist.playlist_cache_movies_path is not null
    and v_playlist.playlist_cache_series_path is not null
    and coalesce(v_playlist.playlist_cache_item_count, 0) > 0;

  update public.playlist_cache_generation_attempts as attempt
  set
    status = 'failed',
    phase = 'failed',
    heartbeat_at = now(),
    finished_at = now(),
    error_code = v_error_code,
    error_message = v_error_message,
    cache_attempts = p_cache_attempts
  where attempt.id = p_attempt_id
    and attempt.status = 'building';

  delete from public.playlist_cache_generation_leases as lease
  where lease.playlist_id = p_playlist_id
    and lease.attempt_id = p_attempt_id
    and lease.owner_id = p_owner_id;

  update public.panel_playlists as playlist
  set
    playlist_cache_active_attempt_id = null,
    playlist_cache_status = case when v_has_cache then 'ready' else 'error' end,
    playlist_cache_error = v_error_message,
    playlist_cache_error_code = v_error_code,
    playlist_cache_attempts = p_cache_attempts,
    playlist_access_mode = case when v_has_cache then 'server_cache' else v_access_mode end
  where playlist.id = p_playlist_id
    and playlist.playlist_cache_active_attempt_id = p_attempt_id;

  return true;
end;
$$;

create or replace function public.reconcile_playlist_cache_generation_leases()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_lease public.playlist_cache_generation_leases%rowtype;
  v_reconciled integer := 0;
begin
  for v_lease in
    delete from public.playlist_cache_generation_leases as lease
    where lease.lease_expires_at <= now()
    returning lease.*
  loop
    update public.playlist_cache_generation_attempts as attempt
    set
      status = 'abandoned',
      phase = 'lease_expired',
      finished_at = now(),
      error_code = 'CACHE_LEASE_EXPIRED',
      error_message = 'A geração perdeu o lease e foi reconciliada automaticamente.'
    where attempt.id = v_lease.attempt_id
      and attempt.status = 'building';

    update public.panel_playlists as playlist
    set
      playlist_cache_active_attempt_id = null,
      playlist_cache_status = case
        when playlist.playlist_cache_manifest_path is not null
          and playlist.playlist_cache_channels_path is not null
          and playlist.playlist_cache_movies_path is not null
          and playlist.playlist_cache_series_path is not null
          and coalesce(playlist.playlist_cache_item_count, 0) > 0
          then 'ready'
        else 'error'
      end,
      playlist_cache_error = case
        when playlist.playlist_cache_manifest_path is not null
          and playlist.playlist_cache_channels_path is not null
          and playlist.playlist_cache_movies_path is not null
          and playlist.playlist_cache_series_path is not null
          and coalesce(playlist.playlist_cache_item_count, 0) > 0
          then null
        else 'A geração foi interrompida. Tente novamente.'
      end,
      playlist_cache_error_code = case
        when playlist.playlist_cache_manifest_path is not null
          and playlist.playlist_cache_channels_path is not null
          and playlist.playlist_cache_movies_path is not null
          and playlist.playlist_cache_series_path is not null
          and coalesce(playlist.playlist_cache_item_count, 0) > 0
          then null
        else 'CACHE_LEASE_EXPIRED'
      end,
      playlist_access_mode = case
        when playlist.playlist_cache_manifest_path is not null
          and playlist.playlist_cache_channels_path is not null
          and playlist.playlist_cache_movies_path is not null
          and playlist.playlist_cache_series_path is not null
          and coalesce(playlist.playlist_cache_item_count, 0) > 0
          then 'server_cache'
        else 'blocked'
      end
    where playlist.id = v_lease.playlist_id
      and playlist.playlist_cache_active_attempt_id = v_lease.attempt_id;

    v_reconciled := v_reconciled + 1;
  end loop;

  return jsonb_build_object(
    'reconciled', v_reconciled,
    'processedAt', now()
  );
end;
$$;

revoke all on function public.claim_playlist_cache_generation(uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.heartbeat_playlist_cache_generation(uuid, uuid, uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.complete_playlist_cache_generation(uuid, uuid, uuid, timestamptz, text, integer, bigint, text, bigint, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.fail_playlist_cache_generation(uuid, uuid, uuid, text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.reconcile_playlist_cache_generation_leases()
  from public, anon, authenticated;

grant execute on function public.claim_playlist_cache_generation(uuid, uuid, integer) to service_role;
grant execute on function public.heartbeat_playlist_cache_generation(uuid, uuid, uuid, text, integer) to service_role;
grant execute on function public.complete_playlist_cache_generation(uuid, uuid, uuid, timestamptz, text, integer, bigint, text, bigint, jsonb, jsonb) to service_role;
grant execute on function public.fail_playlist_cache_generation(uuid, uuid, uuid, text, text, text, jsonb) to service_role;
grant execute on function public.reconcile_playlist_cache_generation_leases() to service_role;

-- pg_cron já é criado pela migration de ciclo temporário dos vendedores.
-- Repetir CREATE EXTENSION ... WITH SCHEMA tenta mover uma extensão existente
-- no PostgreSQL local e falha quando os privilégios do cron já estão definidos.
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'playlist-cache-lease-reconciler'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'playlist-cache-lease-reconciler',
    '*/5 * * * *',
    'select public.reconcile_playlist_cache_generation_leases();'
  );
end
$$;

comment on table public.playlist_cache_generation_attempts is
  'Tentativas persistidas e idempotentes de geração do cache, sem URL ou credencial da origem.';
comment on table public.playlist_cache_generation_leases is
  'Lease renovável por playlist; listas diferentes podem gerar cache sem se bloquearem.';
comment on column public.panel_playlists.playlist_cache_manifest_sha256 is
  'SHA-256 do manifest imutável atualmente publicado.';
comment on column public.panel_playlists.playlist_cache_active_attempt_id is
  'Tentativa ativa de refresh; o cache anterior permanece pronto enquanto houver uma versão válida.';
comment on table public.playlist_cache_generation_lock is
  'Tabela global legada mantida temporariamente para rollback de Edge Functions antigas; não usar em código novo.';
