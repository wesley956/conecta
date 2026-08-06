import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { fetchUniversalPlaylistText } from '../_shared/universalOutboundFetch.ts';
import {
  buildXtreamApiUrl,
  buildXtreamStreamUrl,
  parseXtreamSource,
  type XtreamSource,
} from '../_shared/xtreamSource.ts';
import {
  classifyPlaylistCacheFailure,
  type PlaylistCacheAttempt,
} from '../_shared/playlistAccessMode.ts';
import {
  buildCacheManifest,
  encodeJsonCachePart,
  sha256Hex,
  type UploadedCachePart,
} from '../_shared/cacheManifest.ts';
import { runTasksWithConcurrency } from '../_shared/limitedConcurrency.ts';
import { safeDiagnosticJson, safeDiagnosticText } from '../_shared/diagnosticSafety.ts';

const BUCKET = 'playlist-cache';
const CACHE_LEASE_SECONDS = 180;
const XTREAM_FETCH_CONCURRENCY = 2;
const CACHE_GENERATIONS_TO_KEEP = 2;

type ProgressReporter = (phase: string) => Promise<void>;

type CacheLease = {
  acquired: boolean;
  attemptId: string;
  leaseExpiresAt: string;
  manifestPath: string;
  channelsPath: string;
  moviesPath: string;
  seriesPath: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function getEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Variável ${name} não configurada.`);
  return value;
}

function requireAdmin(req: Request) {
  const expected = Deno.env.get('ADMIN_PANEL_TOKEN') || '';
  const provided = req.headers.get('x-admin-token') || '';

  if (!expected) return json({ error: 'ADMIN_PANEL_TOKEN não configurado.' }, 500);
  if (!provided || provided !== expected) return json({ error: 'Token de administrador inválido.' }, 401);

  return null;
}

async function readBody(req: Request) {
  if (req.method !== 'POST') return {} as any;

  try {
    return await req.json();
  } catch {
    return {} as any;
  }
}

function text(value: unknown, fallback = '') {
  const result = String(value ?? '').trim();
  return result || fallback;
}

function normalizeType(value: unknown) {
  const type = String(value ?? 'm3u').trim().toLowerCase();
  return ['m3u', 'xtream', 'stalker', 'local'].includes(type) ? type : 'm3u';
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function slug(value: unknown, fallback = 'outros') {
  return text(value, fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

function titleCaseCategory(value: string) {
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function cleanLiveGroupTitle(groupTitle: string) {
  const value = groupTitle.trim();
  if (!value) return 'Outros';

  const cleaned = value
    .replace(/[|]+/g, ' ')
    .replace(/\b(FHD|HD|SD|4K|UHD)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return titleCaseCategory(cleaned || value);
}

function cleanMediaCategory(groupTitle: string, kind: 'movie' | 'series') {
  const fallback = kind === 'movie' ? 'Filmes' : 'Séries';
  const parts = groupTitle
    .split(/[|:>/\\-]+/g)
    .map(part => part.trim())
    .filter(Boolean);

  const forbidden = kind === 'movie'
    ? ['filme', 'filmes', 'movie', 'movies', 'vod', 'cinema']
    : ['serie', 'series', 'série', 'séries', 'temporada', 'temporadas', 'season'];

  const picked = parts.find(part => {
    const normalized = normalizeText(part);
    return !forbidden.some(word => normalized === normalizeText(word));
  });

  const raw = picked || parts.at(-1) || groupTitle || fallback;
  const cleaned = raw
    .replace(/\b(FHD|HD|SD|4K|UHD|DUB|DUBLADO|LEG|LEGENDADO)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return titleCaseCategory(cleaned || fallback);
}

function yearFromName(name: string) {
  const match = name.match(/\b(19\d{2}|20\d{2})\b/);
  return match ? Number(match[1]) : 0;
}

function cleanMovieName(name: string) {
  const cleaned = name
    .replace(/\b(?:19|20)\d{2}\b/g, '')
    .replace(/\(\s*\)|\[\s*\]|\{\s*\}/g, '')
    .replace(/\b(4K|UHD|FHD|HD|SD|DUB|DUBLADO|LEG|LEGENDADO|DUAL AUDIO|BLURAY|WEB-DL|WEBRIP|BRRIP|X264|X265|H264|H265)\b/gi, '')
    .replace(/[._]+/g, ' ')
    .replace(/\s*[-–|]\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return cleaned || name.trim() || 'Filme sem nome';
}

const BLOCKED_CACHE_HEADERS = new Set([
  'host',
  'content-length',
  'transfer-encoding',
  'connection',
  'proxy-connection',
  'upgrade',
]);

function cacheConnectionProfile(playlist: any) {
  const raw = playlist?.connection_profile;
  return Array.isArray(raw) ? raw[0] || null : raw || null;
}

function cacheRequestHeaders(playlist: any, defaults: Record<string, string>) {
  const result: Record<string, string> = { ...defaults };
  const raw = cacheConnectionProfile(playlist)?.request_headers;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  for (const [name, value] of Object.entries(raw)) {
    const header = String(name || '').trim();
    const normalized = header.toLowerCase();
    const content = String(value ?? '').trim();
    if (!/^[A-Za-z0-9-]{1,80}$/.test(header)) continue;
    if (BLOCKED_CACHE_HEADERS.has(normalized) || !content) continue;
    result[header] = content.slice(0, 2048);
  }
  return result;
}

function cacheFetchOptions(
  playlist: any,
  label: string,
  maxBytes: number,
  defaults: Record<string, string>,
  allowedOrigin?: string,
) {
  const profile = cacheConnectionProfile(playlist);
  const requested = text(playlist?.tls_mode, 'strict');
  const mode = playlist?.tls_scope_cache === false
    ? 'strict'
    : ['strict', 'custom_ca', 'insecure'].includes(requested) ? requested : 'strict';
  const hosts = new Set<string>();
  for (const raw of Array.isArray(playlist?.tls_allowed_hosts) ? playlist.tls_allowed_hosts : []) {
    const host = String(raw || '').trim().toLowerCase().split(':')[0];
    if (host) hosts.add(host);
  }
  try {
    hosts.add(new URL(String(playlist?.playlist_url || '')).hostname.toLowerCase());
  } catch {
    // A validação principal produzirá uma mensagem específica para URL inválida.
  }
  return {
    label,
    timeoutMs: Math.max(1000, Math.min(180000, Number(profile?.timeout_ms) || 60000)),
    maxBytes,
    allowedOrigins: allowedOrigin ? [allowedOrigin] : undefined,
    headers: cacheRequestHeaders(playlist, defaults),
    followRedirects: profile?.follow_redirects !== false,
    tlsMode: mode as 'strict' | 'custom_ca' | 'insecure',
    customCaPem: mode === 'custom_ca' ? text(profile?.custom_ca_pem) || null : null,
    allowedTlsHosts: [...hosts],
    allowSubdomains: playlist?.tls_allow_subdomains === true,
    allowRedirectHosts: playlist?.tls_allow_redirect_hosts === true,
  };
}

async function fetchJson(url: string, label: string, playlist: any, allowedOrigin?: string) {
  const raw = await fetchUniversalPlaylistText(url, cacheFetchOptions(
    playlist,
    label,
    30 * 1024 * 1024,
    {
      Accept: 'application/json, text/plain, */*',
      'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
    },
    allowedOrigin,
  ));

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${label}: resposta não é JSON.`);
  }
}

async function fetchText(url: string, label: string, playlist: any) {
  return await fetchUniversalPlaylistText(url, cacheFetchOptions(
    playlist,
    label,
    80 * 1024 * 1024,
    {
      Accept: '*/*',
      'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
    },
  ));
}

function buildCategoryMap(items: any[]) {
  const map = new Map<string, string>();

  for (const item of Array.isArray(items) ? items : []) {
    const id = text(item.category_id);
    const name = text(item.category_name);
    if (id && name) map.set(id, name);
  }

  return map;
}

async function mapDefinedInBatches<T, R>(
  items: T[],
  mapper: (item: T) => R | null,
  batchSize = 500,
) {
  const result: R[] = [];

  for (let index = 0; index < items.length; index += 1) {
    const mapped = mapper(items[index]);
    if (mapped !== null) result.push(mapped);
    if ((index + 1) % batchSize === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  return result;
}

function liveExtension(source: XtreamSource) {
  return source?.output?.toLowerCase() === 'm3u8' ? 'm3u8' : 'ts';
}

function liveUrl(source: XtreamSource, streamId: string | number, extension = liveExtension(source)) {
  return buildXtreamStreamUrl(source, 'live', streamId, extension);
}

function alternateLiveUrls(source: XtreamSource, streamId: string | number) {
  const primaryExt = liveExtension(source);
  const fallbackExt = primaryExt === 'm3u8' ? 'ts' : 'm3u8';

  return [
    buildXtreamStreamUrl(source, 'live', streamId, primaryExt),
    buildXtreamStreamUrl(source, 'live', streamId, fallbackExt),
    buildXtreamStreamUrl(source, null, streamId, primaryExt),
    buildXtreamStreamUrl(source, null, streamId, fallbackExt),
  ];
}

function movieUrl(source: XtreamSource, streamId: string | number, extension?: string) {
  const ext = text(extension, 'mp4').replace('.', '') || 'mp4';
  return buildXtreamStreamUrl(source, 'movie', streamId, ext);
}

async function buildXtreamSnapshot(playlist: any, reportProgress: ProgressReporter) {
  const source = parseXtreamSource(playlist.playlist_url);
  if (!source) return null;

  await reportProgress('xtream_profile');
  const profile = await fetchJson(buildXtreamApiUrl(source), 'Login Xtream', playlist, source.origin);
  const userInfo = profile?.user_info ?? {};

  if (String(userInfo.auth) !== '1') {
    throw new Error('A conta Xtream não autorizou o acesso.');
  }

  await reportProgress('xtream_categories');
  const [liveCategories, vodCategories, seriesCategories] = await runTasksWithConcurrency([
    () => fetchJson(buildXtreamApiUrl(source, 'get_live_categories'), 'Categorias de canais', playlist, source.origin).catch(() => []),
    () => fetchJson(buildXtreamApiUrl(source, 'get_vod_categories'), 'Categorias de filmes', playlist, source.origin).catch(() => []),
    () => fetchJson(buildXtreamApiUrl(source, 'get_series_categories'), 'Categorias de séries', playlist, source.origin).catch(() => []),
  ], XTREAM_FETCH_CONCURRENCY);

  const liveCategoryMap = buildCategoryMap(liveCategories);
  const vodCategoryMap = buildCategoryMap(vodCategories);
  const seriesCategoryMap = buildCategoryMap(seriesCategories);

  await reportProgress('xtream_live');
  let liveStreams: any = await fetchJson(buildXtreamApiUrl(source, 'get_live_streams'), 'Canais', playlist, source.origin);
  const channels = await mapDefinedInBatches(
    Array.isArray(liveStreams) ? liveStreams : [],
    item => {
      if (!item.stream_id) return null;
      const groupName = liveCategoryMap.get(String(item.category_id ?? '')) || 'Canais';
      const playbackUrls = alternateLiveUrls(source, item.stream_id);
      const url = playbackUrls[0];

      return {
        id: `${playlist.id}-ch-${item.stream_id}`,
        name: text(item.name, `Canal ${item.stream_id}`),
        logo: text(item.stream_icon) || undefined,
        groupTitle: cleanLiveGroupTitle(groupName),
        group: slug(groupName, 'canais'),
        url,
        isFavorite: false,
        playbackUrls,
      };
    },
  );
  liveStreams = null;

  await reportProgress('xtream_movies');
  let vodStreams: any = await fetchJson(buildXtreamApiUrl(source, 'get_vod_streams'), 'Filmes', playlist, source.origin);
  const movies = await mapDefinedInBatches(
    Array.isArray(vodStreams) ? vodStreams : [],
    item => {
      if (!item.stream_id) return null;
      const name = text(item.name, `Filme ${item.stream_id}`);
      const category = vodCategoryMap.get(String(item.category_id ?? '')) || 'Filmes';
      const url = movieUrl(source, item.stream_id, item.container_extension);

      return {
        id: `${playlist.id}-mv-${item.stream_id}`,
        name: cleanMovieName(name),
        year: yearFromName(name),
        duration: text(item.duration, '—'),
        synopsis: text(item.plot, 'Filme autorizado pelo painel.'),
        cover: text(item.stream_icon) || undefined,
        category: cleanMediaCategory(category, 'movie'),
        url,
        isFavorite: false,
        progress: 0,
        playbackUrls: [url],
      };
    },
  );
  vodStreams = null;

  await reportProgress('xtream_series');
  let seriesItems: any = await fetchJson(buildXtreamApiUrl(source, 'get_series'), 'Séries', playlist, source.origin);
  const series = await mapDefinedInBatches(
    Array.isArray(seriesItems) ? seriesItems : [],
    item => {
      if (!item.series_id) return null;
      const seriesId = item.series_id;
      const category = seriesCategoryMap.get(String(item.category_id ?? '')) || 'Séries';

      return {
        id: `xtream-sr-${seriesId}`,
        name: text(item.name || item.title, `Série ${seriesId}`),
        cover: text(item.cover) || undefined,
        category: cleanMediaCategory(category, 'series'),
        synopsis: text(item.plot, 'Série autorizada pelo painel.'),
        seasons: [],
        isFavorite: false,
        progress: 0,
        xtreamSeriesId: seriesId,
      };
    },
  );
  seriesItems = null;

  await reportProgress('snapshot_ready');

  return { channels, movies, series };
}

function readAttr(line: string, attr: string): string {
  const escapedAttr = attr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`${escapedAttr}\\s*=\\s*"([^"]*)"`, 'i'),
    new RegExp(`${escapedAttr}\\s*=\\s*'([^']*)'`, 'i'),
    new RegExp(`${escapedAttr}\\s*=\\s*([^\\s,]+)`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);
    const value = match?.[1]?.trim();
    if (value) return value;
  }

  return '';
}

function readName(line: string): string {
  const commaIndex = line.lastIndexOf(',');
  if (commaIndex >= 0 && commaIndex < line.length - 1) return line.slice(commaIndex + 1).trim();
  return readAttr(line, 'tvg-name') || 'Sem nome';
}

function readExtInfDuration(line: string): number | null {
  const match = line.match(/^#EXTINF:\s*(-?\d+(?:\.\d+)?)/i);
  const value = Number(match?.[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—';
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(remainingSeconds)}` : `${pad(minutes)}:${pad(remainingSeconds)}`;
}

function isPlayableUrl(url: string) {
  return /^https?:\/\//i.test(url) || /^rtmp:\/\//i.test(url);
}

function* iterateNonEmptyLines(raw: string) {
  let start = 0;

  for (let index = 0; index <= raw.length; index += 1) {
    if (index < raw.length && raw.charCodeAt(index) !== 10) continue;
    const end = index > start && raw.charCodeAt(index - 1) === 13 ? index - 1 : index;
    const line = raw.slice(start, end).trim();
    if (line) yield line;
    start = index + 1;
  }
}

function getUrlPath(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname).toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function getUrlExtension(url: string): string {
  const path = getUrlPath(url).split('?')[0].split('#')[0];
  const match = path.match(/\.([a-z0-9]{2,5})$/i);
  return match?.[1]?.toLowerCase() ?? '';
}

function hasExplicitSeriesPath(url: string) {
  return getUrlPath(url).includes('/series/');
}

function hasExplicitMoviePath(url: string) {
  return getUrlPath(url).includes('/movie/');
}

function hasVodFileExtension(url: string) {
  return /^(mp4|mkv|avi|mov|wmv|flv|webm|m4v)$/i.test(getUrlExtension(url));
}

function hasLiveFileExtension(url: string) {
  return /^(ts|m3u8)$/i.test(getUrlExtension(url));
}

function hasEpisodeSignal(name: string) {
  return (
    /\bs\d{1,2}\s*e\d{1,3}\b/i.test(name) ||
    /\bt\d{1,2}\s*e\d{1,3}\b/i.test(name) ||
    /\b\d{1,2}x\d{1,3}\b/i.test(name) ||
    /\btemporada\s*\d{1,2}.*epis[oó]dio\s*\d{1,3}\b/i.test(name) ||
    /\btemp\.?\s*\d{1,2}.*ep\.?\s*\d{1,3}\b/i.test(name)
  );
}

function hasSeriesCatalogSignal(textValue: string) {
  const value = normalizeText(textValue);
  return value.includes('serie') || value.includes('series') || value.includes('temporada') || value.includes('season');
}

function hasMovieCatalogSignal(textValue: string) {
  const value = normalizeText(textValue);
  return value.includes('filme') || value.includes('filmes') || value.includes('movie') || value.includes('movies') || value.includes('vod') || value.includes('cinema');
}

function hasLinearLiveSignal(textValue: string) {
  const value = normalizeText(textValue);
  return (
    /\b24\s*h(oras)?\b/.test(value) ||
    value.includes('24/7') ||
    /\bcanais?\b/.test(value) ||
    /\bcanal\b/.test(value) ||
    /\btv\b/.test(value) ||
    value.includes('ao vivo') ||
    /\blive\b/.test(value)
  );
}

function looksLike24HourChannel(textValue: string) {
  const value = normalizeText(textValue);
  return /\b24\s*h(oras)?\b/.test(value) || value.includes('24/7');
}

function classifyEntry(name: string, groupTitle: string, url: string): 'live' | 'movie' | 'series' {
  const combined = `${groupTitle} ${name}`;

  if (looksLike24HourChannel(combined)) return 'live';
  if (hasExplicitSeriesPath(url)) return 'series';
  if (hasExplicitMoviePath(url)) return 'movie';
  if (hasEpisodeSignal(name) && !hasLinearLiveSignal(combined)) return 'series';
  if (hasSeriesCatalogSignal(combined) && hasVodFileExtension(url) && !hasLinearLiveSignal(combined)) return 'series';
  if (hasLiveFileExtension(url)) return 'live';
  if (hasVodFileExtension(url) && !hasLinearLiveSignal(combined)) return 'movie';
  if (hasMovieCatalogSignal(combined) && hasVodFileExtension(url) && !hasLinearLiveSignal(combined)) return 'movie';

  return 'live';
}

function parseEpisodeInfo(name: string) {
  const sxe = name.match(/\bS(\d{1,2})\s*E(\d{1,3})\b/i);
  const txe = name.match(/\bT(\d{1,2})\s*E(\d{1,3})\b/i);
  const alt = name.match(/\b(\d{1,2})x(\d{1,3})\b/i);
  const temporada = name.match(/\btemporada\s*(\d{1,2}).*epis[oó]dio\s*(\d{1,3})\b/i);
  const tempEp = name.match(/\btemp\.?\s*(\d{1,2}).*ep\.?\s*(\d{1,3})\b/i);

  const season = Number(sxe?.[1] ?? txe?.[1] ?? alt?.[1] ?? temporada?.[1] ?? tempEp?.[1] ?? 1);
  const episode = Number(sxe?.[2] ?? txe?.[2] ?? alt?.[2] ?? temporada?.[2] ?? tempEp?.[2] ?? 1);
  let seriesName = name
    .replace(/\bS\d{1,2}\s*E\d{1,3}\b/i, '')
    .replace(/\bT\d{1,2}\s*E\d{1,3}\b/i, '')
    .replace(/\b\d{1,2}x\d{1,3}\b/i, '')
    .replace(/\btemporada\s*\d{1,2}.*epis[oó]dio\s*\d{1,3}\b/i, '')
    .replace(/\btemp\.?\s*\d{1,2}.*ep\.?\s*\d{1,3}\b/i, '')
    .replace(/\s*[-–|]\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!seriesName) seriesName = name;

  return {
    seriesName,
    season: Number.isFinite(season) && season > 0 ? season : 1,
    episode: Number.isFinite(episode) && episode > 0 ? episode : 1,
  };
}

async function buildM3USnapshot(playlist: any, reportProgress: ProgressReporter) {
  await reportProgress('m3u_download');
  const raw = await fetchText(playlist.playlist_url, 'Lista M3U', playlist);

  if (!raw.includes('#EXTINF')) {
    throw new Error('A URL não retornou uma lista M3U válida.');
  }

  const channels: any[] = [];
  const movies: any[] = [];
  const seriesMap = new Map<string, any>();
  let episodeCounter = 0;
  let processedEntries = 0;
  let extInfLine: string | null = null;

  await reportProgress('m3u_parse');
  for (const line of iterateNonEmptyLines(raw)) {
    if (line.startsWith('#EXTINF')) {
      extInfLine = line;
      continue;
    }
    if (!extInfLine || !isPlayableUrl(line)) continue;

    const metadataLine = extInfLine;
    extInfLine = null;
    const url = line;
    const name = readName(metadataLine);
    const groupTitle = readAttr(metadataLine, 'group-title') || 'Outros';
    const logo = readAttr(metadataLine, 'tvg-logo') || undefined;
    const epgId = readAttr(metadataLine, 'tvg-id') || undefined;
    const duration = formatDuration(readExtInfDuration(metadataLine));
    const kind = classifyEntry(name, groupTitle, url);
    processedEntries += 1;

    if (processedEntries % 5000 === 0) {
      await reportProgress('m3u_parse');
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    if (kind === 'live') {
      channels.push({
        id: `${playlist.id}-ch-${channels.length + 1}`,
        name,
        group: slug(groupTitle, 'outros'),
        groupTitle: cleanLiveGroupTitle(groupTitle),
        url,
        playbackUrls: [url],
        logo,
        epgId,
        isFavorite: false,
      });
      continue;
    }

    if (kind === 'movie') {
      movies.push({
        id: `${playlist.id}-mv-${movies.length + 1}`,
        name: cleanMovieName(name),
        year: yearFromName(name),
        duration,
        synopsis: 'Filme autorizado pelo painel.',
        cover: logo,
        category: cleanMediaCategory(groupTitle, 'movie'),
        url,
        playbackUrls: [url],
        isFavorite: false,
        progress: 0,
      });
      continue;
    }

    const parsedEpisode = parseEpisodeInfo(name);
    const seriesKey = `${slug(groupTitle)}-${slug(parsedEpisode.seriesName)}`;
    let currentSeries = seriesMap.get(seriesKey);

    if (!currentSeries) {
      currentSeries = {
        id: `${playlist.id}-sr-${seriesMap.size + 1}`,
        name: parsedEpisode.seriesName,
        cover: logo,
        category: cleanMediaCategory(groupTitle, 'series'),
        synopsis: 'Série autorizada pelo painel.',
        seasons: [],
        isFavorite: false,
        progress: 0,
      };
      seriesMap.set(seriesKey, currentSeries);
    }

    let season = currentSeries.seasons.find((item: any) => item.number === parsedEpisode.season);
    if (!season) {
      season = { number: parsedEpisode.season, episodes: [] };
      currentSeries.seasons.push(season);
    }

    episodeCounter += 1;
    season.episodes.push({
      id: `${currentSeries.id}-ep-${episodeCounter}`,
      number: parsedEpisode.episode,
      name,
      url,
      playbackUrls: [url],
      duration,
      progress: 0,
    });
  }

  const series = [...seriesMap.values()].map(item => ({
    ...item,
    seasons: item.seasons
      .map((season: any) => ({
        ...season,
        episodes: [...season.episodes].sort((a: any, b: any) => a.number - b.number),
      }))
      .sort((a: any, b: any) => a.number - b.number),
  }));

  await reportProgress('snapshot_ready');

  return { channels, movies, series };
}

class PlaylistBuildError extends Error {
  constructor(
    message: string,
    readonly attempts: PlaylistCacheAttempt[],
  ) {
    super(message);
    this.name = 'PlaylistBuildError';
  }
}

function attemptLabel(method: PlaylistCacheAttempt['method']) {
  return method === 'm3u' ? 'M3U' : 'Xtream';
}

async function buildSnapshot(playlist: any, reportProgress: ProgressReporter) {
  const attempts: PlaylistCacheAttempt[] = [];
  const playlistType = normalizeType(playlist.playlist_type);
  const hasXtreamCredentials = Boolean(parseXtreamSource(playlist.playlist_url));
  const methods: PlaylistCacheAttempt['method'][] = hasXtreamCredentials || playlistType === 'xtream'
    ? ['xtream', 'm3u']
    : ['m3u', 'xtream'];
  let content: any = null;

  for (const method of methods) {
    try {
      const result = method === 'xtream'
        ? await buildXtreamSnapshot(playlist, reportProgress)
        : await buildM3USnapshot(playlist, reportProgress);

      if (!result) {
        attempts.push({
          method,
          status: 'skipped',
          error: method === 'xtream' ? 'A URL não contém credenciais Xtream reconhecíveis.' : null,
        });
        continue;
      }

      attempts.push({ method, status: 'success', error: null });
      content = result;
      break;
    } catch (error) {
      attempts.push({
        method,
        status: 'error',
        error: error instanceof Error ? error.message : 'Falha desconhecida.',
      });
    }
  }

  if (!content) {
    const details = attempts
      .filter(attempt => attempt.status === 'error')
      .map(attempt => `${attemptLabel(attempt.method)}: ${attempt.error}`)
      .join(' | ');
    throw new PlaylistBuildError(details || 'Nenhuma forma compatível de leitura foi encontrada.', attempts);
  }

  const generatedAt = new Date().toISOString();
  const itemCount = content.channels.length + content.movies.length + content.series.length;

  if (itemCount === 0) {
    attempts.push({
      method: methods.find(method => attempts.some(attempt => attempt.method === method && attempt.status === 'success')) || methods[0],
      status: 'error',
      error: 'A lista foi lida, mas nenhum canal, filme ou série foi encontrado.',
    });
    throw new PlaylistBuildError('A lista foi lida, mas nenhum canal, filme ou série foi encontrado.', attempts);
  }

  const playlistItem = {
    id: playlist.id,
    name: playlist.name,
    type: normalizeType(playlist.playlist_type),
    status: 'active',
    channelCount: content.channels.length,
    movieCount: content.movies.length,
    seriesCount: content.series.length,
    lastSync: generatedAt,
  };

  return {
    schemaVersion: 2,
    generatedAt,
    playlistId: playlist.id,
    playlistName: playlist.name,
    channels: content.channels,
    movies: content.movies,
    series: content.series,
    playlists: [playlistItem],
    cacheAttempts: attempts,
  };
}

async function uploadJsonCachePart(supabase: any, storagePath: string, payload: unknown) {
  const encoded = await encodeJsonCachePart(payload);
  const upload = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, encoded.body, {
      contentType: 'application/json',
      upsert: false,
      cacheControl: '31536000',
    });

  if (upload.error) throw new Error(upload.error.message);

  return {
    path: storagePath,
    sizeBytes: encoded.sizeBytes,
    sha256: encoded.sha256,
  } satisfies UploadedCachePart;
}

function hasUsableCache(playlist: any) {
  return Boolean(
    playlist.playlist_cache_manifest_path &&
    playlist.playlist_cache_channels_path &&
    playlist.playlist_cache_movies_path &&
    playlist.playlist_cache_series_path &&
    Number(playlist.playlist_cache_item_count) > 0
  );
}

function firstRpcRow(data: any) {
  return Array.isArray(data) ? data[0] : data;
}

async function claimCacheGeneration(supabase: any, playlistId: string, ownerId: string): Promise<CacheLease> {
  const { data, error } = await supabase.rpc('claim_playlist_cache_generation', {
    p_playlist_id: playlistId,
    p_owner_id: ownerId,
    p_lease_seconds: CACHE_LEASE_SECONDS,
  });

  if (error) throw new Error(`Não foi possível reservar a geração do cache: ${error.message}`);
  const row = firstRpcRow(data);
  if (!row?.attempt_id) throw new Error('O banco não retornou a tentativa de geração do cache.');

  return {
    acquired: row.acquired === true,
    attemptId: String(row.attempt_id),
    leaseExpiresAt: String(row.lease_expires_at || ''),
    manifestPath: String(row.manifest_path || ''),
    channelsPath: String(row.channels_path || ''),
    moviesPath: String(row.movies_path || ''),
    seriesPath: String(row.series_path || ''),
  };
}

async function heartbeatCacheGeneration(
  supabase: any,
  playlistId: string,
  attemptId: string,
  ownerId: string,
  phase: string,
) {
  const { data, error } = await supabase.rpc('heartbeat_playlist_cache_generation', {
    p_playlist_id: playlistId,
    p_attempt_id: attemptId,
    p_owner_id: ownerId,
    p_phase: phase,
    p_lease_seconds: CACHE_LEASE_SECONDS,
  });

  if (error) throw new Error(`Não foi possível renovar o lease do cache: ${error.message}`);
  return firstRpcRow(data)?.renewed === true;
}

async function completeCacheGeneration(
  supabase: any,
  playlistId: string,
  attemptId: string,
  ownerId: string,
  payload: {
    generatedAt: string;
    version: string;
    itemCount: number;
    sizeBytes: number;
    manifestSha256: string;
    manifestSizeBytes: number;
    cacheAttempts: PlaylistCacheAttempt[];
    parts: Record<string, unknown>;
  },
) {
  const { data, error } = await supabase.rpc('complete_playlist_cache_generation', {
    p_playlist_id: playlistId,
    p_attempt_id: attemptId,
    p_owner_id: ownerId,
    p_generated_at: payload.generatedAt,
    p_version: payload.version,
    p_item_count: payload.itemCount,
    p_size_bytes: payload.sizeBytes,
    p_manifest_sha256: payload.manifestSha256,
    p_manifest_size_bytes: payload.manifestSizeBytes,
    p_cache_attempts: payload.cacheAttempts,
    p_parts: payload.parts,
  });

  if (error) throw new Error(`Não foi possível publicar o cache: ${error.message}`);
  const row = firstRpcRow(data);
  return {
    published: row?.published === true,
    reason: String(row?.reason || 'unknown'),
  };
}

async function failCacheGeneration(
  supabase: any,
  playlistId: string,
  attemptId: string,
  ownerId: string,
  failure: ReturnType<typeof classifyPlaylistCacheFailure>,
  message: string,
  attempts: PlaylistCacheAttempt[],
) {
  const { data, error } = await supabase.rpc('fail_playlist_cache_generation', {
    p_playlist_id: playlistId,
    p_attempt_id: attemptId,
    p_owner_id: ownerId,
    p_error_code: failure.code,
    p_error_message: message,
    p_access_mode: failure.accessMode,
    p_cache_attempts: attempts,
  });

  if (error) throw new Error(`Não foi possível registrar a falha do cache: ${error.message}`);
  return data === true;
}

async function removeCacheObjects(supabase: any, paths: string[]) {
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  if (uniquePaths.length === 0) return true;
  const { error } = await supabase.storage.from(BUCKET).remove(uniquePaths);
  return !error;
}

async function markAttemptObjectsDeleted(supabase: any, attemptId: string) {
  await supabase
    .from('playlist_cache_generation_attempts')
    .update({ objects_deleted_at: new Date().toISOString() })
    .eq('id', attemptId);
}

async function cleanupOldCacheGenerations(supabase: any, playlistId: string) {
  const { data, error } = await supabase
    .from('playlist_cache_generation_attempts')
    .select('id, status, manifest_path, channels_path, movies_path, series_path, finished_at')
    .eq('playlist_id', playlistId)
    .is('objects_deleted_at', null)
    .neq('status', 'building')
    .order('finished_at', { ascending: false, nullsFirst: false })
    .limit(25);

  if (error) return;
  let readySeen = 0;

  for (const attempt of data ?? []) {
    if (attempt.status === 'ready') {
      readySeen += 1;
      if (readySeen <= CACHE_GENERATIONS_TO_KEEP) continue;
    }

    const removed = await removeCacheObjects(supabase, [
      attempt.manifest_path,
      attempt.channels_path,
      attempt.movies_path,
      attempt.series_path,
    ]);
    if (removed) await markAttemptObjectsDeleted(supabase, String(attempt.id));
  }
}

class CacheLeaseLostError extends Error {
  constructor() {
    super('A geração perdeu o lease antes de concluir.');
    this.name = 'CacheLeaseLostError';
  }
}

async function refreshPlaylistCache(supabase: any, playlist: any) {
  const startedAt = Date.now();
  const previousCacheIsUsable = hasUsableCache(playlist);
  const ownerId = crypto.randomUUID();
  const lease = await claimCacheGeneration(supabase, playlist.id, ownerId);

  if (!lease.acquired) {
    return {
      ok: false,
      busy: true,
      playlistId: playlist.id,
      playlistName: playlist.name,
      attemptId: lease.attemptId,
      correlationId: `cache:${lease.attemptId}`,
      leaseExpiresAt: lease.leaseExpiresAt,
      errorCode: 'cache_generation_busy',
      message: 'Esta lista já possui uma geração de cache em andamento.',
      elapsedMs: Date.now() - startedAt,
    };
  }

  const uploadedPaths: string[] = [];
  const reportProgress: ProgressReporter = async phase => {
    const renewed = await heartbeatCacheGeneration(
      supabase,
      playlist.id,
      lease.attemptId,
      ownerId,
      phase,
    );
    if (!renewed) throw new CacheLeaseLostError();
  };

  try {
    const snapshot = await buildSnapshot(playlist, reportProgress);
    const itemCount = snapshot.channels.length + snapshot.movies.length + snapshot.series.length;
    const counts = {
      channels: snapshot.channels.length,
      movies: snapshot.movies.length,
      series: snapshot.series.length,
      total: itemCount,
    };
    const hashSeed = JSON.stringify({
      playlistId: snapshot.playlistId,
      generatedAt: snapshot.generatedAt,
      counts,
      updatedAt: playlist.playlist_updated_at ?? null,
    });
    const hash = (await sha256Hex(hashSeed)).slice(0, 20);
    const version = `${snapshot.generatedAt}-${hash}`;

    await reportProgress('upload_channels');
    const channelsUpload = await uploadJsonCachePart(supabase, lease.channelsPath, {
      schemaVersion: snapshot.schemaVersion,
      generatedAt: snapshot.generatedAt,
      playlistId: snapshot.playlistId,
      playlistName: snapshot.playlistName,
      playlists: snapshot.playlists,
      channels: snapshot.channels,
    });
    uploadedPaths.push(channelsUpload.path);
    snapshot.channels = [];

    await reportProgress('upload_movies');
    const moviesUpload = await uploadJsonCachePart(supabase, lease.moviesPath, {
      schemaVersion: snapshot.schemaVersion,
      generatedAt: snapshot.generatedAt,
      playlistId: snapshot.playlistId,
      playlistName: snapshot.playlistName,
      movies: snapshot.movies,
    });
    uploadedPaths.push(moviesUpload.path);
    snapshot.movies = [];

    await reportProgress('upload_series');
    const seriesUpload = await uploadJsonCachePart(supabase, lease.seriesPath, {
      schemaVersion: snapshot.schemaVersion,
      generatedAt: snapshot.generatedAt,
      playlistId: snapshot.playlistId,
      playlistName: snapshot.playlistName,
      series: snapshot.series,
    });
    uploadedPaths.push(seriesUpload.path);
    snapshot.series = [];

    const manifest = buildCacheManifest({
      schemaVersion: snapshot.schemaVersion,
      generatedAt: snapshot.generatedAt,
      playlistId: snapshot.playlistId,
      playlistName: snapshot.playlistName,
      attemptId: lease.attemptId,
      version,
      counts,
      channels: channelsUpload,
      movies: moviesUpload,
      series: seriesUpload,
      manifestPath: lease.manifestPath,
    });

    await reportProgress('upload_manifest');
    const manifestUpload = await uploadJsonCachePart(supabase, lease.manifestPath, manifest);
    uploadedPaths.push(manifestUpload.path);

    const sizeBytes = manifestUpload.sizeBytes + channelsUpload.sizeBytes + moviesUpload.sizeBytes + seriesUpload.sizeBytes;
    const parts = {
      channels: { path: channelsUpload.path, sha256: channelsUpload.sha256, bytes: channelsUpload.sizeBytes, count: counts.channels },
      movies: { path: moviesUpload.path, sha256: moviesUpload.sha256, bytes: moviesUpload.sizeBytes, count: counts.movies },
      series: { path: seriesUpload.path, sha256: seriesUpload.sha256, bytes: seriesUpload.sizeBytes, count: counts.series },
      manifest: { path: manifestUpload.path, sha256: manifestUpload.sha256, bytes: manifestUpload.sizeBytes },
    };

    await reportProgress('publish_manifest');
    const publication = await completeCacheGeneration(
      supabase,
      playlist.id,
      lease.attemptId,
      ownerId,
      {
        generatedAt: snapshot.generatedAt,
        version,
        itemCount,
        sizeBytes,
        manifestSha256: manifestUpload.sha256,
        manifestSizeBytes: manifestUpload.sizeBytes,
        cacheAttempts: snapshot.cacheAttempts,
        parts,
      },
    );

    if (!publication.published) {
      await removeCacheObjects(supabase, uploadedPaths);
      await markAttemptObjectsDeleted(supabase, lease.attemptId);
      return {
        ok: false,
        playlistId: playlist.id,
        playlistName: playlist.name,
        attemptId: lease.attemptId,
        correlationId: `cache:${lease.attemptId}`,
        errorCode: publication.reason,
        preservedPreviousCache: previousCacheIsUsable,
        message: publication.reason === 'source_changed'
          ? 'A lista foi alterada durante a geração. Gere o cache novamente.'
          : 'A geração perdeu a autorização de publicação e foi descartada com segurança.',
        elapsedMs: Date.now() - startedAt,
      };
    }

    await cleanupOldCacheGenerations(supabase, playlist.id);

    return {
      ok: true,
      playlistId: playlist.id,
      playlistName: playlist.name,
      attemptId: lease.attemptId,
      correlationId: `cache:${lease.attemptId}`,
      itemCount,
      channels: counts.channels,
      movies: counts.movies,
      series: counts.series,
      sizeBytes,
      parts: {
        manifestBytes: manifestUpload.sizeBytes,
        channelsBytes: channelsUpload.sizeBytes,
        moviesBytes: moviesUpload.sizeBytes,
        seriesBytes: seriesUpload.sizeBytes,
      },
      elapsedMs: Date.now() - startedAt,
      version,
    };
  } catch (error) {
    const message = safeDiagnosticText(
      error instanceof Error ? error.message : 'Falha desconhecida.',
      800,
    ) || 'Falha desconhecida.';
    const rawAttempts = error instanceof PlaylistBuildError
      ? error.attempts
      : [{ method: 'm3u', status: 'error', error: message }] as PlaylistCacheAttempt[];
    const attempts = safeDiagnosticJson(rawAttempts) as PlaylistCacheAttempt[];
    const failure = classifyPlaylistCacheFailure(attempts, playlist.playlist_type);

    if (uploadedPaths.length > 0 && await removeCacheObjects(supabase, uploadedPaths)) {
      await markAttemptObjectsDeleted(supabase, lease.attemptId);
    }

    try {
      await failCacheGeneration(
        supabase,
        playlist.id,
        lease.attemptId,
        ownerId,
        failure,
        message,
        attempts,
      );
    } catch {
      // O reconciliador recupera tentativas cujo lease foi perdido antes do registro da falha.
    }

    return {
      ok: false,
      playlistId: playlist.id,
      playlistName: playlist.name,
      attemptId: lease.attemptId,
      correlationId: `cache:${lease.attemptId}`,
      error: message,
      errorCode: failure.code,
      accessMode: failure.accessMode,
      directEligible: failure.directEligible,
      preservedPreviousCache: previousCacheIsUsable,
      message: previousCacheIsUsable
        ? 'A atualização falhou, mas o cache anterior continua ativo.'
        : failure.message,
      attempts,
      elapsedMs: Date.now() - startedAt,
    };
  }
}

serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const body = await readBody(req);
    const action = text(body.action, 'refreshAll');
    const supabase = createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false },
    });

    if (action === 'refresh') {
      const playlistId = text(body.playlistId || body.id);
      if (!playlistId) return json({ error: 'playlistId é obrigatório.' }, 400);

      const { data: playlist, error } = await supabase
        .from('panel_playlists')
        .select('id, name, playlist_url, playlist_type, active, playlist_updated_at, playlist_cache_status, playlist_cache_manifest_path, playlist_cache_channels_path, playlist_cache_movies_path, playlist_cache_series_path, playlist_cache_item_count, tls_mode, tls_allowed_hosts, tls_allow_subdomains, tls_allow_redirect_hosts, tls_scope_cache, connection_profile:panel_playlist_connection_profiles(custom_ca_pem, request_headers, timeout_ms, follow_redirects)')
        .eq('id', playlistId)
        .single();

      if (error) return json({ error: error.message }, 500);
      if (!playlist?.active) return json({ error: 'Lista inativa.' }, 400);
      return json(await refreshPlaylistCache(supabase, playlist));
    }

    if (action === 'refreshAll') {
      const limit = 1;

      const { data: playlists, error } = await supabase
        .from('panel_playlists')
        .select('id, name, playlist_url, playlist_type, active, playlist_updated_at, playlist_cache_updated_at, playlist_cache_status, playlist_cache_manifest_path, playlist_cache_channels_path, playlist_cache_movies_path, playlist_cache_series_path, playlist_cache_item_count, tls_mode, tls_allowed_hosts, tls_allow_subdomains, tls_allow_redirect_hosts, tls_scope_cache, connection_profile:panel_playlist_connection_profiles(custom_ca_pem, request_headers, timeout_ms, follow_redirects)')
        .eq('active', true)
        .order('playlist_cache_updated_at', { ascending: true, nullsFirst: true })
        .limit(limit);

      if (error) return json({ error: error.message }, 500);

      const results = [];
      for (const playlist of playlists ?? []) {
        results.push(await refreshPlaylistCache(supabase, playlist));
      }

      return json({ ok: results.every(result => result.ok), processedLimit: limit, results });
    }

    return json({ error: 'Ação inválida.' }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Falha desconhecida.' }, 500);
  }
});
