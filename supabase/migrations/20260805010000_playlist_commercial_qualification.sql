-- Lote 1: separa transporte técnico de qualificação comercial.
-- Esta migration não altera URLs, vínculos, prioridades, saldos ou validades.

alter table public.panel_playlists
  add column if not exists playlist_qualification_status text not null default 'validating',
  add column if not exists playlist_qualification_code text,
  add column if not exists playlist_qualification_message text,
  add column if not exists playlist_qualification_updated_at timestamptz not null default now(),
  add column if not exists playlist_qualified_at timestamptz,
  add column if not exists playlist_direct_confirmed_at timestamptz,
  add column if not exists playlist_direct_confirmed_device_id uuid references public.panel_devices(id) on delete set null;

alter table public.panel_devices
  add column if not exists is_playlist_validation_device boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'panel_playlists_qualification_status_check'
      and conrelid = 'public.panel_playlists'::regclass
  ) then
    alter table public.panel_playlists
      add constraint panel_playlists_qualification_status_check
      check (playlist_qualification_status in (
        'validating',
        'ready_cache',
        'awaiting_device_test',
        'ready_direct',
        'retryable_error',
        'blocked'
      ));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'panel_playlists_qualification_code_length_check'
      and conrelid = 'public.panel_playlists'::regclass
  ) then
    alter table public.panel_playlists
      add constraint panel_playlists_qualification_code_length_check
      check (
        playlist_qualification_code is null
        or char_length(playlist_qualification_code) between 1 and 80
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'panel_playlists_qualification_message_length_check'
      and conrelid = 'public.panel_playlists'::regclass
  ) then
    alter table public.panel_playlists
      add constraint panel_playlists_qualification_message_length_check
      check (
        playlist_qualification_message is null
        or char_length(playlist_qualification_message) <= 500
      );
  end if;
end
$$;

create index if not exists panel_playlists_qualification_status_idx
  on public.panel_playlists (playlist_qualification_status, active, created_at desc);

create index if not exists panel_playlists_direct_confirmation_idx
  on public.panel_playlists (playlist_direct_confirmed_at desc)
  where playlist_qualification_status = 'ready_direct';

create table if not exists public.panel_playlist_validation_sessions (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.panel_playlists(id) on delete cascade,
  device_id uuid not null references public.panel_devices(id) on delete cascade,
  status text not null default 'active',
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  succeeded_at timestamptz,
  failed_at timestamptz,
  revoked_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint panel_playlist_validation_sessions_status_check
    check (status in ('active', 'succeeded', 'failed', 'expired', 'revoked')),
  constraint panel_playlist_validation_sessions_expiry_check
    check (expires_at > starts_at),
  constraint panel_playlist_validation_sessions_error_code_check
    check (last_error_code is null or char_length(last_error_code) between 1 and 80),
  constraint panel_playlist_validation_sessions_error_message_check
    check (last_error_message is null or char_length(last_error_message) <= 500)
);

create unique index if not exists panel_playlist_validation_one_active_device_idx
  on public.panel_playlist_validation_sessions (device_id)
  where status = 'active';

create unique index if not exists panel_playlist_validation_one_active_playlist_idx
  on public.panel_playlist_validation_sessions (playlist_id)
  where status = 'active';

create index if not exists panel_playlist_validation_history_idx
  on public.panel_playlist_validation_sessions (playlist_id, created_at desc);

create index if not exists panel_playlist_validation_expiry_idx
  on public.panel_playlist_validation_sessions (expires_at)
  where status = 'active';

alter table public.panel_playlist_validation_sessions enable row level security;
alter table public.panel_playlist_validation_sessions force row level security;
revoke all on table public.panel_playlist_validation_sessions from public, anon, authenticated;
grant select, insert, update, delete on table public.panel_playlist_validation_sessions to service_role;

create or replace function public.safe_playlist_qualification_message(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select nullif(
    left(
      trim(
        regexp_replace(
          regexp_replace(
            coalesce(p_value, ''),
            'https?://[^[:space:]|)]+',
            '[origem protegida]',
            'gi'
          ),
          '([?&](username|user|login|password|pass|passwd|pwd|token|key|secret)=)[^&[:space:]|)]+',
          '\1[protegido]',
          'gi'
        )
      ),
      500
    ),
    ''
  );
$$;

create or replace function public.playlist_is_commercially_usable(p_playlist_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select playlist.active is true
      and playlist.playlist_qualification_status in ('ready_cache', 'ready_direct')
    from public.panel_playlists playlist
    where playlist.id = p_playlist_id
  ), false);
$$;

create or replace function public.get_playlist_commercial_decision(p_playlist_id uuid)
returns table (
  playlist_id uuid,
  qualification_status text,
  commercially_usable boolean,
  qualification_label text,
  qualification_message text,
  recommended_action text,
  can_retry_cache boolean,
  requires_device_test boolean,
  qualified_at timestamptz,
  direct_confirmed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    playlist.id,
    playlist.playlist_qualification_status,
    playlist.active is true
      and playlist.playlist_qualification_status in ('ready_cache', 'ready_direct'),
    case playlist.playlist_qualification_status
      when 'validating' then 'Validando lista'
      when 'ready_cache' then 'Cache pronto'
      when 'awaiting_device_test' then 'Aguardando teste no aparelho'
      when 'ready_direct' then 'Acesso direto homologado'
      when 'retryable_error' then 'Falha temporária'
      else 'Lista bloqueada'
    end,
    coalesce(
      playlist.playlist_qualification_message,
      case playlist.playlist_qualification_status
        when 'validating' then 'A lista foi salva e está sendo validada.'
        when 'ready_cache' then 'A lista está pronta para ativação pelo cache protegido.'
        when 'awaiting_device_test' then 'O provedor exige uma confirmação real em aparelho antes da ativação.'
        when 'ready_direct' then 'A lista foi confirmada em aparelho e está pronta para ativação direta.'
        when 'retryable_error' then 'A validação foi interrompida e pode ser tentada novamente.'
        else 'A lista não está liberada para novas ativações.'
      end
    ),
    case playlist.playlist_qualification_status
      when 'validating' then 'wait'
      when 'ready_cache' then 'activate'
      when 'awaiting_device_test' then 'test_on_device'
      when 'ready_direct' then 'activate'
      when 'retryable_error' then 'retry_cache'
      else 'edit_source'
    end,
    playlist.playlist_qualification_status in ('validating', 'retryable_error'),
    playlist.playlist_qualification_status = 'awaiting_device_test',
    playlist.playlist_qualified_at,
    playlist.playlist_direct_confirmed_at
  from public.panel_playlists playlist
  where playlist.id = p_playlist_id;
$$;

create or replace function public.assert_playlist_commercially_usable(
  p_playlist_id uuid,
  p_label text default 'Lista'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_playlist public.panel_playlists%rowtype;
  v_label text := left(coalesce(nullif(trim(p_label), ''), 'Lista'), 80);
begin
  if p_playlist_id is null then
    raise exception using errcode = '22023', message = v_label || ' é obrigatória.';
  end if;

  select *
  into v_playlist
  from public.panel_playlists playlist
  where playlist.id = p_playlist_id
  for share;

  if not found or v_playlist.active is not true then
    raise exception using errcode = 'P0001', message = v_label || ' inexistente ou inativa.';
  end if;

  if v_playlist.playlist_qualification_status not in ('ready_cache', 'ready_direct') then
    raise exception using
      errcode = 'P0001',
      message = format(
        '%s ainda não está homologada para ativação. Estado: %s.',
        v_label,
        case v_playlist.playlist_qualification_status
          when 'validating' then 'validando lista'
          when 'awaiting_device_test' then 'aguardando teste no aparelho'
          when 'retryable_error' then 'falha temporária'
          when 'blocked' then 'lista bloqueada'
          else v_playlist.playlist_qualification_status
        end
      );
  end if;
end;
$$;

create or replace function public.sync_playlist_qualification_from_cache()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_source_changed boolean := false;
  v_cache_changed boolean := false;
  v_transient_codes constant text[] := array[
    'CACHE_LEASE_EXPIRED',
    'CACHE_LEASE_MISSING',
    'CACHE_ATTEMPT_REPLACED',
    'CACHE_BUILD_FAILED',
    'CACHE_BUSY',
    'CACHE_INTERNAL_ERROR'
  ];
  v_definitive_codes constant text[] := array[
    'INVALID_OR_BLOCKED_URL',
    'INVALID_CREDENTIALS',
    'INVALID_PLAYLIST_CONTENT',
    'XTREAM_AUTH_INVALID',
    'XTREAM_AUTH_EXPIRED'
  ];
begin
  if tg_op = 'INSERT' then
    if new.playlist_cache_status = 'ready' and coalesce(new.playlist_cache_item_count, 0) > 0 then
      new.playlist_qualification_status := 'ready_cache';
      new.playlist_qualification_code := 'CACHE_READY';
      new.playlist_qualification_message := 'A lista está pronta para ativação pelo cache protegido.';
      new.playlist_qualified_at := coalesce(new.playlist_cache_updated_at, now());
    else
      new.playlist_qualification_status := coalesce(new.playlist_qualification_status, 'validating');
      new.playlist_qualification_code := coalesce(new.playlist_qualification_code, 'VALIDATION_PENDING');
      new.playlist_qualification_message := coalesce(
        public.safe_playlist_qualification_message(new.playlist_qualification_message),
        'A lista foi salva e está sendo validada.'
      );
    end if;
    new.playlist_qualification_updated_at := now();
    return new;
  end if;

  v_source_changed :=
    new.playlist_url is distinct from old.playlist_url
    or new.playlist_type is distinct from old.playlist_type;

  if v_source_changed then
    new.playlist_cache_status := 'missing';
    new.playlist_cache_path := null;
    new.playlist_cache_version := null;
    new.playlist_cache_updated_at := null;
    new.playlist_cache_item_count := 0;
    new.playlist_cache_size_bytes := 0;
    new.playlist_cache_error := null;
    new.playlist_cache_manifest_path := null;
    new.playlist_cache_channels_path := null;
    new.playlist_cache_movies_path := null;
    new.playlist_cache_series_path := null;
    new.playlist_cache_error_code := null;
    new.playlist_cache_attempts := '[]'::jsonb;
    new.playlist_cache_manifest_sha256 := null;
    new.playlist_cache_manifest_size_bytes := null;
    new.playlist_cache_active_attempt_id := null;
    new.playlist_access_mode := 'server_cache';
    new.playlist_qualification_status := 'validating';
    new.playlist_qualification_code := 'SOURCE_CHANGED';
    new.playlist_qualification_message := 'A origem foi alterada e precisa ser validada novamente.';
    new.playlist_qualification_updated_at := now();
    new.playlist_qualified_at := null;
    new.playlist_direct_confirmed_at := null;
    new.playlist_direct_confirmed_device_id := null;
    return new;
  end if;

  v_cache_changed :=
    new.playlist_cache_status is distinct from old.playlist_cache_status
    or new.playlist_access_mode is distinct from old.playlist_access_mode
    or new.playlist_cache_error_code is distinct from old.playlist_cache_error_code
    or new.playlist_cache_error is distinct from old.playlist_cache_error
    or new.playlist_cache_updated_at is distinct from old.playlist_cache_updated_at
    or new.playlist_cache_item_count is distinct from old.playlist_cache_item_count;

  if not v_cache_changed then
    new.playlist_qualification_message := public.safe_playlist_qualification_message(
      new.playlist_qualification_message
    );
    return new;
  end if;

  if new.playlist_cache_status = 'ready' and coalesce(new.playlist_cache_item_count, 0) > 0 then
    new.playlist_qualification_status := 'ready_cache';
    new.playlist_qualification_code := 'CACHE_READY';
    new.playlist_qualification_message := 'A lista está pronta para ativação pelo cache protegido.';
    new.playlist_qualification_updated_at := now();
    new.playlist_qualified_at := coalesce(new.playlist_cache_updated_at, now());
    return new;
  end if;

  if old.playlist_qualification_status = 'ready_direct'
     and new.playlist_cache_status in ('missing', 'building', 'error') then
    new.playlist_qualification_status := 'ready_direct';
    new.playlist_qualification_code := 'DIRECT_ALREADY_CONFIRMED';
    new.playlist_qualification_message := 'O acesso direto continua homologado enquanto o cache é reavaliado.';
    new.playlist_qualification_updated_at := now();
    return new;
  end if;

  if new.playlist_access_mode = 'direct' then
    new.playlist_qualification_status := 'awaiting_device_test';
    new.playlist_qualification_code := coalesce(new.playlist_cache_error_code, 'DIRECT_TEST_REQUIRED');
    new.playlist_qualification_message := 'O provedor exige confirmação em aparelho antes de liberar novas ativações.';
    new.playlist_qualification_updated_at := now();
    new.playlist_qualified_at := null;
    return new;
  end if;

  if new.playlist_cache_status in ('missing', 'building') then
    new.playlist_qualification_status := 'validating';
    new.playlist_qualification_code := 'VALIDATION_PENDING';
    new.playlist_qualification_message := 'A lista foi salva e está sendo validada.';
    new.playlist_qualification_updated_at := now();
    new.playlist_qualified_at := null;
    return new;
  end if;

  if new.playlist_cache_status = 'error' then
    if new.playlist_cache_error_code = any(v_definitive_codes) then
      new.playlist_qualification_status := 'blocked';
      new.playlist_qualification_code := new.playlist_cache_error_code;
      new.playlist_qualification_message := coalesce(
        public.safe_playlist_qualification_message(new.playlist_cache_error),
        'A lista não pôde ser homologada.'
      );
    else
      new.playlist_qualification_status := 'retryable_error';
      new.playlist_qualification_code := coalesce(new.playlist_cache_error_code, 'VALIDATION_RETRY_REQUIRED');
      new.playlist_qualification_message := coalesce(
        public.safe_playlist_qualification_message(new.playlist_cache_error),
        'A validação foi interrompida e pode ser tentada novamente.'
      );
    end if;
    new.playlist_qualification_updated_at := now();
    new.playlist_qualified_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists panel_playlists_qualification_sync on public.panel_playlists;
create trigger panel_playlists_qualification_sync
before insert or update of
  playlist_url,
  playlist_type,
  playlist_cache_status,
  playlist_access_mode,
  playlist_cache_error_code,
  playlist_cache_error,
  playlist_cache_updated_at,
  playlist_cache_item_count,
  playlist_qualification_message
on public.panel_playlists
for each row execute function public.sync_playlist_qualification_from_cache();

-- Backfill conservador: nenhum vínculo ou dado de origem é alterado.
update public.panel_playlists playlist
set
  playlist_qualification_status = case
    when playlist.playlist_cache_status = 'ready'
      and coalesce(playlist.playlist_cache_item_count, 0) > 0
      then 'ready_cache'
    when playlist.playlist_access_mode = 'direct'
      then 'awaiting_device_test'
    when playlist.playlist_cache_status in ('missing', 'building')
      then 'validating'
    when playlist.playlist_cache_error_code in (
      'INVALID_OR_BLOCKED_URL',
      'INVALID_CREDENTIALS',
      'INVALID_PLAYLIST_CONTENT',
      'XTREAM_AUTH_INVALID',
      'XTREAM_AUTH_EXPIRED'
    ) then 'blocked'
    else 'retryable_error'
  end,
  playlist_qualification_code = case
    when playlist.playlist_cache_status = 'ready'
      and coalesce(playlist.playlist_cache_item_count, 0) > 0
      then 'CACHE_READY'
    when playlist.playlist_access_mode = 'direct'
      then coalesce(playlist.playlist_cache_error_code, 'DIRECT_TEST_REQUIRED')
    when playlist.playlist_cache_status in ('missing', 'building')
      then 'VALIDATION_PENDING'
    else coalesce(playlist.playlist_cache_error_code, 'VALIDATION_RETRY_REQUIRED')
  end,
  playlist_qualification_message = case
    when playlist.playlist_cache_status = 'ready'
      and coalesce(playlist.playlist_cache_item_count, 0) > 0
      then 'A lista está pronta para ativação pelo cache protegido.'
    when playlist.playlist_access_mode = 'direct'
      then 'O provedor exige confirmação em aparelho antes de liberar novas ativações.'
    when playlist.playlist_cache_status in ('missing', 'building')
      then 'A lista foi salva e está sendo validada.'
    when playlist.playlist_cache_error_code in (
      'INVALID_OR_BLOCKED_URL',
      'INVALID_CREDENTIALS',
      'INVALID_PLAYLIST_CONTENT',
      'XTREAM_AUTH_INVALID',
      'XTREAM_AUTH_EXPIRED'
    ) then coalesce(
      public.safe_playlist_qualification_message(playlist.playlist_cache_error),
      'A lista não pôde ser homologada.'
    )
    else coalesce(
      public.safe_playlist_qualification_message(playlist.playlist_cache_error),
      'A validação foi interrompida e pode ser tentada novamente.'
    )
  end,
  playlist_qualification_updated_at = now(),
  playlist_qualified_at = case
    when playlist.playlist_cache_status = 'ready'
      and coalesce(playlist.playlist_cache_item_count, 0) > 0
      then coalesce(playlist.playlist_cache_updated_at, now())
    else null
  end;

-- Promove apenas listas diretas que já possuem sucesso real registrado pela matriz.
do $$
begin
  if to_regclass('public.playlist_provider_attempts') is not null then
    execute $sql$
      update public.panel_playlists playlist
      set
        playlist_qualification_status = 'ready_direct',
        playlist_qualification_code = 'DIRECT_SUCCESS_BACKFILL',
        playlist_qualification_message = 'O acesso direto já havia sido confirmado por um aparelho.',
        playlist_qualification_updated_at = now(),
        playlist_qualified_at = now(),
        playlist_direct_confirmed_at = now()
      where playlist.active is true
        and playlist.playlist_access_mode = 'direct'
        and exists (
          select 1
          from public.playlist_provider_attempts attempt
          where attempt.playlist_id = playlist.id
            and attempt.result = 'success'
            and attempt.transport in ('xtream', 'm3u')
        )
    $sql$;
  end if;
end
$$;

create or replace function public.start_playlist_validation_session(
  p_playlist_id uuid,
  p_device_id uuid,
  p_duration_minutes integer default 15,
  p_created_by_user_id uuid default null
)
returns table (
  session_id uuid,
  playlist_id uuid,
  device_id uuid,
  status text,
  starts_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_playlist public.panel_playlists%rowtype;
  v_device public.panel_devices%rowtype;
  v_session public.panel_playlist_validation_sessions%rowtype;
  v_now timestamptz := now();
begin
  if p_duration_minutes is null or p_duration_minutes not between 2 and 60 then
    raise exception using errcode = '22023', message = 'A validação deve durar entre 2 e 60 minutos.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('playlist-validation:' || p_playlist_id::text, 0)
  );

  update public.panel_playlist_validation_sessions session
  set status = 'expired', updated_at = v_now
  where session.status = 'active'
    and session.expires_at <= v_now;

  select * into v_playlist
  from public.panel_playlists playlist
  where playlist.id = p_playlist_id
  for update;
  if not found or v_playlist.active is not true then
    raise exception using errcode = 'P0002', message = 'Lista ativa não encontrada.';
  end if;
  if v_playlist.playlist_access_mode <> 'direct'
     or v_playlist.playlist_qualification_status not in ('awaiting_device_test', 'retryable_error') then
    raise exception using errcode = 'P0001', message = 'Esta lista não está aguardando validação direta.';
  end if;

  select * into v_device
  from public.panel_devices device
  where device.id = p_device_id
  for update;
  if not found or v_device.is_playlist_validation_device is not true then
    raise exception using errcode = 'P0001', message = 'O aparelho escolhido não está marcado para validação de listas.';
  end if;
  if v_device.device_credential_hash is null then
    raise exception using errcode = 'P0001', message = 'O aparelho de validação ainda não possui credencial segura.';
  end if;

  update public.panel_playlist_validation_sessions session
  set status = 'revoked', revoked_at = v_now, updated_at = v_now
  where session.status = 'active'
    and (session.device_id = p_device_id or session.playlist_id = p_playlist_id);

  insert into public.panel_playlist_validation_sessions (
    playlist_id,
    device_id,
    status,
    starts_at,
    expires_at,
    created_by_user_id,
    updated_at
  ) values (
    p_playlist_id,
    p_device_id,
    'active',
    v_now,
    v_now + make_interval(mins => p_duration_minutes),
    p_created_by_user_id,
    v_now
  ) returning * into v_session;

  update public.panel_playlists playlist
  set
    playlist_qualification_status = 'awaiting_device_test',
    playlist_qualification_code = 'DEVICE_TEST_ACTIVE',
    playlist_qualification_message = 'Teste direto iniciado. Atualize o aplicativo no aparelho de validação.',
    playlist_qualification_updated_at = v_now
  where playlist.id = p_playlist_id;

  return query select
    v_session.id,
    v_session.playlist_id,
    v_session.device_id,
    v_session.status,
    v_session.starts_at,
    v_session.expires_at;
end;
$$;

create or replace function public.resolve_active_playlist_validation_session(p_device_id uuid)
returns table (
  session_id uuid,
  playlist_id uuid,
  device_id uuid,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.panel_playlist_validation_sessions session
  set status = 'expired', updated_at = now()
  where session.status = 'active'
    and session.expires_at <= now();

  return query
  select session.id, session.playlist_id, session.device_id, session.expires_at
  from public.panel_playlist_validation_sessions session
  join public.panel_devices device on device.id = session.device_id
  where session.device_id = p_device_id
    and session.status = 'active'
    and session.expires_at > now()
    and device.is_playlist_validation_device is true
  order by session.created_at desc
  limit 1;
end;
$$;

create or replace function public.mark_playlist_direct_success(
  p_playlist_id uuid,
  p_device_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authorized boolean := false;
  v_now timestamptz := now();
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('playlist-validation:' || p_playlist_id::text, 0)
  );

  select exists (
    select 1
    from public.panel_playlist_validation_sessions session
    where session.playlist_id = p_playlist_id
      and session.device_id = p_device_id
      and session.status = 'active'
      and session.expires_at > v_now
  ) or exists (
    select 1
    from public.panel_devices device
    where device.id = p_device_id
      and device.status = 'active'
      and (
        device.playlist_id = p_playlist_id
        or exists (
          select 1
          from public.panel_device_playlists assignment
          where assignment.device_id = device.id
            and assignment.playlist_id = p_playlist_id
            and assignment.active is true
        )
      )
  ) into v_authorized;

  if not v_authorized then
    return false;
  end if;

  update public.panel_playlist_validation_sessions session
  set
    status = 'succeeded',
    succeeded_at = v_now,
    updated_at = v_now,
    last_error_code = null,
    last_error_message = null
  where session.playlist_id = p_playlist_id
    and session.device_id = p_device_id
    and session.status = 'active';

  update public.panel_playlists playlist
  set
    playlist_access_mode = 'direct',
    playlist_qualification_status = 'ready_direct',
    playlist_qualification_code = 'DIRECT_DEVICE_CONFIRMED',
    playlist_qualification_message = 'O acesso direto foi confirmado por um aparelho autorizado.',
    playlist_qualification_updated_at = v_now,
    playlist_qualified_at = v_now,
    playlist_direct_confirmed_at = v_now,
    playlist_direct_confirmed_device_id = p_device_id
  where playlist.id = p_playlist_id
    and playlist.active is true;

  return found;
end;
$$;

create or replace function public.mark_playlist_validation_failure(
  p_playlist_id uuid,
  p_device_id uuid,
  p_error_code text,
  p_error_message text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_message text := coalesce(
    public.safe_playlist_qualification_message(p_error_message),
    'O aparelho não conseguiu confirmar a lista.'
  );
begin
  update public.panel_playlist_validation_sessions session
  set
    status = 'failed',
    failed_at = v_now,
    updated_at = v_now,
    last_error_code = left(coalesce(nullif(trim(p_error_code), ''), 'DEVICE_TEST_FAILED'), 80),
    last_error_message = v_message
  where session.playlist_id = p_playlist_id
    and session.device_id = p_device_id
    and session.status = 'active';

  if not found then
    return false;
  end if;

  update public.panel_playlists playlist
  set
    playlist_qualification_status = 'awaiting_device_test',
    playlist_qualification_code = 'DEVICE_TEST_FAILED',
    playlist_qualification_message = 'O teste no aparelho falhou. Revise o diagnóstico e tente novamente.',
    playlist_qualification_updated_at = v_now,
    playlist_qualified_at = null
  where playlist.id = p_playlist_id
    and playlist.playlist_qualification_status <> 'ready_direct';

  return true;
end;
$$;

create or replace function public.revoke_playlist_validation_session(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.panel_playlist_validation_sessions session
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where session.id = p_session_id
    and session.status = 'active';
  return found;
end;
$$;

create or replace function public.enforce_device_primary_playlist_qualification()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_requires_check boolean := false;
begin
  if new.status <> 'active' or new.playlist_id is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_requires_check := true;
  else
    v_requires_check :=
      old.status is distinct from new.status
      or old.playlist_id is distinct from new.playlist_id
      or (
        new.subscription_expires_at is not null
        and (
          old.subscription_expires_at is null
          or new.subscription_expires_at > old.subscription_expires_at
        )
      );
  end if;

  if v_requires_check then
    perform public.assert_playlist_commercially_usable(new.playlist_id, 'Lista principal');
  end if;
  return new;
end;
$$;

drop trigger if exists panel_devices_primary_playlist_qualification_guard on public.panel_devices;
create trigger panel_devices_primary_playlist_qualification_guard
before insert or update of status, playlist_id, subscription_expires_at
on public.panel_devices
for each row execute function public.enforce_device_primary_playlist_qualification();

create or replace function public.enforce_device_assignment_playlist_qualification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.active is true and (
    tg_op = 'INSERT'
    or old.active is distinct from new.active
    or old.playlist_id is distinct from new.playlist_id
  ) then
    perform public.assert_playlist_commercially_usable(
      new.playlist_id,
      case when new.priority = 2 then 'Lista reserva' else 'Lista principal' end
    );
  end if;
  return new;
end;
$$;

drop trigger if exists panel_device_playlists_qualification_guard on public.panel_device_playlists;
create trigger panel_device_playlists_qualification_guard
before insert or update of playlist_id, active, priority
on public.panel_device_playlists
for each row execute function public.enforce_device_assignment_playlist_qualification();

revoke all on function public.safe_playlist_qualification_message(text) from public, anon, authenticated;
revoke all on function public.playlist_is_commercially_usable(uuid) from public, anon, authenticated;
revoke all on function public.get_playlist_commercial_decision(uuid) from public, anon, authenticated;
revoke all on function public.assert_playlist_commercially_usable(uuid, text) from public, anon, authenticated;
revoke all on function public.start_playlist_validation_session(uuid, uuid, integer, uuid) from public, anon, authenticated;
revoke all on function public.resolve_active_playlist_validation_session(uuid) from public, anon, authenticated;
revoke all on function public.mark_playlist_direct_success(uuid, uuid) from public, anon, authenticated;
revoke all on function public.mark_playlist_validation_failure(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.revoke_playlist_validation_session(uuid) from public, anon, authenticated;

grant execute on function public.safe_playlist_qualification_message(text) to service_role;
grant execute on function public.playlist_is_commercially_usable(uuid) to service_role;
grant execute on function public.get_playlist_commercial_decision(uuid) to service_role;
grant execute on function public.assert_playlist_commercially_usable(uuid, text) to service_role;
grant execute on function public.start_playlist_validation_session(uuid, uuid, integer, uuid) to service_role;
grant execute on function public.resolve_active_playlist_validation_session(uuid) to service_role;
grant execute on function public.mark_playlist_direct_success(uuid, uuid) to service_role;
grant execute on function public.mark_playlist_validation_failure(uuid, uuid, text, text) to service_role;
grant execute on function public.revoke_playlist_validation_session(uuid) to service_role;

comment on column public.panel_playlists.playlist_qualification_status is
  'Qualificação comercial separada do transporte técnico. Somente ready_cache e ready_direct autorizam novas ativações.';
comment on column public.panel_devices.is_playlist_validation_device is
  'Aparelho explicitamente reservado pelo owner para testar listas diretas sem venda ou vínculo comercial.';
comment on table public.panel_playlist_validation_sessions is
  'Sessões temporárias e isoladas para homologar uma lista direta em aparelho autorizado, sem consumir crédito.';
