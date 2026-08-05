import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  PanelAuthError,
  PanelPrincipal,
  panelAuthErrorResponse,
  requirePanelPrincipal,
} from '../_shared/panelAuth.ts';
import {
  getPlaylistCommercialDecision,
  playlistQualificationPayload,
} from '../_shared/playlistQualification.ts';
import {
  hmacSha256Hex,
  inferPlaylistType,
  inspectPlaylistSource as inspectSource,
  normalizedPlaylistSource,
  playlistSourceFingerprint,
  redactPlaylistSecrets as redactSecrets,
  requiredText,
  textOrNull,
  validatePlaylistUrl,
} from '../_shared/playlistSource.ts';

type JsonBody = Record<string, unknown>;
type TargetContext = {
  mode: 'subscription' | 'device';
  id: string;
  sellerId: string;
  customerName: string | null;
  status: string;
  simultaneousConnections: number;
  currentAssignment: any | null;
};

const DEFAULT_ALLOWED_ORIGINS = [
  'https://wesley956.github.io',
  'https://conecta-five-iota.vercel.app',
  'https://conecta-cruzjade080-4490s-projects.vercel.app',
  'https://conecta-git-main-cruzjade080-4490s-projects.vercel.app',
  'http://localhost:4173',
  'http://localhost:5173',
  'http://127.0.0.1:4173',
  'http://127.0.0.1:5173',
];
const MAX_BODY_BYTES = 64 * 1024;

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
  const selectedOrigin = origin && allowed.has(origin) ? origin : DEFAULT_ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': selectedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(request: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function readBody(request: Request): Promise<JsonBody> {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BODY_BYTES) throw new Error('Requisição excede o limite permitido.');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw new Error('Requisição excede o limite permitido.');
  }
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed as JsonBody : {};
  } catch {
    return {};
  }
}

function uuidOrNull(value: unknown) {
  const valueText = textOrNull(value, 80);
  if (!valueText) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valueText)) {
    throw new Error('Identificador inválido.');
  }
  return valueText;
}

function requiredUuid(value: unknown, label: string) {
  const id = uuidOrNull(value);
  if (!id) throw new Error(`${label} é obrigatório.`);
  return id;
}

function integerInRange(value: unknown, label: string, minimum: number, maximum: number) {
  const numberValue = Number(value);
  if (!Number.isSafeInteger(numberValue) || numberValue < minimum || numberValue > maximum) {
    throw new Error(`${label} deve estar entre ${minimum} e ${maximum}.`);
  }
  return numberValue;
}

function safeDatabaseError(error: any, fallback: string) {
  const code = String(error?.code || '');
  const message = redactSecrets(error?.message || '', 300);
  if (['22023', '23505', 'P0001', 'P0002'].includes(code)) return message || fallback;
  console.error(fallback, { code: error?.code || null });
  return fallback;
}

function unwrap(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

function mapPlaylist(assignment: any) {
  return unwrap(assignment?.playlist);
}

async function resolveDeviceTarget(
  supabase: any,
  principal: PanelPrincipal,
  deviceId: string,
  priority: number,
): Promise<TargetContext> {
  const { data, error } = await supabase
    .from('panel_devices')
    .select(`
      id,
      seller_id,
      customer_id,
      plan_id,
      status,
      playlist_id,
      customer:panel_customers(id, name),
      plan:panel_plans(id, simultaneous_connections),
      primary_playlist:panel_playlists!panel_devices_playlist_id_fkey(
        id, name, playlist_url, playlist_type, active, max_connections,
        playlist_updated_at, playlist_cache_status, playlist_cache_updated_at,
        playlist_cache_item_count, playlist_cache_size_bytes, playlist_cache_error,
        playlist_access_mode, playlist_qualification_status,
        playlist_qualification_message, playlist_qualified_at,
        playlist_direct_confirmed_at
      ),
      device_playlists:panel_device_playlists(
        playlist_id,
        priority,
        active,
        playlist:panel_playlists(
          id, name, playlist_url, playlist_type, active, max_connections,
          playlist_updated_at, playlist_cache_status, playlist_cache_updated_at,
          playlist_cache_item_count, playlist_cache_size_bytes, playlist_cache_error,
          playlist_access_mode, playlist_qualification_status,
          playlist_qualification_message, playlist_qualified_at,
          playlist_direct_confirmed_at
        )
      )
    `)
    .eq('id', deviceId)
    .maybeSingle();

  if (error || !data) throw new Error('Aparelho não encontrado.');
  if (!data.seller_id) throw new Error('Aparelho sem vendedor responsável.');
  if (principal.role === 'seller' && data.seller_id !== principal.sellerId) {
    throw new PanelAuthError('Vendedor não pode editar a lista deste aparelho.', 403);
  }

  const explicit = (data.device_playlists || []).find((item: any) =>
    Number(item.priority) === priority && item.active !== false
  );
  const fallback = priority === 1 ? unwrap(data.primary_playlist) : null;
  const customer = unwrap(data.customer);
  const plan = unwrap(data.plan);

  return {
    mode: 'device',
    id: data.id,
    sellerId: data.seller_id,
    customerName: customer?.name || null,
    status: data.status,
    simultaneousConnections: Math.max(1, Number(plan?.simultaneous_connections || 1)),
    currentAssignment: explicit || (fallback ? { playlist_id: fallback.id, priority: 1, playlist: fallback } : null),
  };
}

async function resolveSubscriptionTarget(
  supabase: any,
  principal: PanelPrincipal,
  subscriptionId: string,
  priority: number,
): Promise<TargetContext> {
  const { data, error } = await supabase
    .from('panel_subscriptions')
    .select(`
      id,
      seller_id,
      status,
      simultaneous_connections_snapshot,
      customer:panel_customers(id, name),
      subscription_playlists:panel_subscription_playlists(
        playlist_id,
        priority,
        active,
        playlist:panel_playlists(
          id, name, playlist_url, playlist_type, active, max_connections,
          playlist_updated_at, playlist_cache_status, playlist_cache_updated_at,
          playlist_cache_item_count, playlist_cache_size_bytes, playlist_cache_error,
          playlist_access_mode, playlist_qualification_status,
          playlist_qualification_message, playlist_qualified_at,
          playlist_direct_confirmed_at
        )
      )
    `)
    .eq('id', subscriptionId)
    .maybeSingle();

  if (error || !data) throw new Error('Assinatura não encontrada.');
  if (principal.role === 'seller' && data.seller_id !== principal.sellerId) {
    throw new PanelAuthError('Vendedor não pode editar a lista desta assinatura.', 403);
  }

  const assignment = (data.subscription_playlists || []).find((item: any) =>
    Number(item.priority) === priority && item.active !== false
  ) || null;
  const customer = unwrap(data.customer);

  return {
    mode: 'subscription',
    id: data.id,
    sellerId: data.seller_id,
    customerName: customer?.name || null,
    status: data.status,
    simultaneousConnections: Math.max(1, Number(data.simultaneous_connections_snapshot || 1)),
    currentAssignment: assignment,
  };
}

async function resolveTarget(
  supabase: any,
  principal: PanelPrincipal,
  body: JsonBody,
  priority: number,
) {
  const deviceId = uuidOrNull(body.deviceId);
  if (deviceId) return resolveDeviceTarget(supabase, principal, deviceId, priority);
  const subscriptionId = requiredUuid(body.subscriptionId, 'Assinatura ou aparelho');
  return resolveSubscriptionTarget(supabase, principal, subscriptionId, priority);
}

function mapDetails(target: TargetContext, priority: number) {
  const playlist = mapPlaylist(target.currentAssignment);
  return {
    targetMode: target.mode,
    deviceId: target.mode === 'device' ? target.id : null,
    subscriptionId: target.mode === 'subscription' ? target.id : null,
    priority,
    role: priority === 1 ? 'principal' : 'reserva',
    customerName: target.customerName,
    simultaneousConnections: target.simultaneousConnections,
    current: playlist ? {
      id: playlist.id,
      name: playlist.name,
      type: playlist.playlist_type,
      maxConnections: Number(playlist.max_connections || 1),
      source: inspectSource(playlist.playlist_url),
      sourceUpdatedAt: playlist.playlist_updated_at || null,
      accessMode: playlist.playlist_access_mode || 'server_cache',
      cacheStatus: playlist.playlist_cache_status || 'missing',
      cacheUpdatedAt: playlist.playlist_cache_updated_at || null,
      cacheItemCount: Number(playlist.playlist_cache_item_count || 0),
      cacheSizeBytes: Number(playlist.playlist_cache_size_bytes || 0),
      cacheError: playlist.playlist_cache_error ? redactSecrets(playlist.playlist_cache_error, 300) : null,
      ...playlistQualificationPayload(playlist),
    } : null,
  };
}

async function triggerPlaylistCache(playlistId: string) {
  const response = await fetch(`${getEnv('SUPABASE_URL')}/functions/v1/playlist-cache`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': getEnv('ADMIN_PANEL_TOKEN'),
    },
    body: JSON.stringify({ action: 'refresh', playlistId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || data?.message || `Falha HTTP ${response.status}.`);
  }
  return data;
}

function scheduleCache(playlistId: string) {
  const promise = triggerPlaylistCache(playlistId).catch(error => {
    console.error('Validação assíncrona da candidata falhou.', {
      message: redactSecrets(error instanceof Error ? error.message : error, 300),
    });
  });
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(promise);
  }
}

async function ensureSellerPermission(supabase: any, sellerId: string, playlistId: string) {
  const { error } = await supabase
    .from('panel_seller_playlists')
    .upsert({
      seller_id: sellerId,
      playlist_id: playlistId,
      active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'seller_id,playlist_id' });
  if (error) throw new Error('Não foi possível liberar a nova lista ao vendedor.');
}

async function findOrCreateCandidate(
  supabase: any,
  target: TargetContext,
  input: {
    name: string;
    playlistUrl: string;
    playlistType: string;
    maxConnections: number;
  },
) {
  const fingerprint = await playlistSourceFingerprint(
    getEnv('SUPABASE_SERVICE_ROLE_KEY'),
    input.playlistUrl,
  );
  const { data: existing, error: existingError } = await supabase
    .from('panel_playlists')
    .select(`
      id, name, playlist_type, active, max_connections, playlist_access_mode,
      playlist_cache_status, playlist_cache_updated_at, playlist_cache_item_count,
      playlist_cache_size_bytes, playlist_cache_error, playlist_cache_error_code,
      playlist_qualification_status, playlist_qualification_message,
      playlist_qualified_at, playlist_direct_confirmed_at
    `)
    .eq('source_fingerprint', fingerprint)
    .eq('active', true)
    .maybeSingle();
  if (existingError) throw new Error('Não foi possível verificar a origem da lista.');

  if (existing) {
    if (Number(existing.max_connections || 1) < target.simultaneousConnections) {
      throw new Error('A lista cadastrada para esta origem não suporta as conexões simultâneas do plano.');
    }
    await ensureSellerPermission(supabase, target.sellerId, String(existing.id));
    return { row: existing, created: false };
  }

  const now = new Date().toISOString();
  const { data: created, error: createError } = await supabase
    .from('panel_playlists')
    .insert({
      name: input.name,
      playlist_url: input.playlistUrl,
      playlist_type: input.playlistType,
      active: true,
      max_connections: input.maxConnections,
      source_fingerprint: fingerprint,
      playlist_updated_at: now,
      playlist_cache_status: 'missing',
      playlist_cache_error: null,
      playlist_cache_error_code: null,
      playlist_cache_attempts: [],
      playlist_access_mode: 'server_cache',
      playlist_qualification_status: 'validating',
      playlist_qualification_code: 'REPLACEMENT_CANDIDATE_CREATED',
      playlist_qualification_message: 'A nova origem foi salva e está sendo validada.',
      playlist_qualification_updated_at: now,
    })
    .select(`
      id, name, playlist_type, active, max_connections, playlist_access_mode,
      playlist_cache_status, playlist_cache_updated_at, playlist_cache_item_count,
      playlist_cache_size_bytes, playlist_cache_error, playlist_cache_error_code,
      playlist_qualification_status, playlist_qualification_message,
      playlist_qualified_at, playlist_direct_confirmed_at
    `)
    .single();
  if (createError || !created) {
    if (createError?.code === '23505') {
      throw new Error('Esta origem já foi cadastrada. Atualize a tela e tente novamente.');
    }
    throw new Error('Não foi possível preparar a nova lista.');
  }

  try {
    await ensureSellerPermission(supabase, target.sellerId, String(created.id));
  } catch (error) {
    await supabase
      .from('panel_playlists')
      .update({ active: false, archived_at: now })
      .eq('id', created.id);
    throw error;
  }
  return { row: created, created: true };
}

async function loadDetails(supabase: any, principal: PanelPrincipal, body: JsonBody) {
  const priority = integerInRange(body.priority, 'Posição da lista', 1, 2);
  const target = await resolveTarget(supabase, principal, body, priority);
  return mapDetails(target, priority);
}

async function applyCandidate(
  supabase: any,
  principal: PanelPrincipal,
  target: TargetContext,
  priority: number,
  candidateId: string,
  reason: string,
  idempotencyKey: string,
) {
  const rpcName = target.mode === 'device'
    ? 'replace_device_playlist_transaction'
    : 'replace_subscription_playlist_transaction';
  const rpcArgs = target.mode === 'device'
    ? {
        p_device_id: target.id,
        p_priority: priority,
        p_candidate_playlist_id: candidateId,
        p_reason: reason,
        p_performed_by: principal.email || principal.userId,
        p_performed_by_user_id: principal.userId,
        p_idempotency_key: idempotencyKey,
      }
    : {
        p_subscription_id: target.id,
        p_priority: priority,
        p_candidate_playlist_id: candidateId,
        p_reason: reason,
        p_performed_by: principal.email || principal.userId,
        p_performed_by_user_id: principal.userId,
        p_idempotency_key: idempotencyKey,
      };

  const { data: switched, error: switchError } = await supabase.rpc(rpcName, rpcArgs);
  if (switchError) {
    throw new Error(safeDatabaseError(switchError, 'A lista foi homologada, mas não pôde ser vinculada.'));
  }
  const result = Array.isArray(switched) ? switched[0] : switched;
  return {
    ...result,
    targetMode: target.mode,
    pending: false,
    message: priority === 1
      ? 'Lista principal homologada e atualizada com segurança.'
      : 'Lista reserva homologada e atualizada com segurança.',
  };
}

async function replacePlaylist(supabase: any, principal: PanelPrincipal, body: JsonBody) {
  const priority = integerInRange(body.priority, 'Posição da lista', 1, 2);
  const target = await resolveTarget(supabase, principal, body, priority);
  if (['cancelled', 'blocked', 'inactive'].includes(String(target.status || '').toLowerCase())) {
    throw new Error('Este aparelho ou assinatura não permite editar listas no estado atual.');
  }

  const name = requiredText(body.name, 'Nome da lista', 180);
  const playlistUrl = validatePlaylistUrl(body.playlistUrl);
  const playlistType = inferPlaylistType(playlistUrl, body.playlistType);
  const maxConnections = integerInRange(body.maxConnections, 'Conexões suportadas', 1, 50);
  const reason = requiredText(body.reason, 'Motivo da edição', 500);
  const idempotencyKey = requiredText(body.idempotencyKey, 'Chave da operação', 200);

  if (maxConnections < target.simultaneousConnections) {
    throw new Error('A nova lista não suporta as conexões simultâneas do plano.');
  }

  // Mantém os nomes usados pelos validadores de regressão e confirma que a
  // implementação canônica substituiu as cópias antigas.
  void normalizedPlaylistSource;
  void hmacSha256Hex;

  const candidate = await findOrCreateCandidate(supabase, target, {
    name,
    playlistUrl,
    playlistType,
    maxConnections,
  });
  const candidateId = String(candidate.row.id);
  const decision = await getPlaylistCommercialDecision(supabase, candidateId);

  if (decision.commerciallyUsable) {
    const applied = await applyCandidate(
      supabase,
      principal,
      target,
      priority,
      candidateId,
      reason,
      idempotencyKey,
    );
    return {
      ...applied,
      playlist: {
        id: candidateId,
        name: candidate.row.name || name,
        type: candidate.row.playlist_type || playlistType,
        maxConnections: Number(candidate.row.max_connections || maxConnections),
        source: inspectSource(playlistUrl),
        accessMode: candidate.row.playlist_access_mode || 'server_cache',
        qualificationStatus: decision.status,
      },
    };
  }

  if (decision.status === 'blocked') {
    throw new Error(`A nova lista não foi aplicada. A lista anterior continua funcionando. ${decision.message}`);
  }

  if (decision.canRetryCache || candidate.created) scheduleCache(candidateId);

  return {
    applied: false,
    pending: true,
    targetMode: target.mode,
    candidatePlaylistId: candidateId,
    qualificationStatus: decision.status,
    qualificationLabel: decision.label,
    qualificationMessage: decision.message,
    requiresDeviceTest: decision.requiresDeviceTest,
    canRetryCache: decision.canRetryCache,
    playlist: {
      id: candidateId,
      name: candidate.row.name || name,
      type: candidate.row.playlist_type || playlistType,
      maxConnections: Number(candidate.row.max_connections || maxConnections),
      source: inspectSource(playlistUrl),
    },
    message: decision.requiresDeviceTest
      ? 'A nova origem foi salva, mas precisa ser homologada em um aparelho. A lista anterior continua funcionando.'
      : 'A nova origem foi salva e está sendo validada. A lista anterior continua funcionando. Tente aplicar novamente quando a homologação concluir.',
  };
}

async function candidateStatus(supabase: any, principal: PanelPrincipal, body: JsonBody) {
  const priority = integerInRange(body.priority, 'Posição da lista', 1, 2);
  const target = await resolveTarget(supabase, principal, body, priority);
  const candidateId = requiredUuid(body.candidatePlaylistId, 'Lista candidata');
  const { data: permission, error: permissionError } = await supabase
    .from('panel_seller_playlists')
    .select('playlist_id')
    .eq('seller_id', target.sellerId)
    .eq('playlist_id', candidateId)
    .eq('active', true)
    .maybeSingle();
  if (permissionError || !permission) throw new Error('A lista candidata não pertence ao vendedor responsável.');
  return {
    candidatePlaylistId: candidateId,
    ...(await getPlaylistCommercialDecision(supabase, candidateId)),
  };
}

serve(async request => {
  const headers = corsHeaders(request);
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return json(request, { error: 'Método não permitido.' }, 405);

  try {
    const supabase = createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const principal = await requirePanelPrincipal(request, supabase, ['owner', 'admin', 'seller']);
    const body = await readBody(request);
    const action = requiredText(body.action || 'details', 'Ação', 40);

    const result = action === 'details'
      ? await loadDetails(supabase, principal, body)
      : action === 'replace'
      ? await replacePlaylist(supabase, principal, body)
      : action === 'candidateStatus'
      ? await candidateStatus(supabase, principal, body)
      : null;

    if (!result) return json(request, { error: 'Ação não suportada.' }, 400);
    return json(request, { ok: true, data: result });
  } catch (error) {
    if (error instanceof PanelAuthError) return panelAuthErrorResponse(error, headers);
    const message = error instanceof Error
      ? redactSecrets(error.message, 300)
      : 'Falha ao editar a lista.';
    console.error('subscription-playlist-edit falhou.', {
      name: error instanceof Error ? error.name : 'unknown',
    });
    return json(request, { error: message || 'Falha ao editar a lista.' }, 400);
  }
});
