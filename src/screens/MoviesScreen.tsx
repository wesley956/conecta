import { useState, useMemo } from 'react';
import { useAppStore } from '@/stores/appStore';
import { AppLayout, Header, CategoryPills, NeonCard, ProgressBar, ScrollContainer, BottomNav } from '@/components/shared';
import { movieCategories } from '@/data/mock';

export function MoviesScreen() {
  const { movies, setScreen, setCurrentMovie, toggleMovieFavorite, uiMode } = useAppStore();
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [selectedMovie, setSelectedMovie] = useState<string | null>(null);

  const filteredMovies = useMemo(() => {
    if (selectedCategory === 'Todos') return movies;
    return movies.filter(m => m.category === selectedCategory);
  }, [movies, selectedCategory]);

  const handleMovieClick = (mv: typeof movies[0]) => {
    setCurrentMovie(mv);
    setSelectedMovie(mv.id);
  };

  const handlePlay = (mv: typeof movies[0]) => {
    setCurrentMovie(mv);
    setScreen('player');
  };

  // Movie detail modal
  const detailMovie = selectedMovie ? movies.find(m => m.id === selectedMovie) : null;

  return (
    <AppLayout>
      <Header title="Filmes" showBack showSearch onBack={() => setScreen('home')} />

      <ScrollContainer>
        <CategoryPills categories={movieCategories} selected={selectedCategory} onSelect={setSelectedCategory} />

        {detailMovie ? (
          /* Movie Detail View */
          <div className="animate-fade-in">
            <div className="bg-card border border-border rounded-2xl overflow-hidden mb-4">
              {/* Cover area */}
              <div className="h-48 bg-gradient-to-br from-neon-orange/20 via-bg-dark to-neon-cyan/10 flex items-center justify-center relative">
                <span className="text-6xl">🎬</span>
                <button onClick={() => setSelectedMovie(null)} className="absolute top-4 left-4 w-10 h-10 bg-bg-primary/80 rounded-full flex items-center justify-center text-text-white hover:bg-bg-primary transition-colors">
                  ←
                </button>
              </div>
              <div className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h2 className="text-2xl font-bold text-text-white">{detailMovie.name}</h2>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-text-gray text-sm">{detailMovie.year}</span>
                      <span className="text-text-gray/40">•</span>
                      <span className="text-text-gray text-sm">{detailMovie.duration}</span>
                      <span className="text-text-gray/40">•</span>
                      <span className="text-neon-cyan text-sm">{detailMovie.category}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleMovieFavorite(detailMovie.id)}
                    className={`text-2xl transition-colors ${detailMovie.isFavorite ? 'text-alert-yellow' : 'text-text-gray/30 hover:text-alert-yellow/50'}`}
                  >
                    {detailMovie.isFavorite ? '⭐' : '☆'}
                  </button>
                </div>
                <p className="text-text-gray text-sm leading-relaxed mb-4">{detailMovie.synopsis}</p>
                {detailMovie.progress !== undefined && detailMovie.progress > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-text-gray/60 text-xs">Progresso</span>
                      <span className="text-neon-orange text-xs">{detailMovie.progress}%</span>
                    </div>
                    <ProgressBar progress={detailMovie.progress} />
                  </div>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={() => handlePlay(detailMovie)}
                    className="flex-1 bg-neon-orange text-bg-primary font-bold py-3 rounded-xl hover:bg-neon-orange/80 transition-colors glow-orange"
                  >
                    ▶️ Assistir
                  </button>
                </div>
              </div>
            </div>
            {/* Legal notice */}
            <p className="text-text-gray/40 text-xs text-center mb-4">⚖️ Apenas conteúdo autorizado</p>
          </div>
        ) : (
          /* Movie Grid */
          <div className={`grid ${uiMode === 'tv' ? 'grid-cols-4 gap-4' : 'grid-cols-3 gap-3'} mb-4`}>
            {filteredMovies.map(mv => (
              <NeonCard key={mv.id} onClick={() => handleMovieClick(mv)}>
                <div className="overflow-hidden">
                  {/* Cover */}
                  <div className="h-36 bg-gradient-to-br from-bg-dark to-card flex items-center justify-center relative">
                    <span className="text-4xl">🎬</span>
                    {mv.isFavorite && (
                      <span className="absolute top-2 right-2 text-sm">⭐</span>
                    )}
                    {mv.progress !== undefined && mv.progress > 0 && (
                      <div className="absolute bottom-0 left-0 right-0">
                        <ProgressBar progress={mv.progress} />
                      </div>
                    )}
                  </div>
                  {/* Info */}
                  <div className="p-3">
                    <h3 className="text-text-white text-sm font-medium truncate">{mv.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-text-gray/60 text-xs">{mv.year}</span>
                      <span className="text-text-gray/40 text-xs">•</span>
                      <span className="text-text-gray/60 text-xs">{mv.duration}</span>
                    </div>
                  </div>
                </div>
              </NeonCard>
            ))}
          </div>
        )}
      </ScrollContainer>

      <BottomNav />
    </AppLayout>
  );
}
