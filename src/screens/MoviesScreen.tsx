import { useMemo, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { AppLayout, Header, CategoryPills, ProgressBar, BottomNav } from '@/components/shared';
import { movieCategories } from '@/data/mock';
import type { Movie } from '@/types';

export function MoviesScreen() {
  const { movies, setScreen, setCurrentMovie, toggleMovieFavorite } = useAppStore();
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [selectedMovie, setSelectedMovie] = useState<string | null>(movies[0]?.id ?? null);

  const filteredMovies = useMemo(() => {
    if (selectedCategory === 'Todos') return movies;
    return movies.filter(movie => movie.category === selectedCategory);
  }, [movies, selectedCategory]);

  const activeMovie = selectedMovie
    ? filteredMovies.find(movie => movie.id === selectedMovie) ?? filteredMovies[0] ?? null
    : filteredMovies[0] ?? null;

  const handlePlay = (movie: Movie) => {
    setCurrentMovie(movie);
    setScreen('player');
  };

  return (
    <AppLayout>
      <div className="clean-tv-page flex h-full flex-col">
        <Header title="Filmes" showBack showSearch onBack={() => setScreen('home')} />

        <main className="grid min-h-0 flex-1 grid-cols-[1fr_.82fr] gap-8">
          <section className="min-h-0">
            <div className="mb-5">
              <p className="text-sm uppercase tracking-[0.34em] text-neon-cyan/75">Catálogo</p>
              <h2 className="text-4xl font-black text-text-white">Filmes autorizados</h2>
            </div>

            <CategoryPills categories={movieCategories} selected={selectedCategory} onSelect={setSelectedCategory} />

            <div className="grid grid-cols-4 gap-5 overflow-y-auto pr-2" style={{ maxHeight: 'calc(100vh - 245px)' }}>
              {filteredMovies.map((movie, index) => (
                <button
                  key={movie.id}
                  onClick={() => setSelectedMovie(movie.id)}
                  onDoubleClick={() => handlePlay(movie)}
                  className={`premium-card overflow-hidden rounded-[1.35rem] text-left transition-all ${
                    activeMovie?.id === movie.id ? 'selected glow-orange' : ''
                  }`}
                >
                  <div className="relative flex h-52 items-center justify-center bg-gradient-to-br from-neon-orange/18 via-white/5 to-neon-cyan/10">
                    <span className="text-6xl">🎬</span>
                    <span className="absolute left-3 top-3 rounded-full bg-black/45 px-2 py-1 text-xs font-black text-white">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    {movie.isFavorite && <span className="absolute right-3 top-3 text-xl">⭐</span>}
                    {movie.progress !== undefined && movie.progress > 0 && (
                      <div className="absolute inset-x-0 bottom-0">
                        <ProgressBar progress={movie.progress} />
                      </div>
                    )}
                  </div>

                  <div className="p-4">
                    <h3 className="truncate text-lg font-black text-text-white">{movie.name}</h3>
                    <div className="mt-2 flex items-center gap-2 text-xs text-text-gray">
                      <span>{movie.year}</span>
                      <span>•</span>
                      <span>{movie.duration}</span>
                    </div>
                    <p className="mt-2 truncate text-xs text-neon-cyan">{movie.category}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <aside>
            <div className="glass-panel rounded-[1.7rem] p-6">
              {activeMovie ? (
                <>
                  <div className="relative mb-5 flex h-72 items-center justify-center overflow-hidden rounded-[1.5rem] border border-neon-orange/30 bg-gradient-to-br from-neon-orange/24 via-white/5 to-neon-cyan/14">
                    <span className="text-8xl">🎬</span>
                    <button
                      onClick={() => toggleMovieFavorite(activeMovie.id)}
                      className={`absolute right-4 top-4 text-3xl ${activeMovie.isFavorite ? 'text-alert-yellow' : 'text-white/35 hover:text-alert-yellow'}`}
                    >
                      {activeMovie.isFavorite ? '⭐' : '☆'}
                    </button>
                  </div>

                  <h3 className="text-4xl font-black leading-tight text-text-white">{activeMovie.name}</h3>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge>{activeMovie.year}</Badge>
                    <Badge>{activeMovie.duration}</Badge>
                    <Badge accent>{activeMovie.category}</Badge>
                  </div>

                  <p className="mt-5 text-sm leading-relaxed text-text-gray">{activeMovie.synopsis}</p>

                  {activeMovie.progress !== undefined && activeMovie.progress > 0 && (
                    <div className="mt-5">
                      <div className="mb-2 flex items-center justify-between text-xs text-text-gray">
                        <span>Continuar assistindo</span>
                        <span className="font-black text-neon-orange">{activeMovie.progress}%</span>
                      </div>
                      <ProgressBar progress={activeMovie.progress} />
                    </div>
                  )}

                  <button
                    onClick={() => handlePlay(activeMovie)}
                    className="btn-neon mt-6 w-full py-4 text-base"
                  >
                    {activeMovie.progress ? 'Continuar assistindo' : 'Assistir agora'}
                  </button>

                  <p className="mt-5 text-center text-[0.68rem] text-text-gray/60">
                    Apenas conteúdo autorizado.
                  </p>
                </>
              ) : (
                <p className="text-text-gray">Selecione um filme.</p>
              )}
            </div>
          </aside>
        </main>

        <BottomNav />
      </div>
    </AppLayout>
  );
}

function Badge({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-black ${
      accent
        ? 'border-neon-cyan/30 bg-neon-cyan/10 text-neon-cyan'
        : 'border-white/10 bg-white/[0.04] text-text-gray'
    }`}>
      {children}
    </span>
  );
}
