begin;

create table if not exists public.playlist_source_consolidations (
  id uuid primary key default gen_random_uuid(),
  duplicate_playlist_id uuid not null unique references public.panel_playlists(id) on delete restrict,
  canonical_playlist_id uuid not null references public.panel_playlists(id) on delete restrict,
  source_fingerprint text,
  reason text not null default 'duplicate_source',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint playlist_source_consolidations_distinct_ids_check
    check (duplicate_playlist_id <> canonical_playlist_id)
);

alter table public.playlist_source_consolidations enable row level security;
revoke all on table public.playlist_source_consolidations from public, anon, authenticated;
grant select, insert, update, delete on table public.playlist_source_consolidations to service_role;

create index if not exists playlist_source_consolidations_canonical_idx
  on public.playlist_source_consolidations(canonical_playlist_id, created_at desc);

create or replace function public.consolidate_playlist_source_transaction(
  p_canonical_id uuid,
  p_duplicate_id uuid,
  p_source_fingerprint text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_canonical public.panel_playlists%rowtype;
  v_duplicate public.panel_playlists%rowtype;
  v_assignment public.panel_device_playlists%rowtype;
  v_target public.panel_device_playlists%rowtype;
  v_session public.panel_playlist_validation_sessions%rowtype;
  v_now timestamptz := now();
  v_fingerprint text := lower(nullif(trim(coalesce(p_source_fingerprint, '')), ''));
  v_seller_links integer := 0;
  v_device_links integer := 0;
  v_legacy_links integer := 0;
  v_review_links integer := 0;
  v_sessions_moved integer := 0;
begin
  if p_canonical_id is null or p_duplicate_id is null or p_canonical_id = p_duplicate_id then
    raise exception using errcode = '22023', message = 'Listas canônica e duplicada precisam ser diferentes.';
  end if;

  if v_fingerprint is not null and v_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Fingerprint da origem inválido.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'playlist-consolidation:' || least(p_canonical_id::text, p_duplicate_id::text)
        || ':' || greatest(p_canonical_id::text, p_duplicate_id::text),
      0
    )
  );

  select playlist.* into v_canonical
  from public.panel_playlists playlist
  where playlist.id = p_canonical_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Lista canônica não encontrada.';
  end if;

  select playlist.* into v_duplicate
  from public.panel_playlists playlist
  where playlist.id = p_duplicate_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Lista duplicada não encontrada.';
  end if;

  if v_canonical.active is not true then
    raise exception using errcode = 'P0001', message = 'A lista canônica precisa estar ativa.';
  end if;

  if v_duplicate.active is not true then
    return jsonb_build_object(
      'ok', true,
      'alreadyConsolidated', true,
      'canonicalPlaylistId', p_canonical_id,
      'duplicatePlaylistId', p_duplicate_id
    );
  end if;

  if v_canonical.playlist_url <> v_duplicate.playlist_url
     and v_fingerprint is null
     and not (
       v_canonical.source_fingerprint is not null
       and v_canonical.source_fingerprint = v_duplicate.source_fingerprint
     ) then
    raise exception using errcode = '22023', message = 'As listas não representam a mesma origem.';
  end if;

  if v_fingerprint is not null then
    if v_canonical.source_fingerprint is not null
       and v_canonical.source_fingerprint <> v_fingerprint then
      raise exception using errcode = '22023', message = 'A lista canônica possui outro fingerprint.';
    end if;
    if v_duplicate.source_fingerprint is not null
       and v_duplicate.source_fingerprint <> v_fingerprint then
      raise exception using errcode = '22023', message = 'A lista duplicada possui outro fingerprint.';
    end if;
  else
    v_fingerprint := coalesce(v_canonical.source_fingerprint, v_duplicate.source_fingerprint);
  end if;

  -- Libera primeiro o índice único da origem; a duplicata continuará preservada e arquivada.
  update public.panel_playlists
  set source_fingerprint = null
  where id = p_duplicate_id;

  insert into public.panel_seller_playlists (
    seller_id,
    playlist_id,
    active,
    created_at,
    updated_at
  )
  select
    link.seller_id,
    p_canonical_id,
    link.active,
    link.created_at,
    v_now
  from public.panel_seller_playlists link
  where link.playlist_id = p_duplicate_id
  on conflict (seller_id, playlist_id) do update
    set active = public.panel_seller_playlists.active or excluded.active,
        updated_at = excluded.updated_at;
  get diagnostics v_seller_links = row_count;

  delete from public.panel_seller_playlists
  where playlist_id = p_duplicate_id;

  for v_assignment in
    select assignment.*
    from public.panel_device_playlists assignment
    where assignment.playlist_id = p_duplicate_id
    order by assignment.device_id, assignment.priority
    for update
  loop
    select assignment.* into v_target
    from public.panel_device_playlists assignment
    where assignment.device_id = v_assignment.device_id
      and assignment.playlist_id = p_canonical_id
    for update;

    if found then
      update public.panel_device_playlists
      set active = v_target.active or v_assignment.active,
          consecutive_failures = least(v_target.consecutive_failures, v_assignment.consecutive_failures),
          last_success_at = greatest(v_target.last_success_at, v_assignment.last_success_at),
          last_failure_at = greatest(v_target.last_failure_at, v_assignment.last_failure_at),
          cooldown_until = case
            when v_target.active or v_assignment.active then null
            else greatest(v_target.cooldown_until, v_assignment.cooldown_until)
          end,
          last_error = coalesce(v_target.last_error, v_assignment.last_error),
          updated_at = v_now
      where id = v_target.id;

      delete from public.panel_device_playlists
      where id = v_assignment.id;
    else
      update public.panel_device_playlists
      set playlist_id = p_canonical_id,
          updated_at = v_now
      where id = v_assignment.id;
    end if;
    v_device_links := v_device_links + 1;
  end loop;

  update public.panel_devices
  set playlist_id = p_canonical_id,
      updated_at = v_now
  where playlist_id = p_duplicate_id;
  get diagnostics v_legacy_links = row_count;

  update public.panel_review_accounts
  set playlist_id = p_canonical_id,
      updated_at = v_now
  where playlist_id = p_duplicate_id;
  get diagnostics v_review_links = row_count;

  for v_session in
    select session.*
    from public.panel_playlist_validation_sessions session
    where session.playlist_id = p_duplicate_id
      and session.status = 'active'
    for update
  loop
    if exists (
      select 1
      from public.panel_playlist_validation_sessions current_session
      where current_session.status = 'active'
        and current_session.id <> v_session.id
        and (
          current_session.playlist_id = p_canonical_id
          or current_session.device_id = v_session.device_id
        )
    ) then
      update public.panel_playlist_validation_sessions
      set status = 'revoked',
          revoked_at = v_now,
          updated_at = v_now,
          last_error_code = 'DUPLICATE_CONSOLIDATED',
          last_error_message = 'Sessão encerrada porque a origem foi consolidada em outra lista.'
      where id = v_session.id;
    else
      update public.panel_playlist_validation_sessions
      set playlist_id = p_canonical_id,
          updated_at = v_now
      where id = v_session.id;
    end if;
    v_sessions_moved := v_sessions_moved + 1;
  end loop;

  update public.panel_playlists
  set source_fingerprint = coalesce(source_fingerprint, v_fingerprint)
  where id = p_canonical_id;

  update public.panel_playlists
  set active = false,
      archived_at = coalesce(archived_at, v_now),
      source_fingerprint = null,
      playlist_access_mode = 'blocked',
      playlist_qualification_status = 'blocked',
      playlist_qualification_code = 'DUPLICATE_CONSOLIDATED',
      playlist_qualification_message = 'Esta linha foi consolidada em uma origem canônica.',
      playlist_qualification_updated_at = v_now
  where id = p_duplicate_id;

  insert into public.playlist_source_consolidations (
    duplicate_playlist_id,
    canonical_playlist_id,
    source_fingerprint,
    reason,
    details,
    created_at
  ) values (
    p_duplicate_id,
    p_canonical_id,
    v_fingerprint,
    'duplicate_source',
    jsonb_build_object(
      'sellerLinks', v_seller_links,
      'deviceLinks', v_device_links,
      'legacyDeviceLinks', v_legacy_links,
      'reviewLinks', v_review_links,
      'validationSessions', v_sessions_moved,
      'duplicateName', v_duplicate.name,
      'canonicalName', v_canonical.name
    ),
    v_now
  )
  on conflict (duplicate_playlist_id) do update
    set canonical_playlist_id = excluded.canonical_playlist_id,
        source_fingerprint = excluded.source_fingerprint,
        details = excluded.details;

  return jsonb_build_object(
    'ok', true,
    'canonicalPlaylistId', p_canonical_id,
    'duplicatePlaylistId', p_duplicate_id,
    'sellerLinks', v_seller_links,
    'deviceLinks', v_device_links,
    'legacyDeviceLinks', v_legacy_links,
    'reviewLinks', v_review_links,
    'validationSessions', v_sessions_moved
  );
end;
$function$;

revoke all on function public.consolidate_playlist_source_transaction(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.consolidate_playlist_source_transaction(uuid, uuid, text)
  to service_role;

-- Remove mensagens técnicas antigas de listas cujo cache atual está pronto.
update public.panel_playlists
set playlist_access_mode = 'server_cache',
    playlist_cache_error = null,
    playlist_cache_error_code = null,
    playlist_qualification_code = case
      when playlist_qualification_status = 'ready_cache' then 'CACHE_READY'
      else playlist_qualification_code
    end,
    playlist_qualification_message = case
      when playlist_qualification_status = 'ready_cache'
        then 'A lista está pronta para ativação pelo cache protegido.'
      else playlist_qualification_message
    end,
    playlist_qualification_updated_at = case
      when playlist_qualification_status = 'ready_cache' then now()
      else playlist_qualification_updated_at
    end
where active is true
  and playlist_cache_status = 'ready'
  and playlist_qualification_status = 'ready_cache'
  and (
    playlist_access_mode <> 'server_cache'
    or playlist_cache_error is not null
    or playlist_cache_error_code is not null
  );

-- Consolida apenas URLs exatamente iguais nesta migração inicial. Origens equivalentes
-- com parâmetros em ordem diferente serão tratadas pelo backfill protegido da Edge Function.
do $block$
declare
  v_group record;
  v_canonical_id uuid;
  v_duplicate record;
  v_fingerprint text;
begin
  for v_group in
    select playlist_url
    from public.panel_playlists
    where active is true
    group by playlist_url
    having count(*) > 1
  loop
    select playlist.id
    into v_canonical_id
    from public.panel_playlists playlist
    where playlist.active is true
      and playlist.playlist_url = v_group.playlist_url
    order by
      case playlist.playlist_qualification_status
        when 'ready_cache' then 0
        when 'ready_direct' then 1
        when 'awaiting_device_test' then 2
        when 'validating' then 3
        when 'retryable_error' then 4
        else 5
      end,
      case when playlist.playlist_cache_status = 'ready' then 0 else 1 end,
      playlist.playlist_cache_item_count desc,
      (
        select count(*)
        from public.panel_device_playlists assignment
        where assignment.playlist_id = playlist.id
          and assignment.active is true
      ) desc,
      (
        select count(*)
        from public.panel_seller_playlists seller_link
        where seller_link.playlist_id = playlist.id
          and seller_link.active is true
      ) desc,
      playlist.created_at asc
    limit 1;

    select max(playlist.source_fingerprint)
    into v_fingerprint
    from public.panel_playlists playlist
    where playlist.active is true
      and playlist.playlist_url = v_group.playlist_url;

    for v_duplicate in
      select playlist.id
      from public.panel_playlists playlist
      where playlist.active is true
        and playlist.playlist_url = v_group.playlist_url
        and playlist.id <> v_canonical_id
      order by playlist.created_at asc
    loop
      perform public.consolidate_playlist_source_transaction(
        v_canonical_id,
        v_duplicate.id,
        v_fingerprint
      );
    end loop;
  end loop;
end;
$block$;

notify pgrst, 'reload schema';

commit;
