import type { Episode, Season, Series } from "./catalog.js";

export interface EpisodePosition {
  readonly seriesId: string;
  readonly seasonNumber: number;
  readonly episodeId: string;
}

export function orderedSeasons(series: Series): readonly Season[] {
  return [...series.seasons].sort((left, right) => left.number - right.number);
}

export function initialSeasonNumber(series: Series): number | null {
  return orderedSeasons(series)[0]?.number ?? null;
}

export function resolveSeason(series: Series, seasonNumber: number | null): Season | null {
  const seasons = orderedSeasons(series);
  if (seasons.length === 0) return null;
  return seasons.find((season) => season.number === seasonNumber) ?? seasons[0] ?? null;
}

export function moveSeason(
  series: Series,
  currentSeasonNumber: number,
  direction: -1 | 1,
): Season | null {
  const seasons = orderedSeasons(series);
  const currentIndex = seasons.findIndex((season) => season.number === currentSeasonNumber);
  if (currentIndex < 0) return seasons[0] ?? null;
  const nextIndex = Math.min(Math.max(currentIndex + direction, 0), seasons.length - 1);
  return seasons[nextIndex] ?? null;
}

export function orderedEpisodes(season: Season): readonly Episode[] {
  return [...season.episodes].sort((left, right) => left.number - right.number);
}

export function findEpisode(series: Series, episodeId: string): EpisodePosition | null {
  for (const season of series.seasons) {
    const episode = season.episodes.find((item) => item.id === episodeId);
    if (episode) {
      return {
        seriesId: series.id,
        seasonNumber: season.number,
        episodeId: episode.id,
      };
    }
  }
  return null;
}

export function nextEpisode(series: Series, currentEpisodeId: string): Episode | null {
  const episodes = orderedSeasons(series).flatMap((season) => orderedEpisodes(season));
  const currentIndex = episodes.findIndex((episode) => episode.id === currentEpisodeId);
  return currentIndex >= 0 ? episodes[currentIndex + 1] ?? null : null;
}

export function previousEpisode(series: Series, currentEpisodeId: string): Episode | null {
  const episodes = orderedSeasons(series).flatMap((season) => orderedEpisodes(season));
  const currentIndex = episodes.findIndex((episode) => episode.id === currentEpisodeId);
  return currentIndex > 0 ? episodes[currentIndex - 1] ?? null : null;
}
