import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { safeFetchPlaylistText } from '../_shared/outboundFetch.ts';
import { buildXtreamApiUrl, parseXtreamSource } from '../_shared/xtreamSource.ts';
import {
  assertWebOrigin,
  readWebJson,
  requireWebSession,
  text,
  webCorsHeaders,
  webJson,
} from '../_shared/webPlayerSecurity.ts';
import { enforceWebRateLimit } from '../_shared/webRateLimit.ts';
import {
  devicePlaylistAssignments,
  downloadCachePart,
  parseContentToken,
  projectChannels,
  projectEpisodes,
  projectMovies,
  projectSeries,
  resolveContentFromCache,
} from '../_shared/webPlayerCatalog.ts';

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('WEB_SERVER_NOT_CONFIGURED');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function sessionForCatalog(request: Request) {
  const supabase = serviceClient();
  const session = await requireWebSession(request, supabase);
  await enforceWebRateLimit(supabase, 'catalog', `session:${session.id}`);
  return { supabase, session };
}

async function catalog(request: Request) {
  const { supabase, session } = await sessionForCatalog(request);
  const assignments = await devicePlaylistAssignments(supabase, session);
  if (!assignments.length) throw new Error('WEB_CATALOG_NOT_READY');
  let lastError: unknown = null;
  for (const assignment of assignments) {
    const coolingDown = assignment.cooldownUntil ? new Date(assignment.cooldownUntil).getTime() > Date.now() : false;
    if (coolingDown && assignment.role === 'primary' && assignments.length > 1) continue;
    try {
      const [rawChannels, rawMovies, rawSeries] = await Promise.all([
        downloadCachePart(supabase, assignment.channelsPath, 'channels'),
        downloadCachePart(supabase, assignment.moviesPath, 'movies'),
        downloadCachePart(supabase, assignment.seriesPath, 'series'),
      ]);
      const [channels, movies, series] = await Promise.all([
        projectChannels(session, assignment.playlistId, rawChannels),
        projectMovies(session, assignment.playlistId, rawMovies),
        projectSeries(session, assignment.playlistId, rawSeries),
      ]);
      return webJson(request, {
        ok: true,
        catalogVersion: assignment.cacheVersion,
        sourceRole: assignment.role,
        usingBackup: assignment.role === 'backup',
        channels,
        movies,
        series,
      });
    } catch (error) { lastError = error; }
  }
  console.error('web-player-catalog cache unavailable', { code: lastError instanceof Error ? lastError.message : 'unknown' });
  throw new Error('WEB_CATALOG_NOT_READY');
}

async function seriesDetails(request: Request, body: Record<string, unknown>) {
  const { supabase, session } = await sessionForCatalog(request);
  const contentId = text(body.contentId, 4096);
  if (!contentId) throw new Error('WEB_CONTENT_ID_REQUIRED');
  const token = await parseContentToken(contentId, session);
  if (token.type !== 'series') throw new Error('WEB_CONTENT_TYPE_INVALID');
  const resolved = await resolveContentFromCache(supabase, session, token);
  const item = resolved.item;
  const seriesName = String(item.name || token.seriesName || 'Série').slice(0, 300);
  let seasons = await projectEpisodes(session, token.playlistId, token.sourceId, item.seasons, seriesName);
  if (!seasons.length) {
    const xtreamSeriesId = text(item.xtreamSeriesId || item.xtream_series_id, 64);
    if (xtreamSeriesId && /^\d{1,20}$/.test(xtreamSeriesId)) {
      try {
        const result = await supabase.storage.from('playlist-cache').download(`${token.playlistId}/series-details/${xtreamSeriesId}.json`);
        if (!result.error && result.data) {
          const cached = JSON.parse(await result.data.text());
          seasons = await projectEpisodes(session, token.playlistId, token.sourceId, cached?.seasons, seriesName);
        }
      } catch { /* detalhe ainda não materializado */ }
    }
  }
  return webJson(request, {
    ok: true,
    contentId,
    contentKey: token.contentKey,
    title: seriesName,
    seasons,
    detailsReady: seasons.length > 0,
    message: seasons.length ? null : 'Os episódios desta série ainda estão sendo preparados para o acesso Web.',
  });
}

function decoded(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    const bytes = Uint8Array.from(atob(raw), character => character.charCodeAt(0));
    return new TextDecoder().decode(bytes).trim() || raw;
  } catch { return raw; }
}
function instant(value: unknown, fallback: unknown) {
  const timestamp = Number(value);
  if (Number.isFinite(timestamp) && timestamp > 0) return new Date(timestamp * (timestamp < 10_000_000_000 ? 1000 : 1));
  const parsed = new Date(String(fallback ?? '').replace(' ', 'T'));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}
function projectPrograms(value: unknown) {
  const listings = Array.isArray((value as { epg_listings?: unknown })?.epg_listings)
    ? (value as { epg_listings: unknown[] }).epg_listings : Array.isArray(value) ? value : [];
  const now = Date.now();
  return listings.flatMap((raw: any) => {
    const start = instant(raw?.start_timestamp, raw?.start);
    const end = instant(raw?.stop_timestamp ?? raw?.end_timestamp, raw?.end ?? raw?.stop);
    const title = decoded(raw?.title).slice(0, 300);
    if (!start || !end || !title || end.getTime() <= now - 60_000) return [];
    return [{ title, description: decoded(raw?.description).slice(0, 900) || undefined, start: start.toISOString(), end: end.toISOString() }];
  }).sort((left, right) => left.start.localeCompare(right.start)).slice(0, 4);
}

async function channelEpg(request: Request, body: Record<string, unknown>) {
  const { supabase, session } = await sessionForCatalog(request);
  const contentId = text(body.contentId, 4096);
  if (!contentId) throw new Error('WEB_CONTENT_ID_REQUIRED');
  const token = await parseContentToken(contentId, session);
  if (token.type !== 'channel') throw new Error('WEB_CONTENT_TYPE_INVALID');
  const resolved = await resolveContentFromCache(supabase, session, token);
  const channel = resolved.item;
  const explicit = text(channel.streamId || channel.stream_id, 32);
  const fromId = String(channel.id || '').match(/(?:-ch-|channel[-_:]?)(\d{1,20})$/i)?.[1]
    || String(channel.id || '').match(/(\d{1,20})$/)?.[1];
  const streamId = explicit || fromId;
  if (!streamId || !/^\d{1,20}$/.test(streamId)) return webJson(request, { ok: true, available: false, programs: [] });
  const source = parseXtreamSource(resolved.assignment.playlistUrl);
  if (!source) return webJson(request, { ok: true, available: false, programs: [] });
  try {
    const target = buildXtreamApiUrl(source, 'get_short_epg', { stream_id: streamId, limit: '4' });
    const raw = await safeFetchPlaylistText(target, {
      label: 'Programação Web', timeoutMs: 15_000, maxBytes: 2 * 1024 * 1024, allowedOrigins: [source.origin],
      headers: { Accept: 'application/json, text/plain, */*', 'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20' },
    });
    const programs = projectPrograms(JSON.parse(raw));
    return webJson(request, { ok: true, available: programs.length > 0, programs });
  } catch (error) {
    console.error('web-player epg provider failed', { code: error instanceof Error ? error.message : 'unknown', playlistRole: resolved.assignment.role });
    return webJson(request, { ok: true, available: false, programs: [] });
  }
}

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: webCorsHeaders(request) });
  if (request.method !== 'POST') return webJson(request, { ok: false, code: 'WEB_METHOD_NOT_ALLOWED' }, 405);
  try {
    assertWebOrigin(request);
    const body = await readWebJson(request);
    const action = text(body.action, 32) || 'catalog';
    if (action === 'catalog') return await catalog(request);
    if (action === 'series') return await seriesDetails(request, body);
    if (action === 'epg') return await channelEpg(request, body);
    return webJson(request, { ok: false, code: 'WEB_ACTION_INVALID' }, 400);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'WEB_CATALOG_ERROR';
    if (code === 'WEB_RATE_LIMITED') return webJson(request, { ok: false, code }, 429);
    if (code.startsWith('WEB_SESSION_') || code.startsWith('WEB_DEVICE_')) return webJson(request, { ok: false, code, message: 'Sua sessão não está mais disponível.' }, 401);
    if (code === 'WEB_CONTENT_ID_INVALID' || code === 'WEB_CONTENT_NOT_AUTHORIZED') return webJson(request, { ok: false, code: 'WEB_CONTENT_NOT_FOUND' }, 404);
    if (code === 'WEB_ORIGIN_NOT_ALLOWED') return webJson(request, { ok: false, code }, 403);
    console.error('web-player-catalog error', { code });
    return webJson(request, { ok: false, code: code.startsWith('WEB_') ? code : 'WEB_CATALOG_UNAVAILABLE', message: 'Não foi possível carregar o catálogo Web agora.' }, 503);
  }
});
