import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { AppLayout, BottomNav, ProgressBar } from '@/components/shared';
import type { Movie } from '@/types';
import { Home as HomeIcon, Clapperboard as MovieIcon, Star as StarIcon, Play as PlayIcon } from 'lucide-react';

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
  const { movies, setScreen, setCurrentMovie, setCurrentSeries, toggleMovieFavorite } = useAppStore();
  const [selectedCategory, setSelectedCategory] = useState(() => window.sessionStorage.getItem('roneca:movies:selectedCategory') ?? 'all');
  const [visibleCount, setVisibleCount] = useState(() => Number(window.sessionStorage.getItem('roneca:movies:visibleCount')) || MOVIE_RENDER_BATCH_SIZE);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const movieGridRef = useRef<HTMLElement | null>(null);

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
    const saved = Number(window.sessionStorage.getItem('roneca:movies:visibleCount'));
    setVisibleCount(Number.isFinite(saved) && saved > MOVIE_RENDER_BATCH_SIZE ? saved : MOVIE_RENDER_BATCH_SIZE);
  }, [selectedCategory, movies.length]);

  useEffect(() => {
    window.sessionStorage.setItem('roneca:movies:selectedCategory', selectedCategory);
  }, [selectedCategory]);

  useEffect(() => {
    window.sessionStorage.setItem('roneca:movies:visibleCount', String(visibleCount));
  }, [visibleCount]);

  useEffect(() => {
    const node = movieGridRef.current;
    if (!node) return;

    const key = `roneca:movies:scroll:${selectedCategory}`;
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
  }, [selectedCategory, visibleCount]);

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
            <HomeIcon aria-hidden="true" size={22} strokeWidth={2.4} />
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
              <MovieIcon aria-hidden="true" size={52} strokeWidth={2.2} className="mx-auto" />
              <p className="mt-5 text-3xl font-light">Nenhum filme nesta categoria</p>
            </div>
          ) : (
            <section ref={movieGridRef} className="roneca-media-grid max-h-[calc(100vh-170px)] overflow-y-auto pr-3">
              {visibleMovies.map(movie => (
                <button
                  key={movie.id}
                  onClick={() => setSelectedMovie(movie)}
                  className="group text-left roneca-poster-card"
                >
                  <div className="relative h-[230px] overflow-hidden rounded-2xl bg-white/[0.045] transition-transform duration-150 group-hover:scale-[1.035] group-focus:scale-[1.035]">
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={event => {
                        event.preventDefault();
                        event.stopPropagation();
                        toggleMovieFavorite(movie.id);
                      }}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          event.stopPropagation();
                          toggleMovieFavorite(movie.id);
                        }
                      }}
                      className={`absolute right-3 top-3 z-20 rounded-full border px-3 py-1.5 text-2xl transition ${
                        movie.isFavorite
                          ? 'border-yellow-300/60 bg-yellow-300/20 text-yellow-200'
                          : 'border-white/10 bg-black/35 text-white/55 hover:text-white'
                      }`}
                      aria-label={movie.isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                    >
                      <StarIcon aria-hidden="true" size={22} strokeWidth={2.4} fill={movie.isFavorite ? "currentColor" : "none"} />
                    </span>
                    {movie.cover ? (
                      <img src={movie.cover} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-gradient-to-br from-white/[0.08] to-white/[0.015] text-6xl">
                        <MovieIcon aria-hidden="true" size={18} strokeWidth={2.4} />
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

        {selectedMovie && (
          <div className="fixed inset-0 z-[120] bg-black/72 backdrop-blur-md" onClick={() => setSelectedMovie(null)}>
            <div
              className="absolute inset-x-4 bottom-4 top-4 overflow-hidden rounded-3xl border border-white/10 bg-[#06111f]/95 shadow-2xl md:inset-x-10"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex h-full min-h-0 flex-col md:flex-row">
                <div className="relative h-52 shrink-0 bg-black/30 md:h-full md:w-[34%]">
                  {selectedMovie.cover ? (
                    <img
                      src={selectedMovie.cover}
                      alt={selectedMovie.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-white/5 text-6xl text-white/30">
                      <PlayIcon aria-hidden="true" size={18} strokeWidth={2.4} />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#06111f] via-transparent to-transparent md:bg-gradient-to-r" />
                </div>

                <div className="flex min-h-0 flex-1 flex-col p-5 md:p-7">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-bold uppercase tracking-[0.24em] text-sky-300/80">Filme</p>
                      <h2 className="mt-1 line-clamp-2 text-3xl font-black leading-none text-white md:text-5xl">
                        {selectedMovie.name}
                      </h2>
                      <p className="mt-2 text-base font-semibold text-white/55">
                        {selectedMovie.category || 'Sem categoria'}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedMovie(null)}
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 text-2xl font-bold text-white hover:bg-white/20"
                      aria-label="Fechar detalhes"
                    >
                      ×
                    </button>
                  </div>

                  <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-2">
                    <p className="max-w-3xl text-lg leading-relaxed text-white/76">
                      {selectedMovie.synopsis || 'Sinopse não disponível para este filme. Você ainda pode iniciar a reprodução normalmente.'}
                    </p>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        const movie = selectedMovie;
                        setSelectedMovie(null);
                        playMovie(movie);
                      }}
                      className="rounded-full bg-sky-400 px-7 py-3 text-base font-black text-slate-950 shadow-lg shadow-sky-500/20 hover:bg-sky-300"
                    >
                      <PlayIcon aria-hidden="true" size={18} strokeWidth={2.4} /> Assistir agora
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedMovie(null)}
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
