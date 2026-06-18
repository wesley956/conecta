import { Capacitor, CapacitorHttp } from '@capacitor/core';
import type { Episode, Season, Series } from '@/types';

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

export function canLoadXtreamSeriesFromPlaylist(rawUrl?: string | null) {
  if (!rawUrl) return false;

  try {
    const url = new URL(rawUrl.trim());

    return (
      url.pathname.toLowerCase().endsWith('/get.php') &&
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

async function fetchJsonWithCapacitor<T>(url: string): Promise<T | null> {
  if (!isNativeRuntime()) return null;

  const response = await CapacitorHttp.get({
    url,
    responseType: 'json' as any,
    headers: REQUEST_HEADERS,
  });

  const status = Number(response.status ?? 0);

  if (status < 200 || status >= 300) {
    throw new Error(`API Xtream respondeu HTTP ${status}.`);
  }

  if (typeof response.data === 'string') {
    return JSON.parse(response.data) as T;
  }

  return response.data as T;
}

async function fetchJsonDirect<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: REQUEST_HEADERS,
  });

  if (!response.ok) {
    throw new Error(`API Xtream respondeu HTTP ${response.status}.`);
  }

  return await response.json() as T;
}

async function fetchJson<T>(url: string): Promise<T> {
  const nativeData = await fetchJsonWithCapacitor<T>(url);

  if (nativeData) return nativeData;

  return await fetchJsonDirect<T>(url);
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

function parseNumber(value: unknown, fallback = 1) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export async function fetchXtreamSeriesCatalog(playlistUrl: string): Promise<Series[]> {
  const source = parseXtreamSource(playlistUrl);

  if (!source) {
    throw new Error('Lista Xtream inválida para carregar séries.');
  }

  const [categories, seriesItems] = await Promise.all([
    fetchJson<any[]>(buildXtreamApiUrl(source, 'get_series_categories')).catch(() => []),
    fetchJson<XtreamSeriesCatalogItem[]>(buildXtreamApiUrl(source, 'get_series')),
  ]);

  const categoryMap = buildCategoryMap(categories);

  return (Array.isArray(seriesItems) ? seriesItems : [])
    .filter(item => item.series_id)
    .map((item, index) => {
      const seriesId = item.series_id as string | number;
      const name = asText(item.name || item.title, `Série ${seriesId}`);
      const category = categoryMap.get(String(item.category_id ?? '')) || 'Séries';

      return {
        id: `xtream-sr-${seriesId}`,
        name,
        cover: asText(item.cover) || undefined,
        category,
        synopsis: asText(item.plot, 'Série importada da lista Xtream autorizada.'),
        seasons: [],
        isFavorite: false,
        progress: 0,
        xtreamSeriesId: seriesId,
        xtreamIndex: index,
      } as Series & { xtreamSeriesId: string | number; xtreamIndex: number };
    });
}

export async function fetchXtreamSeriesEpisodes(playlistUrl: string, seriesId: string | number): Promise<Season[]> {
  const source = parseXtreamSource(playlistUrl);

  if (!source) {
    throw new Error('Lista Xtream inválida para carregar episódios.');
  }

  const info = await fetchJson<any>(buildXtreamApiUrl(source, 'get_series_info', {
    series_id: seriesId,
  }));

  const episodesBySeason = info?.episodes ?? {};
  const seasons: Season[] = [];

  for (const [seasonKey, rawEpisodes] of Object.entries(episodesBySeason)) {
    const seasonNumber = parseNumber(seasonKey, seasons.length + 1);
    const episodes: Episode[] = [];

    for (const raw of Array.isArray(rawEpisodes) ? rawEpisodes : []) {
      const episodeId = raw.id ?? raw.episode_id ?? raw.stream_id;

      if (!episodeId) continue;

      const episodeNumber = parseNumber(raw.episode_num ?? raw.episode_number ?? raw.number, episodes.length + 1);
      const extension = raw.container_extension ?? raw.containerExtension ?? 'mp4';
      const url = seriesStreamUrl(source, episodeId, extension);

      episodes.push({
        id: `xtream-sr-${seriesId}-s${seasonNumber}-e${episodeNumber}`,
        number: episodeNumber,
        name: asText(raw.title || raw.name, `Episódio ${episodeNumber}`),
        url,
        playbackUrls: [url],
        duration: asText(raw.info?.duration || raw.duration, '—'),
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

  return seasons.sort((a, b) => a.number - b.number);
}
