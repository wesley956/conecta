import { Capacitor, CapacitorHttp } from '@capacitor/core';
import type { Episode, Season, Series } from '@/types';

const REQUEST_HEADERS = {
  Accept: '*/*',
  'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
};

interface XtreamSeriesSource {
  origin: string;
  username: string;
  password: string;
  seriesId: string;
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

export function isXtreamSeriesPlaceholder(url?: string) {
  return Boolean(url && /\.xtream-series(\?|#|$)/i.test(url));
}

function parsePlaceholderUrl(rawUrl: string): XtreamSeriesSource | null {
  try {
    const url = new URL(rawUrl);
    const parts = url.pathname.split('/').filter(Boolean).map(part => decodeURIComponent(part));

    const seriesIndex = parts.findIndex(part => part.toLowerCase() === 'series');

    if (seriesIndex < 0) return null;

    const username = parts[seriesIndex + 1] || '';
    const password = parts[seriesIndex + 2] || '';
    const rawSeriesId = parts[seriesIndex + 3] || '';
    const seriesId = rawSeriesId.replace(/\.xtream-series$/i, '').trim();

    if (!username || !password || !seriesId) return null;

    return {
      origin: url.origin,
      username,
      password,
      seriesId,
    };
  } catch {
    return null;
  }
}

function buildApiUrl(source: XtreamSeriesSource) {
  const params = new URLSearchParams({
    username: source.username,
    password: source.password,
    action: 'get_series_info',
    series_id: source.seriesId,
  });

  return `${source.origin}/player_api.php?${params.toString()}`;
}

function buildEpisodeUrl(source: XtreamSeriesSource, episodeId: string | number, extension?: string) {
  const ext = String(extension || 'mp4').replace('.', '').trim() || 'mp4';

  return `${source.origin}/series/${encodeURIComponent(source.username)}/${encodeURIComponent(source.password)}/${episodeId}.${ext}`;
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
    throw new Error(`A API de séries respondeu HTTP ${status}.`);
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
    throw new Error(`A API de séries respondeu HTTP ${response.status}.`);
  }

  return await response.json() as T;
}

async function fetchJson<T>(url: string): Promise<T> {
  const nativeData = await fetchJsonWithCapacitor<T>(url);

  if (nativeData) {
    return nativeData;
  }

  return await fetchJsonDirect<T>(url);
}

function getEpisodeStreamId(raw: any) {
  return raw?.id ?? raw?.episode_id ?? raw?.stream_id;
}

function getEpisodeExtension(raw: any) {
  return raw?.container_extension ?? raw?.containerExtension ?? 'mp4';
}

function getEpisodeNumber(raw: any, fallback: number) {
  const value = Number(raw?.episode_num ?? raw?.episode_number ?? raw?.number ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function toEpisode(source: XtreamSeriesSource, raw: any, fallbackNumber: number): Episode | null {
  const streamId = getEpisodeStreamId(raw);

  if (!streamId) return null;

  const directSource = typeof raw?.direct_source === 'string' ? raw.direct_source.trim() : '';
  const url = directSource.startsWith('http')
    ? directSource
    : buildEpisodeUrl(source, streamId, getEpisodeExtension(raw));

  const number = getEpisodeNumber(raw, fallbackNumber);
  const title = String(raw?.title ?? raw?.name ?? `Episódio ${number}`).trim();

  return {
    id: `xtream-series-${source.seriesId}-ep-${streamId}`,
    number,
    name: title,
    url,
    playbackUrls: [url],
    duration: String(raw?.info?.duration ?? raw?.duration ?? '—'),
    progress: 0,
  };
}

function normalizeSeasons(source: XtreamSeriesSource, rawEpisodes: any): Season[] {
  if (!rawEpisodes || typeof rawEpisodes !== 'object') return [];

  const seasons: Season[] = [];

  for (const [seasonKey, episodesValue] of Object.entries(rawEpisodes)) {
    const rawList = Array.isArray(episodesValue) ? episodesValue : [];
    const seasonNumber = Number(seasonKey) || seasons.length + 1;

    const episodes = rawList
      .map((item, index) => toEpisode(source, item, index + 1))
      .filter(Boolean) as Episode[];

    if (episodes.length === 0) continue;

    seasons.push({
      number: seasonNumber,
      episodes: episodes.sort((a, b) => a.number - b.number),
    });
  }

  return seasons.sort((a, b) => a.number - b.number);
}

export async function hydrateXtreamSeries(baseSeries: Series): Promise<Series> {
  const firstEpisode = baseSeries.seasons[0]?.episodes[0];

  if (!isXtreamSeriesPlaceholder(firstEpisode?.url)) {
    return baseSeries;
  }

  const source = parsePlaceholderUrl(firstEpisode.url);

  if (!source) {
    throw new Error('Não foi possível ler os dados da série.');
  }

  const data = await fetchJson<any>(buildApiUrl(source));
  const info = data?.info ?? {};
  const seasons = normalizeSeasons(source, data?.episodes);

  if (seasons.length === 0) {
    throw new Error('A API não retornou episódios para esta série.');
  }

  return {
    ...baseSeries,
    name: String(info.name ?? baseSeries.name),
    cover: info.cover || info.movie_image || baseSeries.cover,
    synopsis: info.plot || info.description || baseSeries.synopsis,
    seasons,
  };
}
