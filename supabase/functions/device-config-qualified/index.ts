import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { safeDiagnosticText } from '../_shared/diagnosticSafety.ts';

const DIRECT_MARKER = '#roneca-direct-m3u';
const MAX_REQUEST_BYTES = 64 * 1024;
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-credential',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function text(value: unknown) {
  const result = String(value ?? '').trim();
  return result || null;
}

async function readRawBody(request: Request) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_REQUEST_BYTES) throw new Error('Payload muito grande.');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) {
    throw new Error('Payload muito grande.');
  }
  let payload: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(raw || '{}');
    if (parsed && typeof parsed === 'object') payload = parsed as Record<string, unknown>;
  } catch {
    payload = {};
  }
  return { raw: raw || '{}', payload };
}

function healthPayload(payload: Record<string, unknown>) {
  const health = payload.playlistHealth;
  return health && typeof health === 'object' ? health as Record<string, unknown> : null;
}

function directParts(sourceUrl: string) {
  const marked = `${sourceUrl.split(DIRECT_MARKER)[0]}${DIRECT_MARKER}`;
  return {
    manifestUrl: null,
    channelsUrl: marked,
    moviesUrl: marked,
    seriesUrl: marked,
  };
}

function validationSources(playlist: any) {
  const endpoints = (Array.isArray(playlist?.endpoints) ? playlist.endpoints : [])
    .filter((endpoint: any) => endpoint?.active !== false && text(endpoint?.endpoint_url))
    .sort((left: any, right: any) => {
      const primaryDifference = Number(right?.is_primary === true) - Number(left?.is_primary === true);
      if (primaryDifference !== 0) return primaryDifference;
      return Number(left?.priority || 999) - Number(right?.priority || 999);
    })
    .map((endpoint: any, index: number) => ({
      id: String(endpoint.id),
      label: text(endpoint.label) || `Origem ${index + 1}`,
      type: text(endpoint.endpoint_type) || 'm3u',
      priority: index + 1,
      primary: index === 0,
      protocol: text(endpoint.protocol),
      host: text(endpoint.host),
      port: endpoint.port == null ? null : Number(endpoint.port),
      path: text(endpoint.path) || '/',
      outputFormat: text(endpoint.output_format),
      cacheParts: directParts(String(endpoint.endpoint_url)),
    }));

  if (endpoints.length > 0) return endpoints;
  const sourceUrl = text(playlist?.playlist_url);
  if (!sourceUrl) return [];
  return [{
    id: `legacy:${playlist.id}`,
    label: 'Origem principal',
    type: text(playlist?.playlist_type) || 'm3u',
    priority: 1,
    primary: true,
    protocol: null,
    host: sourceHost(sourceUrl),
    port: null,
    path: '/',
    outputFormat: null,
    cacheParts: directParts(sourceUrl),
  }];
}

const BLOCKED_SOURCE_HEADERS = new Set([
  'host',
  'content-length',
  'transfer-encoding',
  'connection',
  'proxy-connection',
  'upgrade',
]);

function connectionProfile(playlist: any) {
  const raw = playlist?.connection_profile;
  return Array.isArray(raw) ? raw[0] || null : raw || null;
}

function sourceHost(sourceUrl: unknown) {
  try {
    const parsed = new URL(String(sourceUrl || ''));
    return parsed.hostname.toLowerCase();
  } catch {
    return '';
  }
}

function safeSourceHeaders(profile: any) {
  const raw = profile?.request_headers;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw)) {
    const header = String(name || '').trim();
    const normalized = header.toLowerCase();
    const content = String(value ?? '').trim();
    if (!/^[A-Za-z0-9-]{1,80}$/.test(header)) continue;
    if (BLOCKED_SOURCE_HEADERS.has(normalized) || !content) continue;
    result[header] = content.slice(0, 2048);
  }
  return result;
}

function playlistNetworkPolicy(playlist: any) {
  const profile = connectionProfile(playlist);
  const requestedMode = text(playlist?.tls_mode) || 'strict';
  const tlsMode = ['strict', 'custom_ca', 'insecure'].includes(requestedMode)
    ? requestedMode
    : 'strict';
  const hosts = new Set<string>();
  for (const raw of Array.isArray(playlist?.tls_allowed_hosts) ? playlist.tls_allowed_hosts : []) {
    const host = String(raw || '').trim().toLowerCase().split(':')[0];
    if (host) hosts.add(host);
  }
  const originHost = sourceHost(playlist?.playlist_url);
  if (originHost) hosts.add(originHost);

  return {
    tlsMode,
    allowedHosts: [...hosts],
    allowSubdomains: playlist?.tls_allow_subdomains === true,
    allowRedirectHosts: playlist?.tls_allow_redirect_hosts === true,
    scopes: {
      validation: playlist?.tls_scope_validation !== false,
      cache: playlist?.tls_scope_cache !== false,
      catalog: playlist?.tls_scope_catalog !== false,
      playback: playlist?.tls_scope_playback !== false,
    },
    customCaPem: tlsMode === 'custom_ca' ? text(profile?.custom_ca_pem) : null,
    requestHeaders: safeSourceHeaders(profile),
    followRedirects: profile?.follow_redirects !== false,
    timeoutMs: Math.max(1000, Math.min(180000, Number(profile?.timeout_ms) || 45000)),
  };
}

async function proxyDeviceConfig(
  supabaseUrl: string,
  request: Request,
  rawBody: string,
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const deviceCredential = request.headers.get('x-device-credential');
  const authorization = request.headers.get('authorization');
  const apikey = request.headers.get('apikey');
  if (deviceCredential) headers['x-device-credential'] = deviceCredential;
  if (authorization) headers.authorization = authorization;
  if (apikey) headers.apikey = apikey;

  const upstream = await fetch(`${supabaseUrl}/functions/v1/device-config`, {
    method: 'POST',
    headers,
    body: rawBody,
  });
  const raw = await upstream.text();
  let payload: any;
  try {
    payload = JSON.parse(raw || '{}');
  } catch {
    return {
      ok: false,
      status: 502,
      payload: { active: false, status: 'pending', message: 'Resposta inválida do servidor.' },
    };
  }
  return { ok: upstream.ok, status: upstream.status, payload };
}

async function resolveDevice(supabase: any, deviceCode: string) {
  const { data, error } = await supabase
    .from('panel_devices')
    .select(`
      id,
      device_code,
      client_name,
      status,
      is_playlist_validation_device,
      playlist:panel_playlists(
          id,
          playlist_url,
          playlist_type,
          active,
          tls_mode,
          tls_allowed_hosts,
          tls_allow_subdomains,
          tls_allow_redirect_hosts,
          tls_scope_validation,
          tls_scope_cache,
          tls_scope_catalog,
          tls_scope_playback,
          connection_profile:panel_playlist_connection_profiles(
            custom_ca_pem,
            request_headers,
            timeout_ms,
            follow_redirects
          )
        ),
      device_playlists:panel_device_playlists(
        playlist_id,
        priority,
        active,
        playlist:panel_playlists(
          id,
          playlist_url,
          playlist_type,
          active,
          tls_mode,
          tls_allowed_hosts,
          tls_allow_subdomains,
          tls_allow_redirect_hosts,
          tls_scope_validation,
          tls_scope_cache,
          tls_scope_catalog,
          tls_scope_playback,
          connection_profile:panel_playlist_connection_profiles(
            custom_ca_pem,
            request_headers,
            timeout_ms,
            follow_redirects
          )
        )
      )
    `)
    .eq('device_code', deviceCode)
    .maybeSingle();
  if (error) return null;
  return data || null;
}

async function resolveValidationSession(supabase: any, deviceId: string) {
  const { data, error } = await supabase.rpc('resolve_active_playlist_validation_session', {
    p_device_id: deviceId,
  });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return row || null;
}

async function validationPlaylist(supabase: any, playlistId: string) {
  const { data, error } = await supabase
    .from('panel_playlists')
    .select(`
      id,
      name,
      playlist_url,
      playlist_type,
      active,
      playlist_access_mode,
      playlist_qualification_status,
      playlist_cache_status,
      playlist_updated_at,
      playlist_direct_confirmed_device_id,
      tls_mode,
      tls_allowed_hosts,
      tls_allow_subdomains,
      tls_allow_redirect_hosts,
      tls_scope_validation,
      tls_scope_cache,
      tls_scope_catalog,
      tls_scope_playback,
      connection_profile:panel_playlist_connection_profiles(
        custom_ca_pem,
        request_headers,
        timeout_ms,
        follow_redirects
      ),
      endpoints:panel_playlist_endpoints!panel_playlist_endpoints_playlist_id_fkey(
        id,
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
        active
      )
    `)
    .eq('id', playlistId)
    .maybeSingle();
  if (error || !data || data.active === false) return null;
  return data;
}

async function requireRpcSuccess(
  supabase: any,
  functionName: string,
  parameters: Record<string, unknown>,
  failureMessage: string,
) {
  const { data, error } = await supabase.rpc(functionName, parameters);
  if (error) throw new Error(`${failureMessage}: ${error.message}`);
  if (data !== true) throw new Error(failureMessage);
}

async function applyHealth(
  supabase: any,
  deviceId: string,
  health: Record<string, unknown> | null,
  validationSession: any | null,
): Promise<'success' | 'failure' | null> {
  if (!health) return null;
  const playlistId = text(health.playlistId);
  const status = text(health.status);
  if (!playlistId || !status) return null;

  if (status === 'success') {
    await requireRpcSuccess(
      supabase,
      'mark_playlist_direct_success',
      {
        p_playlist_id: playlistId,
        p_device_id: deviceId,
      },
      'O aparelho carregou o catálogo, mas o servidor não autorizou a homologação',
    );

    const confirmed = await validationPlaylist(supabase, playlistId);
    if (
      !confirmed
      || confirmed.playlist_qualification_status !== 'ready_direct'
      || String(confirmed.playlist_direct_confirmed_device_id || '') !== deviceId
    ) {
      throw new Error('O aparelho carregou o catálogo, mas a homologação não foi persistida corretamente.');
    }
    return 'success';
  }

  if (
    status === 'failure'
    && validationSession
    && String(validationSession.playlist_id) === playlistId
  ) {
    await requireRpcSuccess(
      supabase,
      'mark_playlist_validation_failure',
      {
        p_playlist_id: playlistId,
        p_device_id: deviceId,
        p_error_code: 'DEVICE_REPORTED_FAILURE',
        p_error_message: safeDiagnosticText(health.error, 500)
          || 'O aparelho não conseguiu carregar a lista.',
      },
      'O teste falhou, mas o servidor não conseguiu registrar o resultado',
    );
    return 'failure';
  }

  return null;
}

function sourceMap(device: any) {
  const sources = new Map<string, { url: string; type: string; networkPolicy: Record<string, unknown> }>();
  const legacy = Array.isArray(device?.playlist) ? device.playlist[0] : device?.playlist;
  if (legacy?.id && legacy?.active !== false && text(legacy.playlist_url)) {
    sources.set(String(legacy.id), {
      url: String(legacy.playlist_url),
      type: text(legacy.playlist_type) || 'm3u',
      networkPolicy: playlistNetworkPolicy(legacy),
    });
  }
  for (const assignment of device?.device_playlists || []) {
    if (assignment?.active === false) continue;
    const playlist = Array.isArray(assignment?.playlist) ? assignment.playlist[0] : assignment?.playlist;
    if (!playlist?.id || playlist.active === false || !text(playlist.playlist_url)) continue;
    sources.set(String(playlist.id), {
      url: String(playlist.playlist_url),
      type: text(playlist.playlist_type) || 'm3u',
      networkPolicy: playlistNetworkPolicy(playlist),
    });
  }
  return sources;
}

function injectCommercialDirectSources(payload: any, device: any) {
  const sources = sourceMap(device);
  const playlists = Array.isArray(payload.playlists)
    ? payload.playlists.map((item: any) => {
        const id = text(item?.id);
        const source = id ? sources.get(id) : null;
        if (!source) return item;
        const enriched = {
          ...item,
          type: text(item?.type) || source.type,
          networkPolicy: source.networkPolicy,
        };
        const cacheReady = item?.cacheReady === true
          || Boolean(item?.cacheParts?.channelsUrl || item?.cacheSnapshotUrl);
        if (cacheReady || item?.accessMode !== 'direct') return enriched;
        return {
          ...enriched,
          type: source.type,
          cacheParts: directParts(source.url),
          cacheReady: true,
          directFallback: true,
        };
      })
    : [];
  const selectedId = text(payload.selectedPlaylistId);
  const selected = selectedId ? playlists.find((item: any) => String(item?.id) === selectedId) : null;
  const usingDirect = playlists.some((item: any) => item?.directFallback === true);
  return {
    ...payload,
    playlists,
    cacheParts: selected?.cacheParts || payload.cacheParts || null,
    directPlaylistFallbackAllowed: usingDirect,
    message: usingDirect
      ? 'Cache indisponível neste provedor. O aplicativo usará a conexão direta homologada.'
      : payload.message,
  };
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ active: false, message: 'Método não permitido.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ active: false, status: 'pending', message: 'Servidor não configurado.' }, 500);
    }

    const { raw, payload: requestPayload } = await readRawBody(request);
    const upstream = await proxyDeviceConfig(supabaseUrl, request, raw);
    const upstreamPayload = upstream.payload;

    // Erros de identidade sempre prevalecem. A sessão de validação jamais contorna
    // código, UUID ou credencial do aparelho.
    if (!upstream.ok && [400, 401, 403, 409, 428].includes(upstream.status)) {
      return json(upstreamPayload, upstream.status);
    }

    const deviceCode = text(upstreamPayload?.deviceCode)
      || text(requestPayload.deviceCode)
      || text(requestPayload.device_code);
    if (!deviceCode) return json(upstreamPayload, upstream.status);

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const device = await resolveDevice(supabase, deviceCode);
    if (!device) return json(upstreamPayload, upstream.status);

    const validationSession = device.is_playlist_validation_device === true
      ? await resolveValidationSession(supabase, device.id)
      : null;
    const healthResult = await applyHealth(
      supabase,
      device.id,
      healthPayload(requestPayload),
      validationSession,
    );

    if (healthResult === 'failure') {
      return json({
        active: false,
        status: 'pending',
        deviceCode,
        validationMode: true,
        message: 'O teste no aparelho falhou e o diagnóstico foi registrado. Revise a lista antes de tentar novamente.',
      });
    }

    if (validationSession) {
      const playlist = await validationPlaylist(supabase, String(validationSession.playlist_id));
      if (!playlist || playlist.playlist_access_mode !== 'direct') {
        return json({
          active: false,
          status: 'pending',
          deviceCode,
          message: 'A sessão de validação não possui uma lista direta disponível.',
        });
      }
      const sources = validationSources(playlist);
      if (sources.length === 0) {
        return json({
          active: false,
          status: 'pending',
          deviceCode,
          message: 'A origem da lista de validação não está disponível.',
        });
      }
      const parts = sources[0].cacheParts;
      const item = {
        id: playlist.id,
        priority: 1,
        role: 'primary',
        name: playlist.name,
        type: playlist.playlist_type || 'm3u',
        accessMode: 'direct',
        qualificationStatus: playlist.playlist_qualification_status,
        updatedAt: playlist.playlist_updated_at,
        cacheStatus: playlist.playlist_cache_status,
        cacheReady: true,
        directFallback: true,
        cacheParts: parts,
        sourceEndpoints: sources,
        networkPolicy: playlistNetworkPolicy(playlist),
      };
      return json({
        active: true,
        status: 'active',
        deviceCode,
        clientName: device.client_name || upstreamPayload?.clientName || 'Aparelho de validação',
        expiresAt: validationSession.expires_at,
        playlistName: playlist.name,
        selectedPlaylistId: playlist.id,
        playlists: [item],
        cacheParts: parts,
        cacheSnapshotUrl: null,
        validationMode: true,
        validationSessionId: validationSession.session_id,
        validationExpiresAt: validationSession.expires_at,
        validationPersisted: healthResult === 'success',
        message: healthResult === 'success'
          ? 'Acesso direto homologado e confirmado no servidor.'
          : 'Modo de validação ativo. Nenhuma venda ou vínculo de cliente será alterado.',
      });
    }

    if (!upstream.ok || upstreamPayload?.active !== true || upstreamPayload?.status !== 'active') {
      return json(upstreamPayload, upstream.status);
    }

    return json(injectCommercialDirectSources(upstreamPayload, device), upstream.status);
  } catch (error) {
    return json({
      active: false,
      status: 'pending',
      message: safeDiagnosticText(
        error instanceof Error ? error.message : 'Falha temporária ao carregar a configuração.',
        500,
      ) || 'Falha temporária ao carregar a configuração.',
    }, 500);
  }
});
