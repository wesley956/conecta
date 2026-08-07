-- Lote 3: fecha os casos de borda do ciclo público de listas sem alterar os estados técnicos legados.
-- Também endurece a anonimização do caminho aprendido e semeia conhecimento técnico já comprovado.

create or replace function public.playlist_safe_profile_path(p_path text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_path text := split_part(coalesce(nullif(trim(p_path), ''), '/'), '?', 1);
  v_lower text;
begin
  if left(v_path, 1) <> '/' then v_path := '/' || v_path; end if;
  v_lower := lower(v_path);

  -- Endpoints conhecidos não carregam dados de cliente no modelo compartilhado.
  if v_lower ~ '/player_api\.php/?$' then return '/player_api.php'; end if;
  if v_lower ~ '/get\.php/?$' then return '/get.php'; end if;
  if v_lower ~ '/xmltv\.php/?$' then return '/xmltv.php'; end if;
  if v_lower ~ '/portal\.php/?$' then return '/portal.php'; end if;

  -- Estruturas que normalmente contêm usuário/senha no path são transformadas em template.
  if v_lower ~ '^/(live|movie|series)/' then
    return '/' || split_part(trim(both '/' from v_lower), '/', 1) || '/{credential}/{credential}/{resource}';
  end if;
  if v_lower ~ '^/p/' then return '/p/{credential}/{credential}/{resource}'; end if;

  -- Para caminhos desconhecidos priorizamos segurança: o host/tipo/protocolo continuam úteis,
  -- mas nenhum segmento arbitrário é reaproveitado entre clientes.
  return '/{resource}';
end;
$$;

create or replace function public.get_playlist_lifecycle_decision(p_playlist_id uuid)
returns table (
  playlist_id uuid,
  lifecycle_status text,
  lifecycle_label text,
  lifecycle_message text,
  android_status text,
  lg_status text,
  samsung_status text,
  recommended_action text,
  can_retry_cache boolean,
  admin_diagnostic_recommended boolean,
  cache_ready boolean,
  confirmed_by_device boolean,
  technical_status text,
  technical_code text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    playlist.id,
    case
      when playlist.archived_at is not null or playlist.active is false then 'archived'
      when playlist.playlist_qualification_status = 'blocked' then 'blocked'
      when playlist.playlist_cache_status = 'ready' and coalesce(playlist.playlist_cache_item_count, 0) > 0 then 'ready_cache'
      when playlist.playlist_qualification_status = 'ready_direct' and playlist.playlist_direct_confirmed_at is not null then 'confirmed_by_device'
      when playlist.playlist_qualification_code = 'DEVICE_TEST_FAILED' then 'device_failed'
      when playlist.playlist_qualification_status in ('awaiting_device_test', 'retryable_error') then 'awaiting_device_confirmation'
      when playlist.playlist_qualification_status = 'validating' and coalesce(playlist.playlist_cache_status, 'missing') = 'missing' then 'saving'
      else 'generating_cache'
    end,
    case
      when playlist.archived_at is not null or playlist.active is false then 'Arquivada'
      when playlist.playlist_qualification_status = 'blocked' then 'Bloqueada'
      when playlist.playlist_cache_status = 'ready' and coalesce(playlist.playlist_cache_item_count, 0) > 0 then 'Pronta com cache'
      when playlist.playlist_qualification_status = 'ready_direct' and playlist.playlist_direct_confirmed_at is not null then 'Confirmada pelo aparelho'
      when playlist.playlist_qualification_code = 'DEVICE_TEST_FAILED' then 'Falhou no aparelho'
      when playlist.playlist_qualification_status in ('awaiting_device_test', 'retryable_error') then 'Aguardando confirmação no aparelho'
      when playlist.playlist_qualification_status = 'validating' and coalesce(playlist.playlist_cache_status, 'missing') = 'missing' then 'Salvando'
      else 'Gerando cache'
    end,
    case
      when playlist.archived_at is not null or playlist.active is false then 'A lista foi arquivada e não aparece em novas ativações.'
      when playlist.playlist_qualification_status = 'blocked' then coalesce(public.safe_playlist_qualification_message(playlist.playlist_qualification_message), 'A origem foi bloqueada e precisa ser corrigida antes de uma nova ativação.')
      when playlist.playlist_cache_status = 'ready' and coalesce(playlist.playlist_cache_item_count, 0) > 0 then 'O cache foi gerado e a lista está pronta nas plataformas compatíveis.'
      when playlist.playlist_qualification_status = 'ready_direct' and playlist.playlist_direct_confirmed_at is not null then 'Um aparelho Android abriu o conteúdo e confirmou esta lista.'
      when playlist.playlist_qualification_code = 'DEVICE_TEST_FAILED' then 'O aparelho tentou esta lista e não conseguiu confirmar o acesso. Revise os dados ou tente novamente antes de uma nova ativação.'
      when playlist.playlist_qualification_status in ('awaiting_device_test', 'retryable_error') then 'O servidor não conseguiu confirmar a origem. No Android, ela pode ser ativada provisoriamente e o próprio aparelho confirmará o resultado.'
      when playlist.playlist_qualification_status = 'validating' and coalesce(playlist.playlist_cache_status, 'missing') = 'missing' then 'O cadastro da lista ainda está sendo processado.'
      else 'O servidor está tentando autenticar a origem e gerar o cache.'
    end,
    case
      when playlist.archived_at is not null or playlist.active is false
        or playlist.playlist_qualification_status = 'blocked'
        or playlist.playlist_qualification_code = 'DEVICE_TEST_FAILED' then 'blocked'
      when playlist.playlist_cache_status = 'ready' and coalesce(playlist.playlist_cache_item_count, 0) > 0 then 'available'
      when playlist.playlist_qualification_status = 'ready_direct' and playlist.playlist_direct_confirmed_at is not null then 'available'
      else 'provisional'
    end,
    case
      when playlist.archived_at is null and playlist.active is true
       and playlist.playlist_cache_status = 'ready' and coalesce(playlist.playlist_cache_item_count, 0) > 0 then 'available_by_cache'
      else 'unavailable'
    end,
    case
      when playlist.archived_at is null and playlist.active is true
       and playlist.playlist_cache_status = 'ready' and coalesce(playlist.playlist_cache_item_count, 0) > 0 then 'available_by_cache'
      else 'unavailable'
    end,
    case
      when playlist.archived_at is not null or playlist.active is false then 'none'
      when playlist.playlist_qualification_status = 'blocked' then 'edit_source'
      when playlist.playlist_cache_status = 'ready' and coalesce(playlist.playlist_cache_item_count, 0) > 0 then 'activate'
      when playlist.playlist_qualification_status = 'ready_direct' and playlist.playlist_direct_confirmed_at is not null then 'activate'
      when playlist.playlist_qualification_code = 'DEVICE_TEST_FAILED' then 'review_or_retry'
      when playlist.playlist_qualification_status in ('awaiting_device_test', 'retryable_error') then 'activate_on_android'
      else 'wait'
    end,
    playlist.playlist_qualification_status in ('validating', 'retryable_error')
      or playlist.playlist_qualification_code = 'DEVICE_TEST_FAILED',
    playlist.playlist_qualification_status in ('awaiting_device_test', 'retryable_error')
      or playlist.playlist_qualification_code = 'DEVICE_TEST_FAILED',
    playlist.playlist_cache_status = 'ready' and coalesce(playlist.playlist_cache_item_count, 0) > 0,
    playlist.playlist_direct_confirmed_at is not null,
    playlist.playlist_qualification_status,
    playlist.playlist_qualification_code
  from public.panel_playlists playlist
  where playlist.id = p_playlist_id;
$$;

-- Uma falha confirmada pelo próprio aparelho não deve ser oferecida novamente como ativação
-- provisória até que o cache/origem seja tentado novamente e o estado técnico mude.
create or replace function public.assert_playlist_commercially_usable_for_device(
  p_playlist_id uuid,
  p_device_id uuid,
  p_label text default 'Lista'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_playlist public.panel_playlists%rowtype;
  v_device_type text;
  v_label text := coalesce(nullif(trim(p_label), ''), 'Lista');
begin
  select playlist.* into v_playlist
  from public.panel_playlists playlist
  where playlist.id = p_playlist_id;
  if not found or v_playlist.active is not true or v_playlist.archived_at is not null then
    raise exception using errcode='P0001', message=v_label || ' não existe ou está arquivada.';
  end if;

  select lower(coalesce(device.device_type, '')) into v_device_type
  from public.panel_devices device
  where device.id = p_device_id;
  if not found then
    raise exception using errcode='P0002', message='Aparelho não encontrado.';
  end if;

  if v_playlist.playlist_qualification_code = 'DEVICE_TEST_FAILED' then
    raise exception using errcode='P0001', message=v_label || ' falhou na confirmação do aparelho. Revise os dados ou tente novamente antes de ativar.';
  end if;

  if v_playlist.playlist_qualification_status = 'ready_cache' then return; end if;
  if v_playlist.playlist_qualification_status = 'ready_direct' then
    if v_device_type not in ('android','androidtv') then
      raise exception using errcode='P0001', message=v_label || ' sem cache está disponível somente para Android.';
    end if;
    return;
  end if;

  if v_device_type in ('android','androidtv')
     and v_playlist.playlist_qualification_status in ('validating','awaiting_device_test','retryable_error') then
    return;
  end if;

  raise exception using errcode='P0001', message=v_label || ' não está disponível para este aparelho.';
end;
$$;

-- Semeia apenas conhecimento técnico de origens já comprovadas. Nenhuma URL ou credencial
-- é copiada para o perfil; cabeçalhos passam pela allowlist e caminhos passam pelo template seguro.
insert into public.panel_playlist_server_profiles (
  profile_key, protocol, host, port, endpoint_type, path_pattern, output_format,
  strategy_key, safe_headers, request_method, timeout_ms, retry_count,
  follow_redirects, observed_tls_mode, success_count, last_success_at,
  last_playlist_id, updated_at
)
select
  public.playlist_server_profile_key(
    endpoint.protocol,
    endpoint.host,
    coalesce(endpoint.port, case lower(coalesce(endpoint.protocol,'')) when 'https' then 443 when 'http' then 80 else null end),
    endpoint.endpoint_type,
    endpoint.path
  ),
  lower(coalesce(endpoint.protocol, 'http')),
  lower(endpoint.host),
  coalesce(endpoint.port, case lower(coalesce(endpoint.protocol,'')) when 'https' then 443 when 'http' then 80 else null end),
  endpoint.endpoint_type,
  public.playlist_safe_profile_path(endpoint.path),
  endpoint.output_format,
  case
    when playlist.playlist_qualification_status = 'ready_direct' then 'device:confirmed'
    else 'cache:ready'
  end,
  public.playlist_safe_profile_headers(coalesce(connection_profile.request_headers, '{}'::jsonb)),
  coalesce(connection_profile.request_method, 'GET'),
  coalesce(connection_profile.timeout_ms, 45000),
  coalesce(connection_profile.retry_count, 1),
  coalesce(connection_profile.follow_redirects, true),
  'strict',
  1,
  coalesce(
    playlist.playlist_direct_confirmed_at,
    playlist.playlist_cache_updated_at,
    playlist.playlist_qualified_at,
    now()
  ),
  playlist.id,
  now()
from public.panel_playlists playlist
join public.panel_playlist_endpoints endpoint
  on endpoint.id = playlist.primary_endpoint_id
left join public.panel_playlist_connection_profiles connection_profile
  on connection_profile.playlist_id = playlist.id
where playlist.active is true
  and playlist.archived_at is null
  and endpoint.active is true
  and (
    (playlist.playlist_cache_status = 'ready' and coalesce(playlist.playlist_cache_item_count,0) > 0)
    or (playlist.playlist_qualification_status = 'ready_direct' and playlist.playlist_direct_confirmed_at is not null)
  )
on conflict (profile_key) do nothing;

revoke all on function public.get_playlist_lifecycle_decision(uuid) from public, anon, authenticated;
revoke all on function public.assert_playlist_commercially_usable_for_device(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.get_playlist_lifecycle_decision(uuid) to service_role;
grant execute on function public.assert_playlist_commercially_usable_for_device(uuid,uuid,text) to service_role;

notify pgrst, 'reload schema';
