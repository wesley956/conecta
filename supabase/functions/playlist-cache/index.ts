import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { safeFetchPlaylistText } from '../_shared/outboundFetch.ts';
import {
  classifyPlaylistCacheFailure,
  type PlaylistCacheAttempt,
} from '../_shared/playlistAccessMode.ts';

const BUCKET = 'playlist-cache';
const CACHE_LOCK_ID = 'global';
const CACHE_LOCK_TTL_MS = 3 * 60_000;

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

function parseXtreamSource(rawUrl: string) {
  try {
    const url = new URL(rawUrl.trim());
    const username = url.searchParams.get('username') || '';
    const password = url.searchParams.get('password') || '';
    const output = url.searchParams.get('output') || 'mpegts';

    if (!username || !password) return null;

    return {
      origin: url.origin,
      username,
      password,
      output,
    };
  } catch {
    return null;
  }
}

function buildXtreamApiUrl(source: ReturnType<typeof parseXtreamSource>, action?: string, extra: Record<string, string | number> = {}) {
  if (!source) throw new Error('Fonte Xtream inválida.');

  const params = new URLSearchParams({
    username: source.username,
    password: source.password,
  });

  if (action) params.set('action', action);

  for (const [key, value] of Object.entries(extra)) {
    params.set(key, String(value));
  }

  return `${source.origin}/player_api.php?${params.toString()}`;
}

async function fetchJson(url: string, label: string) {
  const raw = await safeFetchPlaylistText(url, {
    label,
    timeoutMs: 45_000,
    maxBytes: 30 * 1024 * 1024,
    headers: {
      Accept: 'application/json, text/plain, */*',
      'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
    },
  });

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${label}: resposta não é JSON. Início: ${raw.slice(0, 120)}`);
  }
}

async function fetchText(url: string, label: string) {
  return await safeFetchPlaylistText(url, {
    label,
    timeoutMs: 60_000,
    maxBytes: 80 * 1024 * 1024,
    headers: {
      Accept: '*/*',
      'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
    },
  });
}

async function sha256Short(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);

  return [...new Uint8Array(hash)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 20);
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

async function mapInBatches<T, R>(items: T[], mapper: (item: T) => R, batchSize = 500) {
  const result: R[] = [];

  for (let index = 0; index < items.length; index += 1) {
    result.push(mapper(items[index]));
    if ((index + 1) % batchSize === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  return result;
}

function liveExtension(source: ReturnType<typeof parseXtreamSource>) {
  return source?.output?.toLowerCase() === 'm3u8' ? 'm3u8' : 'ts';
}

function liveUrl(source: ReturnType<typeof parseXtreamSource>, streamId: string | number, extension = liveExtension(source)) {
  if (!source) throw new Error('Fonte Xtream inválida.');
  return `${source.origin}/live/${encodeURIComponent(source.username)}/${encodeURIComponent(source.password)}/${streamId}.${extension}`;
}

function alternateLiveUrls(source: ReturnType<typeof parseXtreamSource>, streamId: string | number) {
  if (!source) throw new Error('Fonte Xtream inválida.');

  const primaryExt = liveExtension(source);
  const fallbackExt = primaryExt === 'm3u8' ? 'ts' : 'm3u8';
  const username = encodeURIComponent(source.username);
  const password = encodeURIComponent(source.password);

  return [
    `${source.origin}/live/${username}/${password}/${streamId}.${primaryExt}`,
    `${source.origin}/live/${username}/${password}/${streamId}.${fallbackExt}`,
    `${source.origin}/${username}/${password}/${streamId}.${primaryExt}`,
    `${source.origin}/${username}/${password}/${streamId}.${fallbackExt}`,
  ];
}

function movieUrl(source: ReturnType<typeof parseXtreamSource>, streamId: string | number, extension?: string) {
  if (!source) throw new Error('Fonte Xtream inválida.');
  const ext = text(extension, 'mp4').replace('.', '') || 'mp4';
  return `${source.origin}/movie/${encodeURIComponent(source.username)}/${encodeURIComponent(source.password)}/${streamId}.${ext}`;
}

async function buildXtreamSnapshot(playlist: any) {
  const source = parseXtreamSource(playlist.playlist_url);
  if (!source) return null;

  const profile = await fetchJson(buildXtreamApiUrl(source), 'Login Xtream');
  const userInfo = profile?.user_info ?? {};

  if (String(userInfo.auth) !== '1') {
    throw new Error('A conta Xtream não autorizou o acesso.');
  }

  const [liveCategories, vodCategories, seriesCategories] = await Promise.all([
    fetchJson(buildXtreamApiUrl(source, 'get_live_categories'), 'Categorias de canais').catch(() => []),
    fetchJson(buildXtreamApiUrl(source, 'get_vod_categories'), 'Categorias de filmes').catch(() => []),
    fetchJson(buildXtreamApiUrl(source, 'get_series_categories'), 'Categorias de séries').catch(() => []),
  ]);

  const liveCategoryMap = buildCategoryMap(liveCategories);
  const vodCategoryMap = buildCategoryMap(vodCategories);
  const seriesCategoryMap = buildCategoryMap(seriesCategories);

  let liveStreams: any = await fetchJson(buildXtreamApiUrl(source, 'get_live_streams'), 'Canais');
  const channels = await mapInBatches(
    (Array.isArray(liveStreams) ? liveStreams : []).filter(item => item.stream_id),
    item => {
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

  let vodStreams: any = await fetchJson(buildXtreamApiUrl(source, 'get_vod_streams'), 'Filmes');
  const movies = await mapInBatches(
    (Array.isArray(vodStreams) ? vodStreams : []).filter(item => item.stream_id),
    item => {
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

  let seriesItems: any = await fetchJson(buildXtreamApiUrl(source, 'get_series'), 'Séries');
  const series = await mapInBatches(
    (Array.isArray(seriesItems) ? seriesItems : []).filter(item => item.series_id),
    item => {
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

  if (movies.length === 0) {
    throw new Error('API Xtream retornou 0 filmes; usando lista M3U completa como fallback.');
  }

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

function findNextPlayableUrl(lines: string[], startIndex: number): { url: string; index: number } | null {
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const candidate = lines[index]?.trim() ?? '';
    if (!candidate) continue;
    if (candidate.startsWith('#EXTINF')) return null;
    if (isPlayableUrl(candidate)) return { url: candidate, index };
  }
  return null;
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

async function buildM3USnapshot(playlist: any) {
  const raw = await fetchText(playlist.playlist_url, 'Lista M3U');

  if (!raw.includes('#EXTINF')) {
    throw new Error('A URL não retornou uma lista M3U válida.');
  }

  const channels: any[] = [];
  const movies: any[] = [];
  const seriesMap = new Map<string, any>();
  const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  let episodeCounter = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith('#EXTINF')) continue;

    const playable = findNextPlayableUrl(lines, index);
    if (!playable) continue;

    const url = playable.url;
    const name = readName(line);
    const groupTitle = readAttr(line, 'group-title') || 'Outros';
    const logo = readAttr(line, 'tvg-logo') || undefined;
    const epgId = readAttr(line, 'tvg-id') || undefined;
    const duration = formatDuration(readExtInfDuration(line));
    const kind = classifyEntry(name, groupTitle, url);
    index = playable.index;

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

async function buildSnapshot(playlist: any) {
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
        ? await buildXtreamSnapshot(playlist)
        : await buildM3USnapshot(playlist);

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
    url: playlist.playlist_url,
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
    playlistUrl: playlist.playlist_url,
    channels: content.channels,
    movies: content.movies,
    series: content.series,
    playlists: [playlistItem],
    cacheAttempts: attempts,
  };
}

async function uploadJsonCachePart(supabase: any, storagePath: string, payload: unknown) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const upload = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, body, {
      contentType: 'application/json',
      upsert: true,
      cacheControl: '3600',
    });

  if (upload.error) throw new Error(upload.error.message);

  return {
    path: storagePath,
    sizeBytes: new TextEncoder().encode(body).byteLength,
  };
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

async function acquireCacheLock(supabase: any, playlistId: string) {
  const staleBefore = new Date(Date.now() - CACHE_LOCK_TTL_MS).toISOString();
  await supabase
    .from('playlist_cache_generation_lock')
    .delete()
    .eq('id', CACHE_LOCK_ID)
    .lt('started_at', staleBefore);

  const token = crypto.randomUUID();
  const { error } = await supabase
    .from('playlist_cache_generation_lock')
    .insert({
      id: CACHE_LOCK_ID,
      playlist_id: playlistId,
      token,
      started_at: new Date().toISOString(),
    });

  if (!error) return { acquired: true, token };
  if (error.code === '23505') return { acquired: false, token: null };
  throw new Error(`Não foi possível reservar a geração do cache: ${error.message}`);
}

async function releaseCacheLock(supabase: any, token: string | null) {
  if (!token) return;
  await supabase
    .from('playlist_cache_generation_lock')
    .delete()
    .eq('id', CACHE_LOCK_ID)
    .eq('token', token);
}

async function refreshPlaylistCache(supabase: any, playlist: any) {
  const startedAt = Date.now();
  const previousCacheIsUsable = hasUsableCache(playlist);
  const lock = await acquireCacheLock(supabase, playlist.id);

  if (!lock.acquired) {
    return {
      ok: false,
      busy: true,
      playlistId: playlist.id,
      playlistName: playlist.name,
      errorCode: 'cache_generation_busy',
      message: 'Outra lista já está gerando cache. Aguarde a conclusão e tente novamente.',
      elapsedMs: Date.now() - startedAt,
    };
  }

  if (!previousCacheIsUsable) {
    await supabase
      .from('panel_playlists')
      .update({
        playlist_cache_status: 'building',
        playlist_cache_error: null,
        playlist_cache_error_code: null,
        playlist_cache_attempts: [],
        playlist_access_mode: 'server_cache',
      })
      .eq('id', playlist.id);
  }

  try {
    const snapshot = await buildSnapshot(playlist);
    const itemCount = snapshot.channels.length + snapshot.movies.length + snapshot.series.length;
    const hashSeed = JSON.stringify({
      playlistId: snapshot.playlistId,
      generatedAt: snapshot.generatedAt,
      channels: snapshot.channels.length,
      movies: snapshot.movies.length,
      series: snapshot.series.length,
      updatedAt: playlist.playlist_updated_at ?? null,
    });
    const hash = await sha256Short(hashSeed);
    const version = `${snapshot.generatedAt}-${hash}`;

    const manifestPath = `${playlist.id}/manifest-${hash}.json`;
    const channelsPath = `${playlist.id}/channels-${hash}.json`;
    const moviesPath = `${playlist.id}/movies-${hash}.json`;
    const seriesPath = `${playlist.id}/series-${hash}.json`;

    const manifest = {
      schemaVersion: snapshot.schemaVersion,
      generatedAt: snapshot.generatedAt,
      playlistId: snapshot.playlistId,
      playlistName: snapshot.playlistName,
      playlistUrl: snapshot.playlistUrl,
      version,
      counts: {
        channels: snapshot.channels.length,
        movies: snapshot.movies.length,
        series: snapshot.series.length,
        total: itemCount,
      },
      files: {
        manifest: manifestPath,
        channels: channelsPath,
        movies: moviesPath,
        series: seriesPath,
      },
    };

    const channelsPayload = {
      schemaVersion: snapshot.schemaVersion,
      generatedAt: snapshot.generatedAt,
      playlistId: snapshot.playlistId,
      playlistName: snapshot.playlistName,
      playlistUrl: snapshot.playlistUrl,
      playlists: snapshot.playlists,
      channels: snapshot.channels,
    };

    const moviesPayload = {
      schemaVersion: snapshot.schemaVersion,
      generatedAt: snapshot.generatedAt,
      playlistId: snapshot.playlistId,
      playlistName: snapshot.playlistName,
      playlistUrl: snapshot.playlistUrl,
      movies: snapshot.movies,
    };

    const seriesPayload = {
      schemaVersion: snapshot.schemaVersion,
      generatedAt: snapshot.generatedAt,
      playlistId: snapshot.playlistId,
      playlistName: snapshot.playlistName,
      playlistUrl: snapshot.playlistUrl,
      series: snapshot.series,
    };

    const manifestUpload = await uploadJsonCachePart(supabase, manifestPath, manifest);
    const channelsUpload = await uploadJsonCachePart(supabase, channelsPath, channelsPayload);
    const moviesUpload = await uploadJsonCachePart(supabase, moviesPath, moviesPayload);
    const seriesUpload = await uploadJsonCachePart(supabase, seriesPath, seriesPayload);

    const sizeBytes = manifestUpload.sizeBytes + channelsUpload.sizeBytes + moviesUpload.sizeBytes + seriesUpload.sizeBytes;

    await supabase
      .from('panel_playlists')
      .update({
        playlist_cache_status: 'ready',
        playlist_cache_path: manifestUpload.path,
        playlist_cache_manifest_path: manifestUpload.path,
        playlist_cache_channels_path: channelsUpload.path,
        playlist_cache_movies_path: moviesUpload.path,
        playlist_cache_series_path: seriesUpload.path,
        playlist_cache_version: version,
        playlist_cache_updated_at: snapshot.generatedAt,
        playlist_cache_item_count: itemCount,
        playlist_cache_size_bytes: sizeBytes,
        playlist_cache_error: null,
        playlist_cache_error_code: null,
        playlist_cache_attempts: snapshot.cacheAttempts,
        playlist_access_mode: 'server_cache',
      })
      .eq('id', playlist.id);

    return {
      ok: true,
      playlistId: playlist.id,
      playlistName: playlist.name,
      itemCount,
      channels: snapshot.channels.length,
      movies: snapshot.movies.length,
      series: snapshot.series.length,
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
    const message = error instanceof Error ? error.message : 'Falha desconhecida.';
    const attempts = error instanceof PlaylistBuildError
      ? error.attempts
      : [{ method: 'm3u', status: 'error', error: message }] as PlaylistCacheAttempt[];
    const failure = classifyPlaylistCacheFailure(attempts, playlist.playlist_type);

    await supabase
      .from('panel_playlists')
      .update({
        playlist_cache_status: previousCacheIsUsable ? 'ready' : 'error',
        playlist_cache_error: message,
        playlist_cache_error_code: failure.code,
        playlist_cache_attempts: attempts,
        playlist_access_mode: previousCacheIsUsable ? 'server_cache' : failure.accessMode,
      })
      .eq('id', playlist.id);

    return {
      ok: false,
      playlistId: playlist.id,
      playlistName: playlist.name,
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
  } finally {
    await releaseCacheLock(supabase, lock.token);
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
        .select('id, name, playlist_url, playlist_type, active, playlist_updated_at, playlist_cache_status, playlist_cache_manifest_path, playlist_cache_channels_path, playlist_cache_movies_path, playlist_cache_series_path, playlist_cache_item_count')
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
        .select('id, name, playlist_url, playlist_type, active, playlist_updated_at, playlist_cache_updated_at, playlist_cache_status, playlist_cache_manifest_path, playlist_cache_channels_path, playlist_cache_movies_path, playlist_cache_series_path, playlist_cache_item_count')
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
