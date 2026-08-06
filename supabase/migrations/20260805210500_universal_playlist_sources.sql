-- Cadastro universal de fontes, endpoints alternativos e segurança TLS por lista.
-- A migração é aditiva: preserva URL, status, cache e vínculos existentes.

create extension if not exists pgcrypto with schema extensions;

alter table public.panel_playlists
  add column if not exists provider_name text,
  add column if not exists provider_plan_name text,
  add column if not exists provider_created_at timestamptz,
  add column if not exists provider_expires_at timestamptz,
  add column if not exists source_kind text not null default 'auto',
  add column if not exists source_summary jsonb not null default '{}'::jsonb,
  add column if not exists registration_version integer not null default 1,
  add column if not exists primary_endpoint_id uuid,
  add column if not exists tls_mode text not null default 'strict',
  add column if not exists tls_allowed_hosts text[] not null default '{}'::text[],
  add column if not exists tls_allow_subdomains boolean not null default false,
  add column if not exists tls_allow_redirect_hosts boolean not null default false,
  add column if not exists tls_scope_validation boolean not null default true,
  add column if not exists tls_scope_cache boolean not null default true,
  add column if not exists tls_scope_catalog boolean not null default true,
  add column if not exists tls_scope_playback boolean not null default true,
  add column if not exists tls_risk_accepted_at timestamptz,
  add column if not exists tls_risk_accepted_by uuid;

alter table public.panel_playlists
  drop constraint if exists panel_playlists_source_kind_check,
  add constraint panel_playlists_source_kind_check check (
    source_kind = any (array[
      'auto'::text,
      'provider_message'::text,
      'm3u'::text,
      'xtream'::text,
      'stalker'::text,
      'api'::text,
      'direct'::text,
      'manual'::text,
      'file'::text
    ])
  ),
  drop constraint if exists panel_playlists_registration_version_check,
  add constraint panel_playlists_registration_version_check check (
    registration_version between 1 and 20
  ),
  drop constraint if exists panel_playlists_tls_mode_check,
  add constraint panel_playlists_tls_mode_check check (
    tls_mode = any (array['strict'::text, 'custom_ca'::text, 'insecure'::text])
  ),
  drop constraint if exists panel_playlists_tls_risk_check,
  add constraint panel_playlists_tls_risk_check check (
    tls_mode <> 'insecure'
    or (tls_risk_accepted_at is not null and tls_risk_accepted_by is not null)
  );

create table if not exists public.panel_playlist_endpoints (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.panel_playlists(id) on delete cascade,
  endpoint_type text not null,
  label text not null,
  endpoint_url text not null,
  protocol text,
  host text not null,
  port integer,
  path text,
  output_format text,
  priority smallint not null default 1,
  is_primary boolean not null default false,
  active boolean not null default true,
  source_fingerprint text not null,
  masked_preview text not null,
  metadata jsonb not null default '{}'::jsonb,
  last_test_status text not null default 'untested',
  last_test_code text,
  last_test_message text,
  last_tested_at timestamptz,
  last_test_duration_ms bigint,
  last_test_item_count integer,
  last_final_host text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint panel_playlist_endpoints_type_check check (
    endpoint_type = any (array[
      'xtream'::text,
      'm3u'::text,
      'hls'::text,
      'ssiptv'::text,
      'dash'::text,
      'rtmp'::text,
      'rtsp'::text,
      'direct'::text,
      'api'::text,
      'stalker'::text,
      'file'::text,
      'manual'::text,
      'unknown'::text
    ])
  ),
  constraint panel_playlist_endpoints_protocol_check check (
    protocol is null or protocol = any (array['http'::text, 'https'::text, 'rtmp'::text, 'rtsp'::text, 'file'::text])
  ),
  constraint panel_playlist_endpoints_port_check check (
    port is null or port between 1 and 65535
  ),
  constraint panel_playlist_endpoints_priority_check check (
    priority between 1 and 100
  ),
  constraint panel_playlist_endpoints_fingerprint_check check (
    source_fingerprint ~ '^[0-9a-f]{64}$'::text
  ),
  constraint panel_playlist_endpoints_test_status_check check (
    last_test_status = any (array[
      'untested'::text,
      'testing'::text,
      'success'::text,
      'partial'::text,
      'failure'::text,
      'expired'::text,
      'blocked'::text
    ])
  ),
  constraint panel_playlist_endpoints_playlist_fingerprint_key unique (playlist_id, source_fingerprint)
);

create unique index if not exists panel_playlist_endpoints_one_primary_idx
  on public.panel_playlist_endpoints (playlist_id)
  where is_primary is true and active is true;
create index if not exists panel_playlist_endpoints_playlist_priority_idx
  on public.panel_playlist_endpoints (playlist_id, active, priority);
create index if not exists panel_playlist_endpoints_host_idx
  on public.panel_playlist_endpoints (lower(host));
create index if not exists panel_playlist_endpoints_fingerprint_idx
  on public.panel_playlist_endpoints (source_fingerprint);

create table if not exists public.panel_playlist_connection_profiles (
  playlist_id uuid primary key references public.panel_playlists(id) on delete cascade,
  custom_ca_pem text,
  request_headers jsonb not null default '{}'::jsonb,
  request_method text not null default 'GET',
  request_body jsonb,
  timeout_ms integer not null default 45000,
  retry_count smallint not null default 1,
  follow_redirects boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint panel_playlist_connection_profiles_method_check check (
    request_method = any (array['GET'::text, 'POST'::text])
  ),
  constraint panel_playlist_connection_profiles_timeout_check check (
    timeout_ms between 1000 and 180000
  ),
  constraint panel_playlist_connection_profiles_retry_check check (
    retry_count between 0 and 5
  ),
  constraint panel_playlist_connection_profiles_ca_check check (
    custom_ca_pem is null
    or (
      char_length(custom_ca_pem) between 40 and 65535
      and custom_ca_pem like '%BEGIN CERTIFICATE%'
      and custom_ca_pem like '%END CERTIFICATE%'
    )
  )
);

create table if not exists public.panel_playlist_imports (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.panel_playlists(id) on delete cascade,
  input_kind text not null,
  input_sha256 text not null,
  parsed_summary jsonb not null default '{}'::jsonb,
  created_by_user_id uuid,
  created_by_role text not null,
  created_at timestamptz not null default now(),
  constraint panel_playlist_imports_kind_check check (
    input_kind = any (array[
      'provider_message'::text,
      'structured'::text,
      'url'::text,
      'file'::text,
      'manual'::text
    ])
  ),
  constraint panel_playlist_imports_hash_check check (
    input_sha256 ~ '^[0-9a-f]{64}$'::text
  ),
  constraint panel_playlist_imports_role_check check (
    created_by_role = any (array['owner'::text, 'admin'::text, 'seller'::text, 'system'::text])
  )
);
create index if not exists panel_playlist_imports_playlist_created_idx
  on public.panel_playlist_imports (playlist_id, created_at desc);

create table if not exists public.panel_playlist_test_runs (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.panel_playlists(id) on delete cascade,
  endpoint_id uuid references public.panel_playlist_endpoints(id) on delete cascade,
  stage text not null,
  result text not null,
  strategy_key text,
  protocol text,
  host_snapshot text not null,
  port integer,
  path_snapshot text,
  http_status integer,
  duration_ms bigint not null default 0,
  response_bytes bigint,
  item_count integer,
  error_code text,
  error_message text,
  redirect_snapshot text,
  tls_mode text not null default 'strict',
  created_by_user_id uuid,
  occurred_at timestamptz not null default now(),
  constraint panel_playlist_test_runs_stage_check check (
    stage = any (array[
      'dns'::text,
      'connection'::text,
      'tls'::text,
      'authentication'::text,
      'catalog'::text,
      'playback'::text,
      'complete'::text
    ])
  ),
  constraint panel_playlist_test_runs_result_check check (
    result = any (array['success'::text, 'partial'::text, 'failure'::text, 'skipped'::text])
  ),
  constraint panel_playlist_test_runs_tls_mode_check check (
    tls_mode = any (array['strict'::text, 'custom_ca'::text, 'insecure'::text])
  ),
  constraint panel_playlist_test_runs_port_check check (
    port is null or port between 1 and 65535
  ),
  constraint panel_playlist_test_runs_http_status_check check (
    http_status is null or http_status between 100 and 599
  ),
  constraint panel_playlist_test_runs_duration_check check (
    duration_ms between 0 and 3600000
  )
);
create index if not exists panel_playlist_test_runs_playlist_time_idx
  on public.panel_playlist_test_runs (playlist_id, occurred_at desc);
create index if not exists panel_playlist_test_runs_endpoint_time_idx
  on public.panel_playlist_test_runs (endpoint_id, occurred_at desc);

alter table public.panel_playlist_endpoints enable row level security;
alter table public.panel_playlist_connection_profiles enable row level security;
alter table public.panel_playlist_imports enable row level security;
alter table public.panel_playlist_test_runs enable row level security;

revoke all on public.panel_playlist_endpoints from public, anon, authenticated;
revoke all on public.panel_playlist_connection_profiles from public, anon, authenticated;
revoke all on public.panel_playlist_imports from public, anon, authenticated;
revoke all on public.panel_playlist_test_runs from public, anon, authenticated;

grant all on public.panel_playlist_endpoints to service_role;
grant all on public.panel_playlist_connection_profiles to service_role;
grant all on public.panel_playlist_imports to service_role;
grant all on public.panel_playlist_test_runs to service_role;

-- Cria um endpoint principal para cada lista legada sem alterar qualquer campo operacional.
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
  metadata
)
select
  playlist.id,
  case playlist.playlist_type
    when 'xtream' then 'xtream'
    when 'stalker' then 'stalker'
    else 'm3u'
  end,
  'Origem principal preservada',
  playlist.playlist_url,
  lower(nullif(substring(playlist.playlist_url from '^([a-zA-Z][a-zA-Z0-9+.-]*):'), '')),
  coalesce(
    nullif(substring(playlist.playlist_url from '^[a-zA-Z][a-zA-Z0-9+.-]*://([^/:?#]+)'), ''),
    'origem-legada'
  ),
  nullif(substring(playlist.playlist_url from '^[a-zA-Z][a-zA-Z0-9+.-]*://[^/:?#]+:([0-9]{1,5})'), '')::integer,
  nullif(substring(playlist.playlist_url from '^[a-zA-Z][a-zA-Z0-9+.-]*://[^/?#]+([^?#]*)'), ''),
  nullif(substring(playlist.playlist_url from '[?&]output=([^&#]+)'), ''),
  1,
  true,
  playlist.active,
  coalesce(
    playlist.source_fingerprint,
    encode(extensions.digest(playlist.playlist_url, 'sha256'), 'hex')
  ),
  coalesce(
    nullif(substring(playlist.playlist_url from '^([a-zA-Z][a-zA-Z0-9+.-]*://[^/?#]+)'), ''),
    'origem-legada'
  ) || '/••••',
  jsonb_build_object('legacy', true, 'preservedAt', now())
from public.panel_playlists playlist
where not exists (
  select 1
  from public.panel_playlist_endpoints endpoint
  where endpoint.playlist_id = playlist.id
)
on conflict do nothing;

update public.panel_playlists playlist
set primary_endpoint_id = endpoint.id
from public.panel_playlist_endpoints endpoint
where endpoint.playlist_id = playlist.id
  and endpoint.is_primary is true
  and playlist.primary_endpoint_id is null;

alter table public.panel_playlists
  drop constraint if exists panel_playlists_primary_endpoint_id_fkey,
  add constraint panel_playlists_primary_endpoint_id_fkey
  foreign key (primary_endpoint_id)
  references public.panel_playlist_endpoints(id)
  on delete set null;

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

comment on table public.panel_playlist_endpoints is
  'Endpoints alternativos de uma única fonte. A URL exata é protegida pelo backend e nunca deve aparecer em listagens comuns.';
comment on table public.panel_playlist_connection_profiles is
  'Configurações sensíveis de conexão, incluindo CA personalizada e cabeçalhos; acesso exclusivo do backend.';
comment on table public.panel_playlist_imports is
  'Histórico sanitizado da importação. O texto bruto do fornecedor nunca é persistido.';
comment on table public.panel_playlist_test_runs is
  'Resultados sanitizados por endpoint e etapa, sem query string, usuário, senha ou token.';
comment on function public.register_universal_playlist_source_transaction(
  text, text, text, text, integer, text, uuid, jsonb, jsonb, jsonb, jsonb,
  text, text, jsonb, uuid, text, uuid
) is 'Cadastro atômico e canônico de uma fonte com vários endpoints e TLS por lista.';
