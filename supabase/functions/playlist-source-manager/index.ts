import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  PanelAuthError,
  panelAuthErrorResponse,
  requirePanelPrincipal,
  type PanelPrincipal,
} from '../_shared/panelAuth.ts';
import {
  legacyPlaylistType,
  parseProviderMessage,
  parseStructuredSource,
  safeConnectionProfileSummary,
  sanitizeConnectionHeaders,
  type ParsedEndpoint,
  type ParsedUniversalSource,
} from '../_shared/universalPlaylistSource.ts';
import {
  classifyProbeError,
  probeUniversalEndpoint,
  type TlsMode,
} from '../_shared/universalOutboundProbe.ts';
import {
  redactPlaylistSecrets,
  requiredText,
} from '../_shared/playlistSource.ts';

const DEFAULT_ALLOWED_ORIGINS = [
  'https://wesley956.github.io',
  'https://conecta-five-iota.vercel.app',
  'http://localhost:4173',
  'http://localhost:5173',
  'http://127.0.0.1:4173',
  'http://127.0.0.1:5173',
];
const MAX_BODY_BYTES = 160 * 1024;
const MAX_ENDPOINTS = 20;
const TEST_ENDPOINT_LIMIT = 8;

declare const EdgeRuntime: undefined | { waitUntil(promise: Promise<unknown>): void };

function getEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Variável ${name} não configurada.`);
  return value;
}

function allowedOrigins() {
  const configured = String(Deno.env.get('PANEL_ALLOWED_ORIGINS') || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_ALLOWED_ORIGINS);
}

function corsHeaders(request: Request) {
  const origin = String(request.headers.get('origin') || '').trim();
  const allowed = allowedOrigins();
  const selected = origin && allowed.has(origin) ? origin : DEFAULT_ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': selected,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(request: Request, value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BODY_BYTES) throw new Error('Requisição excede o limite permitido.');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw new Error('Requisição excede o limite permitido.');
  }
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    throw new Error('Corpo JSON inválido.');
  }
}

function uuid(value: unknown, label: string, optional = false) {
  const result = String(value ?? '').trim();
  if (!result && optional) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) {
    throw new Error(`${label} inválido.`);
  }
  return result;
}

function integer(value: unknown, fallback: number, minimum: number, maximum: number) {
  const result = Number(value ?? fallback);
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) {
    throw new Error(`Valor precisa estar entre ${minimum} e ${maximum}.`);
  }
  return result;
}

function boolean(value: unknown, fallback = false) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return fallback;
}

function object(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function clean(value: unknown, max = 500) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

function normalizeTlsMode(value: unknown): TlsMode {
  const mode = clean(value || 'strict', 30).toLowerCase();
  if (mode === 'strict' || mode === 'custom_ca' || mode === 'insecure') return mode;
  throw new Error('Modo de certificado inválido.');
}

function safeHost(value: unknown) {
  const host = clean(value, 255).toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || /[/?#@\s]/.test(host)) throw new Error('Domínio autorizado inválido.');
  return host;
}

function endpointHosts(endpoints: ParsedEndpoint[]) {
  return [...new Set(endpoints.map(endpoint => endpoint.host.toLowerCase()).filter(Boolean))];
}

function securityPayload(body: Record<string, unknown>, parsed: ParsedUniversalSource) {
  const input = object(body.security);
  const mode = normalizeTlsMode(input.mode);
  const actualHosts = endpointHosts(parsed.endpoints);
  const requestedHosts = Array.isArray(input.allowedHosts)
    ? input.allowedHosts.map(safeHost)
    : actualHosts;
  const allowedHosts = [...new Set(requestedHosts)];
  const allowRedirectHosts = boolean(input.allowRedirectHosts, false);
  const allowSubdomains = boolean(input.allowSubdomains, false);
  const riskAccepted = boolean(input.riskAccepted, false);
  const scopes = object(input.scopes);

  for (const host of actualHosts) {
    const directlyAllowed = allowedHosts.includes(host);
    const viaParent = allowSubdomains && allowedHosts.some(parent => host.endsWith(`.${parent}`));
    if (!directlyAllowed && !viaParent) {
      throw new Error(`O domínio ${host} precisa estar autorizado na segurança da fonte.`);
    }
  }
  if (mode === 'insecure' && !riskAccepted) {
    throw new Error('Confirme o risco antes de ignorar erros de certificado.');
  }

  return {
    mode,
    allowedHosts,
    allowSubdomains,
    allowRedirectHosts,
    riskAccepted,
    scopes: {
      validation: boolean(scopes.validation, true),
      cache: boolean(scopes.cache, true),
      catalog: boolean(scopes.catalog, true),
      playback: boolean(scopes.playback, true),
    },
  };
}

function connectionProfilePayload(body: Record<string, unknown>, security: ReturnType<typeof securityPayload>) {
  const input = object(body.connectionProfile);
  const customCaPem = clean(input.customCaPem, 65535) || null;
  if (security.mode === 'custom_ca' && !customCaPem?.includes('BEGIN CERTIFICATE')) {
    throw new Error('Informe o certificado personalizado em formato PEM.');
  }
  const method = clean(input.method || 'GET', 10).toUpperCase();
  if (method !== 'GET' && method !== 'POST') throw new Error('Método de conexão inválido.');
  return {
    customCaPem,
    headers: sanitizeConnectionHeaders(input.headers),
    method,
    body: input.body && typeof input.body === 'object' ? input.body : null,
    timeoutMs: integer(input.timeoutMs, 45000, 1000, 180000),
    retryCount: integer(input.retryCount, 1, 0, 5),
    followRedirects: boolean(input.followRedirects, true),
  };
}

function setPrimary(parsed: ParsedUniversalSource, value: unknown) {
  const requested = Number(value ?? parsed.recommendation.primaryIndex);
  const index = Number.isSafeInteger(requested) && requested >= 0 && requested < parsed.endpoints.length
    ? requested
    : parsed.recommendation.primaryIndex;
  parsed.endpoints.forEach((endpoint, endpointIndex) => {
    endpoint.primary = endpointIndex === index;
    endpoint.priority = endpointIndex + 1;
  });
  return parsed.endpoints[index];
}

async function parseInput(body: Record<string, unknown>) {
  const secret = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (clean(body.providerMessage, MAX_BODY_BYTES)) {
    return await parseProviderMessage(body.providerMessage, secret);
  }
  return await parseStructuredSource(body, secret);
}

function safeDraft(parsed: ParsedUniversalSource) {
  return {
    sourceKind: parsed.sourceKind,
    provider: parsed.provider,
    endpoints: parsed.endpoints.map(endpoint => ({
      ...endpoint,
      url: endpoint.url,
    })),
    externalLinks: parsed.externalLinks,
    warnings: parsed.warnings,
    recommendation: parsed.recommendation,
    inputSha256: parsed.inputSha256,
    redactedSummary: parsed.redactedSummary,
  };
}

async function assertPlaylistAccess(
  supabase: any,
  principal: PanelPrincipal,
  playlistId: string,
) {
  if (principal.role === 'seller') {
    const { data: permission, error } = await supabase
      .from('panel_seller_playlists')
      .select('playlist_id')
      .eq('seller_id', principal.sellerId)
      .eq('playlist_id', playlistId)
      .eq('active', true)
      .maybeSingle();
    if (error || !permission) throw new PanelAuthError('Lista não pertence ao vendedor.', 403);
  }
  const { data, error } = await supabase
    .from('panel_playlists')
    .select(`
      id, name, playlist_type, active, max_connections, source_kind,
      provider_name, provider_plan_name, provider_created_at, provider_expires_at,
      source_summary, registration_version, primary_endpoint_id,
      tls_mode, tls_allowed_hosts, tls_allow_subdomains, tls_allow_redirect_hosts,
      tls_scope_validation, tls_scope_cache, tls_scope_catalog, tls_scope_playback,
      tls_risk_accepted_at, playlist_access_mode, playlist_cache_status,
      playlist_cache_updated_at, playlist_cache_item_count,
      playlist_qualification_status, playlist_qualification_code,
      playlist_qualification_message, playlist_qualification_updated_at
    `)
    .eq('id', playlistId)
    .maybeSingle();
  if (error || !data) throw new Error('Lista não encontrada.');
  return data;
}

async function listSources(supabase: any, principal: PanelPrincipal) {
  let playlistIds: string[] | null = null;
  if (principal.role === 'seller') {
    const { data, error } = await supabase
      .from('panel_seller_playlists')
      .select('playlist_id')
      .eq('seller_id', principal.sellerId)
      .eq('active', true);
    if (error) throw new Error('Não foi possível carregar as permissões do vendedor.');
    playlistIds = (data || []).map((row: any) => String(row.playlist_id));
    if (playlistIds.length === 0) return [];
  }

  let query = supabase
    .from('panel_playlists')
    .select(`
      id, name, playlist_type, active, max_connections, source_kind,
      provider_name, provider_plan_name, provider_expires_at,
      registration_version, primary_endpoint_id,
      tls_mode, tls_allowed_hosts, tls_scope_validation, tls_scope_cache,
      tls_scope_catalog, tls_scope_playback, playlist_access_mode,
      playlist_cache_status, playlist_cache_updated_at, playlist_cache_item_count,
      playlist_qualification_status, playlist_qualification_code,
      playlist_qualification_message, playlist_qualification_updated_at,
      endpoints:panel_playlist_endpoints(
        id, endpoint_type, label, protocol, host, port, path, output_format,
        priority, is_primary, active, masked_preview, last_test_status,
        last_test_code, last_test_message, last_tested_at, last_test_duration_ms,
        last_test_item_count, last_final_host
      )
    `)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(500);
  if (playlistIds) query = query.in('id', playlistIds);
  const { data, error } = await query;
  if (error) throw new Error('Não foi possível carregar as fontes universais.');
  return (data || []).map((row: any) => ({
    id: row.id,
    name: row.name,
    type: row.playlist_type,
    active: row.active === true,
    maxConnections: Number(row.max_connections || 1),
    sourceKind: row.source_kind || 'auto',
    providerName: row.provider_name || null,
    planName: row.provider_plan_name || null,
    providerExpiresAt: row.provider_expires_at || null,
    registrationVersion: Number(row.registration_version || 1),
    primaryEndpointId: row.primary_endpoint_id || null,
    tls: {
      mode: row.tls_mode || 'strict',
      allowedHosts: row.tls_allowed_hosts || [],
      scopes: {
        validation: row.tls_scope_validation !== false,
        cache: row.tls_scope_cache !== false,
        catalog: row.tls_scope_catalog !== false,
        playback: row.tls_scope_playback !== false,
      },
    },
    accessMode: row.playlist_access_mode,
    cacheStatus: row.playlist_cache_status,
    cacheUpdatedAt: row.playlist_cache_updated_at,
    cacheItemCount: Number(row.playlist_cache_item_count || 0),
    qualificationStatus: row.playlist_qualification_status,
    qualificationCode: row.playlist_qualification_code,
    qualificationMessage: row.playlist_qualification_message,
    qualificationUpdatedAt: row.playlist_qualification_updated_at,
    endpoints: (row.endpoints || []).sort((a: any, b: any) => Number(a.priority) - Number(b.priority)).map((endpoint: any) => ({
      id: endpoint.id,
      type: endpoint.endpoint_type,
      label: endpoint.label,
      protocol: endpoint.protocol,
      host: endpoint.host,
      port: endpoint.port,
      path: endpoint.path,
      outputFormat: endpoint.output_format,
      priority: endpoint.priority,
      primary: endpoint.is_primary === true,
      active: endpoint.active === true,
      preview: endpoint.masked_preview,
      test: {
        status: endpoint.last_test_status,
        code: endpoint.last_test_code,
        message: endpoint.last_test_message,
        testedAt: endpoint.last_tested_at,
        durationMs: endpoint.last_test_duration_ms,
        itemCount: endpoint.last_test_item_count,
        finalHost: endpoint.last_final_host,
      },
    })),
  }));
}

async function details(supabase: any, principal: PanelPrincipal, playlistId: string) {
  const playlist = await assertPlaylistAccess(supabase, principal, playlistId);
  const [{ data: endpoints, error: endpointError }, { data: profile, error: profileError }, { data: tests, error: testError }] = await Promise.all([
    supabase
      .from('panel_playlist_endpoints')
      .select('*')
      .eq('playlist_id', playlistId)
      .order('priority', { ascending: true }),
    supabase
      .from('panel_playlist_connection_profiles')
      .select('custom_ca_pem, request_headers, request_method, request_body, timeout_ms, retry_count, follow_redirects')
      .eq('playlist_id', playlistId)
      .maybeSingle(),
    supabase
      .from('panel_playlist_test_runs')
      .select('id, endpoint_id, stage, result, strategy_key, protocol, host_snapshot, port, path_snapshot, http_status, duration_ms, response_bytes, item_count, error_code, error_message, redirect_snapshot, tls_mode, occurred_at')
      .eq('playlist_id', playlistId)
      .order('occurred_at', { ascending: false })
      .limit(100),
  ]);
  if (endpointError || profileError || testError) throw new Error('Não foi possível carregar os detalhes da fonte.');
  return {
    playlist: {
      ...playlist,
      playlist_url: undefined,
    },
    endpoints: (endpoints || []).map((endpoint: any) => ({
      id: endpoint.id,
      type: endpoint.endpoint_type,
      label: endpoint.label,
      url: endpoint.endpoint_url,
      preview: endpoint.masked_preview,
      protocol: endpoint.protocol,
      host: endpoint.host,
      port: endpoint.port,
      path: endpoint.path,
      outputFormat: endpoint.output_format,
      priority: endpoint.priority,
      primary: endpoint.is_primary === true,
      active: endpoint.active === true,
      metadata: endpoint.metadata || {},
    })),
    connectionProfile: profile ? {
      customCaPem: profile.custom_ca_pem || '',
      headers: profile.request_headers || {},
      method: profile.request_method,
      body: profile.request_body,
      timeoutMs: profile.timeout_ms,
      retryCount: profile.retry_count,
      followRedirects: profile.follow_redirects !== false,
    } : {
      customCaPem: '', headers: {}, method: 'GET', body: null,
      timeoutMs: 45000, retryCount: 1, followRedirects: true,
    },
    tests: tests || [],
  };
}


async function deleteSource(
  supabase: any,
  principal: PanelPrincipal,
  playlistId: string,
) {
  const playlist = await assertPlaylistAccess(supabase, principal, playlistId);

  let deviceQuery = supabase
    .from('panel_device_playlists')
    .select('id, device:panel_devices!inner(id, seller_id)', { count: 'exact', head: true })
    .eq('playlist_id', playlistId);
  let legacyQuery = supabase
    .from('panel_devices')
    .select('id', { count: 'exact', head: true })
    .eq('playlist_id', playlistId);

  if (principal.role === 'seller') {
    deviceQuery = deviceQuery.eq('device.seller_id', principal.sellerId);
    legacyQuery = legacyQuery.eq('seller_id', principal.sellerId);
  }

  const [{ count: assignmentCount, error: assignmentError }, { count: legacyCount, error: legacyError }] = await Promise.all([
    deviceQuery,
    legacyQuery,
  ]);
  if (assignmentError || legacyError) throw new Error('Não foi possível conferir os vínculos da fonte.');
  const linkedDevices = Number(assignmentCount || 0) + Number(legacyCount || 0);
  if (linkedDevices > 0) {
    throw new Error(`A fonte ainda está vinculada a ${linkedDevices} aparelho(s). Troque ou remova esses vínculos antes de excluir.`);
  }

  if (principal.role === 'seller') {
    const { error: unlinkError } = await supabase
      .from('panel_seller_playlists')
      .delete()
      .eq('seller_id', principal.sellerId)
      .eq('playlist_id', playlistId);
    if (unlinkError) throw new Error('Não foi possível excluir a fonte da conta do vendedor.');

    const [{ count: remainingSellerLinks, error: sellerCountError }, { count: globalAssignments, error: globalAssignmentError }, { count: globalLegacy, error: globalLegacyError }, { count: reviewLinks, error: reviewError }] = await Promise.all([
      supabase.from('panel_seller_playlists').select('id', { count: 'exact', head: true }).eq('playlist_id', playlistId),
      supabase.from('panel_device_playlists').select('id', { count: 'exact', head: true }).eq('playlist_id', playlistId),
      supabase.from('panel_devices').select('id', { count: 'exact', head: true }).eq('playlist_id', playlistId),
      supabase.from('panel_review_accounts').select('id', { count: 'exact', head: true }).eq('playlist_id', playlistId),
    ]);
    if (sellerCountError || globalAssignmentError || globalLegacyError || reviewError) {
      throw new Error('A fonte foi desvinculada, mas não foi possível concluir a limpeza automática.');
    }
    if (
      Number(remainingSellerLinks || 0) === 0 &&
      Number(globalAssignments || 0) === 0 &&
      Number(globalLegacy || 0) === 0 &&
      Number(reviewLinks || 0) === 0
    ) {
      await supabase.from('panel_playlists').update({
        active: false,
        archived_at: new Date().toISOString(),
        playlist_qualification_status: 'blocked',
        playlist_qualification_code: 'SOURCE_ARCHIVED_BY_SELLER',
        playlist_qualification_message: 'Fonte arquivada após a remoção do último vínculo comercial.',
        playlist_qualification_updated_at: new Date().toISOString(),
      }).eq('id', playlistId);
    }
  } else {
    const [{ count: sellerLinks, error: sellerError }, { count: reviewLinks, error: reviewError }] = await Promise.all([
      supabase.from('panel_seller_playlists').select('id', { count: 'exact', head: true }).eq('playlist_id', playlistId),
      supabase.from('panel_review_accounts').select('id', { count: 'exact', head: true }).eq('playlist_id', playlistId),
    ]);
    if (sellerError || reviewError) throw new Error('Não foi possível conferir os vínculos comerciais da fonte.');
    if (Number(reviewLinks || 0) > 0) {
      throw new Error('A fonte está vinculada a uma conta de homologação. Remova esse vínculo antes de excluir.');
    }

    const { error: unlinkError } = await supabase
      .from('panel_seller_playlists')
      .delete()
      .eq('playlist_id', playlistId);
    if (unlinkError) throw new Error('Não foi possível remover os vínculos com vendedores.');

    const { error: archiveError } = await supabase.from('panel_playlists').update({
      active: false,
      archived_at: new Date().toISOString(),
      playlist_qualification_status: 'blocked',
      playlist_qualification_code: 'SOURCE_ARCHIVED_BY_ADMIN',
      playlist_qualification_message: 'Fonte arquivada pelo painel administrativo.',
      playlist_qualification_updated_at: new Date().toISOString(),
    }).eq('id', playlistId);
    if (archiveError) throw new Error('Não foi possível arquivar a fonte.');

    await supabase.from('panel_audit_logs').insert({
      action: 'playlist_source_archived',
      entity_type: 'playlist',
      entity_id: playlistId,
      description: `Fonte "${clean(playlist.name, 180)}" arquivada pelo cadastro universal.`,
      metadata: { removedSellerLinks: Number(sellerLinks || 0), registrationVersion: playlist.registration_version || 1 },
      performed_by: principal.email || principal.userId,
    });
  }

  return {
    playlistId,
    archived: true,
    message: principal.role === 'seller'
      ? 'Fonte removida da sua conta com segurança.'
      : 'Fonte arquivada e removida da biblioteca ativa.',
  };
}

async function triggerLegacyCache(playlistId: string) {
  const response = await fetch(`${getEnv('SUPABASE_URL')}/functions/v1/playlist-cache`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': getEnv('ADMIN_PANEL_TOKEN'),
    },
    body: JSON.stringify({ action: 'refresh', playlistId }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error || body?.message || `Falha HTTP ${response.status}.`);
  }
}

function schedule(promise: Promise<unknown>) {
  const tracked = promise.catch(error => {
    console.error('Falha em tarefa assíncrona do cadastro universal.', {
      message: redactPlaylistSecrets(error instanceof Error ? error.message : error, 400),
    });
  });
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(tracked);
}

async function saveSource(
  supabase: any,
  principal: PanelPrincipal,
  body: Record<string, unknown>,
) {
  const parsed = await parseInput(body);
  if (parsed.endpoints.length > MAX_ENDPOINTS) {
    throw new Error(`Uma fonte pode ter no máximo ${MAX_ENDPOINTS} endpoints.`);
  }
  const primary = setPrimary(parsed, body.primaryIndex);
  const name = requiredText(body.name || parsed.provider.name || 'Nova fonte', 'Nome da lista', 180);
  const maxConnections = integer(
    body.maxConnections ?? parsed.provider.maxConnections ?? 1,
    1,
    1,
    50,
  );
  const security = securityPayload(body, parsed);
  const connectionProfile = connectionProfilePayload(body, security);
  const existingPlaylistId = uuid(body.playlistId, 'Lista', true);
  if (existingPlaylistId) await assertPlaylistAccess(supabase, principal, existingPlaylistId);
  const sellerId = principal.role === 'seller'
    ? principal.sellerId
    : uuid(body.sellerId, 'Vendedor', true);

  const { data, error } = await supabase.rpc('register_universal_playlist_source_transaction', {
    p_name: name,
    p_primary_url: primary.url,
    p_legacy_type: legacyPlaylistType(primary),
    p_source_kind: parsed.sourceKind,
    p_max_connections: maxConnections,
    p_primary_fingerprint: primary.fingerprint,
    p_seller_id: sellerId,
    p_provider: {
      name: parsed.provider.name,
      planName: parsed.provider.planName,
      createdAt: parsed.provider.createdAt,
      expiresAt: parsed.provider.expiresAt,
    },
    p_endpoints: parsed.endpoints,
    p_security: security,
    p_connection_profile: connectionProfile,
    p_import_kind: parsed.sourceKind === 'provider_message' ? 'provider_message' : 'structured',
    p_import_sha256: parsed.inputSha256,
    p_import_summary: parsed.redactedSummary,
    p_created_by_user_id: principal.userId,
    p_created_by_role: principal.role,
    p_existing_playlist_id: existingPlaylistId,
  });
  if (error) throw new Error(error.message || 'Não foi possível salvar a fonte.');
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.playlist_id) throw new Error('O cadastro não retornou a fonte salva.');
  const playlistId = String(result.playlist_id);

  if (security.mode === 'strict' && security.scopes.cache) {
    schedule(triggerLegacyCache(playlistId));
  } else {
    await supabase
      .from('panel_playlists')
      .update({
        playlist_access_mode: 'direct',
        playlist_qualification_status: 'awaiting_device_test',
        playlist_qualification_code: security.mode === 'strict'
          ? 'DIRECT_SOURCE_REQUIRES_DEVICE_TEST'
          : 'TLS_COMPATIBILITY_REQUIRES_DEVICE_TEST',
        playlist_qualification_message: security.mode === 'strict'
          ? 'A fonte será validada diretamente em um aparelho autorizado.'
          : 'A fonte usa uma política especial de certificado e precisa ser confirmada no aparelho.',
        playlist_qualification_updated_at: new Date().toISOString(),
      })
      .eq('id', playlistId);
  }

  return {
    playlistId,
    created: result.created === true,
    endpointCount: Number(result.endpoint_count || parsed.endpoints.length),
    source: parsed.redactedSummary,
    security: {
      ...security,
      connection: safeConnectionProfileSummary(connectionProfile),
    },
    message: result.created === true
      ? 'Fonte salva com todos os endpoints. A validação foi iniciada.'
      : 'Fonte existente atualizada sem criar duplicação.',
  };
}

function probeClassification(endpoint: ParsedEndpoint, result: Awaited<ReturnType<typeof probeUniversalEndpoint>>) {
  if (!result.ok) {
    if (result.status === 401 || result.status === 403) {
      return { status: 'failure', code: 'AUTH_REJECTED', message: `O servidor recusou a autenticação (HTTP ${result.status}).`, itemCount: null };
    }
    if (result.status === 404) {
      return { status: 'failure', code: 'PATH_NOT_FOUND', message: 'O domínio respondeu, mas o caminho informado não foi encontrado (HTTP 404).', itemCount: null };
    }
    return { status: 'failure', code: `HTTP_${result.status}`, message: `O servidor respondeu HTTP ${result.status}.`, itemCount: null };
  }
  if (endpoint.type === 'xtream') {
    try {
      const payload = JSON.parse(result.sample || '{}');
      const auth = String(payload?.user_info?.auth ?? '');
      if (auth === '1') return { status: 'success', code: 'XTREAM_AUTH_OK', message: 'A API Xtream aceitou as credenciais.', itemCount: null };
      if (payload?.user_info) return { status: 'failure', code: 'XTREAM_AUTH_REJECTED', message: 'A API Xtream respondeu, mas não autorizou a conta.', itemCount: null };
    } catch {
      return { status: 'partial', code: 'XTREAM_NON_JSON', message: 'O endereço respondeu, mas a amostra não parece ser uma resposta JSON da API Xtream.', itemCount: null };
    }
  }
  if (endpoint.type === 'm3u' || endpoint.type === 'hls' || endpoint.type === 'ssiptv') {
    if (/^#EXTM3U/im.test(result.sample)) {
      const count = (result.sample.match(/^#EXTINF:/gim) || []).length;
      return { status: 'success', code: 'PLAYLIST_HEADER_OK', message: 'A resposta contém uma playlist M3U válida.', itemCount: count || null };
    }
    if (endpoint.type === 'hls' && /#EXT-X-(TARGETDURATION|STREAM-INF|MEDIA-SEQUENCE)/i.test(result.sample)) {
      return { status: 'success', code: 'HLS_MANIFEST_OK', message: 'A resposta contém um manifesto HLS válido.', itemCount: null };
    }
    return { status: 'partial', code: 'CONTENT_UNCONFIRMED', message: 'O endereço respondeu, mas a amostra ainda não confirmou o formato da lista.', itemCount: null };
  }
  return { status: 'success', code: 'ENDPOINT_REACHABLE', message: 'O endpoint respondeu com sucesso.', itemCount: null };
}

async function storeTestRun(
  supabase: any,
  principal: PanelPrincipal,
  playlistId: string | null,
  endpointId: string | null,
  endpoint: ParsedEndpoint,
  tlsMode: TlsMode,
  result: {
    result: 'success' | 'partial' | 'failure' | 'skipped';
    code: string;
    message: string;
    httpStatus?: number | null;
    durationMs?: number;
    bytes?: number | null;
    itemCount?: number | null;
    redirect?: string | null;
    finalHost?: string | null;
  },
) {
  if (!playlistId) return;
  await supabase.from('panel_playlist_test_runs').insert({
    playlist_id: playlistId,
    endpoint_id: endpointId,
    stage: 'connection',
    result: result.result,
    strategy_key: `${endpoint.type}:${tlsMode}`,
    protocol: endpoint.protocol,
    host_snapshot: endpoint.host,
    port: endpoint.port,
    path_snapshot: endpoint.path,
    http_status: result.httpStatus ?? null,
    duration_ms: result.durationMs || 0,
    response_bytes: result.bytes ?? null,
    item_count: result.itemCount ?? null,
    error_code: result.result === 'failure' ? result.code : null,
    error_message: result.message.slice(0, 500),
    redirect_snapshot: result.redirect || null,
    tls_mode: tlsMode,
    created_by_user_id: principal.userId,
  });
  if (endpointId) {
    await supabase.from('panel_playlist_endpoints').update({
      last_test_status: result.result === 'success' ? 'success' : result.result === 'partial' ? 'partial' : 'failure',
      last_test_code: result.code,
      last_test_message: result.message.slice(0, 500),
      last_tested_at: new Date().toISOString(),
      last_test_duration_ms: result.durationMs || 0,
      last_test_item_count: result.itemCount ?? null,
      last_final_host: result.finalHost || null,
      updated_at: new Date().toISOString(),
    }).eq('id', endpointId).eq('playlist_id', playlistId);
  }
}

async function testDraftOrSaved(
  supabase: any,
  principal: PanelPrincipal,
  body: Record<string, unknown>,
) {
  const playlistId = uuid(body.playlistId, 'Lista', true);
  let parsed: ParsedUniversalSource;
  let security: ReturnType<typeof securityPayload>;
  let profile: ReturnType<typeof connectionProfilePayload>;
  let endpointIds = new Map<string, string>();

  if (playlistId && !body.providerMessage && !body.endpoints && !body.playlistUrl) {
    const saved = await details(supabase, principal, playlistId);
    parsed = await parseStructuredSource({
      sourceKind: saved.playlist.source_kind,
      endpoints: saved.endpoints,
      providerName: saved.playlist.provider_name,
      planName: saved.playlist.provider_plan_name,
      providerCreatedAt: saved.playlist.provider_created_at,
      providerExpiresAt: saved.playlist.provider_expires_at,
      maxConnections: saved.playlist.max_connections,
    }, getEnv('SUPABASE_SERVICE_ROLE_KEY'));
    for (const endpoint of saved.endpoints) endpointIds.set(endpoint.url, endpoint.id);
    security = securityPayload({
      security: {
        mode: saved.playlist.tls_mode,
        allowedHosts: saved.playlist.tls_allowed_hosts,
        allowSubdomains: saved.playlist.tls_allow_subdomains,
        allowRedirectHosts: saved.playlist.tls_allow_redirect_hosts,
        riskAccepted: saved.playlist.tls_mode === 'insecure',
        scopes: {
          validation: saved.playlist.tls_scope_validation,
          cache: saved.playlist.tls_scope_cache,
          catalog: saved.playlist.tls_scope_catalog,
          playback: saved.playlist.tls_scope_playback,
        },
      },
    }, parsed);
    profile = connectionProfilePayload({ connectionProfile: saved.connectionProfile }, security);
  } else {
    parsed = await parseInput(body);
    security = securityPayload(body, parsed);
    profile = connectionProfilePayload(body, security);
    if (playlistId) await assertPlaylistAccess(supabase, principal, playlistId);
  }

  const endpoints = parsed.endpoints.slice(0, TEST_ENDPOINT_LIMIT);
  const results: Array<Record<string, unknown>> = [];
  for (const endpoint of endpoints) {
    const endpointId = endpointIds.get(endpoint.url) || null;
    const modes: TlsMode[] = security.mode === 'strict' ? ['strict'] : ['strict', security.mode];
    let succeeded = false;
    for (const tlsMode of modes) {
      if (succeeded) break;
      try {
        const probe = await probeUniversalEndpoint(endpoint.url, {
          timeoutMs: profile.timeoutMs,
          maxBytes: 512 * 1024,
          headers: profile.headers,
          method: profile.method as 'GET' | 'POST',
          body: profile.body ? JSON.stringify(profile.body) : undefined,
          followRedirects: profile.followRedirects,
          tlsMode,
          customCaPem: profile.customCaPem,
          allowedTlsHosts: security.allowedHosts,
          allowSubdomains: security.allowSubdomains,
          allowRedirectHosts: security.allowRedirectHosts,
        });
        const classification = probeClassification(endpoint, probe);
        const normalizedResult = classification.status === 'success'
          ? 'success'
          : classification.status === 'partial' ? 'partial' : 'failure';
        await storeTestRun(supabase, principal, playlistId, endpointId, endpoint, tlsMode, {
          result: normalizedResult,
          code: classification.code,
          message: classification.message,
          httpStatus: probe.status,
          durationMs: probe.durationMs,
          bytes: probe.bytes,
          itemCount: classification.itemCount,
          redirect: probe.redirectChain.at(-1) || null,
          finalHost: new URL(probe.finalUrl).hostname,
        });
        results.push({
          endpoint: { type: endpoint.type, label: endpoint.label, preview: endpoint.preview, host: endpoint.host, port: endpoint.port },
          tlsMode,
          result: normalizedResult,
          code: classification.code,
          message: classification.message,
          httpStatus: probe.status,
          durationMs: probe.durationMs,
          bytes: probe.bytes,
          itemCount: classification.itemCount,
          finalHost: new URL(probe.finalUrl).hostname,
        });
        succeeded = normalizedResult === 'success';
      } catch (error) {
        const classified = classifyProbeError(error);
        await storeTestRun(supabase, principal, playlistId, endpointId, endpoint, tlsMode, {
          result: 'failure', code: classified.code, message: classified.message,
        });
        results.push({
          endpoint: { type: endpoint.type, label: endpoint.label, preview: endpoint.preview, host: endpoint.host, port: endpoint.port },
          tlsMode,
          result: 'failure',
          code: classified.code,
          message: classified.message,
        });
      }
    }
  }

  const successfulIndex = results.findIndex(result => result.result === 'success');
  return {
    testedEndpointCount: endpoints.length,
    resultCount: results.length,
    success: successfulIndex >= 0,
    recommendedResultIndex: successfulIndex,
    results,
  };
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return json(request, { error: 'Método não permitido.' }, 405);

  try {
    const supabase = createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const principal = await requirePanelPrincipal(request, supabase, ['owner', 'admin', 'seller']);
    const body = await readBody(request);
    const action = clean(body.action || 'list', 40);

    if (action === 'analyze') {
      const parsed = await parseInput(body);
      return json(request, { ok: true, draft: safeDraft(parsed) });
    }
    if (action === 'list') {
      return json(request, { ok: true, sources: await listSources(supabase, principal) });
    }
    if (action === 'details') {
      const playlistId = uuid(body.playlistId, 'Lista')!;
      return json(request, { ok: true, ...(await details(supabase, principal, playlistId)) });
    }
    if (action === 'save' || action === 'create' || action === 'update') {
      return json(request, { ok: true, ...(await saveSource(supabase, principal, body)) }, 202);
    }
    if (action === 'test') {
      return json(request, { ok: true, ...(await testDraftOrSaved(supabase, principal, body)) });
    }
    if (action === 'delete') {
      const playlistId = uuid(body.playlistId, 'Lista')!;
      return json(request, { ok: true, ...(await deleteSource(supabase, principal, playlistId)) });
    }

    return json(request, { error: 'Ação não suportada.' }, 400);
  } catch (error) {
    if (error instanceof PanelAuthError) return panelAuthErrorResponse(error, corsHeaders(request));
    const message = redactPlaylistSecrets(error instanceof Error ? error.message : error, 500);
    console.error('Falha no cadastro universal de fontes.', { message });
    return json(request, { error: message || 'Falha inesperada no cadastro universal.' }, 400);
  }
});
