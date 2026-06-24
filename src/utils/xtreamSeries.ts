import { Capacitor, CapacitorHttp } from '@capacitor/core';
import type { Episode, Season, Series } from '@/types';
import { parseCapacitorJsonOrThrow, parseJsonOrThrow, SeriesApiError } from '@/utils/safeFetchJson';

interface XtreamSourceInfo {
  origin: string;
  username: string;
  password: string;
}

interface XtreamSeriesCatalogItem {
  series_id?: string | number;
  name?: string;
  title?: string;
  cover?: string;
  category_id?: string | number;
  plot?: string;
  cast?: string;
  rating?: string;
}

const REQUEST_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
};

const seriesCatalogCache = new Map<string, Series[]>();
const seriesEpisodesCache = new Map<string, Season[]>();
const SERIES_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function cacheHash(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash).toString(36);
}

function readStorageCache<T>(key: string): T | null {
  try {
    if (typeof window === 'undefined') return null;

    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { savedAt?: number; data?: T };
    const savedAt = Number(parsed.savedAt ?? 0);

    if (!savedAt || Date.now() - savedAt > SERIES_CACHE_TTL_MS) {
      window.sessionStorage.removeItem(key);
      return null;
    }

    return parsed.data ?? null;
  } catch {
    return null;
  }
}

function writeStorageCache<T>(key: string, data: T) {
  try {
    if (typeof window === 'undefined') return;

    window.sessionStorage.setItem(key, JSON.stringify({
      savedAt: Date.now(),
      data,
    }));
  } catch {
    // cache é otimização; se falhar, ignora
  }
}

function isNativeRuntime() {
  if (typeof window === 'undefined') return false;

  const runtime = Capacitor?.getPlatform?.();
  const capacitor = (window as any).Capacitor;

  return (
    runtime === 'android' ||
    runtime === 'ios' ||
    Boolean(Capacitor?.isNativePlatform?.()) ||
    Boolean(capacitor?.isNativePlatform?.())
  );
}

function parseXtreamSource(rawUrl: string): XtreamSourceInfo | null {
  try {
    const url = new URL(rawUrl.trim());
    const username = url.searchParams.get('username') || '';
    const password = url.searchParams.get('password') || '';

    if (!username || !password) return null;

    return {
      origin: url.origin,
      username,
      password,
    };
  } catch {
    return null;
  }
}

function isSupportedXtreamEndpoint(pathname: string) {
  const path = pathname.toLowerCase();

  return path.endsWith('/get.php') || path.endsWith('/player_api.php');
}

export function canLoadXtreamSeriesFromPlaylist(rawUrl?: string | null) {
  if (!rawUrl) return false;

  try {
    const url = new URL(rawUrl.trim());

    return (
      isSupportedXtreamEndpoint(url.pathname) &&
      Boolean(url.searchParams.get('username')) &&
      Boolean(url.searchParams.get('password'))
    );
  } catch {
    return false;
  }
}

function buildXtreamApiUrl(source: XtreamSourceInfo, action: string, extra: Record<string, string | number> = {}) {
  const params = new URLSearchParams({
    username: source.username,
    password: source.password,
    action,
  });

  for (const [key, value] of Object.entries(extra)) {
    params.set(key, String(value));
  }

  return `${source.origin}/player_api.php?${params.toString()}`;
}

async function fetchJsonWithCapacitor<T>(url: string, context: string): Promise<T | null> {
  if (!isNativeRuntime()) return null;

  const response = await CapacitorHttp.get({
    url,
    // Pedimos texto, não 'json': se a API responder HTML, o CapacitorHttp
    // não tenta (e falha) o parse internamente — deixamos nosso
    // parseCapacitorJsonOrThrow detectar isso e gerar uma mensagem clara.
    responseType: 'text' as any,
    headers: REQUEST_HEADERS,
  });

  const status = Number(response.status ?? 0);

  if (status < 200 || status >= 300) {
    throw new SeriesApiError(`${context}: API Xtream respondeu HTTP ${status}.`);
  }

  return parseCapacitorJsonOrThrow<T>(response.data, context);
}

async function fetchJsonDirect<T>(url: string, context: string): Promise<T> {
  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: REQUEST_HEADERS,
  });

  if (!response.ok) {
    throw new SeriesApiError(`${context}: API Xtream respondeu HTTP ${response.status}.`);
  }

  const text = await response.text();
  return parseJsonOrThrow<T>(text, context);
}

async function fetchJson<T>(url: string, context: string): Promise<T> {
  const nativeData = await fetchJsonWithCapacitor<T>(url, context);

  if (nativeData) return nativeData;

  return await fetchJsonDirect<T>(url, context);
}

function buildCategoryMap(categories: any[]) {
  const map = new Map<string, string>();

  for (const category of Array.isArray(categories) ? categories : []) {
    const id = String(category.category_id ?? '').trim();
    const name = String(category.category_name ?? '').trim();

    if (id && name) {
      map.set(id, name);
    }
  }

  return map;
}

function seriesStreamUrl(source: XtreamSourceInfo, episodeId: string | number, extension?: string) {
  const ext = String(extension || 'mp4').replace('.', '').trim() || 'mp4';

  return `${source.origin}/series/${encodeURIComponent(source.username)}/${encodeURIComponent(source.password)}/${episodeId}.${ext}`;
}

function asText(value: unknown, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function normalizeLabel(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanSeriesCategory(value: string) {
  const text = asText(value, 'Sem categoria')
    .replace(/\b(FHD|HD|SD|4K|UHD|DUB|DUBLADO|LEG|LEGENDADO)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return text || 'Sem categoria';
}

function cloneSeasons(seasons: Season[]) {
  return seasons.map(season => ({
    ...season,
    episodes: season.episodes.map(episode => ({ ...episode })),
  }));
}

function cloneSeries(items: Series[]) {
  return items.map(item => ({
    ...item,
    seasons: cloneSeasons(item.seasons),
  }));
}

function sortSeriesList(items: Series[]) {
  return [...items].sort((a, b) => {
    const categoryCompare = normalizeLabel(a.category || '').localeCompare(normalizeLabel(b.category || ''), 'pt-BR');
    if (categoryCompare !== 0) return categoryCompare;

    return normalizeLabel(a.name || '').localeCompare(normalizeLabel(b.name || ''), 'pt-BR');
  });
}

function parseNumber(value: unknown, fallback = 1) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizeEpisodeGroups(info: any): Array<[string, any[]]> {
  const rawEpisodes = info?.episodes ?? {};

  if (Array.isArray(rawEpisodes)) {
    return [['1', rawEpisodes]];
  }

  if (rawEpisodes && typeof rawEpisodes === 'object') {
    return Object.entries(rawEpisodes).flatMap(([seasonKey, value]) => {
      if (Array.isArray(value)) {
        return [[seasonKey, value] as [string, any[]]];
      }

      if (value && typeof value === 'object') {
        const nested = Object.values(value).filter(Array.isArray).flat() as any[];

        return nested.length > 0 ? [[seasonKey, nested] as [string, any[]]] : [];
      }

      return [];
    });
  }

  return [];
}

function cleanEpisodeExtension(value: unknown) {
  const ext = String(value || 'mp4')
    .replace('.', '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
    .trim();

  return ext || 'mp4';
}

function episodeDuration(raw: any) {
  return asText(
    raw?.info?.duration ||
    raw?.info?.duration_secs ||
    raw?.duration ||
    raw?.duration_secs ||
    raw?.durationSec,
    '—'
  );
}

export async function fetchXtreamSeriesCatalog(playlistUrl: string): Promise<Series[]> {
  const cacheKey = playlistUrl.trim();

  const cached = seriesCatalogCache.get(cacheKey);
  if (cached) return cloneSeries(cached);

  const storageKey = `roneca:xtream:series:catalog:${cacheHash(cacheKey)}`;
  const stored = readStorageCache<Series[]>(storageKey);

  if (stored) {
    const cloned = cloneSeries(stored);
    seriesCatalogCache.set(cacheKey, cloneSeries(cloned));
    return cloned;
  }

  const source = parseXtreamSource(playlistUrl);

  if (!source) {
    throw new Error('Lista Xtream inválida para carregar séries.');
  }

  const [categories, seriesItems] = await Promise.all([
    fetchJson<any[]>(buildXtreamApiUrl(source, 'get_series_categories'), 'Categorias de séries').catch(() => []),
    fetchJson<XtreamSeriesCatalogItem[]>(buildXtreamApiUrl(source, 'get_series'), 'Catálogo de séries'),
  ]);

  const categoryMap = buildCategoryMap(categories);

  const loaded = sortSeriesList(
    (Array.isArray(seriesItems) ? seriesItems : [])
      .filter(item => item.series_id)
      .map((item, index) => {
        const seriesId = item.series_id as string | number;
        const name = asText(item.name || item.title, `Série ${seriesId}`);
        const category = cleanSeriesCategory(categoryMap.get(String(item.category_id ?? '')) || 'Sem categoria');

        return {
          id: `xtream-sr-${seriesId}`,
          name,
          cover: asText(item.cover) || undefined,
          category,
          synopsis: asText(item.plot, 'Série autorizada pelo painel.'),
          seasons: [],
          isFavorite: false,
          progress: 0,
          xtreamSeriesId: seriesId,
          xtreamIndex: index,
        } as Series & { xtreamSeriesId: string | number; xtreamIndex: number };
      })
  );

  seriesCatalogCache.set(cacheKey, cloneSeries(loaded));
  writeStorageCache(storageKey, cloneSeries(loaded));

  return cloneSeries(loaded);
}

export async function fetchXtreamSeriesEpisodes(playlistUrl: string, seriesId: string | number): Promise<Season[]> {
  const cacheKey = `${playlistUrl.trim()}::${String(seriesId)}`;

  const cached = seriesEpisodesCache.get(cacheKey);
  if (cached) return cloneSeasons(cached);

  const storageKey = `roneca:xtream:series:episodes:${cacheHash(cacheKey)}`;
  const stored = readStorageCache<Season[]>(storageKey);

  if (stored) {
    const cloned = cloneSeasons(stored);
    seriesEpisodesCache.set(cacheKey, cloneSeasons(cloned));
    return cloned;
  }

  const source = parseXtreamSource(playlistUrl);

  if (!source) {
    throw new Error('Lista Xtream inválida para carregar episódios.');
  }

  const info = await fetchJson<any>(buildXtreamApiUrl(source, 'get_series_info', {
    series_id: seriesId,
  }), 'Episódios da série');

  const seasons: Season[] = [];

  for (const [seasonKey, rawEpisodes] of normalizeEpisodeGroups(info)) {
    const seasonsApi = Array.isArray(info?.seasons) ? info.seasons : [];
    const seasonFromEpisode = rawEpisodes.find(raw => raw?.season || raw?.season_number || raw?.seasonNumber);
    const seasonNumber = parseNumber(
      seasonFromEpisode?.season ??
      seasonFromEpisode?.season_number ??
      seasonFromEpisode?.seasonNumber ??
      seasonsApi.find((season: any) => String(season?.season_number ?? season?.seasonNumber ?? season?.number ?? '') === String(seasonKey))?.season_number ??
      seasonKey,
      seasons.length + 1
    );

    const episodes: Episode[] = [];

    for (const raw of rawEpisodes) {
      const episodeId = raw.id ?? raw.episode_id ?? raw.stream_id;

      if (!episodeId) continue;

      const episodeNumber = parseNumber(raw.episode_num ?? raw.episode_number ?? raw.number, episodes.length + 1);
      const extension = cleanEpisodeExtension(raw.container_extension ?? raw.containerExtension ?? raw.info?.container_extension);
      const url = seriesStreamUrl(source, episodeId, extension);

      episodes.push({
        id: `xtream-sr-${seriesId}-s${seasonNumber}-e${episodeNumber}`,
        number: episodeNumber,
        name: asText(raw.title || raw.name, `Episódio ${episodeNumber}`),
        url,
        playbackUrls: [url],
        duration: episodeDuration(raw),
        progress: 0,
      });
    }

    if (episodes.length > 0) {
      seasons.push({
        number: seasonNumber,
        episodes: episodes.sort((a, b) => a.number - b.number),
      });
    }
  }

  const loaded = seasons.sort((a, b) => a.number - b.number);
  seriesEpisodesCache.set(cacheKey, cloneSeasons(loaded));
  writeStorageCache(storageKey, cloneSeasons(loaded));

  return cloneSeasons(loaded);
}
