-- Protege fontes universais compartilhadas contra sobrescrita por reutilização canônica.
-- Migração incremental porque a fundação universal já foi aplicada em produção.

create or replace function public.register_universal_playlist_source_transaction(
  p_name text,
  p_primary_url text,
  p_legacy_type text,
  p_source_kind text,
  p_max_connections integer,
  p_primary_fingerprint text,
  p_seller_id uuid,
  p_provider jsonb,
  p_endpoints jsonb,
  p_security jsonb,
  p_connection_profile jsonb,
  p_import_kind text,
  p_import_sha256 text,
  p_import_summary jsonb,
  p_created_by_user_id uuid,
  p_created_by_role text,
  p_existing_playlist_id uuid default null
)
returns table (
  playlist_id uuid,
  created boolean,
  endpoint_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registration record;
  v_playlist_id uuid;
  v_created boolean;
  v_endpoint jsonb;
  v_endpoint_id uuid;
  v_first_endpoint_id uuid;
  v_endpoint_count integer := 0;
  v_tls_mode text := lower(trim(coalesce(p_security ->> 'mode', 'strict')));
  v_allowed_hosts text[] := coalesce(
    array(select jsonb_array_elements_text(coalesce(p_security -> 'allowedHosts', '[]'::jsonb))),
    '{}'::text[]
  );
  v_role text := lower(trim(coalesce(p_created_by_role, 'system')));
  v_now timestamptz := now();
begin
  if p_source_kind not in ('auto', 'provider_message', 'm3u', 'xtream', 'stalker', 'api', 'direct', 'manual', 'file') then
    raise exception using errcode = '22023', message = 'Modo de origem inválido.';
  end if;
  if jsonb_typeof(p_endpoints) <> 'array' or jsonb_array_length(p_endpoints) < 1 then
    raise exception using errcode = '22023', message = 'Ao menos um endpoint é obrigatório.';
  end if;
  if v_tls_mode not in ('strict', 'custom_ca', 'insecure') then
    raise exception using errcode = '22023', message = 'Modo TLS inválido.';
  end if;
  if v_role not in ('owner', 'admin', 'seller', 'system') then
    raise exception using errcode = '22023', message = 'Responsável inválido.';
  end if;
  if v_role = 'seller' and p_existing_playlist_id is not null then
    raise exception using errcode = '42501', message = 'Vendedor não pode editar uma origem compartilhada.';
  end if;
  if v_role = 'seller' and v_tls_mode <> 'strict' then
    raise exception using errcode = '42501', message = 'Vendedor não pode configurar exceção de certificado.';
  end if;
  if v_tls_mode = 'insecure' and coalesce((p_security ->> 'riskAccepted')::boolean, false) is not true then
    raise exception using errcode = '22023', message = 'É necessário confirmar o risco para ignorar certificados.';
  end if;

  if p_existing_playlist_id is not null then
    select playlist.id
    into v_playlist_id
    from public.panel_playlists playlist
    where playlist.id = p_existing_playlist_id
      and playlist.archived_at is null
    for update;
    if v_playlist_id is null then
      raise exception using errcode = 'P0002', message = 'Lista existente não encontrada.';
    end if;
    if exists (
      select 1
      from public.panel_playlists duplicate
      where duplicate.id <> v_playlist_id
        and duplicate.active is true
        and duplicate.archived_at is null
        and duplicate.source_fingerprint = p_primary_fingerprint
    ) then
      raise exception using errcode = '23505', message = 'A origem principal já pertence a outra lista.';
    end if;
    v_created := false;
    if p_seller_id is not null then
      insert into public.panel_seller_playlists (seller_id, playlist_id, active, created_at, updated_at)
      values (p_seller_id, v_playlist_id, true, v_now, v_now)
      on conflict on constraint panel_seller_playlists_seller_id_playlist_id_key do update
      set active = true, updated_at = excluded.updated_at;
    end if;
  else
    select *
    into v_registration
    from public.register_playlist_source_transaction(
      p_name,
      p_primary_url,
      p_legacy_type,
      p_max_connections,
      p_primary_fingerprint,
      p_seller_id
    );

    v_playlist_id := v_registration.playlist_id;
    v_created := v_registration.created;
  end if;

  -- Reutilização canônica é somente vínculo. Nunca sobrescreve uma origem
  -- compartilhada com dados, endpoints ou segurança enviados por outro ator.
  if p_existing_playlist_id is null and v_created is false then
    select count(*)::integer
    into v_endpoint_count
    from public.panel_playlist_endpoints endpoint
    where endpoint.playlist_id = v_playlist_id
      and endpoint.active is true;

    insert into public.panel_audit_logs (
      action, entity_type, entity_id, description, metadata, performed_by
    ) values (
      'universal_playlist_reused',
      'playlist',
      v_playlist_id,
      'Origem existente reutilizada sem alterar configuração, endpoints ou política TLS.',
      jsonb_build_object('role', v_role, 'endpointCount', v_endpoint_count),
      v_role || ':' || coalesce(p_created_by_user_id::text, 'system')
    );

    return query select v_playlist_id, false, v_endpoint_count;
    return;
  end if;

  update public.panel_playlists playlist
  set name = left(trim(p_name), 180),
      source_fingerprint = p_primary_fingerprint,
      provider_name = nullif(left(trim(coalesce(p_provider ->> 'name', '')), 180), ''),
      provider_plan_name = nullif(left(trim(coalesce(p_provider ->> 'planName', '')), 240), ''),
      provider_created_at = nullif(p_provider ->> 'createdAt', '')::timestamptz,
      provider_expires_at = nullif(p_provider ->> 'expiresAt', '')::timestamptz,
      source_kind = p_source_kind,
      source_summary = coalesce(p_import_summary, '{}'::jsonb),
      registration_version = 2,
      max_connections = p_max_connections,
      tls_mode = v_tls_mode,
      tls_allowed_hosts = v_allowed_hosts,
      tls_allow_subdomains = coalesce((p_security ->> 'allowSubdomains')::boolean, false),
      tls_allow_redirect_hosts = coalesce((p_security ->> 'allowRedirectHosts')::boolean, false),
      tls_scope_validation = coalesce((p_security -> 'scopes' ->> 'validation')::boolean, true),
      tls_scope_cache = coalesce((p_security -> 'scopes' ->> 'cache')::boolean, true),
      tls_scope_catalog = coalesce((p_security -> 'scopes' ->> 'catalog')::boolean, true),
      tls_scope_playback = coalesce((p_security -> 'scopes' ->> 'playback')::boolean, true),
      tls_risk_accepted_at = case when v_tls_mode = 'insecure' then v_now else null end,
      tls_risk_accepted_by = case when v_tls_mode = 'insecure' then p_created_by_user_id else null end,
      playlist_url = p_primary_url,
      playlist_type = p_legacy_type,
      playlist_updated_at = case when playlist.playlist_url is distinct from p_primary_url then v_now else playlist.playlist_updated_at end
  where playlist.id = v_playlist_id;

  -- Remove a marca de principal antes do upsert para respeitar o índice parcial.
  update public.panel_playlist_endpoints
  set is_primary = false,
      updated_at = v_now
  where playlist_id = v_playlist_id;

  for v_endpoint in select value from jsonb_array_elements(p_endpoints)
  loop
    insert into public.panel_playlist_endpoints (
      playlist_id,
      endpoint_type,
      label,
      endpoint_url,
      protocol,
      host,
      port,
      path,
      output_format,
      priority,
      is_primary,
      active,
      source_fingerprint,
      masked_preview,
      metadata,
      updated_at
    ) values (
      v_playlist_id,
      left(coalesce(v_endpoint ->> 'type', 'unknown'), 30),
      left(coalesce(nullif(v_endpoint ->> 'label', ''), 'Endpoint'), 180),
      left(coalesce(v_endpoint ->> 'url', ''), 4096),
      nullif(lower(v_endpoint ->> 'protocol'), ''),
      left(coalesce(v_endpoint ->> 'host', 'origem'), 255),
      nullif(v_endpoint ->> 'port', '')::integer,
      left(coalesce(v_endpoint ->> 'path', ''), 2048),
      left(coalesce(v_endpoint ->> 'outputFormat', ''), 80),
      greatest(1, least(100, coalesce((v_endpoint ->> 'priority')::integer, 1))),
      coalesce((v_endpoint ->> 'primary')::boolean, false),
      coalesce((v_endpoint ->> 'active')::boolean, true),
      lower(v_endpoint ->> 'fingerprint'),
      left(coalesce(v_endpoint ->> 'preview', ''), 4096),
      coalesce(v_endpoint -> 'metadata', '{}'::jsonb),
      v_now
    )
    on conflict on constraint panel_playlist_endpoints_playlist_fingerprint_key do update
    set endpoint_type = excluded.endpoint_type,
        label = excluded.label,
        endpoint_url = excluded.endpoint_url,
        protocol = excluded.protocol,
        host = excluded.host,
        port = excluded.port,
        path = excluded.path,
        output_format = excluded.output_format,
        priority = excluded.priority,
        is_primary = excluded.is_primary,
        active = excluded.active,
        masked_preview = excluded.masked_preview,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    returning id into v_endpoint_id;

    if coalesce((v_endpoint ->> 'primary')::boolean, false) then
      v_first_endpoint_id := v_endpoint_id;
    elsif v_first_endpoint_id is null then
      v_first_endpoint_id := v_endpoint_id;
    end if;
    v_endpoint_count := v_endpoint_count + 1;
  end loop;

  if v_first_endpoint_id is null then
    raise exception using errcode = '22023', message = 'Não foi possível definir o endpoint principal.';
  end if;

  update public.panel_playlist_endpoints
  set is_primary = (id = v_first_endpoint_id),
      updated_at = v_now
  where playlist_id = v_playlist_id;

  update public.panel_playlists
  set primary_endpoint_id = v_first_endpoint_id
  where id = v_playlist_id;

  insert into public.panel_playlist_connection_profiles (
    playlist_id,
    custom_ca_pem,
    request_headers,
    request_method,
    request_body,
    timeout_ms,
    retry_count,
    follow_redirects,
    updated_at
  ) values (
    v_playlist_id,
    nullif(p_connection_profile ->> 'customCaPem', ''),
    coalesce(p_connection_profile -> 'headers', '{}'::jsonb),
    upper(coalesce(nullif(p_connection_profile ->> 'method', ''), 'GET')),
    p_connection_profile -> 'body',
    greatest(1000, least(180000, coalesce((p_connection_profile ->> 'timeoutMs')::integer, 45000))),
    greatest(0, least(5, coalesce((p_connection_profile ->> 'retryCount')::integer, 1))),
    coalesce((p_connection_profile ->> 'followRedirects')::boolean, true),
    v_now
  )
  on conflict (playlist_id) do update
  set custom_ca_pem = excluded.custom_ca_pem,
      request_headers = excluded.request_headers,
      request_method = excluded.request_method,
      request_body = excluded.request_body,
      timeout_ms = excluded.timeout_ms,
      retry_count = excluded.retry_count,
      follow_redirects = excluded.follow_redirects,
      updated_at = excluded.updated_at;

  if p_import_sha256 is not null and p_import_sha256 ~ '^[0-9a-f]{64}$' then
    insert into public.panel_playlist_imports (
      playlist_id,
      input_kind,
      input_sha256,
      parsed_summary,
      created_by_user_id,
      created_by_role
    ) values (
      v_playlist_id,
      p_import_kind,
      p_import_sha256,
      coalesce(p_import_summary, '{}'::jsonb),
      p_created_by_user_id,
      v_role
    );
  end if;

  insert into public.panel_audit_logs (
    action,
    entity_type,
    entity_id,
    description,
    metadata,
    performed_by
  ) values (
    case when v_created then 'universal_playlist_created' else 'universal_playlist_updated' end,
    'playlist',
    v_playlist_id,
    case when v_created
      then 'Fonte cadastrada pelo cadastro universal.'
      else 'Fonte existente reutilizada e atualizada pelo cadastro universal.'
    end,
    jsonb_build_object(
      'sourceKind', p_source_kind,
      'endpointCount', v_endpoint_count,
      'tlsMode', v_tls_mode,
      'allowedHostCount', cardinality(v_allowed_hosts),
      'credentialsLogged', false
    ),
    v_role
  );

  return query select v_playlist_id, v_created, v_endpoint_count;
end;
$$;

revoke all on function public.register_universal_playlist_source_transaction(
  text, text, text, text, integer, text, uuid, jsonb, jsonb, jsonb, jsonb,
  text, text, jsonb, uuid, text, uuid
) from public, anon, authenticated;
grant execute on function public.register_universal_playlist_source_transaction(
  text, text, text, text, integer, text, uuid, jsonb, jsonb, jsonb, jsonb,
  text, text, jsonb, uuid, text, uuid
) to service_role;

comment on function public.register_universal_playlist_source_transaction(
  text, text, text, text, integer, text, uuid, jsonb, jsonb, jsonb, jsonb,
  text, text, jsonb, uuid, text, uuid
) is 'Cadastro atômico e canônico de uma fonte com vários endpoints e TLS por lista.';
