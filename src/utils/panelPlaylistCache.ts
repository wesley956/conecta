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
}

interface MoviesPart {
  movies?: Movie[];
}

interface SeriesPart {
  series?: Series[];
}

export interface PanelPlaylistCachePartHandlers {
  onChannels?: (payload: { channels: Channel[]; playlists: Playlist[] }) => void;
  onMovies?: (payload: { movies: Movie[] }) => void;
  onSeries?: (payload: { series: Series[] }) => void;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
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
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`${label} respondeu HTTP ${response.status}.`);
  }

  return await response.json() as T;
}

export async function fetchPanelPlaylistCache(url: string): Promise<PanelPlaylistCacheSnapshot> {
  const payload = await fetchJson<Partial<PanelPlaylistCacheSnapshot>>(url, 'Cache do painel');

  const snapshot: PanelPlaylistCacheSnapshot = {
    ...payload,
    channels: asArray<Channel>(payload.channels),
    movies: asArray<Movie>(payload.movies),
    series: asArray<Series>(payload.series),
    playlists: asArray<Playlist>(payload.playlists),
  };

  const total = snapshot.channels.length + snapshot.movies.length + snapshot.series.length;

  if (total === 0) {
    throw new Error('Cache do painel está vazio.');
  }

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
  const channels = asArray<Channel>(channelsPart.channels);
  const playlists = asArray<Playlist>(channelsPart.playlists);

  if (channels.length === 0) {
    throw new Error('Cache de canais está vazio.');
  }

  handlers.onChannels?.({ channels, playlists });

  const moviesPart = await fetchJson<MoviesPart>(parts.moviesUrl || '', 'Cache de filmes');
  const movies = asArray<Movie>(moviesPart.movies);
  handlers.onMovies?.({ movies });

  const seriesPart = await fetchJson<SeriesPart>(parts.seriesUrl || '', 'Cache de séries');
  const series = asArray<Series>(seriesPart.series);
  handlers.onSeries?.({ series });

  return {
    channels,
    movies,
    series,
    playlists,
  };
}
