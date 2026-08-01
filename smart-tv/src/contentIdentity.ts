import type { Channel, Movie, Series } from "./catalog";
import type { SeriesSeasonResponse } from "./deviceSession";

export function contentToken(value?: string | null) {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "sem-nome";
}

export function channelContentKey(channel: Pick<Channel, "name" | "groupTitle">) {
  return `channel:${contentToken(channel.name)}:${contentToken(channel.groupTitle)}`;
}

export function movieContentKey(movie: Pick<Movie, "name" | "year">) {
  return `movie:${contentToken(movie.name)}:${movie.year || 0}`;
}

export function seriesContentKey(series: Pick<Series, "name">) {
  return `series:${contentToken(series.name)}`;
}

export function episodeContentKey(
  seriesName: string,
  season: Pick<SeriesSeasonResponse, "number">,
  episode: { number: number }
) {
  return `episode:${contentToken(seriesName)}:s${season.number}:e${episode.number}`;
}

export function sameContentKey(left?: string, right?: string) {
  return Boolean(left && right && left === right);
}
