import { useState, useMemo } from 'react';
import { useAppStore } from '@/stores/appStore';
import { AppLayout, Header, CategoryPills, NeonCard, ProgressBar, ScrollContainer, BottomNav } from '@/components/shared';

export function SeriesScreen() {
  const { series, setScreen, toggleSeriesFavorite, uiMode } = useAppStore();
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [selectedSeries, setSelectedSeries] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState(0);

  const categories = useMemo(() => {
    const cats = ['Todos', ...new Set(series.map(s => s.category))];
    return cats;
  }, [series]);

  const filteredSeries = useMemo(() => {
    if (selectedCategory === 'Todos') return series;
    return series.filter(s => s.category === selectedCategory);
  }, [series, selectedCategory]);

  const currentSeries = selectedSeries ? series.find(s => s.id === selectedSeries) : null;
  const currentSeason = currentSeries?.seasons[selectedSeason];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlePlayEpisode = (_ep?: any) => {
    setScreen('player');
  };

  return (
    <AppLayout>
      <Header title="Séries" showBack showSearch onBack={() => setScreen('home')} />

      <ScrollContainer>
        {currentSeries ? (
          /* Series Detail */
          <div className="animate-fade-in">
            <div className="bg-card border border-border rounded-2xl overflow-hidden mb-4">
              {/* Cover */}
              <div className="h-44 bg-gradient-to-br from-neon-cyan/20 via-bg-dark to-neon-orange/10 flex items-center justify-center relative">
                <span className="text-6xl">🎥</span>
                <button onClick={() => { setSelectedSeries(null); setSelectedSeason(0); }} className="absolute top-4 left-4 w-10 h-10 bg-bg-primary/80 rounded-full flex items-center justify-center text-text-white hover:bg-bg-primary transition-colors">
                  ←
                </button>
                <button
                  onClick={() => toggleSeriesFavorite(currentSeries.id)}
                  className={`absolute top-4 right-4 text-2xl transition-colors ${currentSeries.isFavorite ? 'text-alert-yellow' : 'text-text-gray/30'}`}
                >
                  {currentSeries.isFavorite ? '⭐' : '☆'}
                </button>
              </div>
              <div className="p-5">
                <h2 className="text-2xl font-bold text-text-white mb-1">{currentSeries.name}</h2>
                <span className="text-neon-cyan text-sm">{currentSeries.category}</span>
                <p className="text-text-gray text-sm leading-relaxed mt-3">{currentSeries.synopsis}</p>
              </div>
            </div>

            {/* Season Tabs */}
            <div className="flex gap-2 mb-4">
              {currentSeries.seasons.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedSeason(i)}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                    selectedSeason === i
                      ? 'bg-neon-orange text-bg-primary'
                      : 'bg-card border border-border text-text-gray hover:border-neon-orange/50'
                  }`}
                >
                  T{s.number}
                </button>
              ))}
            </div>

            {/* Episodes */}
            {currentSeason && (
              <div className="space-y-2 mb-4">
                {currentSeason.episodes.map(ep => (
                  <div
                    key={ep.id}
                    className="bg-card border border-border rounded-xl p-4 flex items-center gap-4 hover:border-neon-orange/50 transition-all cursor-pointer group"
                    onClick={() => handlePlayEpisode(ep)}
                  >
                    <div className="w-10 h-10 rounded-lg bg-bg-dark border border-border flex items-center justify-center flex-shrink-0 group-hover:border-neon-orange transition-colors">
                      <span className="text-text-gray text-sm font-bold">{ep.number}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-text-white text-sm font-medium truncate">{ep.name}</h4>
                      <span className="text-text-gray/60 text-xs">{ep.duration}</span>
                      {ep.progress !== undefined && ep.progress > 0 && (
                        <ProgressBar progress={ep.progress} className="mt-2" />
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      <button className="text-text-gray/40 group-hover:text-neon-orange transition-colors text-xl">
                        ▶
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="text-text-gray/40 text-xs text-center mb-4">⚖️ Apenas conteúdo autorizado</p>
          </div>
        ) : (
          /* Series Grid */
          <>
            <CategoryPills categories={categories} selected={selectedCategory} onSelect={setSelectedCategory} />
            <div className={`grid ${uiMode === 'tv' ? 'grid-cols-4 gap-4' : 'grid-cols-3 gap-3'} mb-4`}>
              {filteredSeries.map(sr => (
                <NeonCard key={sr.id} onClick={() => { setSelectedSeries(sr.id); setSelectedSeason(0); }}>
                  <div className="overflow-hidden">
                    <div className="h-36 bg-gradient-to-br from-bg-dark to-card flex items-center justify-center relative">
                      <span className="text-4xl">🎥</span>
                      {sr.isFavorite && <span className="absolute top-2 right-2 text-sm">⭐</span>}
                      {sr.seasons.length > 0 && (
                        <span className="absolute bottom-2 left-2 bg-bg-primary/80 text-text-gray text-[10px] px-2 py-0.5 rounded">
                          {sr.seasons.length} temporada{sr.seasons.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <div className="p-3">
                      <h3 className="text-text-white text-sm font-medium truncate">{sr.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-neon-cyan text-xs">{sr.category}</span>
                      </div>
                      {sr.progress !== undefined && sr.progress > 0 && (
                        <ProgressBar progress={sr.progress} className="mt-2" />
                      )}
                    </div>
                  </div>
                </NeonCard>
              ))}
            </div>
          </>
        )}
      </ScrollContainer>

      <BottomNav />
    </AppLayout>
  );
}
