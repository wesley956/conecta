import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  assertWebOrigin,
  openWebPayload,
  readWebJson,
  requireWebSession,
  sealWebPayload,
  text,
  webCorsHeaders,
  webJson,
} from '../_shared/webPlayerSecurity.ts';
import {
  devicePlaylistAssignments,
  downloadCachePart,
  parseContentToken,
  resolveContentFromCache,
  resolveLogicalContent,
  type PlaylistAssignment,
  type WebContentToken,
  type WebContentType,
} from '../_shared/webPlayerCatalog.ts';
import { classifyRecoveryError, sanitizedRecoveryCode } from '../_shared/webPlayerRecovery.ts';

const PLAYBACK_TOKEN_TTL_MS = 10 * 60 * 1000;
const RECOVERY_TOKEN_TTL_MS = 60 * 60 * 1000;

type RecoveryToken = {
  v: number;
  kind: 'recovery';
  sessionId: string;
  deviceId: string;
  type: WebContentType;
  contentKey: string;
  playlistId: string;
  playlistPriority: number;
  sourceId: string;
  seriesSourceId?: string;
  seriesName?: string;
  urlIndex: number;
  sameOriginAttempts: number;
  exp: number;
};

type Resolved = {
  assignment: PlaylistAssignment;
  item: Record<string, unknown>;
};

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('WEB_SERVER_NOT_CONFIGURED');
  return createClient(url, key, { auth: { persistSession: false } });
}

function candidateUrls(item: Record<string, unknown>) {
  const candidates = [
    ...(Array.isArray(item.playbackUrls) ? item.playbackUrls : []),
    item.url,
  ];
  const seen = new Set<string>();
  return candidates.flatMap(value => {
    const raw = String(value || '').trim();
    if (!raw || seen.has(raw)) return [];
    try {
      const url = new URL(raw);
      if (!['http:', 'https:'].includes(url.protocol)) return [];
      if (url.username || url.password) return [];
      seen.add(raw);
      return [url.toString()];
    } catch {
      return [];
    }
  }).slice(0, 8);
}

function mediaKind(urlString: string): 'hls' | 'file' | 'unknown' {
  try {
    const url = new URL(urlString);
    const pathname = url.pathname.toLowerCase();
    if (pathname.endsWith('.m3u8')) return 'hls';
    if (/\.(mp4|m4v|webm|mov|mkv|ts)$/i.test(pathname)) return 'file';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

function directSafe(urlString: string) {
  if (!/^(1|true|yes)$/i.test(String(Deno.env.get('WEB_ALLOW_DIRECT_SAFE') || ''))) return false;
  try {
    const url = new URL(urlString);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    if ([...url.searchParams.keys()].some(key => /user|pass|token|auth|key|credential/i.test(key))) return false;
    if (/\/(live|movie|series)\/[^/]+\/[^/]+\//i.test(url.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

async function resolveEpisodeFromSeriesCache(
  supabase: ReturnType<typeof serviceClient>,
  session: Awaited<ReturnType<typeof requireWebSession>>,
  token: WebContentToken,
) {
  const assignments = await devicePlaylistAssignments(supabase, session);
  const assignment = assignments.find(item => item.playlistId === token.playlistId);
  if (!assignment || !token.seriesSourceId) throw new Error('WEB_EPISODE_NOT_FOUND');
  const seriesItems = await downloadCachePart(supabase, assignment.seriesPath, 'series');
  const series = seriesItems.find(item => String(item.id || '') === token.seriesSourceId);
  if (!series) throw new Error('WEB_EPISODE_NOT_FOUND');

  if (Array.isArray(series.seasons)) {
    for (const seasonValue of series.seasons) {
      if (!seasonValue || typeof seasonValue !== 'object' || !Array.isArray((seasonValue as any).episodes)) continue;
      const episode = (seasonValue as any).episodes.find((item: any) => String(item?.id || '') === token.sourceId);
      if (episode) return { assignment, item: episode as Record<string, unknown> };
    }
  }

  const xtreamSeriesId = String(series.xtreamSeriesId || series.xtream_series_id || '').trim();
  if (/^\d{1,20}$/.test(xtreamSeriesId)) {
    const detail = await supabase.storage.from('playlist-cache')
      .download(`${token.playlistId}/series-details/${xtreamSeriesId}.json`);
    if (!detail.error && detail.data) {
      const cached = JSON.parse(await detail.data.text());
      if (Array.isArray(cached?.seasons)) {
        for (const season of cached.seasons) {
          if (!Array.isArray(season?.episodes)) continue;
          const episode = season.episodes.find((item: any) => String(item?.id || '') === token.sourceId);
          if (episode) return { assignment, item: episode as Record<string, unknown> };
        }
      }
    }
  }
  throw new Error('WEB_EPISODE_NOT_FOUND');
}

async function resolveInitial(
  supabase: ReturnType<typeof serviceClient>,
  session: Awaited<ReturnType<typeof requireWebSession>>,
  token: WebContentToken,
): Promise<Resolved> {
  if (token.type === 'episode') {
    try {
      return await resolveContentFromCache(supabase, session, token) as Resolved;
    } catch {
      return await resolveEpisodeFromSeriesCache(supabase, session, token) as Resolved;
    }
  }
  return await resolveContentFromCache(supabase, session, token) as Resolved;
}

async function recoveryToken(
  session: Awaited<ReturnType<typeof requireWebSession>>,
  token: Pick<WebContentToken, 'type'|'contentKey'|'sourceId'|'seriesSourceId'|'seriesName'>,
  assignment: PlaylistAssignment,
  urlIndex: number,
  sameOriginAttempts: number,
) {
  return await sealWebPayload({
    v: 1,
    kind: 'recovery',
    sessionId: session.id,
    deviceId: session.deviceId,
    type: token.type,
    contentKey: token.contentKey,
    playlistId: assignment.playlistId,
    playlistPriority: assignment.priority,
    sourceId: token.sourceId,
    ...(token.seriesSourceId ? { seriesSourceId: token.seriesSourceId } : {}),
    ...(token.seriesName ? { seriesName: token.seriesName } : {}),
    urlIndex,
    sameOriginAttempts,
    exp: Date.now() + RECOVERY_TOKEN_TTL_MS,
  });
}

async function authorize(
  request: Request,
  session: Awaited<ReturnType<typeof requireWebSession>>,
  token: Pick<WebContentToken, 'type'|'contentKey'|'sourceId'|'seriesSourceId'|'seriesName'>,
  resolved: Resolved,
  urlIndex: number,
  sameOriginAttempts: number,
  recovery?: { classification: string; backoffMs: number; failover: boolean },
) {
  const urls = candidateUrls(resolved.item);
  const selected = urls[urlIndex];
  if (!selected) throw new Error('WEB_CONTENT_UNAVAILABLE');
  const kind = mediaKind(selected);
  const nextRecoveryToken = await recoveryToken(session, token, resolved.assignment, urlIndex, sameOriginAttempts);
  const expiresAtMs = Date.now() + PLAYBACK_TOKEN_TTL_MS;

  if (directSafe(selected)) {
    return webJson(request, {
      ok: true,
      mode: 'direct-safe',
      playbackUrl: selected,
      mediaKind: kind,
      contentType: token.type,
      contentKey: token.contentKey,
      playlistRole: resolved.assignment.role,
      alternativesAvailable: Math.max(0, urls.length - urlIndex - 1),
      recoveryToken: nextRecoveryToken,
      expiresAt: new Date(expiresAtMs).toISOString(),
      ...(recovery ? { recovery } : {}),
    });
  }

  const gatewayEnabled = /^(1|true|yes)$/i.test(String(Deno.env.get('WEB_MEDIA_GATEWAY_ENABLED') || ''));
  if (!gatewayEnabled) {
    return webJson(request, {
      ok: false,
      code: 'WEB_MEDIA_GATEWAY_REQUIRED',
      message: 'Esta mídia precisa do gateway Web, ainda não habilitado neste ambiente.',
    }, 409);
  }

  const mediaToken = await sealWebPayload({
    v: 1,
    kind: 'media',
    sessionId: session.id,
    deviceId: session.deviceId,
    contentType: token.type,
    contentKey: token.contentKey,
    playlistId: resolved.assignment.playlistId,
    playlistRole: resolved.assignment.role,
    url: selected,
    exp: expiresAtMs,
  });
  const functionsUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1`;
  return webJson(request, {
    ok: true,
    mode: 'gateway',
    playbackUrl: `${functionsUrl}/web-player-media?token=${encodeURIComponent(mediaToken)}`,
    mediaKind: kind,
    contentType: token.type,
    contentKey: token.contentKey,
    playlistRole: resolved.assignment.role,
    alternativesAvailable: Math.max(0, urls.length - urlIndex - 1),
    recoveryToken: nextRecoveryToken,
    expiresAt: new Date(expiresAtMs).toISOString(),
    ...(recovery ? { recovery } : {}),
  });
}

async function recover(request: Request, body: Record<string, unknown>) {
  const supabase = serviceClient();
  const session = await requireWebSession(request, supabase);
  const opaque = text(body.recoveryToken, 4096);
  const errorCode = sanitizedRecoveryCode(body.errorCode);
  if (!opaque) return webJson(request, { ok: false, code: 'WEB_RECOVERY_TOKEN_REQUIRED' }, 400);
  const state = await openWebPayload<RecoveryToken & Record<string, unknown>>(opaque);
  if (
    state.v !== 1 || state.kind !== 'recovery' ||
    state.sessionId !== session.id || state.deviceId !== session.deviceId ||
    typeof state.contentKey !== 'string' || typeof state.playlistId !== 'string' ||
    !['channel','movie','episode'].includes(String(state.type)) ||
    Number(state.exp || 0) <= Date.now()
  ) return webJson(request, { ok: false, code: 'WEB_RECOVERY_TOKEN_INVALID' }, 401);

  const attempt = Math.max(0, Math.min(3, Number(state.sameOriginAttempts || 0)));
  const decision = classifyRecoveryError(errorCode, attempt);
  if (decision.classification === 'cancelled') {
    return webJson(request, { ok: false, code: 'WEB_RECOVERY_CANCELLED', terminal: true }, 409);
  }
  if (decision.classification === 'session') {
    return webJson(request, { ok: false, code: 'WEB_SESSION_INVALID', terminal: true }, 401);
  }
  if (decision.classification === 'offline') {
    return webJson(request, { ok: false, code: 'WEB_OFFLINE', waitForOnline: true }, 409);
  }

  const contentToken: WebContentToken = {
    v: 1,
    deviceId: session.deviceId,
    playlistId: state.playlistId,
    type: state.type,
    sourceId: state.sourceId,
    contentKey: state.contentKey,
    seriesSourceId: state.seriesSourceId,
    seriesName: state.seriesName,
    exp: Date.now() + 60_000,
  };

  let current: Resolved | null = null;
  try { current = await resolveInitial(supabase, session, contentToken); } catch { current = null; }

  if (decision.retrySameOrigin && current) {
    return await authorize(request, session, state, current, state.urlIndex, attempt + 1, {
      classification: decision.classification,
      backoffMs: decision.backoffMs,
      failover: false,
    });
  }

  if (current && decision.advanceOrigin) {
    const urls = candidateUrls(current.item);
    const nextIndex = state.urlIndex + 1;
    if (nextIndex < urls.length) {
      return await authorize(request, session, state, current, nextIndex, 0, {
        classification: decision.classification,
        backoffMs: 0,
        failover: false,
      });
    }
  }

  if (decision.advanceOrigin) {
    try {
      const next = await resolveLogicalContent(supabase, session, state.type, state.contentKey, {
        afterPriority: state.playlistPriority,
      }) as Resolved;
      return await authorize(request, session, state, next, 0, 0, {
        classification: decision.classification,
        backoffMs: 0,
        failover: next.assignment.role === 'backup',
      });
    } catch {
      // sem conteúdo lógico equivalente nas listas seguintes
    }
  }

  return webJson(request, {
    ok: false,
    code: 'WEB_RECOVERY_EXHAUSTED',
    terminal: true,
    classification: decision.classification,
    message: 'As alternativas autorizadas para este conteúdo foram esgotadas.',
  }, 404);
}

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: webCorsHeaders(request) });
  if (request.method !== 'POST') return webJson(request, { ok: false, code: 'WEB_METHOD_NOT_ALLOWED' }, 405);
  try {
    assertWebOrigin(request);
    const body = await readWebJson(request);
    const action = text(body.action, 32) || 'authorize';
    if (action === 'recover') return await recover(request, body);

    const contentId = text(body.contentId, 4096);
    if (!contentId) return webJson(request, { ok: false, code: 'WEB_CONTENT_ID_REQUIRED' }, 400);
    const supabase = serviceClient();
    const session = await requireWebSession(request, supabase);
    const token = await parseContentToken(contentId, session);
    if (token.type === 'series') {
      return webJson(request, { ok: false, code: 'WEB_SERIES_NOT_DIRECTLY_PLAYABLE' }, 400);
    }
    const resolved = await resolveInitial(supabase, session, token);
    return await authorize(request, session, token, resolved, 0, 0);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'WEB_PLAYBACK_ERROR';
    if (code.startsWith('WEB_SESSION_') || code.startsWith('WEB_DEVICE_')) {
      return webJson(request, { ok: false, code, message: 'Sua sessão não está mais disponível.' }, 401);
    }
    if (/WEB_CONTENT|WEB_EPISODE|WEB_LOGICAL/.test(code)) {
      return webJson(request, { ok: false, code: 'WEB_CONTENT_NOT_FOUND' }, 404);
    }
    if (code === 'WEB_ORIGIN_NOT_ALLOWED') return webJson(request, { ok: false, code }, 403);
    console.error('web-player-playback error', { code });
    return webJson(request, { ok: false, code: 'WEB_PLAYBACK_UNAVAILABLE' }, 503);
  }
});
