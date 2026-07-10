import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Film, Search, X } from 'lucide-react';
import { StreamingShell } from '@/components/layout/StreamingShell';
import { CatalogPosterCard } from '@/components/media/CatalogPosterCard';
import { MovieDetailsView } from '@/components/media/MovieDetailsView';
import { useAppStore } from '@/stores/appStore';
import { useLongPressFavorite } from '@/utils/useLongPressFavorite';
import type { Movie } from '@/types';
import '@/styles/movies.css';

const MOVIE_RENDER_BATCH_SIZE = 60;

interface CategoryOption {
  id: string;
  name: string;
  count: number;
}

function sortByName(a: CategoryOption, b: CategoryOption) {
  return a.name.localeCompare(b.name, 'pt-BR');
}

function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function getSafeImageUrl(url?: string) {
  if (!url) return undefined;

  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('http://')) {
    return undefined;
  }

  return url;
}

export function MoviesScreen() {
  const movies = useAppStore(state => state.movies);
  const setScreen = useAppStore(state => state.setScreen);
  const setCurrentMovie = useAppStore(state => state.setCurrentMovie);
  const setCurrentSeries = useAppStore(state => state.setCurrentSeries);
  const toggleMovieFavorite = useAppStore(state => state.toggleMovieFavorite);

  const [selectedCategory, setSelectedCategory] = useState(() => window.sessionStorage.getItem('roneca:movies:selectedCategory') ?? 'all');
  const [searchTerm, setSearchTerm] = useState(() => window.sessionStorage.getItem('roneca:movies:searchTerm') ?? '');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [visibleCount, setVisibleCount] = useState(() => Number(window.sessionStorage.getItem('roneca:movies:visibleCount')) || MOVIE_RENDER_BATCH_SIZE);
  const [selectedMovieId, setSelectedMovieId] = useState<string | null>(null);
  const pageScrollRef = useRef<HTMLDivElement | null>(null);
  const movieFavoriteHold = useLongPressFavorite();

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
      { id: 'favorites', name: 'Minha Lista', count: movies.filter(movie => movie.isFavorite).length },
      { id: 'continue', name: 'Continuar', count: movies.filter(movie => (movie.progress ?? 0) > 0).length },
      ...[...map.values()].sort(sortByName),
    ];
  }, [movies]);

  const filteredMovies = useMemo(() => {
    let result: Movie[];

    if (selectedCategory === 'favorites') {
      result = movies.filter(movie => movie.isFavorite);
    } else if (selectedCategory === 'continue') {
      result = movies.filter(movie => (movie.progress ?? 0) > 0);
    } else if (selectedCategory === 'all') {
      result = movies;
    } else {
      result = movies.filter(movie => movie.category === selectedCategory);
    }

    const query = normalizeSearch(deferredSearchTerm);

    if (!query) return result;

    return result.filter(movie => {
      const searchable = normalizeSearch(`${movie.name} ${movie.category} ${movie.year || ''} ${movie.synopsis || ''}`);
      return searchable.includes(query);
    });
  }, [deferredSearchTerm, movies, selectedCategory]);

  const selectedMovie = useMemo(() => {
    if (!selectedMovieId) return null;
    return movies.find(movie => movie.id === selectedMovieId) ?? null;
  }, [movies, selectedMovieId]);

  const recommendations = useMemo(() => {
    if (!selectedMovie) return [];

    const sameCategory = movies.filter(movie => (
      movie.id !== selectedMovie.id &&
      movie.category === selectedMovie.category
    ));

    const fallback = movies.filter(movie => (
      movie.id !== selectedMovie.id &&
      movie.category !== selectedMovie.category
    ));

    return [...sameCategory, ...fallback].slice(0, 14);
  }, [movies, selectedMovie]);

  const visibleMovies = useMemo(() => {
    return filteredMovies.slice(0, visibleCount);
  }, [filteredMovies, visibleCount]);

  const canLoadMore = visibleMovies.length < filteredMovies.length;
  const selectedLabel = categoryOptions.find(category => category.id === selectedCategory)?.name ?? 'Filmes';

  useEffect(() => {
    if (!categoryOptions.some(category => category.id === selectedCategory)) {
      setSelectedCategory('all');
    }
  }, [categoryOptions, selectedCategory]);

  useEffect(() => {
    setVisibleCount(MOVIE_RENDER_BATCH_SIZE);
  }, [deferredSearchTerm, selectedCategory]);

  useEffect(() => {
    window.sessionStorage.setItem('roneca:movies:selectedCategory', selectedCategory);
  }, [selectedCategory]);

  useEffect(() => {
    window.sessionStorage.setItem('roneca:movies:searchTerm', searchTerm);
  }, [searchTerm]);

  useEffect(() => {
    window.sessionStorage.setItem('roneca:movies:visibleCount', String(visibleCount));
  }, [visibleCount]);

  useEffect(() => {
    const node = pageScrollRef.current;
    if (!node || selectedMovie) return;

    const queryKey = normalizeSearch(deferredSearchTerm) || 'sem-busca';
    const key = `roneca:movies:scroll:${selectedCategory}:${queryKey}`;
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
  }, [deferredSearchTerm, selectedCategory, selectedMovie, visibleCount]);

  useEffect(() => {
    if (selectedMovieId && !selectedMovie) {
      setSelectedMovieId(null);
    }
  }, [selectedMovie, selectedMovieId]);

  const playMovie = (movie: Movie) => {
    setCurrentSeries(null);
    setCurrentMovie(movie);
    setScreen('player');
  };

  return (
    <StreamingShell>
      {selectedMovie ? (
        <MovieDetailsView
          movie={selectedMovie}
          recommendations={recommendations}
          onBack={() => setSelectedMovieId(null)}
          onPlay={() => playMovie(selectedMovie)}
          onToggleFavorite={() => toggleMovieFavorite(selectedMovie.id)}
          onOpenRecommendation={movie => setSelectedMovieId(movie.id)}
        />
      ) : (
        <div ref={pageScrollRef} className="movies-page">
          <div className="movies-page-inner">
            <header className="movies-header">
              <div>
                <p className="stream-kicker">Catálogo</p>
                <h1 className="movies-header-title">Filmes</h1>
                <p className="movies-header-subtitle">
                  {selectedLabel} • {filteredMovies.length} título(s)
                </p>
              </div>

              <div className="movies-header-actions">
                <label className="movies-search-field">
                  <Search aria-hidden="true" size={17} strokeWidth={2.2} />
                  <input
                    value={searchTerm}
                    onChange={event => setSearchTerm(event.target.value)}
                    placeholder="Buscar filme"
                    aria-label="Buscar filme"
                  />
                  {searchTerm ? (
                    <button
                      type="button"
                      className="movies-search-clear"
                      onClick={() => setSearchTerm('')}
                      aria-label="Limpar busca"
                    >
                      <X aria-hidden="true" size={14} strokeWidth={2.4} />
                    </button>
                  ) : null}
                </label>

                <div className="movies-count-chip">
                  <Film aria-hidden="true" size={15} strokeWidth={2.2} />
                  <span>{movies.length} filmes</span>
                </div>
              </div>
            </header>

            <nav className="movies-category-strip" aria-label="Categorias de filmes">
              {categoryOptions.map(category => (
                <button
                  key={category.id}
                  type="button"
                  className={`movies-category-chip ${selectedCategory === category.id ? 'is-active' : ''}`}
                  onClick={() => setSelectedCategory(category.id)}
                  title={category.name}
                >
                  <span>{category.name}</span>
                  <span>{category.count}</span>
                </button>
              ))}
            </nav>

            {filteredMovies.length === 0 ? (
              <section className="movies-empty-state">
                <div>
                  <Film aria-hidden="true" size={46} strokeWidth={1.8} />
                  <h2>Nenhum filme encontrado</h2>
                  <p>
                    {movies.length === 0
                      ? 'Os filmes aparecerão aqui quando o catálogo vinculado estiver carregado.'
                      : 'Tente outra categoria ou limpe o campo de busca.'}
                  </p>
                </div>
              </section>
            ) : (
              <section className="movies-library">
                <div className="movies-library-heading">
                  <div>
                    <h2 className="movies-library-title">{selectedLabel}</h2>
                    <p className="movies-library-subtitle">Pressione para abrir os detalhes. Segure para favoritar.</p>
                  </div>

                  <p className="movies-library-count">
                    Exibindo {visibleMovies.length} de {filteredMovies.length}
                  </p>
                </div>

                <div className="movies-grid">
                  {visibleMovies.map(movie => (
                    <CatalogPosterCard
                      key={movie.id}
                      image={getSafeImageUrl(movie.cover)}
                      title={movie.name}
                      meta={[movie.year > 0 ? movie.year : null, movie.category || null].filter(Boolean).join(' • ') || 'Filme'}
                      favorite={movie.isFavorite}
                      progress={movie.progress}
                      onPointerDown={() => movieFavoriteHold.start(() => toggleMovieFavorite(movie.id))}
                      onPointerUp={() => movieFavoriteHold.cancel()}
                      onPointerLeave={() => movieFavoriteHold.cancel()}
                      onPointerCancel={() => movieFavoriteHold.cancel()}
                      onClick={() => {
                        if (movieFavoriteHold.consume()) return;
                        setSelectedMovieId(movie.id);
                      }}
                    />
                  ))}
                </div>

                {canLoadMore ? (
                  <button
                    type="button"
                    className="movies-load-more"
                    onClick={() => setVisibleCount(count => count + MOVIE_RENDER_BATCH_SIZE)}
                  >
                    Carregar mais {Math.min(MOVIE_RENDER_BATCH_SIZE, filteredMovies.length - visibleMovies.length)} filmes
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
