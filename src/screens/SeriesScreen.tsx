import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { AppLayout, BottomNav, ProgressBar } from '@/components/shared';
import type { Series, Movie } from '@/types';

const SERIES_RENDER_BATCH_SIZE = 60;

interface CategoryOption {
  id: string;
  name: string;
  count: number;
}

function sortByName(a: CategoryOption, b: CategoryOption) {
  return a.name.localeCompare(b.name, 'pt-BR');
}

export function SeriesScreen() {
  const { series, setScreen, setCurrentMovie, setCurrentSeries } = useAppStore();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [visibleCount, setVisibleCount] = useState(SERIES_RENDER_BATCH_SIZE);

  const categoryOptions = useMemo<CategoryOption[]>(() => {
    const map = new Map<string, CategoryOption>();

    for (const item of series) {
      const name = item.category || 'Outros';
      const current = map.get(name);

      map.set(name, {
        id: name,
        name,
        count: (current?.count ?? 0) + 1,
      });
    }

    return [
      { id: 'all', name: 'Todas', count: series.length },
      { id: 'favorites', name: 'Favoritas', count: series.filter(item => item.isFavorite).length },
      { id: 'continue', name: 'Continuar', count: series.filter(item => (item.progress ?? 0) > 0).length },
      ...[...map.values()].sort(sortByName),
    ];
  }, [series]);

  const filteredSeries = useMemo(() => {
    if (selectedCategory === 'all') return series;
    if (selectedCategory === 'favorites') return series.filter(item => item.isFavorite);
    if (selectedCategory === 'continue') return series.filter(item => (item.progress ?? 0) > 0);

    return series.filter(item => item.category === selectedCategory);
  }, [series, selectedCategory]);

  useEffect(() => {
    setVisibleCount(SERIES_RENDER_BATCH_SIZE);
  }, [selectedCategory, series.length]);

  const visibleSeries = useMemo(() => {
    return filteredSeries.slice(0, visibleCount);
  }, [filteredSeries, visibleCount]);

  const canLoadMore = visibleSeries.length < filteredSeries.length;
  const selectedLabel = categoryOptions.find(category => category.id === selectedCategory)?.name ?? 'Séries';

  const playFirstEpisode = (item: Series) => {
    const firstSeason = item.seasons[0];
    const firstEpisode = firstSeason?.episodes[0];

    setCurrentSeries(item);

    if (!firstEpisode) return;

    const episodeAsMovie: Movie = {
      id: firstEpisode.id,
      name: `${item.name} - T${firstSeason.number}E${firstEpisode.number}`,
      year: 0,
      duration: firstEpisode.duration,
      synopsis: item.synopsis,
      cover: item.cover,
      category: item.category,
      url: firstEpisode.url,
      playbackUrls: firstEpisode.playbackUrls,
      progress: firstEpisode.progress,
      isFavorite: item.isFavorite,
    };

    setCurrentMovie(episodeAsMovie);
    setScreen('player');
  };

  return (
    <AppLayout>
      <div className="clean-tv-page flex h-full px-14 py-7">
        <BottomNav />

        <aside className="w-[310px] shrink-0 pr-8">
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
                <span className="shrink-0 text-base text-white/35">{category.count}</span>
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
            <p className="text-2xl font-light text-white/72">
              {filteredSeries.length === 0 ? 'Nenhum item' : 'Escolha uma série'}
            </p>

            <p className="text-xl font-light text-white/42">
              {visibleSeries.length}/{filteredSeries.length} série(s)
            </p>
          </div>

          {filteredSeries.length === 0 ? (
            <div className="mt-24 text-center text-white/45">
              <p className="text-5xl">🎥</p>
              <p className="mt-5 text-3xl font-light">Nenhuma série nesta categoria</p>
            </div>
          ) : (
            <section className="grid max-h-[calc(100vh-165px)] grid-cols-6 gap-x-10 gap-y-9 overflow-y-auto pr-8">
              {visibleSeries.map(item => (
                <button
                  key={item.id}
                  onClick={() => playFirstEpisode(item)}
                  className="group text-left"
                >
                  <div className="relative h-[230px] overflow-hidden rounded-xl bg-white/[0.045] transition-transform duration-150 group-hover:scale-[1.035] group-focus:scale-[1.035]">
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
                      {item.seasons.length} temp.
                    </span>
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
                  className="col-span-6 mx-auto mt-4 rounded-md bg-white/[0.08] px-8 py-3 text-xl font-light text-white/75 hover:bg-white/[0.14] hover:text-white"
                >
                  Carregar mais {Math.min(SERIES_RENDER_BATCH_SIZE, filteredSeries.length - visibleSeries.length)} série(s)
                </button>
              )}
            </section>
          )}
        </main>
      </div>
    </AppLayout>
  );
}
