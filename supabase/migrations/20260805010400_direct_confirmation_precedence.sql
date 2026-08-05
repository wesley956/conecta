-- A confirmação explícita de um aparelho autorizado prevalece sobre o erro
-- anterior do datacenter. A sincronização técnica não pode rebaixar ready_direct.

create or replace function public.sync_playlist_qualification_from_cache()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_source_changed boolean := false;
  v_cache_changed boolean := false;
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

  -- Transição explícita feita por mark_playlist_direct_success.
  if new.playlist_qualification_status = 'ready_direct'
     and new.playlist_direct_confirmed_at is not null then
    new.playlist_access_mode := 'direct';
    new.playlist_cache_error := null;
    new.playlist_cache_error_code := null;
    new.playlist_qualification_code := coalesce(
      new.playlist_qualification_code,
      'DIRECT_DEVICE_CONFIRMED'
    );
    new.playlist_qualification_message := coalesce(
      public.safe_playlist_qualification_message(new.playlist_qualification_message),
      'O acesso direto foi confirmado por um aparelho autorizado.'
    );
    new.playlist_qualification_updated_at := coalesce(
      new.playlist_qualification_updated_at,
      now()
    );
    new.playlist_qualified_at := coalesce(new.playlist_qualified_at, now());
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
    new.playlist_qualified_at := coalesce(old.playlist_qualified_at, now());
    new.playlist_direct_confirmed_at := old.playlist_direct_confirmed_at;
    new.playlist_direct_confirmed_device_id := old.playlist_direct_confirmed_device_id;
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
      new.playlist_qualification_code := coalesce(
        new.playlist_cache_error_code,
        'VALIDATION_RETRY_REQUIRED'
      );
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
