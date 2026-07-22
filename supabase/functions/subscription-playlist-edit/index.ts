import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  PanelAuthError,
  PanelPrincipal,
  panelAuthErrorResponse,
  requirePanelPrincipal,
} from '../_shared/panelAuth.ts';

type JsonBody = Record<string, unknown>;

const DEFAULT_ALLOWED_ORIGINS = [
  'https://wesley956.github.io',
  'http://localhost:4173',
  'http://localhost:5173',
  'http://127.0.0.1:4173',
  'http://127.0.0.1:5173',
];

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
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 64 * 1024) throw new Error('Requisição excede o limite permitido.');
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body as JsonBody : {};
  } catch {
    return {};
  }
}

function textOrNull(value: unknown, maxLength = 500) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (text.length > maxLength) throw new Error('Texto excede o tamanho permitido.');
  return text;
}

function requiredText(value: unknown, label: string, maxLength = 500) {
  const text = textOrNull(value, maxLength);
  if (!text) throw new Error(`${label} é obrigatório.`);
  return text;
}

function requiredUuid(value: unknown, label: string) {
  const text = requiredText(value, label, 80);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw new Error(`${label} inválido.`);
  }
  return text;
}

function integerInRange(value: unknown, label: string, minimum: number, maximum: number) {
  const numberValue = Number(value);
  if (!Number.isSafeInteger(numberValue) || numberValue < minimum || numberValue > maximum) {
    throw new Error(`${label} deve estar entre ${minimum} e ${maximum}.`);
  }
  return numberValue;
}

function normalizePlaylistType(value: unknown) {
  const type = String(value ?? 'm3u').trim().toLowerCase();
  if (!['m3u', 'xtream', 'stalker'].includes(type)) throw new Error('Tipo de lista inválido.');
  return type;
}

function validatePlaylistUrl(value: unknown) {
  const raw = requiredText(value, 'Nova URL da lista', 4096);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('Nova URL da lista é inválida.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('A URL da lista precisa usar HTTP ou HTTPS.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Não informe credenciais antes do domínio. Use os parâmetros fornecidos pelo provedor.');
  }
  parsed.hash = '';
  return parsed.toString();
}

function maskPath(pathname: string) {
  const parts = pathname.split('/');
  return parts.map((part, index) => {
    const previous = String(parts[index - 1] || '').toLowerCase();
    const beforePrevious = String(parts[index - 2] || '').toLowerCase();
    if (['live', 'movie', 'series'].includes(previous)) return '••••';
    if (index > 1 && ['live', 'movie', 'series'].includes(beforePrevious)) return '••••';
    if (part.length > 28) return `${part.slice(0, 5)}…${part.slice(-3)}`;
    return part;
  }).join('/');
}

function inspectSource(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const parameterNames = [...new Set([...parsed.searchParams.keys()])];
    const previewQuery = parameterNames.length
      ? `?${parameterNames.map(key => `${encodeURIComponent(key)}=••••`).join('&')}`
      : '';
    const normalizedNames = parameterNames.map(name => name.toLowerCase());
    return {
      preview: `${parsed.protocol}//${parsed.host}${maskPath(parsed.pathname)}${previewQuery}`,
      protocol: parsed.protocol.replace(':', '').toUpperCase(),
      host: parsed.host,
      path: maskPath(parsed.pathname),
      parameterNames,
      hasUsername: normalizedNames.some(name => ['username', 'user', 'login'].includes(name)),
      hasPassword: normalizedNames.some(name => ['password', 'pass', 'passwd', 'pwd'].includes(name)),
    };
  } catch {
    return null;
  }
}

function normalizedPlaylistSource(value: string) {
  const parsed = new URL(value);
  parsed.hash = '';
  parsed.hostname = parsed.hostname.toLowerCase();
  const entries = [...parsed.searchParams.entries()]
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyOrder = leftKey.localeCompare(rightKey);
      return keyOrder || leftValue.localeCompare(rightValue);
    });
  parsed.search = '';
  for (const [key, entryValue] of entries) parsed.searchParams.append(key, entryValue);
  return parsed.toString();
}

async function hmacSha256Hex(secret: string, value: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return [...new Uint8Array(signature)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function redactSecrets(value: unknown) {
  let message = String(value ?? '').slice(0, 600);
  message = message.replace(/([?&](?:username|user|login|password|pass|passwd|pwd|token|key|secret)=)[^&\s]+/gi, '$1••••');
  message = message.replace(/(https?:\/\/[^\s?#]+)\?[^\s]+/gi, '$1?••••');
  return message.slice(0, 300);
}

function safeDatabaseError(error: any, fallback: string) {
  const code = String(error?.code || '');
  const message = redactSecrets(error?.message || '');
  if (['22023', '23505', 'P0001', 'P0002'].includes(code)) return message || fallback;
  console.error(fallback, { code: error?.code || null });
  return fallback;
}

async function assertSubscriptionAccess(
  supabase: any,
  principal: PanelPrincipal,
  subscriptionId: string,
) {
  const { data, error } = await supabase
    .from('panel_subscriptions')
    .select(`
      id,
      seller_id,
      customer_id,
      status,
      simultaneous_connections_snapshot,
      customer:panel_customers(id, name)
    `)
    .eq('id', subscriptionId)
    .maybeSingle();
  if (error || !data) throw new Error('Assinatura não encontrada.');
  if (principal.role === 'seller' && data.seller_id !== principal.sellerId) {
    throw new PanelAuthError('Vendedor não pode editar a lista desta assinatura.', 403);
  }
  return data;
}

async function currentAssignment(supabase: any, subscriptionId: string, priority: number) {
  const { data, error } = await supabase
    .from('panel_subscription_playlists')
    .select(`
      id,
      playlist_id,
      priority,
      active,
      assigned_at,
      playlist:panel_playlists(
        id,
        name,
        playlist_url,
        playlist_type,
        active,
        max_connections,
        playlist_updated_at,
        playlist_cache_status,
        playlist_cache_updated_at,
        playlist_cache_item_count,
        playlist_cache_size_bytes,
        playlist_cache_error
      )
    `)
    .eq('subscription_id', subscriptionId)
    .eq('priority', priority)
    .eq('active', true)
    .maybeSingle();
  if (error) throw new Error('Não foi possível carregar a lista atual.');
  return data || null;
}

function unwrap(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

function mapDetails(subscription: any, assignment: any, priority: number) {
  const playlist = unwrap(assignment?.playlist);
  const customer = unwrap(subscription?.customer);
  return {
    subscriptionId: subscription.id,
    priority,
    role: priority === 1 ? 'principal' : 'reserva',
    customerName: customer?.name || null,
    simultaneousConnections: Number(subscription.simultaneous_connections_snapshot || 1),
    current: playlist ? {
      id: playlist.id,
      name: playlist.name,
      type: playlist.playlist_type,
      maxConnections: Number(playlist.max_connections || 1),
      source: inspectSource(playlist.playlist_url),
      sourceUpdatedAt: playlist.playlist_updated_at || null,
      cacheStatus: playlist.playlist_cache_status || 'missing',
      cacheUpdatedAt: playlist.playlist_cache_updated_at || null,
      cacheItemCount: Number(playlist.playlist_cache_item_count || 0),
      cacheSizeBytes: Number(playlist.playlist_cache_size_bytes || 0),
      cacheError: playlist.playlist_cache_error ? redactSecrets(playlist.playlist_cache_error) : null,
    } : null,
  };
}

async function triggerPlaylistCache(supabaseUrl: string, playlistId: string) {
  const response = await fetch(`${supabaseUrl}/functions/v1/playlist-cache`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': getEnv('ADMIN_PANEL_TOKEN'),
    },
    body: JSON.stringify({ action: 'refresh', playlistId }),
  });
  const data = await response.json().catch(() => ({}));
  return {
    ok: response.ok && data?.ok === true,
    data,
    error: redactSecrets(data?.error || data?.message || (!response.ok ? `Falha HTTP ${response.status}.` : '')),
  };
}

async function archiveCandidate(supabase: any, playlistId: string, error: string) {
  const now = new Date().toISOString();
  await supabase
    .from('panel_playlists')
    .update({
      active: false,
      archived_at: now,
      playlist_cache_status: 'error',
      playlist_cache_error: redactSecrets(error),
    })
    .eq('id', playlistId);
  await supabase
    .from('panel_seller_playlists')
    .update({ active: false, updated_at: now })
    .eq('playlist_id', playlistId);
}

async function loadDetails(supabase: any, principal: PanelPrincipal, body: JsonBody) {
  const subscriptionId = requiredUuid(body.subscriptionId, 'Assinatura');
  const priority = integerInRange(body.priority, 'Posição da lista', 1, 2);
  const subscription = await assertSubscriptionAccess(supabase, principal, subscriptionId);
  const assignment = await currentAssignment(supabase, subscriptionId, priority);
  if (priority === 1 && !assignment) throw new Error('A assinatura não possui lista principal exclusiva para editar.');
  return mapDetails(subscription, assignment, priority);
}

async function replacePlaylist(supabase: any, principal: PanelPrincipal, body: JsonBody) {
  const subscriptionId = requiredUuid(body.subscriptionId, 'Assinatura');
  const priority = integerInRange(body.priority, 'Posição da lista', 1, 2);
  const subscription = await assertSubscriptionAccess(supabase, principal, subscriptionId);
  if (['cancelled', 'needs_review'].includes(subscription.status)) {
    throw new Error('A assinatura não permite editar listas neste estado.');
  }

  const name = requiredText(body.name, 'Nome da lista', 180);
  const playlistUrl = validatePlaylistUrl(body.playlistUrl);
  const playlistType = normalizePlaylistType(body.playlistType);
  const maxConnections = integerInRange(body.maxConnections, 'Conexões suportadas', 1, 50);
  const reason = requiredText(body.reason, 'Motivo da edição', 500);
  const idempotencyKey = requiredText(body.idempotencyKey, 'Chave da operação', 200);

  if (maxConnections < Number(subscription.simultaneous_connections_snapshot || 1)) {
    throw new Error('A nova lista não suporta as conexões simultâneas do plano.');
  }

  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const fingerprint = await hmacSha256Hex(serviceRoleKey, normalizedPlaylistSource(playlistUrl));
  const now = new Date().toISOString();

  const { data: candidate, error: candidateError } = await supabase
    .from('panel_playlists')
    .insert({
      name,
      playlist_url: playlistUrl,
      playlist_type: playlistType,
      active: true,
      max_connections: maxConnections,
      source_fingerprint: fingerprint,
      playlist_updated_at: now,
      playlist_cache_status: 'processing',
      playlist_cache_error: null,
    })
    .select('id')
    .single();

  if (candidateError || !candidate?.id) {
    throw new Error(candidateError?.code === '23505'
      ? 'Esta origem já está cadastrada e não pode ser duplicada.'
      : 'Não foi possível preparar a nova lista.');
  }

  const candidateId = String(candidate.id);
  try {
    const { error: permissionError } = await supabase
      .from('panel_seller_playlists')
      .upsert({
        seller_id: subscription.seller_id,
        playlist_id: candidateId,
        active: true,
        updated_at: now,
      }, { onConflict: 'seller_id,playlist_id' });
    if (permissionError) throw new Error('Não foi possível liberar a nova lista ao vendedor.');

    const cache = await triggerPlaylistCache(getEnv('SUPABASE_URL'), candidateId);
    if (!cache.ok) {
      const detail = cache.error || 'A origem não gerou um cache válido.';
      await archiveCandidate(supabase, candidateId, detail);
      throw new Error(`A nova lista não foi aplicada. A lista anterior continua funcionando. Motivo: ${detail}`);
    }

    const { data: switched, error: switchError } = await supabase.rpc(
      'replace_subscription_playlist_transaction',
      {
        p_subscription_id: subscriptionId,
        p_priority: priority,
        p_candidate_playlist_id: candidateId,
        p_reason: reason,
        p_performed_by: principal.email || principal.userId,
        p_performed_by_user_id: principal.userId,
        p_idempotency_key: idempotencyKey,
      },
    );

    if (switchError) {
      await archiveCandidate(supabase, candidateId, switchError.message || 'Falha ao concluir a troca.');
      throw new Error(safeDatabaseError(switchError, 'A nova lista foi validada, mas não pôde ser vinculada.'));
    }

    const result = Array.isArray(switched) ? switched[0] : switched;
    return {
      ...result,
      playlist: {
        id: candidateId,
        name,
        type: playlistType,
        maxConnections,
        source: inspectSource(playlistUrl),
        cacheStatus: 'ready',
        cacheItemCount: Number(cache.data?.itemCount || 0),
      },
      message: priority === 1
        ? 'Lista principal validada e atualizada em todos os aparelhos.'
        : 'Lista reserva validada e atualizada em todos os aparelhos.',
    };
  } catch (error) {
    const { data: activeAssignment } = await supabase
      .from('panel_subscription_playlists')
      .select('id')
      .eq('playlist_id', candidateId)
      .eq('active', true)
      .maybeSingle();
    if (!activeAssignment) {
      await archiveCandidate(
        supabase,
        candidateId,
        error instanceof Error ? error.message : 'Falha ao aplicar a nova lista.',
      );
    }
    throw error;
  }
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
      : null;

    if (!result) return json(request, { error: 'Ação não suportada.' }, 400);
    return json(request, { ok: true, data: result });
  } catch (error) {
    if (error instanceof PanelAuthError) return panelAuthErrorResponse(error, headers);
    const message = error instanceof Error ? redactSecrets(error.message) : 'Falha ao editar a lista.';
    console.error('subscription-playlist-edit falhou.', {
      name: error instanceof Error ? error.name : 'unknown',
    });
    return json(request, { error: message || 'Falha ao editar a lista.' }, 400);
  }
});
