import type { Catalog, Channel, Movie, Series } from "../catalog";
import type { SeriesSeasonResponse } from "../deviceSession";
import type { LibraryItem, LibraryKind } from "../mediaLibrary";
import type { PlaybackItem, PlaybackQueueItem } from "../player/types";
import { channelContentKey, episodeContentKey, movieContentKey, seriesContentKey } from "../contentIdentity";

export type MediaCard = {
  id: string;
  contentKey: string;
  kind: LibraryKind;
  name: string;
  image?: string;
  meta: string;
  playback?: PlaybackItem;
  movie?: Movie;
  series?: Series;
  progress?: number;
  duration?: number;
  currentTime?: number;
};

export function playableUrls(url: string, alternatives?: string[]) {
  return Array.from(new Set([...(alternatives || []), url].filter(value => typeof value === "string" && value.trim().length > 0)));
}

export function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
}

export function channelCard(item: Channel): MediaCard {
  const contentKey = channelContentKey(item);
  return {
    id: item.id,
    contentKey,
    kind: "channel",
    name: item.name,
    image: item.logo,
    meta: item.groupTitle || "TV ao vivo",
    playback: {
      id: item.id,
      contentKey,
      name: item.name,
      urls: playableUrls(item.url, item.playbackUrls),
      live: true,
      kind: "channel",
      image: item.logo,
      meta: item.groupTitle || "TV ao vivo"
    }
  };
}

export function movieCard(item: Movie): MediaCard {
  return {
    id: item.id,
    contentKey: movieContentKey(item),
    kind: "movie",
    name: item.name,
    image: item.cover,
    meta: [item.year || "", item.category].filter(Boolean).join(" • "),
    movie: item
  };
}

export function seriesCard(item: Series): MediaCard {
  return {
    id: item.id,
    contentKey: seriesContentKey(item),
    kind: "series",
    name: item.name,
    image: item.cover,
    meta: item.category || "Séries",
    series: item
  };
}

export function queueFromSeasons(seriesName: string, image: string | undefined, seasons: SeriesSeasonResponse[]): PlaybackQueueItem[] {
  return seasons.flatMap(season => season.episodes.map(episode => ({
    id: episode.id,
    contentKey: episodeContentKey(seriesName, season, episode),
    seriesKey: seriesContentKey({ name: seriesName }),
    name: `${seriesName} • T${season.number}E${episode.number}`,
    urls: playableUrls(episode.url, episode.playbackUrls),
    image,
    meta: `${seriesName} • T${season.number}E${episode.number}`,
    seasonNumber: season.number,
    episodeNumber: episode.number
  })));
}

export function resolveLibraryItem(catalog: Catalog, saved: LibraryItem): MediaCard | null {
  if (saved.kind === "channel") {
    const item = catalog.channels.find(value => saved.contentKey ? channelContentKey(value) === saved.contentKey : value.id === saved.id);
    return item ? channelCard(item) : null;
  }
  if (saved.kind === "movie") {
    const item = catalog.movies.find(value => saved.contentKey ? movieContentKey(value) === saved.contentKey : value.id === saved.id);
    return item ? movieCard(item) : null;
  }
  if (saved.kind === "series") {
    const item = catalog.series.find(value => saved.contentKey ? seriesContentKey(value) === saved.contentKey : value.id === saved.id);
    return item ? seriesCard(item) : null;
  }
  for (const series of catalog.series) {
    const queue = queueFromSeasons(series.name, series.cover, series.seasons || []);
    const queueIndex = queue.findIndex(value => saved.contentKey ? value.contentKey === saved.contentKey : value.id === saved.id);
    const episode = queue[queueIndex];
    if (!episode) continue;
    return {
      id: episode.id,
      contentKey: episode.contentKey,
      kind: "episode",
      name: episode.name,
      image: episode.image,
      meta: episode.meta || saved.meta || series.name,
      playback: {
        id: episode.id,
        contentKey: episode.contentKey,
        name: episode.name,
        urls: episode.urls,
        live: false,
        kind: "episode",
        image: episode.image,
        meta: episode.meta,
        seriesQueue: queue,
        seriesQueueIndex: queueIndex
      }
    };
  }
  return null;
}

export function libraryCards(catalog: Catalog, items: LibraryItem[]): MediaCard[] {
  return items.flatMap(saved => {
    const card = resolveLibraryItem(catalog, saved);
    if (!card) return [];
    const progress = saved.duration && saved.currentTime
      ? Math.min(100, Math.max(0, saved.currentTime / saved.duration * 100))
      : 0;
    return [{
      ...card,
      progress,
      duration: saved.duration,
      currentTime: saved.currentTime
    }];
  });
}
