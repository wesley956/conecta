import type { Playlist, Series } from '@/types';
import { canLoadXtreamSeriesFromPlaylist, getCachedXtreamSeriesCatalog } from '@/utils/xtreamSeries';

const REMOTE_SERIES_FAVORITES_KEY = 'roneca:series:remoteFavorites';

function readRemoteFavoriteIds() {
  try {
    const raw = window.localStorage.getItem(REMOTE_SERIES_FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []);
  } catch {
    return new Set<string>();
  }
}

function cloneSeries(item: Series): Series {
  return {
    ...item,
    seasons: item.seasons.map(season => ({
      ...season,
      episodes: season.episodes.map(episode => ({ ...episode })),
    })),
  };
}

export function getMergedSeriesCatalog(localSeries: Series[], playlists: Playlist[]) {
  const map = new Map<string, Series>();
  const remoteFavoriteIds = readRemoteFavoriteIds();

  for (const item of localSeries) {
    map.set(item.id, cloneSeries(item));
  }

  const xtreamPlaylist = playlists.find(playlist => canLoadXtreamSeriesFromPlaylist(playlist.url));
  const remoteSeries = getCachedXtreamSeriesCatalog(xtreamPlaylist?.url) ?? [];

  for (const item of remoteSeries) {
    const localItem = map.get(item.id);

    map.set(item.id, {
      ...cloneSeries(item),
      ...localItem,
      isFavorite: Boolean(localItem?.isFavorite || item.isFavorite || remoteFavoriteIds.has(item.id)),
      seasons: localItem?.seasons?.length ? localItem.seasons : item.seasons,
    });
  }

  return [...map.values()];
}
