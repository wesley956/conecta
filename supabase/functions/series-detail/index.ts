import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { safeFetchPlaylistText } from '../_shared/outboundFetch.ts';
import {
  buildXtreamApiUrl,
  buildXtreamStreamUrl,
  parseXtreamSource,
  type XtreamSource,
} from '../_shared/xtreamSource.ts';

const CACHE_BUCKET = 'playlist-cache';
const REQUEST_BUDGET_MS = 35_000;
const PROVIDER_ATTEMPT_TIMEOUT_MS = 12_000;
const MIN_PROVIDER_ATTEMPT_MS = 750;
const PROVIDER_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
};
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-credential',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type EpisodeResult = {
  id: string;
  number: number;
  name: string;
  duration: string;
  url: string;
  playbackUrls: string[];
};

type SeasonResult = { number: number; episodes: EpisodeResult[] };
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': status >= 400 ? 'no-store' : 'private, max-age=300',
    },
  });
}

function text(value: unknown) {
  return String(value ?? '').trim() || null;
}

async function payload(req: Request): Promise<Record<string, unknown>> {
  try {
    const value = await req.json();
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function credential(req: Request, body: Record<string, unknown>) {
  const header = text(req.headers.get('x-device-credential'));
  if (header) return header;
  const auth = text(req.headers.get('authorization'));
  const match = auth?.match(/^Device\s+(.+)$/i);
  return match?.[1]?.trim() || text(body.deviceCredential) || text(body.device_credential);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

function apiUrl(source: XtreamSource, action: string, params: Record<string, string>) {
  return buildXtreamApiUrl(source, action, params);
}

function streamUrl(source: XtreamSource, id: string, extension: unknown) {
  const ext = String(extension || 'mp4').replace('.', '').replace(/[^a-z0-9]/gi, '') || 'mp4';
  return buildXtreamStreamUrl(source, 'series', id, ext);
}

async function providerText(
  rawUrl: string,
  allowedOrigin: string,
  deadlineMs: number,
): Promise<string> {
  const target = new URL(rawUrl);
  const allowed = new URL(allowedOrigin);
  if (target.origin !== allowed.origin) {
    throw new Error('UPSTREAM_HOST_MISMATCH');
  }
  const remainingMs = deadlineMs - Date.now();
  if (remainingMs < MIN_PROVIDER_ATTEMPT_MS) {
    throw new Error('UPSTREAM_BUDGET_EXHAUSTED');
  }
  try {
    return await safeFetchPlaylistText(target.toString(), {
      label: 'Detalhes da série',
      timeoutMs: Math.min(PROVIDER_ATTEMPT_TIMEOUT_MS, remainingMs),
      maxBytes: 40 * 1024 * 1024,
      allowedOrigins: [allowed.origin],
      headers: PROVIDER_HEADERS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/tempo limite/i.test(message)) throw new Error('UPSTREAM_TIMEOUT');
    const httpStatus = message.match(/HTTP\s+(\d{3})/i)?.[1];
    if (httpStatus) throw new Error(`UPSTREAM_HTTP_${httpStatus}`);
    throw error;
  }
}

function number(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function episodeRecord(value: any) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && (
    value.id != null || value.episode_id != null || value.stream_id != null || value.info?.id != null
  ));
}

function collect(value: unknown, depth = 0): any[] {
  if (value == null || depth > 8) return [];
  if (Array.isArray(value)) return value.flatMap(item => collect(item, depth + 1));
  if (typeof value !== 'object') return [];
  if (episodeRecord(value)) return [value];
  return Object.values(value as Record<string, unknown>).flatMap(item => collect(item, depth + 1));
}

function groups(info: any): Array<[string, any[]]> {
  const raw = info?.episodes ?? info?.series_data?.episodes ?? info?.data?.episodes ?? {};
  if (Array.isArray(raw)) {
    const grouped = new Map<string, any[]>();
    for (const item of raw) {
      const season = String(item?.season ?? item?.season_number ?? item?.info?.season ?? 1);
      const entries = grouped.get(season) ?? [];
      entries.push(item);
      grouped.set(season, entries);
    }
    return [...grouped.entries()];
  }
  if (!raw || typeof raw !== 'object') return [];
  return Object.entries(raw).flatMap(([season, value]) => {
    const entries = collect(value);
    return entries.length ? [[season, entries] as [string, any[]]] : [];
  });
}

function mapSeasons(info: any, source: XtreamSource, seriesId: string): SeasonResult[] {
  const result: SeasonResult[] = [];
  for (const [seasonKey, rawEpisodes] of groups(info)) {
    const first = rawEpisodes[0] || {};
    const seasonNumber = number(
      first.season ?? first.season_number ?? first.seasonNumber ?? first.info?.season ?? seasonKey,
      result.length + 1,
    );
    const seen = new Set<string>();
    const episodes = rawEpisodes.flatMap((raw: any, index: number) => {
      const episodeId = raw?.id ?? raw?.episode_id ?? raw?.stream_id ?? raw?.info?.id;
      if (episodeId == null) return [];
      const id = String(episodeId);
      if (!id || seen.has(id)) return [];
      seen.add(id);
      const episodeNumber = number(
        raw?.episode_num ?? raw?.episode_number ?? raw?.episodeNumber ?? raw?.number ??
          raw?.info?.episode_num ?? raw?.info?.episode_number,
        index + 1,
      );
      const url = streamUrl(
        source,
        id,
        raw?.container_extension ?? raw?.containerExtension ??
          raw?.info?.container_extension ?? raw?.info?.containerExtension,
      );
      return [{
        id: `xtream-sr-${seriesId}-s${seasonNumber}-e${episodeNumber}-${id}`,
        number: episodeNumber,
        name: String(raw?.title ?? raw?.name ?? raw?.info?.name ?? `Episódio ${episodeNumber}`),
        duration: String(raw?.info?.duration ?? raw?.duration ?? raw?.duration_secs ?? '—'),
        url,
        playbackUrls: [url],
      }];
    });
    if (episodes.length) result.push({
      number: seasonNumber,
      episodes: episodes.sort((a, b) => a.number - b.number),
    });
  }
  return result.sort((a, b) => a.number - b.number);
}

function cachePath(playlistId: string, seriesId: string) {
  return `${playlistId}/series-details/${seriesId}.json`;
}

async function loadCache(supabase: any, playlistId: string, seriesId: string, version: string | null) {
  try {
    const download = await supabase.storage.from(CACHE_BUCKET).download(cachePath(playlistId, seriesId));
    if (download.error || !download.data) return null;
    const data = JSON.parse(await download.data.text());
    if (String(data?.cacheVersion ?? '') !== String(version ?? '')) return null;
    return Array.isArray(data?.seasons) && data.seasons.length ? data.seasons as SeasonResult[] : null;
  } catch {
    return null;
  }
}

async function saveCache(
  supabase: any,
  playlistId: string,
  seriesId: string,
  version: string | null,
  seasons: SeasonResult[],
) {
  try {
    const result = await supabase.storage.from(CACHE_BUCKET).upload(
      cachePath(playlistId, seriesId),
      JSON.stringify({ schemaVersion: 3, seriesId, cacheVersion: version, seasons }),
      { contentType: 'application/json', cacheControl: '3600', upsert: true },
    );
    return !result.error;
  } catch {
    return false;
  }
}

function reason(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith('UPSTREAM_')) return message;
  if (/JSON|Unexpected token/i.test(message)) return 'UPSTREAM_INVALID_JSON';
  return 'UPSTREAM_UNAVAILABLE';
}

serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ message: 'Método não permitido.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRole) return json({ message: 'Servidor não configurado.' }, 500);

  const body = await payload(req);
  const deviceCode = text(body.deviceCode) || text(body.device_code);
  const deviceUuid = text(body.deviceUuid) || text(body.device_uuid);
  const deviceCredential = credential(req, body);
  const seriesId = text(body.seriesId) || text(body.series_id);
  if (!deviceCode || !deviceUuid || !deviceCredential || !seriesId) {
    return json({ message: 'Identificação do aparelho e da série incompleta.' }, 400);
  }
  if (!/^\d{1,20}$/.test(seriesId)) return json({ message: 'Série inválida.' }, 400);

  const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
  const { data: device, error } = await supabase.from('panel_devices').select(`
    id, device_uuid, device_credential_hash, status, subscription_expires_at,
    playlist:panel_playlists (id, playlist_url, playlist_cache_version, active),
    device_playlists:panel_device_playlists (
      playlist_id, priority, active, cooldown_until,
      playlist:panel_playlists (id, playlist_url, playlist_cache_version, active)
    )
  `).eq('device_code', deviceCode).maybeSingle();

  if (error) return json({ message: 'Não foi possível validar o aparelho.' }, 500);
  if (!device) return json({ message: 'Aparelho não encontrado.' }, 404);
  const credentialHash = await sha256(deviceCredential);
  if (
    !device.device_credential_hash ||
    !timingSafeEqual(credentialHash, device.device_credential_hash) ||
    device.device_uuid !== deviceUuid
  ) return json({ message: 'Credencial do aparelho inválida.' }, 403);

  const expired = device.subscription_expires_at
    ? new Date(device.subscription_expires_at).getTime() <= Date.now()
    : false;
  if (device.status !== 'active' || expired) {
    return json({ message: expired ? 'Assinatura expirada.' : 'Aparelho não ativo.' }, 403);
  }

  const requestedPlaylistId = text(body.playlistId) || text(body.playlist_id);
  const legacyPlaylist = Array.isArray(device.playlist) ? device.playlist[0] : device.playlist;
  let assignments = (device.device_playlists ?? [])
    .map((assignment: any) => ({
      ...assignment,
      playlist: Array.isArray(assignment.playlist) ? assignment.playlist[0] : assignment.playlist,
    }))
    .filter((assignment: any) =>
      assignment.active !== false &&
      assignment.playlist?.active !== false &&
      assignment.playlist?.playlist_url
    )
    .sort((left: any, right: any) => Number(left.priority) - Number(right.priority));

  if (!assignments.length && legacyPlaylist?.active && legacyPlaylist.playlist_url) {
    assignments = [{ playlist_id: legacyPlaylist.id, priority: 1, playlist: legacyPlaylist }];
  }
  if (!assignments.length) return json({ message: 'Lista ativa não encontrada.' }, 404);

  // O ID enviado pelo aplicativo é apenas uma preferência. Ele nunca permite
  // acessar uma lista que não esteja vinculada ao aparelho autenticado.
  if (requestedPlaylistId) {
    assignments.sort((left: any, right: any) => {
      const leftRequested = left.playlist_id === requestedPlaylistId ? 0 : 1;
      const rightRequested = right.playlist_id === requestedPlaylistId ? 0 : 1;
      return leftRequested - rightRequested || Number(left.priority) - Number(right.priority);
    });
  }

  let failure: unknown = new Error('UPSTREAM_EMPTY_EPISODES');
  const attemptedPlaylistIds: string[] = [];
  const deadlineMs = Date.now() + REQUEST_BUDGET_MS;

  for (const assignment of assignments) {
    if (Date.now() >= deadlineMs) {
      failure = new Error('UPSTREAM_BUDGET_EXHAUSTED');
      break;
    }
    const playlist = assignment.playlist;
    const source = parseXtreamSource(playlist.playlist_url);
    if (!source) {
      failure = new Error('UPSTREAM_INVALID_SOURCE');
      continue;
    }
    attemptedPlaylistIds.push(playlist.id);

    const stored = await loadCache(supabase, playlist.id, seriesId, playlist.playlist_cache_version);
    if (stored) {
      return json({
        seriesId,
        seasons: stored,
        source: 'storage-cache',
        sourcePlaylistId: playlist.id,
        usedFallback: playlist.id !== assignments[0].playlist_id,
        message: null,
      });
    }

    const attempts = [
      apiUrl(source, 'get_series_info', { series_id: seriesId }),
      apiUrl(source, 'get_series_info', { id: seriesId }),
    ];
    for (const target of attempts) {
      if (Date.now() >= deadlineMs) {
        failure = new Error('UPSTREAM_BUDGET_EXHAUSTED');
        break;
      }
      try {
        const raw = await providerText(target, source.origin, deadlineMs);
        const seasons = mapSeasons(JSON.parse(raw), source, seriesId);
        if (seasons.length) {
          // O cache acelera a próxima chamada, mas nunca invalida uma resposta
          // já obtida do fornecedor quando o Storage está indisponível.
          await saveCache(supabase, playlist.id, seriesId, playlist.playlist_cache_version, seasons);
          return json({
            seriesId,
            seasons,
            source: 'xtream',
            sourcePlaylistId: playlist.id,
            usedFallback: playlist.id !== assignments[0].playlist_id,
            message: null,
          });
        }
        failure = new Error('UPSTREAM_EMPTY_EPISODES');
      } catch (error) {
        failure = error;
      }
    }
  }

  const reasonCode = reason(failure);
  console.error('series-detail provider failed', {
    deviceId: device.id,
    attemptedPlaylistIds,
    requestedPlaylistId,
    seriesId,
    reasonCode,
  });
  return json({
    message: 'Não foi possível carregar os episódios desta série.',
    reasonCode,
  }, 502);
});
