import type { Channel, Movie, Playlist, Series } from '@/types';
import type { DevicePanelCacheParts } from '@/utils/devicePanel';

export interface PanelPlaylistCacheSnapshot {
  schemaVersion?: number;
  generatedAt?: string;
  playlistId?: string;
  playlistName?: string;
  playlistUrl?: string;
  channels: Channel[];
  movies: Movie[];
  series: Series[];
  playlists?: Playlist[];
}

interface ChannelsPart {
  channels?: Channel[];
  playlists?: Playlist[];
  data?: Channel[];
  items?: Channel[];
  results?: Channel[];
}

interface MoviesPart {
  movies?: Movie[];
  data?: Movie[];
  items?: Movie[];
  results?: Movie[];
}

interface SeriesPart {
  series?: Series[];
  data?: Series[];
  items?: Series[];
  results?: Series[];
}

export interface PanelPlaylistCachePartHandlers {
  onChannels?: (payload: { channels: Channel[]; playlists: Playlist[] }) => void;
  onMovies?: (payload: { movies: Movie[] }) => void;
  onSeries?: (payload: { series: Series[] }) => void;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function pickArray<T>(payload: unknown, keys: string[]): T[] {
  if (Array.isArray(payload)) return payload as T[];

  const record = asRecord(payload);

  for (const key of keys) {
    const value = record[key];

    if (Array.isArray(value)) return value as T[];
  }

  return [];
}

function totalItems(snapshot: Pick<PanelPlaylistCacheSnapshot, 'channels' | 'movies' | 'series'>) {
  return snapshot.channels.length + snapshot.movies.length + snapshot.series.length;
}

function assertNonEmptyCache(snapshot: Pick<PanelPlaylistCacheSnapshot, 'channels' | 'movies' | 'series'>, label: string) {
  if (totalItems(snapshot) === 0) {
    throw new Error(`${label} está vazio.`);
  }
}

async function fetchJson<T>(url: string, label: string): Promise<T> {
  const cleanUrl = String(url || '').trim();

  if (!/^https?:\/\//i.test(cleanUrl)) {
    throw new Error(`${label} sem URL válida.`);
  }

  const response = await fetch(cleanUrl, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Accept: 'application/json, text/plain, */*',
    },
  });

  const raw = await response.text().catch(() => '');

  if (!response.ok) {
    throw new Error(`${label} respondeu HTTP ${response.status}. ${raw.slice(0, 140)}`.trim());
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`${label} não retornou JSON válido. Início: ${raw.slice(0, 160)}`);
  }
}

export async function fetchPanelPlaylistCache(url: string): Promise<PanelPlaylistCacheSnapshot> {
  const payload = await fetchJson<Partial<PanelPlaylistCacheSnapshot> | any>(url, 'Cache do painel');

  const snapshot: PanelPlaylistCacheSnapshot = {
    ...asRecord(payload),
    channels: pickArray<Channel>(payload, ['channels', 'data', 'items', 'results']),
    movies: pickArray<Movie>(payload, ['movies']),
    series: pickArray<Series>(payload, ['series']),
    playlists: pickArray<Playlist>(payload, ['playlists']),
  };

  assertNonEmptyCache(snapshot, 'Cache do painel');

  return snapshot;
}

export function canUsePanelCacheParts(parts?: DevicePanelCacheParts | null) {
  return Boolean(parts?.channelsUrl && parts?.moviesUrl && parts?.seriesUrl);
}

export async function fetchPanelPlaylistCacheParts(
  parts: DevicePanelCacheParts,
  handlers: PanelPlaylistCachePartHandlers = {},
): Promise<PanelPlaylistCacheSnapshot> {
  if (!canUsePanelCacheParts(parts)) {
    throw new Error('Cache em partes incompleto.');
  }

  const channelsPart = await fetchJson<ChannelsPart>(parts.channelsUrl || '', 'Cache de canais');
  const channels = pickArray<Channel>(channelsPart, ['channels', 'data', 'items', 'results']);
  const playlists = pickArray<Playlist>(channelsPart, ['playlists']);
  handlers.onChannels?.({ channels, playlists });

  const moviesPart = await fetchJson<MoviesPart>(parts.moviesUrl || '', 'Cache de filmes');
  const movies = pickArray<Movie>(moviesPart, ['movies', 'data', 'items', 'results']);
  handlers.onMovies?.({ movies });

  const seriesPart = await fetchJson<SeriesPart>(parts.seriesUrl || '', 'Cache de séries');
  const series = pickArray<Series>(seriesPart, ['series', 'data', 'items', 'results']);
  handlers.onSeries?.({ series });

  const snapshot: PanelPlaylistCacheSnapshot = {
    channels,
    movies,
    series,
    playlists,
  };

  assertNonEmptyCache(snapshot, 'Cache em partes do painel');

  return snapshot;
}
