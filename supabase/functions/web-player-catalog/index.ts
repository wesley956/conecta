import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  assertWebOrigin,
  readWebJson,
  requireWebSession,
  text,
  webCorsHeaders,
  webJson,
} from '../_shared/webPlayerSecurity.ts';
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

async function catalog(request: Request) {
  const supabase = serviceClient();
  const session = await requireWebSession(request, supabase);
  const assignments = await devicePlaylistAssignments(supabase, session);
  if (!assignments.length) throw new Error('WEB_CATALOG_NOT_READY');

  let lastError: unknown = null;
  for (const assignment of assignments) {
    const coolingDown = assignment.cooldownUntil
      ? new Date(assignment.cooldownUntil).getTime() > Date.now()
      : false;
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
    } catch (error) {
      lastError = error;
    }
  }
  console.error('web-player-catalog cache unavailable', {
    code: lastError instanceof Error ? lastError.message : 'unknown',
  });
  throw new Error('WEB_CATALOG_NOT_READY');
}

async function seriesDetails(request: Request, body: Record<string, unknown>) {
  const supabase = serviceClient();
  const session = await requireWebSession(request, supabase);
  const contentId = text(body.contentId, 4096);
  if (!contentId) throw new Error('WEB_CONTENT_ID_REQUIRED');
  const token = await parseContentToken(contentId, session);
  if (token.type !== 'series') throw new Error('WEB_CONTENT_TYPE_INVALID');
  const resolved = await resolveContentFromCache(supabase, session, token);
  const item = resolved.item;
  let seasons = await projectEpisodes(session, token.playlistId, token.sourceId, item.seasons);

  if (!seasons.length) {
    const xtreamSeriesId = text(item.xtreamSeriesId || item.xtream_series_id, 64);
    if (xtreamSeriesId && /^\d{1,20}$/.test(xtreamSeriesId)) {
      try {
        const result = await supabase.storage.from('playlist-cache')
          .download(`${token.playlistId}/series-details/${xtreamSeriesId}.json`);
        if (!result.error && result.data) {
          const cached = JSON.parse(await result.data.text());
          seasons = await projectEpisodes(session, token.playlistId, token.sourceId, cached?.seasons);
        }
      } catch {
        // O detalhe pode ainda não ter sido materializado pelo backend.
      }
    }
  }

  return webJson(request, {
    ok: true,
    contentId,
    title: String(item.name || 'Série').slice(0, 300),
    seasons,
    detailsReady: seasons.length > 0,
    message: seasons.length
      ? null
      : 'Os episódios desta série ainda estão sendo preparados para o acesso Web.',
  });
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
    return webJson(request, { ok: false, code: 'WEB_ACTION_INVALID' }, 400);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'WEB_CATALOG_ERROR';
    if (code.startsWith('WEB_SESSION_') || code.startsWith('WEB_DEVICE_')) {
      return webJson(request, { ok: false, code, message: 'Sua sessão não está mais disponível.' }, 401);
    }
    if (code === 'WEB_CONTENT_ID_INVALID' || code === 'WEB_CONTENT_NOT_AUTHORIZED') {
      return webJson(request, { ok: false, code: 'WEB_CONTENT_NOT_FOUND' }, 404);
    }
    if (code === 'WEB_ORIGIN_NOT_ALLOWED') return webJson(request, { ok: false, code }, 403);
    console.error('web-player-catalog error', { code });
    return webJson(request, {
      ok: false,
      code: code.startsWith('WEB_') ? code : 'WEB_CATALOG_UNAVAILABLE',
      message: 'Não foi possível carregar o catálogo Web agora.',
    }, 503);
  }
});
