import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { AppLayout, BottomNav, ProgressBar } from '@/components/shared';
import type { Series, Movie, Season, Episode } from '@/types';
import {
  canLoadXtreamSeriesFromPlaylist,
  fetchXtreamSeriesCatalog,
  fetchXtreamSeriesEpisodes,
} from '@/utils/xtreamSeries';

const SERIES_RENDER_BATCH_SIZE = 60;

interface CategoryOption {
  id: string;
  name: string;
  count: number;
}

type XtreamSeries = Series & {
  xtreamSeriesId?: string | number;
};

function sortByName(a: CategoryOption, b: CategoryOption) {
  return a.name.localeCompare(b.name, 'pt-BR');
}

export function SeriesScreen() {
  const {
    series,
    playlists,
    setScreen,
    setCurrentMovie,
    setCurrentSeries,
  } = useAppStore();

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [visibleCount, setVisibleCount] = useState(SERIES_RENDER_BATCH_SIZE);
  const [remoteSeries, setRemoteSeries] = useState<XtreamSeries[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [loadingSeriesId, setLoadingSeriesId] = useState<string | null>(null);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  const [seriesDetail, setSeriesDetail] = useState<{ item: XtreamSeries; seasons: Season[] } | null>(null);
  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState<number | null>(null);

  const xtreamPlaylist = useMemo(() => {
    return playlists.find(playlist => canLoadXtreamSeriesFromPlaylist(playlist.url));
  }, [playlists]);

  useEffect(() => {
    let cancelled = false;

    async function loadCatalog() {
      if (!xtreamPlaylist?.url) return;
      if (remoteSeries.length > 0) return;

      setIsLoadingCatalog(true);
      setSeriesError(null);

      try {
        const loaded = await fetchXtreamSeriesCatalog(xtreamPlaylist.url);

        if (!cancelled) {
          setRemoteSeries(loaded);
        }
      } catch (error) {
        if (!cancelled) {
          setSeriesError(error instanceof Error ? error.message : 'Não foi possível carregar séries.');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingCatalog(false);
        }
      }
    }

    void loadCatalog();

    return () => {
      cancelled = true;
    };
  }, [xtreamPlaylist?.url, remoteSeries.length]);

  const allSeries = useMemo<XtreamSeries[]>(() => {
    const map = new Map<string, XtreamSeries>();

    for (const item of series as XtreamSeries[]) {
      map.set(item.id, item);
    }

    for (const item of remoteSeries) {
      map.set(item.id, item);
    }

    return [...map.values()];
  }, [series, remoteSeries]);

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
      { id: 'favorites', name: 'Favoritas', count: allSeries.filter(item => item.isFavorite).length },
      { id: 'continue', name: 'Continuar', count: allSeries.filter(item => (item.progress ?? 0) > 0).length },
      ...[...map.values()].sort(sortByName),
    ];
  }, [allSeries]);

  const filteredSeries = useMemo(() => {
    if (selectedCategory === 'all') return allSeries;
    if (selectedCategory === 'favorites') return allSeries.filter(item => item.isFavorite);
    if (selectedCategory === 'continue') return allSeries.filter(item => (item.progress ?? 0) > 0);

    return allSeries.filter(item => item.category === selectedCategory);
  }, [allSeries, selectedCategory]);

  useEffect(() => {
    setVisibleCount(SERIES_RENDER_BATCH_SIZE);
  }, [selectedCategory, allSeries.length]);

  const visibleSeries = useMemo(() => {
    return filteredSeries.slice(0, visibleCount);
  }, [filteredSeries, visibleCount]);

  const canLoadMore = visibleSeries.length < filteredSeries.length;
  const selectedLabel = categoryOptions.find(category => category.id === selectedCategory)?.name ?? 'Séries';

  // Toca um episódio específico (chamado a partir do seletor de
  // temporada/episódio, nunca mais "no escuro" direto do card da série).
  const playEpisode = (item: Series, season: Season, episode: Episode) => {
    setCurrentSeries(item);

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

  // Ao clicar numa série: 1) já tem temporadas carregadas (lista M3U comum)?
  // mostra o seletor direto. 2) é uma série Xtream sob demanda? busca
  // get_series_info agora e então mostra o seletor. Nunca toca o primeiro
  // episódio automaticamente — o usuário escolhe a temporada/episódio.
  const openSeriesDetail = async (item: XtreamSeries) => {
    setSeriesError(null);

    if (item.seasons.length > 0) {
      setSeriesDetail({ item, seasons: item.seasons });
      setSelectedSeasonNumber(item.seasons[0].number);
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

      setSeriesDetail({ item, seasons });
      setSelectedSeasonNumber(seasons[0].number);
    } catch (error) {
      setSeriesError(error instanceof Error ? error.message : 'Não foi possível carregar episódios.');
    } finally {
      setLoadingSeriesId(null);
    }
  };

  const closeSeriesDetail = () => {
    setSeriesDetail(null);
    setSelectedSeasonNumber(null);
  };

  const selectedSeason = seriesDetail?.seasons.find(season => season.number === selectedSeasonNumber)
    ?? seriesDetail?.seasons[0]
    ?? null;

  return (
    <AppLayout>
      <div className="clean-tv-page flex h-full px-14 py-7">
        <BottomNav />

        <aside className="clean-tv-categories w-[310px] shrink-0 pr-8">
          <button
            onClick={() => setScreen('home')}
            className="mb-7 text-5xl text-white/45 transition-colors hover:text-white"
          >
            ⌂
          </button>

          <h2 className="mb-4 px-5 text-xl font-light text-white/38">Categorias</h2>

          <div className="max-h-[calc(100vh-150px)] space-y-1 overflow-y-auto pr-2">
            {categoryOptions.map(category => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`clean-tv-row flex w-full items-center justify-between gap-4 px-5 py-4 text-left ${
                  selectedCategory === category.id ? 'active' : ''
                }`}
              >
                <span className="truncate text-2xl font-light">{category.name}</span>
                <span className="clean-tv-category-count shrink-0 text-base text-white/35">{category.count}</span>
              </button>
            ))}
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="mb-8 flex items-center justify-between gap-10">
            <div>
              <p className="text-xl font-light text-white/38">Séries</p>
              <h1 className="clean-tv-title text-4xl">{selectedLabel}</h1>
            </div>

            <button
              onClick={() => setScreen('search')}
              className="text-5xl text-white/80 transition-colors hover:text-white"
            >
              ⌕
            </button>
          </header>

          <div className="mb-8 flex items-center justify-between gap-8 pr-8">
            <div>
              <p className="text-2xl font-light text-white/72">
                {isLoadingCatalog ? 'Carregando séries...' : filteredSeries.length === 0 ? 'Nenhum item' : 'Escolha uma série'}
              </p>

              {seriesError && (
                <p className="mt-2 max-w-3xl text-base text-red-200/80">
                  {seriesError}
                </p>
              )}

              {!xtreamPlaylist && allSeries.length === 0 && !isLoadingCatalog && (
                <p className="mt-2 max-w-3xl text-base text-white/38">
                  Séries sob demanda serão carregadas automaticamente quando a lista Xtream estiver disponível.
                </p>
              )}
            </div>

            <p className="text-xl font-light text-white/42">
              {visibleSeries.length}/{filteredSeries.length} série(s)
            </p>
          </div>

          {filteredSeries.length === 0 ? (
            <div className="mt-24 text-center text-white/45">
              <p className="text-5xl">{isLoadingCatalog ? '⏳' : '🎥'}</p>
              <p className="mt-5 text-3xl font-light">
                {isLoadingCatalog ? 'Buscando catálogo de séries' : 'Nenhuma série nesta categoria'}
              </p>
            </div>
          ) : (
            <section className="roneca-media-grid max-h-[calc(100vh-170px)] overflow-y-auto pr-3">
              {visibleSeries.map(item => (
                <button
                  key={item.id}
                  onClick={() => void openSeriesDetail(item)}
                  disabled={loadingSeriesId === item.id}
                  className="group text-left roneca-poster-card disabled:opacity-55"
                >
                  <div className="relative h-[230px] overflow-hidden rounded-2xl bg-white/[0.045] transition-transform duration-150 group-hover:scale-[1.035] group-focus:scale-[1.035]">
                    {item.cover ? (
                      <img src={item.cover} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-gradient-to-br from-white/[0.08] to-white/[0.015] text-6xl">
                        🎥
                      </div>
                    )}

                    {item.progress !== undefined && item.progress > 0 && (
                      <div className="absolute inset-x-0 bottom-0">
                        <ProgressBar progress={item.progress} />
                      </div>
                    )}

                    <span className="absolute bottom-3 left-3 rounded bg-black/45 px-2 py-1 text-xs text-white/70">
                      {item.seasons.length > 0 ? `${item.seasons.length} temp.` : 'Sob demanda'}
                    </span>

                    {loadingSeriesId === item.id && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/65 text-xl text-white">
                        Carregando...
                      </div>
                    )}
                  </div>

                  <p className="mt-3 truncate text-2xl font-light text-white/72 group-hover:text-white">
                    {item.name}
                  </p>
                  <p className="truncate text-sm text-white/32">{item.category}</p>
                </button>
              ))}

              {canLoadMore && (
                <button
                  onClick={() => setVisibleCount(count => count + SERIES_RENDER_BATCH_SIZE)}
                  className="roneca-load-more"
                >
                  Carregar mais {Math.min(SERIES_RENDER_BATCH_SIZE, filteredSeries.length - visibleSeries.length)} série(s)
                </button>
              )}
            </section>
          )}
        </main>

        {seriesDetail && (
          <div
            className="fixed inset-0 z-[120] bg-black/72 backdrop-blur-md"
            onClick={closeSeriesDetail}
          >
            <div
              className="absolute inset-x-4 bottom-4 top-4 overflow-hidden rounded-3xl border border-white/10 bg-[#06111f]/95 shadow-2xl md:inset-x-10"
              onClick={event => event.stopPropagation()}
            >
              <div className="flex h-full min-h-0 flex-col md:flex-row">
                <div className="relative h-48 shrink-0 bg-black/30 md:h-full md:w-[32%]">
                  {seriesDetail.item.cover ? (
                    <img
                      src={seriesDetail.item.cover}
                      alt={seriesDetail.item.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-white/5 text-6xl text-white/30">
                      ▦
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#06111f] via-transparent to-transparent md:bg-gradient-to-r" />
                </div>

                <div className="flex min-h-0 flex-1 flex-col p-5 md:p-7">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-bold uppercase tracking-[0.24em] text-sky-300/80">Série</p>
                      <h2 className="mt-1 line-clamp-2 text-3xl font-black leading-none text-white md:text-5xl">
                        {seriesDetail.item.name}
                      </h2>
                      <p className="mt-2 text-base font-semibold text-white/55">
                        {seriesDetail.item.category || 'Sem categoria'}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={closeSeriesDetail}
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 text-2xl font-bold text-white hover:bg-white/20"
                      aria-label="Fechar detalhes"
                    >
                      ×
                    </button>
                  </div>

                  <p className="mt-4 line-clamp-3 max-w-4xl text-base leading-relaxed text-white/72">
                    {seriesDetail.item.synopsis || 'Sinopse não disponível para esta série.'}
                  </p>

                  {seriesDetail.seasons.length > 1 && (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {seriesDetail.seasons.map(season => (
                        <button
                          key={season.number}
                          type="button"
                          onClick={() => setSelectedSeasonNumber(season.number)}
                          className={`rounded-full px-4 py-2 text-sm font-black transition-colors ${
                            selectedSeasonNumber === season.number
                              ? 'bg-sky-400 text-slate-950'
                              : 'bg-white/[0.07] text-white/65 hover:text-white'
                          }`}
                        >
                          Temporada {season.number}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-2">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="text-xl font-black text-white">Episódios</h3>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {selectedSeason?.episodes.map(episode => (
                        <button
                          key={episode.id}
                          type="button"
                          onClick={() => playEpisode(
                            { ...seriesDetail.item, seasons: seriesDetail.seasons },
                            selectedSeason,
                            episode,
                          )}
                          className="rounded-xl border border-white/10 bg-black/18 p-3 text-left hover:border-sky-300/50 hover:bg-sky-400/10"
                        >
                          <p className="line-clamp-2 text-sm font-black text-white">
                            {episode.number}. {episode.name}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-white/46">
                            {episode.duration && episode.duration !== '—' ? episode.duration : 'Assistir episódio'}
                          </p>
                        </button>
                      ))}
                    </div>

                    {!selectedSeason?.episodes.length && (
                      <p className="px-2 py-6 text-center text-base text-white/40">
                        Nenhum episódio encontrado nesta temporada.
                      </p>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={closeSeriesDetail}
                      className="rounded-full border border-white/12 bg-white/8 px-6 py-3 text-base font-bold text-white hover:bg-white/14"
                    >
                      Voltar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
