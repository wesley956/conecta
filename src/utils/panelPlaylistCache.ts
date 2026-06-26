import type { Channel, Movie, Playlist, Series } from '@/types';

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

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

export async function fetchPanelPlaylistCache(url: string): Promise<PanelPlaylistCacheSnapshot> {
  const cleanUrl = String(url || '').trim();

  if (!/^https?:\/\//i.test(cleanUrl)) {
    throw new Error('Cache do painel sem URL válida.');
  }

  const response = await fetch(cleanUrl, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Cache do painel respondeu HTTP ${response.status}.`);
  }

  const payload = await response.json() as Partial<PanelPlaylistCacheSnapshot>;

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
