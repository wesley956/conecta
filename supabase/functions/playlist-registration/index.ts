import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  PanelAuthError,
  panelAuthErrorResponse,
  requirePanelPrincipal,
} from '../_shared/panelAuth.ts';
import {
  PLAYLIST_QUALIFICATION_FIELDS,
  playlistQualificationPayload,
} from '../_shared/playlistQualification.ts';
import {
  inferPlaylistType,
  inspectPlaylistSource,
  playlistSourceFingerprint,
  redactPlaylistSecrets,
  requiredText,
  validatePlaylistUrl,
} from '../_shared/playlistSource.ts';

const DEFAULT_ALLOWED_ORIGINS = [
  'https://wesley956.github.io',
  'https://conecta-five-iota.vercel.app',
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
    return {};
  }
}

function requiredUuid(value: unknown, label: string) {
  const id = String(value ?? '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error(`${label} inválido.`);
  }
  return id;
}

function optionalUuid(value: unknown, label: string) {
  const id = String(value ?? '').trim();
  return id ? requiredUuid(id, label) : null;
}

function safeRequestId(value: unknown) {
  const id = String(value ?? '').trim();
  if (!id) return null;
  if (id.length > 180 || !/^[a-zA-Z0-9:._-]+$/.test(id)) return null;
  return id;
}

function positiveInteger(value: unknown, fallback = 1, maximum = 50) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`Conexões suportadas devem estar entre 1 e ${maximum}.`);
  }
  return parsed;
}

function schedule(promise: Promise<unknown>) {
  const tracked = promise.catch(error => {
    console.error('Falha na validação assíncrona da lista.', {
      message: redactPlaylistSecrets(error instanceof Error ? error.message : error, 300),
    });
  });
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(tracked);
  }
}

async function triggerCache(playlistId: string) {
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
  return response.json().catch(() => ({}));
}

const PLAYLIST_SELECT = `
  id,
  name,
  playlist_type,
  active,
  max_connections,
  playlist_updated_at,
  playlist_access_mode,
  playlist_cache_status,
  playlist_cache_updated_at,
  playlist_cache_item_count,
  playlist_cache_size_bytes,
  playlist_cache_error_code,
  ${PLAYLIST_QUALIFICATION_FIELDS}
`;

function mapPlaylist(row: Record<string, unknown>, reused = false) {
  return {
    id: row.id,
    name: row.name,
    type: row.playlist_type,
    active: row.active === true,
    maxConnections: Number(row.max_connections || 1),
    sourceUpdatedAt: row.playlist_updated_at || null,
    accessMode: row.playlist_access_mode || 'server_cache',
    cacheStatus: row.playlist_cache_status || 'missing',
    cacheUpdatedAt: row.playlist_cache_updated_at || null,
    cacheItemCount: Number(row.playlist_cache_item_count || 0),
    cacheSizeBytes: Number(row.playlist_cache_size_bytes || 0),
    cacheErrorCode: row.playlist_cache_error_code || null,
    reused,
    ...playlistQualificationPayload(row),
  };
}

function nextActionFor(playlist: ReturnType<typeof mapPlaylist>) {
  if (playlist.commerciallyUsable) return 'activate';
  if (playlist.qualificationStatus === 'awaiting_device_test') return 'test_on_android';
  if (playlist.qualificationStatus === 'retryable_error') return 'retry_cache';
  if (playlist.qualificationStatus === 'blocked') return 'edit_source';
  return 'wait';
}

async function loadAuthorizedPlaylist(
  supabase: any,
  principal: any,
  playlistId: string,
) {
  if (principal.role === 'seller') {
    if (!principal.sellerId) throw new PanelAuthError('Conta de vendedor sem vínculo comercial.', 403);
    const { data: permission, error: permissionError } = await supabase
      .from('panel_seller_playlists')
      .select('playlist_id')
      .eq('seller_id', principal.sellerId)
      .eq('playlist_id', playlistId)
      .eq('active', true)
      .maybeSingle();
    if (permissionError || !permission) throw new PanelAuthError('Lista não pertence ao vendedor.', 403);
  }

  const { data, error } = await supabase
    .from('panel_playlists')
    .select(PLAYLIST_SELECT)
    .eq('id', playlistId)
    .maybeSingle();
  if (error || !data) throw new Error('Lista não encontrada.');
  return data as Record<string, unknown>;
}

async function listAuthorizedPlaylists(supabase: any, principal: any) {
  if (principal.role === 'seller') {
    if (!principal.sellerId) throw new PanelAuthError('Conta de vendedor sem vínculo comercial.', 403);
    const { data, error } = await supabase
      .from('panel_seller_playlists')
      .select(`playlist:panel_playlists(${PLAYLIST_SELECT})`)
      .eq('seller_id', principal.sellerId)
      .eq('active', true)
      .order('updated_at', { ascending: false });
    if (error) throw new Error('Não foi possível carregar as listas do vendedor.');
    return (data || []).map((item: any) => {
      const row = Array.isArray(item.playlist) ? item.playlist[0] : item.playlist;
      return row ? mapPlaylist(row) : null;
    }).filter(Boolean);
  }

  const { data, error } = await supabase
    .from('panel_playlists')
    .select(PLAYLIST_SELECT)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error('Não foi possível carregar as listas.');
  return (data || []).map((row: any) => mapPlaylist(row));
}

async function registerSource(
  supabase: any,
  principal: any,
  input: {
    name: string;
    playlistUrl: string;
    playlistType: string;
    maxConnections: number;
    fingerprint: string;
    sellerId: string | null;
  },
) {
  if (principal.role === 'seller' && !principal.sellerId) {
    throw new PanelAuthError('Conta de vendedor sem vínculo comercial.', 403);
  }

  const targetSellerId = principal.role === 'seller'
    ? principal.sellerId
    : input.sellerId;

  const { data, error } = await supabase.rpc('register_playlist_source_transaction', {
    p_name: input.name,
    p_playlist_url: input.playlistUrl,
    p_playlist_type: input.playlistType,
    p_max_connections: input.maxConnections,
    p_source_fingerprint: input.fingerprint,
    p_seller_id: targetSellerId,
  });
  if (error) {
    throw new Error(error.message || 'Não foi possível salvar ou reutilizar a lista.');
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.playlist_id) throw new Error('O cadastro não retornou a lista salva.');
  return {
    playlistId: String(row.playlist_id),
    created: row.created === true,
    sellerId: targetSellerId,
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
    const action = String(body.action || 'list').trim();

    if (action === 'list') {
      return json(request, { ok: true, playlists: await listAuthorizedPlaylists(supabase, principal) });
    }

    if (action === 'status') {
      const playlistId = requiredUuid(body.playlistId, 'Lista');
      const row = await loadAuthorizedPlaylist(supabase, principal, playlistId);
      const playlist = mapPlaylist(row);
      return json(request, {
        ok: true,
        saved: true,
        playlistId,
        playlist,
        qualificationStatus: playlist.qualificationStatus,
        commerciallyUsable: playlist.commerciallyUsable,
        nextAction: nextActionFor(playlist),
      });
    }

    if (action === 'retry') {
      const playlistId = requiredUuid(body.playlistId, 'Lista');
      const row = await loadAuthorizedPlaylist(supabase, principal, playlistId);
      const qualification = playlistQualificationPayload(row);
      if (!qualification.canRetryCache && !qualification.requiresDeviceTest) {
        const playlist = mapPlaylist(row);
        return json(request, {
          ok: true,
          saved: true,
          playlistId,
          playlist,
          qualificationStatus: playlist.qualificationStatus,
          commerciallyUsable: playlist.commerciallyUsable,
          nextAction: nextActionFor(playlist),
          message: qualification.commerciallyUsable
            ? 'A lista já está homologada.'
            : qualification.qualificationMessage,
        });
      }

      const { error: updateError } = await supabase
        .from('panel_playlists')
        .update({
          playlist_qualification_status: 'validating',
          playlist_qualification_code: 'MANUAL_RETRY',
          playlist_qualification_message: 'Nova validação iniciada.',
          playlist_qualification_updated_at: new Date().toISOString(),
        })
        .eq('id', playlistId);
      if (updateError) throw new Error('Não foi possível reiniciar a validação da lista.');

      schedule(triggerCache(playlistId));
      const playlist = mapPlaylist(await loadAuthorizedPlaylist(supabase, principal, playlistId));
      return json(request, {
        ok: true,
        saved: true,
        playlistId,
        playlist,
        qualificationStatus: playlist.qualificationStatus,
        commerciallyUsable: playlist.commerciallyUsable,
        nextAction: nextActionFor(playlist),
        message: 'Nova validação iniciada. Não cadastre a lista novamente.',
      }, 202);
    }

    if (action === 'create') {
      const name = requiredText(body.name, 'Nome da lista', 180);
      const playlistUrl = validatePlaylistUrl(body.playlistUrl);
      const playlistType = inferPlaylistType(playlistUrl, body.playlistType);
      const maxConnections = positiveInteger(body.maxConnections, 1, 50);
      const requestId = safeRequestId(body.requestId);
      const sellerId = principal.role === 'seller'
        ? principal.sellerId
        : optionalUuid(body.sellerId, 'Vendedor');
      const fingerprint = await playlistSourceFingerprint(
        getEnv('SUPABASE_SERVICE_ROLE_KEY'),
        playlistUrl,
      );

      const registration = await registerSource(supabase, principal, {
        name,
        playlistUrl,
        playlistType,
        maxConnections,
        fingerprint,
        sellerId,
      });
      const row = await loadAuthorizedPlaylist(supabase, principal, registration.playlistId);
      const playlist = mapPlaylist(row, !registration.created);

      if (registration.created || playlist.canRetryCache) {
        schedule(triggerCache(registration.playlistId));
      }

      const message = registration.created
        ? 'Lista salva. A validação continuará sem prender esta tela. Não cadastre novamente.'
        : playlist.commerciallyUsable
        ? 'Esta origem já estava cadastrada e homologada. Ela foi reutilizada.'
        : 'Esta origem já estava cadastrada. Acompanhe a validação existente e não cadastre novamente.';

      return json(request, {
        ok: true,
        saved: true,
        created: registration.created,
        reused: !registration.created,
        playlistId: registration.playlistId,
        playlist,
        qualificationStatus: playlist.qualificationStatus,
        commerciallyUsable: playlist.commerciallyUsable,
        nextAction: nextActionFor(playlist),
        requestId,
        source: inspectPlaylistSource(playlistUrl),
        message,
      }, registration.created || !playlist.commerciallyUsable ? 202 : 200);
    }

    return json(request, { error: 'Ação não suportada.' }, 400);
  } catch (error) {
    if (error instanceof PanelAuthError) {
      return panelAuthErrorResponse(error, corsHeaders(request));
    }
    const message = redactPlaylistSecrets(
      error instanceof Error ? error.message : 'Falha no cadastro da lista.',
      500,
    );
    return json(request, { error: message || 'Falha no cadastro da lista.' }, 400);
  }
});
