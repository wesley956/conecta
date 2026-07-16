import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { safeFetchPlaylistText } from '../_shared/outboundFetch.ts';

const CACHE_BUCKET = 'playlist-cache';
const PROVIDER_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-credential',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface XtreamSource {
  origin: string;
  username: string;
  password: string;
}

interface EpisodeResult {
  id: string;
  number: number;
  name: string;
  duration: string;
  url: string;
  playbackUrls: string[];
}

interface SeasonResult {
  number: number;
  episodes: EpisodeResult[];
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'private, max-age=300',
    },
  });
}

async function readPayload(request: Request): Promise<Record<string, unknown>> {
  try {
    const payload = await request.json();
    return payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function textOrNull(value: unknown) {
  const result = String(value ?? '').trim();
  return result || null;
}

function readDeviceCredential(request: Request, payload: Record<string, unknown>) {
  const header = textOrNull(request.headers.get('x-device-credential'));
  if (header) return header;
  const authorization = textOrNull(request.headers.get('authorization'));
  const match = authorization?.match(/^Device\s+(.+)$/i);
  if (match?.[1]) return match[1].trim();
  return textOrNull(payload.deviceCredential) || textOrNull(payload.device_credential);
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function parseXtreamSource(rawUrl: string): XtreamSource | null {
  try {
    const url = new URL(rawUrl.trim());
    const username = url.searchParams.get('username') || '';
    const password = url.searchParams.get('password') || '';
    const path = url.pathname.toLowerCase();
    if (!username || !password) return null;
    if (!path.endsWith('/get.php') && !path.endsWith('/player_api.php')) return null;
    return { origin: url.origin, username, password };
  } catch {
    return null;
  }
}

function buildXtreamApiUrl(
  source: XtreamSource,
  action: string,
  extra: Record<string, string | number> = {},
) {
  const params = new URLSearchParams({
    username: source.username,
    password: source.password,
    action,
  });
  for (const [key, value] of Object.entries(extra)) params.set(key, String(value));
  return `${source.origin}/player_api.php?${params.toString()}`;
}

function episodeStreamUrl(source: XtreamSource, episodeId: string | number, extensionValue: unknown) {
  const extension = String(extensionValue || 'mp4')
    .replace('.', '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
    .trim() || 'mp4';
  return `${source.origin}/series/${encodeURIComponent(source.username)}/${encodeURIComponent(source.password)}/${episodeId}.${extension}`;
}

function positiveNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function label(value: unknown, fallback: string) {
  const result = String(value ?? '').trim();
  return result || fallback;
}

function normalizeEpisodeGroups(info: any): Array<[string, any[]]> {
  const rawEpisodes = info?.episodes ?? {};
  if (Array.isArray(rawEpisodes)) return [['1', rawEpisodes]];
  if (!rawEpisodes || typeof rawEpisodes !== 'object') return [];
  return Object.entries(rawEpisodes).flatMap(([seasonKey, value]) => {
    if (Array.isArray(value)) return [[seasonKey, value] as [string, any[]]];
    if (value && typeof value === 'object') {
      const nested = Object.values(value).filter(Array.isArray).flat() as any[];
      return nested.length > 0 ? [[seasonKey, nested] as [string, any[]]] : [];
    }
    return [];
  });
}

function mapXtreamSeasons(info: any, source: XtreamSource, seriesId: string): SeasonResult[] {
  const seasons: SeasonResult[] = [];
  for (const [seasonKey, rawEpisodes] of normalizeEpisodeGroups(info)) {
    const seasonMetadata = Array.isArray(info?.seasons) ? info.seasons : [];
    const firstWithSeason = rawEpisodes.find(raw => raw?.season || raw?.season_number || raw?.seasonNumber);
    const seasonNumber = positiveNumber(
      firstWithSeason?.season ??
        firstWithSeason?.season_number ??
        firstWithSeason?.seasonNumber ??
        seasonMetadata.find((item: any) => String(item?.season_number ?? item?.number ?? '') === String(seasonKey))?.season_number ??
        seasonKey,
      seasons.length + 1,
    );

    const episodes = rawEpisodes.flatMap((raw: any, index: number) => {
      const episodeId = raw?.id ?? raw?.episode_id ?? raw?.stream_id;
      if (!episodeId) return [];
      const episodeNumber = positiveNumber(raw?.episode_num ?? raw?.episode_number ?? raw?.number, index + 1);
      const url = episodeStreamUrl(
        source,
        episodeId,
        raw?.container_extension ?? raw?.containerExtension ?? raw?.info?.container_extension,
      );
      return [{
        id: `xtream-sr-${seriesId}-s${seasonNumber}-e${episodeNumber}`,
        number: episodeNumber,
        name: label(raw?.title || raw?.name, `Episódio ${episodeNumber}`),
        duration: label(
          raw?.info?.duration || raw?.info?.duration_secs || raw?.duration || raw?.duration_secs,
          '—',
        ),
        url,
        playbackUrls: [url],
      }];
    });

    if (episodes.length > 0) {
      seasons.push({
        number: seasonNumber,
        episodes: episodes.sort((left, right) => left.number - right.number),
      });
    }
  }
  return seasons.sort((left, right) => left.number - right.number);
}

function normalizeLabel(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(4k|uhd|fhd|hd|sd|dub|dublado|leg|legendado)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readM3uAttr(line: string, attribute: string) {
  const escaped = attribute.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`${escaped}\\s*=\\s*"([^"]*)"`, 'i'),
    new RegExp(`${escaped}\\s*=\\s*'([^']*)'`, 'i'),
    new RegExp(`${escaped}\\s*=\\s*([^\\s,]+)`, 'i'),
  ];
  for (const pattern of patterns) {
    const value = line.match(pattern)?.[1]?.trim();
    if (value) return value;
  }
  return '';
}

function readM3uName(line: string) {
  const commaIndex = line.lastIndexOf(',');
  return commaIndex >= 0 && commaIndex < line.length - 1
    ? line.slice(commaIndex + 1).trim()
    : readM3uAttr(line, 'tvg-name');
}

function readM3uDuration(line: string) {
  const seconds = Number(line.match(/^#EXTINF:\s*(-?\d+(?:\.\d+)?)/i)?.[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(remaining)}` : `${pad(minutes)}:${pad(remaining)}`;
}

function parseEpisodeName(name: string) {
  const patterns = [
    /\bS(\d{1,3})[\s._-]*E(\d{1,4})\b/i,
    /\bT(\d{1,3})[\s._-]*E(\d{1,4})\b/i,
    /\b(\d{1,3})x(\d{1,4})\b/i,
    /\btemporada\s*(\d{1,3}).*epis[oó]dio\s*(\d{1,4})\b/i,
    /\btemp\.?\s*(\d{1,3}).*ep\.?\s*(\d{1,4})\b/i,
  ];
  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (!match) continue;
    const seriesName = name
      .replace(pattern, ' ')
      .replace(/^\s*[-–|:]+\s*|\s*[-–|:]+\s*$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return {
      season: positiveNumber(match[1], 1),
      episode: positiveNumber(match[2], 1),
      seriesName: seriesName || name,
    };
  }
  return null;
}

function cleanGroupName(value: string) {
  return value
    .replace(/\b(series?|séries?|temporadas?|seasons?)\b/gi, ' ')
    .replace(/[|:>/\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function namesMatch(candidate: string, expected: string) {
  const left = normalizeLabel(candidate);
  const right = normalizeLabel(expected);
  if (!left || !right) return false;
  if (left === right) return true;
  if (Math.min(left.length, right.length) < 5) return false;
  return left.includes(right) || right.includes(left);
}

function mapM3uSeasons(raw: string, expectedSeriesName: string, seriesId: string): SeasonResult[] {
  const seasonMap = new Map<number, EpisodeResult[]>();
  const seen = new Set<string>();
  const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  let episodeCounter = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith('#EXTINF')) continue;
    const displayName = readM3uName(line);
    const parsed = parseEpisodeName(displayName);
    if (!parsed) continue;
    const groupName = cleanGroupName(readM3uAttr(line, 'group-title'));
    const matches =
      namesMatch(parsed.seriesName, expectedSeriesName) ||
      namesMatch(groupName, expectedSeriesName) ||
      namesMatch(displayName, expectedSeriesName);
    if (!matches) continue;

    let url = '';
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const candidate = lines[cursor];
      if (candidate.startsWith('#EXTINF')) break;
      if (/^https?:\/\//i.test(candidate)) {
        url = candidate;
        index = cursor;
        break;
      }
    }
    if (!url) continue;

    const dedupeKey = `${parsed.season}:${parsed.episode}:${url}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    episodeCounter += 1;
    const episodes = seasonMap.get(parsed.season) ?? [];
    episodes.push({
      id: `m3u-sr-${seriesId}-s${parsed.season}-e${parsed.episode}-${episodeCounter}`,
      number: parsed.episode,
      name: displayName || `Episódio ${parsed.episode}`,
      duration: readM3uDuration(line),
      url,
      playbackUrls: [url],
    });
    seasonMap.set(parsed.season, episodes);
  }

  return [...seasonMap.entries()]
    .map(([number, episodes]) => ({
      number,
      episodes: episodes.sort((left, right) => left.number - right.number),
    }))
    .sort((left, right) => left.number - right.number);
}

async function findSeriesNameFromCache(supabase: any, cachePath: string | null, seriesId: string) {
  if (!cachePath) return null;
  try {
    const download = await supabase.storage.from(CACHE_BUCKET).download(cachePath);
    if (download.error || !download.data) return null;
    const parsed = JSON.parse(await download.data.text());
    const items = Array.isArray(parsed?.series) ? parsed.series : [];
    const targetId = `xtream-sr-${seriesId}`;
    const item = items.find((candidate: any) => (
      String(candidate?.id ?? '') === targetId ||
      String(candidate?.xtreamSeriesId ?? '') === seriesId
    ));
    return textOrNull(item?.name);
  } catch {
    return null;
  }
}

async function findSeriesNameFromProvider(source: XtreamSource, seriesId: string) {
  try {
    const raw = await safeFetchPlaylistText(buildXtreamApiUrl(source, 'get_series'), {
      label: 'Catálogo de séries',
      timeoutMs: 45_000,
      maxBytes: 30 * 1024 * 1024,
      headers: PROVIDER_HEADERS,
    });
    const items = JSON.parse(raw);
    if (!Array.isArray(items)) return null;
    const item = items.find(candidate => String(candidate?.series_id ?? '') === seriesId);
    return textOrNull(item?.name || item?.title);
  } catch {
    return null;
  }
}

function detailCachePath(playlistId: string, seriesId: string) {
  return `${playlistId}/series-details/${seriesId}.json`;
}

async function loadCachedDetails(
  supabase: any,
  playlistId: string,
  seriesId: string,
  cacheVersion: string | null,
): Promise<SeasonResult[] | null> {
  try {
    const download = await supabase.storage.from(CACHE_BUCKET).download(detailCachePath(playlistId, seriesId));
    if (download.error || !download.data) return null;
    const parsed = JSON.parse(await download.data.text());
    if (String(parsed?.cacheVersion ?? '') !== String(cacheVersion ?? '')) return null;
    return Array.isArray(parsed?.seasons) && parsed.seasons.length > 0 ? parsed.seasons : null;
  } catch {
    return null;
  }
}

async function saveCachedDetails(
  supabase: any,
  playlistId: string,
  seriesId: string,
  cacheVersion: string | null,
  seasons: SeasonResult[],
) {
  const payload = JSON.stringify({
    schemaVersion: 1,
    seriesId,
    cacheVersion,
    generatedAt: new Date().toISOString(),
    seasons,
  });
  const upload = await supabase.storage.from(CACHE_BUCKET).upload(
    detailCachePath(playlistId, seriesId),
    payload,
    { contentType: 'application/json', cacheControl: '3600', upsert: true },
  );
  if (upload.error) console.warn('series detail cache upload failed', { playlistId, seriesId });
}

function safeReason(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/tempo limite/i.test(message)) return 'UPSTREAM_TIMEOUT';
  if (/HTTP\s+4\d\d/i.test(message)) return 'UPSTREAM_REJECTED';
  if (/JSON/i.test(message)) return 'UPSTREAM_INVALID_JSON';
  if (/Host não permitido/i.test(message)) return 'UPSTREAM_HOST_BLOCKED';
  return 'UPSTREAM_UNAVAILABLE';
}

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ message: 'Método não permitido.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return json({ message: 'Servidor não configurado.' }, 500);

  const payload = await readPayload(request);
  const deviceCode = textOrNull(payload.deviceCode) || textOrNull(payload.device_code);
  const deviceUuid = textOrNull(payload.deviceUuid) || textOrNull(payload.device_uuid);
  const deviceCredential = readDeviceCredential(request, payload);
  const seriesId = textOrNull(payload.seriesId) || textOrNull(payload.series_id);
  if (!deviceCode || !deviceUuid || !deviceCredential || !seriesId) {
    return json({ message: 'Identificação do aparelho e da série incompleta.' }, 400);
  }
  if (
    deviceCode.length > 80 || deviceUuid.length > 160 || deviceCredential.length > 256 ||
    !/^\d{1,20}$/.test(seriesId)
  ) {
    return json({ message: 'Parâmetros inválidos.' }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: device, error } = await supabase
    .from('panel_devices')
    .select(`
      id,
      device_uuid,
      device_credential_hash,
      status,
      subscription_expires_at,
      playlist:panel_playlists (
        id,
        playlist_url,
        playlist_cache_series_path,
        playlist_cache_version,
        active
      )
    `)
    .eq('device_code', deviceCode)
    .maybeSingle();

  if (error) return json({ message: 'Não foi possível validar o aparelho.' }, 500);
  if (!device) return json({ message: 'Aparelho não encontrado.' }, 404);
  const credentialHash = await sha256Hex(deviceCredential);
  if (
    !device.device_credential_hash ||
    !constantTimeEqual(credentialHash, device.device_credential_hash) ||
    device.device_uuid !== deviceUuid
  ) {
    return json({ message: 'Credencial do aparelho inválida.' }, 403);
  }
  const expired = device.subscription_expires_at
    ? new Date(device.subscription_expires_at).getTime() <= Date.now()
    : false;
  if (device.status !== 'active' || expired) {
    return json({ message: expired ? 'Assinatura expirada.' : 'Aparelho não ativo.' }, 403);
  }

  const playlist = Array.isArray(device.playlist) ? device.playlist[0] : device.playlist;
  if (!playlist?.active || !playlist.playlist_url) return json({ message: 'Lista ativa não encontrada.' }, 404);
  const source = parseXtreamSource(playlist.playlist_url);
  if (!source) return json({ message: 'Esta série não utiliza uma fonte Xtream sob demanda.' }, 422);

  const stored = await loadCachedDetails(
    supabase,
    playlist.id,
    seriesId,
    playlist.playlist_cache_version,
  );
  if (stored) return json({ seriesId, seasons: stored, source: 'storage-cache', message: null });

  let xtreamFailure: unknown = null;
  try {
    const raw = await safeFetchPlaylistText(
      buildXtreamApiUrl(source, 'get_series_info', { series_id: seriesId }),
      {
        label: 'Episódios da série',
        timeoutMs: 45_000,
        maxBytes: 30 * 1024 * 1024,
        headers: PROVIDER_HEADERS,
      },
    );
    const seasons = mapXtreamSeasons(JSON.parse(raw), source, seriesId);
    if (seasons.length > 0) {
      await saveCachedDetails(supabase, playlist.id, seriesId, playlist.playlist_cache_version, seasons);
      return json({ seriesId, seasons, source: 'xtream', message: null });
    }
    xtreamFailure = new Error('A API Xtream respondeu sem episódios.');
  } catch (failure) {
    xtreamFailure = failure;
  }

  const seriesName =
    await findSeriesNameFromCache(supabase, playlist.playlist_cache_series_path, seriesId) ||
    await findSeriesNameFromProvider(source, seriesId);

  if (seriesName) {
    try {
      const rawM3u = await safeFetchPlaylistText(playlist.playlist_url, {
        label: 'Lista M3U para episódios',
        timeoutMs: 75_000,
        maxBytes: 120 * 1024 * 1024,
        headers: { Accept: '*/*', 'User-Agent': PROVIDER_HEADERS['User-Agent'] },
      });
      const seasons = mapM3uSeasons(rawM3u, seriesName, seriesId);
      if (seasons.length > 0) {
        await saveCachedDetails(supabase, playlist.id, seriesId, playlist.playlist_cache_version, seasons);
        return json({ seriesId, seasons, source: 'm3u-fallback', message: null });
      }
    } catch (fallbackError) {
      console.error('series-detail m3u fallback failed', {
        deviceId: device.id,
        playlistId: playlist.id,
        seriesId,
        reasonCode: safeReason(fallbackError),
      });
    }
  }

  console.error('series-detail failed', {
    deviceId: device.id,
    playlistId: playlist.id,
    seriesId,
    reasonCode: safeReason(xtreamFailure),
    cacheNameFound: Boolean(seriesName),
  });
  return json({
    message: 'Não foi possível localizar os episódios desta série. Atualize o conteúdo e tente novamente.',
    reasonCode: safeReason(xtreamFailure),
  }, 502);
});