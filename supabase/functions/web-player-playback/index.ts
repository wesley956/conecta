import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  assertWebOrigin,
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
  type WebContentToken,
} from '../_shared/webPlayerCatalog.ts';

const PLAYBACK_TOKEN_TTL_MS = 10 * 60 * 1000;

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

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: webCorsHeaders(request) });
  if (request.method !== 'POST') return webJson(request, { ok: false, code: 'WEB_METHOD_NOT_ALLOWED' }, 405);
  try {
    assertWebOrigin(request);
    const body = await readWebJson(request);
    const contentId = text(body.contentId, 4096);
    if (!contentId) return webJson(request, { ok: false, code: 'WEB_CONTENT_ID_REQUIRED' }, 400);

    const supabase = serviceClient();
    const session = await requireWebSession(request, supabase);
    const token = await parseContentToken(contentId, session);
    if (token.type === 'series') {
      return webJson(request, { ok: false, code: 'WEB_SERIES_NOT_DIRECTLY_PLAYABLE' }, 400);
    }

    let resolved: { assignment: { playlistId: string; role: 'primary' | 'backup' }; item: Record<string, unknown> };
    if (token.type === 'episode') {
      try {
        resolved = await resolveContentFromCache(supabase, session, token) as typeof resolved;
      } catch {
        resolved = await resolveEpisodeFromSeriesCache(supabase, session, token) as typeof resolved;
      }
    } else {
      resolved = await resolveContentFromCache(supabase, session, token) as typeof resolved;
    }

    const urls = candidateUrls(resolved.item);
    if (!urls.length) return webJson(request, {
      ok: false,
      code: 'WEB_CONTENT_UNAVAILABLE',
      message: 'Este conteúdo não possui uma origem Web utilizável.',
    }, 404);

    const primary = urls[0];
    const kind = mediaKind(primary);
    if (directSafe(primary)) {
      return webJson(request, {
        ok: true,
        mode: 'direct-safe',
        playbackUrl: primary,
        mediaKind: kind,
        contentType: token.type,
        playlistRole: resolved.assignment.role,
        alternativesAvailable: Math.max(0, urls.length - 1),
        expiresAt: new Date(Date.now() + PLAYBACK_TOKEN_TTL_MS).toISOString(),
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

    const expiresAtMs = Date.now() + PLAYBACK_TOKEN_TTL_MS;
    const mediaToken = await sealWebPayload({
      v: 1,
      kind: 'media',
      sessionId: session.id,
      deviceId: session.deviceId,
      contentType: token.type,
      playlistId: resolved.assignment.playlistId,
      playlistRole: resolved.assignment.role,
      url: primary,
      exp: expiresAtMs,
    });
    const functionsUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1`;
    return webJson(request, {
      ok: true,
      mode: 'gateway',
      playbackUrl: `${functionsUrl}/web-player-media?token=${encodeURIComponent(mediaToken)}`,
      mediaKind: kind,
      contentType: token.type,
      playlistRole: resolved.assignment.role,
      alternativesAvailable: Math.max(0, urls.length - 1),
      expiresAt: new Date(expiresAtMs).toISOString(),
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'WEB_PLAYBACK_ERROR';
    if (code.startsWith('WEB_SESSION_') || code.startsWith('WEB_DEVICE_')) {
      return webJson(request, { ok: false, code, message: 'Sua sessão não está mais disponível.' }, 401);
    }
    if (/WEB_CONTENT|WEB_EPISODE/.test(code)) {
      return webJson(request, { ok: false, code: 'WEB_CONTENT_NOT_FOUND' }, 404);
    }
    if (code === 'WEB_ORIGIN_NOT_ALLOWED') return webJson(request, { ok: false, code }, 403);
    console.error('web-player-playback error', { code });
    return webJson(request, { ok: false, code: 'WEB_PLAYBACK_UNAVAILABLE' }, 503);
  }
});
