import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Clapperboard, LoaderCircle, Search, X } from 'lucide-react';
import { StreamingShell } from '@/components/layout/StreamingShell';
import { CatalogPosterCard } from '@/components/media/CatalogPosterCard';
import { SeriesDetailsView } from '@/components/media/SeriesDetailsView';
import { useAppStore } from '@/stores/appStore';
import type { Episode, Movie, Season, Series } from '@/types';
import {
  canLoadXtreamSeriesFromPlaylist,
  fetchXtreamSeriesCatalog,
  fetchXtreamSeriesEpisodes,
  getCachedXtreamSeriesCatalog,
} from '@/utils/xtreamSeries';
import { useLongPressFavorite } from '@/utils/useLongPressFavorite';
import '@/styles/series.css';

const SERIES_RENDER_BATCH_SIZE = 48;

interface CategoryOption {
  id: string;
  name: string;
  count: number;
}

type XtreamSeries = Series & {
  xtreamSeriesId?: string | number;
};

const remoteSeriesScreenCache = new Map<string, XtreamSeries[]>();
const REMOTE_SERIES_FAVORITES_KEY = 'roneca:series:remoteFavorites';

function readRemoteSeriesFavoriteIds() {
  try {
    const raw = window.localStorage.getItem(REMOTE_SERIES_FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeRemoteSeriesFavoriteIds(ids: string[]) {
  try {
    window.localStorage.setItem(REMOTE_SERIES_FAVORITES_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    // Favoritos remotos são uma melhoria de UX; se falhar, o app continua.
  }
}

function withRemoteFavoriteState(items: XtreamSeries[], favoriteIds: string[]) {
  const favoriteSet = new Set(favoriteIds);

  return items.map(item => ({
    ...item,
    isFavorite: favoriteSet.has(item.id) || Boolean(item.isFavorite),
  }));
}

function cloneRemoteSeriesItems(items: XtreamSeries[]) {
  return items.map(item => ({
    ...item,
    seasons: item.seasons.map(season => ({
      ...season,
      episodes: season.episodes.map(episode => ({ ...episode })),
    })),
  }));
}

function sortByName(a: CategoryOption, b: CategoryOption) {
  return a.name.localeCompare(b.name, 'pt-BR');
}

function normalizeSeriesSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function sortSeriesForDisplay(a: XtreamSeries, b: XtreamSeries) {
  const categoryCompare = normalizeSeriesSearch(a.category || '').localeCompare(
    normalizeSeriesSearch(b.category || ''),
    'pt-BR',
  );

  if (categoryCompare !== 0) return categoryCompare;
  return normalizeSeriesSearch(a.name || '').localeCompare(normalizeSeriesSearch(b.name || ''), 'pt-BR');
}

function getSafeImageUrl(url?: string) {
  if (!url) return undefined;

  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('http://')) {
    return undefined;
  }

  return url;
}

export function SeriesScreen() {
  const series = useAppStore(state => state.series);
  const playlists = useAppStore(state => state.playlists);
  const setScreen = useAppStore(state => state.setScreen);
  const setCurrentMovie = useAppStore(state => state.setCurrentMovie);
  const setCurrentSeries = useAppStore(state => state.setCurrentSeries);
  const toggleSeriesFavorite = useAppStore(state => state.toggleSeriesFavorite);

  const [selectedCategory, setSelectedCategory] = useState(() => window.sessionStorage.getItem('roneca:series:selectedCategory') ?? 'all');
  const [searchTerm, setSearchTerm] = useState(() => window.sessionStorage.getItem('roneca:series:searchTerm') ?? '');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [visibleCount, setVisibleCount] = useState(() => Number(window.sessionStorage.getItem('roneca:series:visibleCount')) || SERIES_RENDER_BATCH_SIZE);
  const [remoteSeries, setRemoteSeries] = useState<XtreamSeries[]>(() => {
    const playlist = playlists.find(item => canLoadXtreamSeriesFromPlaylist(item.url));
    const cached = getCachedXtreamSeriesCatalog(playlist?.url) as XtreamSeries[] | null;
    return withRemoteFavoriteState(cached ? cloneRemoteSeriesItems(cached) : [], readRemoteSeriesFavoriteIds());
  });
  const [remoteFavoriteIds, setRemoteFavoriteIds] = useState<string[]>(readRemoteSeriesFavoriteIds);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [loadingSeriesId, setLoadingSeriesId] = useState<string | null>(null);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [detailSeasons, setDetailSeasons] = useState<Season[]>([]);
  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState<number | null>(null);
  const pageScrollRef = useRef<HTMLDivElement | null>(null);
  const seriesFavoriteHold = useLongPressFavorite();

  const xtreamPlaylist = useMemo(() => {
    return playlists.find(playlist => canLoadXtreamSeriesFromPlaylist(playlist.url));
  }, [playlists]);

  useEffect(() => {
    let cancelled = false;

    async function loadCatalog() {
      const playlistUrl = xtreamPlaylist?.url?.trim();
      if (!playlistUrl) return;

      const cached = remoteSeriesScreenCache.get(playlistUrl)
        || getCachedXtreamSeriesCatalog(playlistUrl) as XtreamSeries[] | null;

      if (cached && cached.length > 0) {
        if (!cancelled) {
          setRemoteSeries(withRemoteFavoriteState(cloneRemoteSeriesItems(cached), remoteFavoriteIds));
          setIsLoadingCatalog(false);
        }
        return;
      }

      setIsLoadingCatalog(true);
      setSeriesError(null);

      try {
        const loaded = await fetchXtreamSeriesCatalog(playlistUrl) as XtreamSeries[];
        remoteSeriesScreenCache.set(playlistUrl, cloneRemoteSeriesItems(loaded));

        if (!cancelled) {
          setRemoteSeries(withRemoteFavoriteState(loaded, remoteFavoriteIds));
        }
      } catch (error) {
        if (!cancelled) {
          setSeriesError(error instanceof Error ? error.message : 'Não foi possível carregar séries.');
        }
      } finally {
        if (!cancelled) setIsLoadingCatalog(false);
      }
    }

    void loadCatalog();

    return () => {
      cancelled = true;
    };
  }, [xtreamPlaylist?.url, remoteFavoriteIds]);

  const allSeries = useMemo<XtreamSeries[]>(() => {
    const map = new Map<string, XtreamSeries>();

    for (const item of series as XtreamSeries[]) {
      map.set(item.id, item);
    }

    for (const item of remoteSeries) {
      map.set(item.id, item);
    }

    return [...map.values()].sort(sortSeriesForDisplay);
  }, [remoteSeries, series]);

  const categoryOptions = useMemo<CategoryOption[]>(() => {
    const map = new Map<string, CategoryOption>();

    for (const item of allSeries) {
      const name = item.category || 'Outros';
      const current = map.get(name);

      map.set(name, {
        id: name,
        name,
        count: (current?.count ?? 0) + 1,
      });
    }

    return [
      { id: 'all', name: 'Todas', count: allSeries.length },
      { id: 'favorites', name: 'Minha Lista', count: allSeries.filter(item => item.isFavorite).length },
      { id: 'continue', name: 'Continuar', count: allSeries.filter(item => (item.progress ?? 0) > 0).length },
      ...[...map.values()].sort(sortByName),
    ];
  }, [allSeries]);

  const filteredSeries = useMemo(() => {
    const byCategory = (() => {
      if (selectedCategory === 'all') return allSeries;
      if (selectedCategory === 'favorites') return allSeries.filter(item => item.isFavorite);
      if (selectedCategory === 'continue') return allSeries.filter(item => (item.progress ?? 0) > 0);
      return allSeries.filter(item => item.category === selectedCategory);
    })();

    const query = normalizeSeriesSearch(deferredSearchTerm);
    if (!query) return byCategory;

    return byCategory.filter(item => {
      const haystack = normalizeSeriesSearch(`${item.name} ${item.category} ${item.synopsis ?? ''}`);
      return haystack.includes(query);
    });
  }, [allSeries, deferredSearchTerm, selectedCategory]);

  const selectedSeries = useMemo(() => {
    if (!selectedSeriesId) return null;
    return allSeries.find(item => item.id === selectedSeriesId) ?? null;
  }, [allSeries, selectedSeriesId]);

  const recommendations = useMemo(() => {
    if (!selectedSeries) return [];

    const sameCategory = allSeries.filter(item => (
      item.id !== selectedSeries.id && item.category === selectedSeries.category
    ));
    const fallback = allSeries.filter(item => (
      item.id !== selectedSeries.id && item.category !== selectedSeries.category
    ));

    return [...sameCategory, ...fallback].slice(0, 14);
  }, [allSeries, selectedSeries]);

  const visibleSeries = useMemo(() => {
    return filteredSeries.slice(0, visibleCount);
  }, [filteredSeries, visibleCount]);

  const canLoadMore = visibleSeries.length < filteredSeries.length;
  const selectedLabel = categoryOptions.find(category => category.id === selectedCategory)?.name ?? 'Séries';

  useEffect(() => {
    if (!categoryOptions.some(category => category.id === selectedCategory)) {
      setSelectedCategory('all');
    }
  }, [categoryOptions, selectedCategory]);

  useEffect(() => {
    setVisibleCount(SERIES_RENDER_BATCH_SIZE);
  }, [deferredSearchTerm, selectedCategory]);

  useEffect(() => {
    window.sessionStorage.setItem('roneca:series:selectedCategory', selectedCategory);
  }, [selectedCategory]);

  useEffect(() => {
    window.sessionStorage.setItem('roneca:series:searchTerm', searchTerm);
  }, [searchTerm]);

  useEffect(() => {
    window.sessionStorage.setItem('roneca:series:visibleCount', String(visibleCount));
  }, [visibleCount]);

  useEffect(() => {
    const node = pageScrollRef.current;
    if (!node || selectedSeries) return;

    const queryKey = normalizeSeriesSearch(deferredSearchTerm) || 'sem-busca';
    const key = `roneca:series:scroll:${selectedCategory}:${queryKey}`;
    const savedScroll = Number(window.sessionStorage.getItem(key));

    if (Number.isFinite(savedScroll) && savedScroll > 0) {
      window.requestAnimationFrame(() => {
        node.scrollTop = savedScroll;
      });
    }

    const saveScroll = () => {
      window.sessionStorage.setItem(key, String(node.scrollTop));
    };

    node.addEventListener('scroll', saveScroll, { passive: true });

    return () => {
      saveScroll();
      node.removeEventListener('scroll', saveScroll);
    };
  }, [deferredSearchTerm, selectedCategory, selectedSeries, visibleCount]);

  useEffect(() => {
    if (selectedSeriesId && !selectedSeries) {
      setSelectedSeriesId(null);
      setDetailSeasons([]);
      setSelectedSeasonNumber(null);
    }
  }, [selectedSeries, selectedSeriesId]);

  const toggleFavoriteSeries = (item: XtreamSeries) => {
    const existsInLocalStore = series.some(seriesItem => seriesItem.id === item.id);

    if (existsInLocalStore) {
      toggleSeriesFavorite(item.id);
      return;
    }

    setRemoteFavoriteIds(current => {
      const isFavorite = current.includes(item.id);
      const next = isFavorite
        ? current.filter(id => id !== item.id)
        : [...current, item.id];

      writeRemoteSeriesFavoriteIds(next);

      setRemoteSeries(currentRemote => {
        const updated = withRemoteFavoriteState(currentRemote, next);

        if (xtreamPlaylist?.url) {
          remoteSeriesScreenCache.set(xtreamPlaylist.url.trim(), cloneRemoteSeriesItems(updated));
        }

        return updated;
      });

      return next;
    });
  };

  const playEpisode = (item: Series, season: Season, episode: Episode) => {
    const itemWithSeasons: Series = { ...item, seasons: detailSeasons.length > 0 ? detailSeasons : item.seasons };
    setCurrentSeries(itemWithSeasons);

    const episodeAsMovie: Movie = {
      id: episode.id,
      name: `${item.name} - T${season.number}E${episode.number}`,
      year: 0,
      duration: episode.duration,
      synopsis: item.synopsis,
      cover: item.cover,
      category: item.category,
      url: episode.url,
      playbackUrls: episode.playbackUrls,
      progress: episode.progress,
      isFavorite: item.isFavorite,
    };

    setCurrentMovie(episodeAsMovie);
    setScreen('player');
  };

  const openSeriesDetail = async (item: XtreamSeries) => {
    if (loadingSeriesId === item.id) return;
    setSeriesError(null);

    if (item.seasons.length > 0) {
      setDetailSeasons(item.seasons);
      setSelectedSeasonNumber(item.seasons[0].number);
      setSelectedSeriesId(item.id);
      return;
    }

    if (!xtreamPlaylist?.url || !item.xtreamSeriesId) {
      setSeriesError('Essa série não possui episódios carregados.');
      return;
    }

    setLoadingSeriesId(item.id);

    try {
      const seasons = await fetchXtreamSeriesEpisodes(xtreamPlaylist.url, item.xtreamSeriesId);

      if (seasons.length === 0) {
        setSeriesError('Nenhum episódio foi encontrado nesta série.');
        return;
      }

      const itemWithSeasons = { ...item, seasons };

      setRemoteSeries(current => {
        const next = current.map(seriesItem => (
          seriesItem.id === item.id ? itemWithSeasons : seriesItem
        ));

        if (xtreamPlaylist?.url) {
          remoteSeriesScreenCache.set(xtreamPlaylist.url.trim(), cloneRemoteSeriesItems(next));
        }

        return next;
      });

      setDetailSeasons(seasons);
      setSelectedSeasonNumber(seasons[0].number);
      setSelectedSeriesId(item.id);
    } catch (error) {
      setSeriesError(error instanceof Error ? error.message : 'Não foi possível carregar episódios.');
    } finally {
      setLoadingSeriesId(null);
    }
  };

  const closeSeriesDetail = () => {
    setSelectedSeriesId(null);
    setDetailSeasons([]);
    setSelectedSeasonNumber(null);
  };

  return (
    <StreamingShell>
      {selectedSeries ? (
        <SeriesDetailsView
          series={{ ...selectedSeries, seasons: detailSeasons }}
          seasons={detailSeasons}
          selectedSeasonNumber={selectedSeasonNumber}
          recommendations={recommendations}
          onBack={closeSeriesDetail}
          onSelectSeason={setSelectedSeasonNumber}
          onPlayEpisode={(season, episode) => playEpisode(selectedSeries, season, episode)}
          onToggleFavorite={() => toggleFavoriteSeries(selectedSeries)}
          onOpenRecommendation={item => void openSeriesDetail(item as XtreamSeries)}
        />
      ) : (
        <div ref={pageScrollRef} className="series-page">
          <div className="series-page-inner">
            <header className="series-header">
              <div>
                <p className="stream-kicker">Catálogo</p>
                <h1 className="series-header-title">Séries</h1>
                <p className="series-header-subtitle">
                  {isLoadingCatalog ? 'Carregando catálogo...' : `${selectedLabel} • ${filteredSeries.length} título(s)`}
                </p>
              </div>

              <div className="series-header-actions">
                <label className="series-search-field">
                  <Search aria-hidden="true" size={17} strokeWidth={2.2} />
                  <input
                    value={searchTerm}
                    onChange={event => setSearchTerm(event.target.value)}
                    placeholder="Buscar série"
                    aria-label="Buscar série"
                  />
                  {searchTerm ? (
                    <button
                      type="button"
                      className="series-search-clear"
                      onClick={() => setSearchTerm('')}
                      aria-label="Limpar busca"
                    >
                      <X aria-hidden="true" size={14} strokeWidth={2.4} />
                    </button>
                  ) : null}
                </label>

                <div className="series-count-chip">
                  {isLoadingCatalog ? (
                    <LoaderCircle aria-hidden="true" size={15} className="animate-spin" />
                  ) : (
                    <Clapperboard aria-hidden="true" size={15} strokeWidth={2.2} />
                  )}
                  <span>{allSeries.length} séries</span>
                </div>
              </div>
            </header>

            <nav className="series-category-strip" aria-label="Categorias de séries">
              {categoryOptions.map(category => (
                <button
                  key={category.id}
                  type="button"
                  className={`series-category-chip ${selectedCategory === category.id ? 'is-active' : ''}`}
                  onClick={() => setSelectedCategory(category.id)}
                  title={category.name}
                >
                  <span>{category.name}</span>
                  <span>{category.count}</span>
                </button>
              ))}
            </nav>

            {seriesError ? (
              <div className="series-alert" role="status">
                <AlertTriangle aria-hidden="true" size={15} strokeWidth={2.2} />
                <span>{seriesError}</span>
              </div>
            ) : null}

            {filteredSeries.length === 0 ? (
              <section className="series-empty-state">
                <div>
                  {isLoadingCatalog ? (
                    <LoaderCircle aria-hidden="true" size={46} className="animate-spin" />
                  ) : (
                    <Clapperboard aria-hidden="true" size={46} strokeWidth={1.8} />
                  )}
                  <h2>{isLoadingCatalog ? 'Buscando catálogo de séries' : 'Nenhuma série encontrada'}</h2>
                  <p>
                    {isLoadingCatalog
                      ? 'Aguarde enquanto o catálogo vinculado é carregado.'
                      : allSeries.length === 0
                        ? 'As séries aparecerão aqui quando a lista vinculada estiver disponível.'
                        : 'Tente outra categoria ou limpe o campo de busca.'}
                  </p>
                </div>
              </section>
            ) : (
              <section className="series-library">
                <div className="series-library-heading">
                  <div>
                    <h2 className="series-library-title">{selectedLabel}</h2>
                    <p className="series-library-subtitle">Pressione para abrir temporadas e episódios. Segure para favoritar.</p>
                  </div>

                  <p className="series-library-count">
                    Exibindo {visibleSeries.length} de {filteredSeries.length}
                  </p>
                </div>

                <div className="series-grid">
                  {visibleSeries.map(item => {
                    const isLoading = loadingSeriesId === item.id;

                    return (
                      <CatalogPosterCard
                        key={item.id}
                        image={getSafeImageUrl(item.cover)}
                        title={item.name}
                        meta={isLoading ? 'Carregando episódios...' : item.category || 'Série'}
                        favorite={item.isFavorite}
                        progress={item.progress}
                        badge={isLoading ? 'Aguarde' : item.seasons.length > 0 ? `${item.seasons.length} temp.` : 'Série'}
                        onPointerDown={() => seriesFavoriteHold.start(() => toggleFavoriteSeries(item))}
                        onPointerUp={() => seriesFavoriteHold.cancel()}
                        onPointerLeave={() => seriesFavoriteHold.cancel()}
                        onPointerCancel={() => seriesFavoriteHold.cancel()}
                        onClick={() => {
                          if (seriesFavoriteHold.consume() || isLoading) return;
                          void openSeriesDetail(item);
                        }}
                      />
                    );
                  })}
                </div>

                {canLoadMore ? (
                  <button
                    type="button"
                    className="series-load-more"
                    onClick={() => setVisibleCount(count => count + SERIES_RENDER_BATCH_SIZE)}
                  >
                    Carregar mais {Math.min(SERIES_RENDER_BATCH_SIZE, filteredSeries.length - visibleSeries.length)} séries
                  </button>
                ) : null}
              </section>
            )}
          </div>
        </div>
      )}
    </StreamingShell>
  );
}
