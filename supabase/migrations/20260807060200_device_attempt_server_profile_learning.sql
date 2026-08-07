-- Lote 3: aprende a estratégia vencedora observada pelo aparelho sem reaproveitar credenciais.
-- Tentativas de cache são ignoradas para não aprender o próprio Supabase como servidor do provedor.

create or replace function public.learn_playlist_server_profile_from_device_attempt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_connection public.panel_playlist_connection_profiles%rowtype;
  v_key text;
  v_port integer;
  v_safe_headers jsonb := '{}'::jsonb;
begin
  if new.result <> 'success' then return new; end if;
  if new.transport not in ('xtream','m3u') then return new; end if;
  if coalesce(new.protocol, '') not in ('http','https') then return new; end if;
  if nullif(trim(coalesce(new.host_snapshot, '')), '') is null then return new; end if;

  select profile.* into v_connection
  from public.panel_playlist_connection_profiles profile
  where profile.playlist_id = new.playlist_id;

  if v_connection.playlist_id is not null then
    v_safe_headers := public.playlist_safe_profile_headers(v_connection.request_headers);
  end if;

  v_port := coalesce(
    new.port,
    case lower(coalesce(new.protocol, '')) when 'https' then 443 when 'http' then 80 else null end
  );
  v_key := public.playlist_server_profile_key(
    new.protocol,
    new.host_snapshot,
    v_port,
    new.transport,
    new.path_snapshot
  );

  insert into public.panel_playlist_server_profiles (
    profile_key, protocol, host, port, endpoint_type, path_pattern, output_format,
    strategy_key, safe_headers, request_method, timeout_ms, retry_count,
    follow_redirects, observed_tls_mode, success_count, last_success_at,
    last_playlist_id, updated_at
  ) values (
    v_key,
    lower(new.protocol),
    lower(new.host_snapshot),
    v_port,
    new.transport,
    public.playlist_safe_profile_path(new.path_snapshot),
    new.output_format,
    left(new.strategy_key, 240),
    v_safe_headers,
    coalesce(v_connection.request_method, 'GET'),
    coalesce(v_connection.timeout_ms, 45000),
    coalesce(v_connection.retry_count, 1),
    coalesce(v_connection.follow_redirects, true),
    'strict',
    1,
    new.occurred_at,
    new.playlist_id,
    now()
  )
  on conflict (profile_key) do update set
    strategy_key = excluded.strategy_key,
    safe_headers = excluded.safe_headers,
    output_format = coalesce(excluded.output_format, public.panel_playlist_server_profiles.output_format),
    request_method = excluded.request_method,
    timeout_ms = excluded.timeout_ms,
    retry_count = excluded.retry_count,
    follow_redirects = excluded.follow_redirects,
    success_count = public.panel_playlist_server_profiles.success_count + 1,
    last_success_at = greatest(public.panel_playlist_server_profiles.last_success_at, excluded.last_success_at),
    last_playlist_id = excluded.last_playlist_id,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists playlist_provider_attempts_learn_server_profile on public.playlist_provider_attempts;
create trigger playlist_provider_attempts_learn_server_profile
after insert on public.playlist_provider_attempts
for each row execute function public.learn_playlist_server_profile_from_device_attempt();

revoke all on function public.learn_playlist_server_profile_from_device_attempt() from public, anon, authenticated;
grant execute on function public.learn_playlist_server_profile_from_device_attempt() to service_role;

comment on function public.learn_playlist_server_profile_from_device_attempt() is
  'Aprende host/protocolo/porta/formato/strategy_key de tentativas diretas bem-sucedidas no aparelho. Ignora cache e nunca copia URL, usuário, senha, token ou headers do cliente.';

notify pgrst, 'reload schema';
