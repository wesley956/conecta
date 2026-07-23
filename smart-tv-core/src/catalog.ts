export type ContentKind = "channel" | "movie" | "series" | "episode";

export interface Channel {
  readonly id: string;
  readonly name: string;
  readonly groupTitle: string;
  readonly logoUrl: string | null;
  readonly primaryUrl: string;
  readonly playbackUrls: readonly string[];
}

export interface Movie {
  readonly id: string;
  readonly name: string;
  readonly year: number | null;
  readonly duration: string | null;
  readonly synopsis: string | null;
  readonly coverUrl: string | null;
  readonly category: string;
  readonly primaryUrl: string;
  readonly playbackUrls: readonly string[];
}

export interface Episode {
  readonly id: string;
  readonly number: number;
  readonly name: string;
  readonly duration: string | null;
  readonly primaryUrl: string;
  readonly playbackUrls: readonly string[];
}

export interface Season {
  readonly number: number;
  readonly episodes: readonly Episode[];
}

export interface Series {
  readonly id: string;
  readonly name: string;
  readonly coverUrl: string | null;
  readonly category: string;
  readonly synopsis: string | null;
  readonly seasons: readonly Season[];
  readonly xtreamSeriesId: string | null;
}

export interface Catalog {
  readonly channels: readonly Channel[];
  readonly movies: readonly Movie[];
  readonly series: readonly Series[];
}

export interface CatalogState extends Catalog {
  readonly loadingSection: string | null;
  readonly loaded: boolean;
  readonly error: string | null;
}

export type ContentKey =
  | `channel:${string}`
  | `movie:${string}`
  | `series:${string}`
  | `episode:${string}:${string}`;

export function channelKey(channelId: string): ContentKey {
  return `channel:${channelId}`;
}

export function movieKey(movieId: string): ContentKey {
  return `movie:${movieId}`;
}

export function seriesKey(seriesId: string): ContentKey {
  return `series:${seriesId}`;
}

export function episodeKey(seriesId: string, episodeId: string): ContentKey {
  return `episode:${seriesId}:${episodeId}`;
}
