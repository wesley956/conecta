import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { AppLayout, BottomNav, ProgressBar } from '@/components/shared';
import type { Movie } from '@/types';

const MOVIE_RENDER_BATCH_SIZE = 60;

interface CategoryOption {
  id: string;
  name: string;
  count: number;
}

function sortByName(a: CategoryOption, b: CategoryOption) {
  return a.name.localeCompare(b.name, 'pt-BR');
}

export function MoviesScreen() {
  const { movies, setScreen, setCurrentMovie, setCurrentSeries } = useAppStore();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [visibleCount, setVisibleCount] = useState(MOVIE_RENDER_BATCH_SIZE);

  const categoryOptions = useMemo<CategoryOption[]>(() => {
    const map = new Map<string, CategoryOption>();

    for (const movie of movies) {
      const name = movie.category || 'Outros';
      const current = map.get(name);

      map.set(name, {
        id: name,
        name,
        count: (current?.count ?? 0) + 1,
      });
    }

    return [
      { id: 'all', name: 'Todos', count: movies.length },
      { id: 'favorites', name: 'Favoritos', count: movies.filter(movie => movie.isFavorite).length },
      { id: 'continue', name: 'Continuar', count: movies.filter(movie => (movie.progress ?? 0) > 0).length },
      ...[...map.values()].sort(sortByName),
    ];
  }, [movies]);

  const filteredMovies = useMemo(() => {
    if (selectedCategory === 'all') return movies;
    if (selectedCategory === 'favorites') return movies.filter(movie => movie.isFavorite);
    if (selectedCategory === 'continue') return movies.filter(movie => (movie.progress ?? 0) > 0);

    return movies.filter(movie => movie.category === selectedCategory);
  }, [movies, selectedCategory]);

  useEffect(() => {
    setVisibleCount(MOVIE_RENDER_BATCH_SIZE);
  }, [selectedCategory, movies.length]);

  const visibleMovies = useMemo(() => {
    return filteredMovies.slice(0, visibleCount);
  }, [filteredMovies, visibleCount]);

  const canLoadMore = visibleMovies.length < filteredMovies.length;
  const selectedLabel = categoryOptions.find(category => category.id === selectedCategory)?.name ?? 'Filmes';

  const playMovie = (movie: Movie) => {
    setCurrentSeries(null);
    setCurrentMovie(movie);
    setScreen('player');
  };

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
              <p className="text-xl font-light text-white/38">Filmes</p>
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
              {filteredMovies.length === 0 ? 'Nenhum item' : 'Escolha um filme'}
            </p>

            <p className="text-xl font-light text-white/42">
              {visibleMovies.length}/{filteredMovies.length} filme(s)
            </p>
          </div>

          {filteredMovies.length === 0 ? (
            <div className="mt-24 text-center text-white/45">
              <p className="text-5xl">🎬</p>
              <p className="mt-5 text-3xl font-light">Nenhum filme nesta categoria</p>
            </div>
          ) : (
            <section className="roneca-media-grid max-h-[calc(100vh-170px)] overflow-y-auto pr-3">
              {visibleMovies.map(movie => (
                <button
                  key={movie.id}
                  onClick={() => playMovie(movie)}
                  className="group text-left roneca-poster-card"
                >
                  <div className="relative h-[230px] overflow-hidden rounded-2xl bg-white/[0.045] transition-transform duration-150 group-hover:scale-[1.035] group-focus:scale-[1.035]">
                    {movie.cover ? (
                      <img src={movie.cover} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-gradient-to-br from-white/[0.08] to-white/[0.015] text-6xl">
                        🎬
                      </div>
                    )}

                    {movie.progress !== undefined && movie.progress > 0 && (
                      <div className="absolute inset-x-0 bottom-0">
                        <ProgressBar progress={movie.progress} />
                      </div>
                    )}
                  </div>

                  <p className="mt-3 truncate text-2xl font-light text-white/72 group-hover:text-white">
                    {movie.name}
                  </p>
                  <p className="truncate text-sm text-white/32">{movie.category}</p>
                </button>
              ))}

              {canLoadMore && (
                <button
                  onClick={() => setVisibleCount(count => count + MOVIE_RENDER_BATCH_SIZE)}
                  className="roneca-load-more"
                >
                  Carregar mais {Math.min(MOVIE_RENDER_BATCH_SIZE, filteredMovies.length - visibleMovies.length)} filme(s)
                </button>
              )}
            </section>
          )}
        </main>
      </div>
    </AppLayout>
  );
}
