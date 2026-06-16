import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { AppLayout, BottomNav, ProgressBar } from '@/components/shared';
import { movieCategories } from '@/data/mock';
import type { Movie } from '@/types';

const MOVIE_RENDER_BATCH_SIZE = 60;

export function MoviesScreen() {
  const { movies, setScreen, setCurrentMovie } = useAppStore();
  const [selectedCategory, setSelectedCategory] = useState('Destaques');
  const [visibleCount, setVisibleCount] = useState(MOVIE_RENDER_BATCH_SIZE);

  const categories = useMemo(() => {
    const importedCategories = movies.map(movie => movie.category).filter(Boolean);
    return ['Destaques', 'Em alta', 'Lançamentos', ...new Set([...movieCategories.filter(c => c !== 'Todos'), ...importedCategories])];
  }, [movies]);

  const filteredMovies = useMemo(() => {
    if (selectedCategory === 'Destaques' || selectedCategory === 'Em alta') return movies;

    if (selectedCategory === 'Lançamentos') {
      return [...movies].sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
    }

    return movies.filter(movie => movie.category === selectedCategory);
  }, [movies, selectedCategory]);

  useEffect(() => {
    setVisibleCount(MOVIE_RENDER_BATCH_SIZE);
  }, [selectedCategory, movies.length]);

  const visibleMovies = useMemo(() => {
    return filteredMovies.slice(0, visibleCount);
  }, [filteredMovies, visibleCount]);

  const canLoadMore = visibleMovies.length < filteredMovies.length;

  const playMovie = (movie: Movie) => {
    setCurrentMovie(movie);
    setScreen('player');
  };

  return (
    <AppLayout>
      <div className="clean-tv-page flex h-full px-14 py-7">
        <BottomNav />

        <main className="min-w-0 flex-1">
          <header className="mb-8 flex items-center gap-10">
            <button
              onClick={() => setScreen('search')}
              className="text-5xl text-white/80 transition-colors hover:text-white"
            >
              ⌕
            </button>

            <nav className="flex min-w-0 items-center gap-9 overflow-hidden">
              {categories.slice(0, 9).map(category => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`rounded-full px-8 py-2 text-2xl font-light transition-all ${
                    selectedCategory === category
                      ? 'border border-white/70 text-white'
                      : 'text-white/42 hover:text-white/75'
                  }`}
                >
                  {category.length > 14 ? `${category.slice(0, 13)}..` : category}
                </button>
              ))}
            </nav>
          </header>

          <div className="mb-8 flex items-center justify-between gap-8 pl-16 pr-8">
            <div className="flex items-center gap-14">
              <button className="border-b border-white/35 pb-2 text-2xl font-light text-white/78">
                Populares
              </button>
              <button className="pb-2 text-2xl font-light text-white/42">
                Favoritos
              </button>
            </div>

            <p className="text-xl font-light text-white/42">
              {visibleMovies.length}/{filteredMovies.length} filme(s)
            </p>
          </div>

          {filteredMovies.length === 0 ? (
            <div className="mt-24 text-center text-white/45">
              <p className="text-5xl">🎬</p>
              <p className="mt-5 text-3xl font-light">Nenhum filme encontrado</p>
            </div>
          ) : (
            <section className="grid max-h-[calc(100vh-165px)] grid-cols-6 gap-x-10 gap-y-9 overflow-y-auto pr-8">
              {visibleMovies.map(movie => (
                <button
                  key={movie.id}
                  onClick={() => playMovie(movie)}
                  className="group text-left"
                >
                  <div className="relative h-[230px] overflow-hidden rounded-xl bg-white/[0.045] transition-transform duration-150 group-hover:scale-[1.035] group-focus:scale-[1.035]">
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
                </button>
              ))}

              {canLoadMore && (
                <button
                  onClick={() => setVisibleCount(count => count + MOVIE_RENDER_BATCH_SIZE)}
                  className="col-span-6 mx-auto mt-4 rounded-md bg-white/[0.08] px-8 py-3 text-xl font-light text-white/75 hover:bg-white/[0.14] hover:text-white"
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
