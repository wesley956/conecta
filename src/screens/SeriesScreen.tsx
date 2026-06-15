import { useMemo, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { AppLayout, Header, CategoryPills, ProgressBar, BottomNav } from '@/components/shared';
import type { Episode, Series } from '@/types';

export function SeriesScreen() {
  const { series, setScreen, toggleSeriesFavorite } = useAppStore();
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [selectedSeries, setSelectedSeries] = useState<string | null>(series[0]?.id ?? null);
  const [selectedSeason, setSelectedSeason] = useState(0);

  const categories = useMemo(() => ['Todos', ...new Set(series.map(item => item.category))], [series]);

  const filteredSeries = useMemo(() => {
    if (selectedCategory === 'Todos') return series;
    return series.filter(item => item.category === selectedCategory);
  }, [series, selectedCategory]);

  const activeSeries = selectedSeries
    ? filteredSeries.find(item => item.id === selectedSeries) ?? filteredSeries[0] ?? null
    : filteredSeries[0] ?? null;

  const currentSeason = activeSeries?.seasons[selectedSeason] ?? activeSeries?.seasons[0] ?? null;

  const handlePlayEpisode = (_series: Series, _episode: Episode) => {
    setScreen('player');
  };

  return (
    <AppLayout>
      <div className="flex h-full flex-col">
        <Header title="Séries" showBack showSearch onBack={() => setScreen('home')} />

        <main className="grid min-h-0 flex-1 grid-cols-[1fr_.9fr] gap-8">
          <section className="min-h-0">
            <div className="mb-5">
              <p className="text-sm uppercase tracking-[0.34em] text-neon-cyan/75">Temporadas</p>
              <h2 className="text-4xl font-black text-text-white">Séries autorizadas</h2>
            </div>

            <CategoryPills categories={categories} selected={selectedCategory} onSelect={setSelectedCategory} />

            <div className="grid grid-cols-4 gap-5 overflow-y-auto pr-2" style={{ maxHeight: 'calc(100vh - 245px)' }}>
              {filteredSeries.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setSelectedSeries(item.id);
                    setSelectedSeason(0);
                  }}
                  className={`premium-card overflow-hidden rounded-[1.35rem] text-left transition-all ${
                    activeSeries?.id === item.id ? 'selected glow-orange' : ''
                  }`}
                >
                  <div className="relative flex h-52 items-center justify-center bg-gradient-to-br from-neon-cyan/20 via-white/5 to-neon-orange/12">
                    <span className="text-6xl">🎥</span>
                    {item.isFavorite && <span className="absolute right-3 top-3 text-xl">⭐</span>}
                    <span className="absolute bottom-3 left-3 rounded-full border border-white/10 bg-black/45 px-3 py-1 text-xs font-black text-white">
                      {item.seasons.length} temporada{item.seasons.length !== 1 ? 's' : ''}
                    </span>
                    {item.progress !== undefined && item.progress > 0 && (
                      <div className="absolute inset-x-0 bottom-0">
                        <ProgressBar progress={item.progress} />
                      </div>
                    )}
                  </div>

                  <div className="p-4">
                    <h3 className="truncate text-lg font-black text-text-white">{item.name}</h3>
                    <p className="mt-2 truncate text-xs font-bold text-neon-cyan">{item.category}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <aside className="min-h-0">
            <div className="glass-panel flex h-full flex-col rounded-[1.7rem] p-6">
              {activeSeries ? (
                <>
                  <div className="relative mb-5 flex h-52 items-center justify-center overflow-hidden rounded-[1.5rem] border border-neon-cyan/25 bg-gradient-to-br from-neon-cyan/18 via-white/5 to-neon-orange/12">
                    <span className="text-8xl">🎥</span>
                    <button
                      onClick={() => toggleSeriesFavorite(activeSeries.id)}
                      className={`absolute right-4 top-4 text-3xl ${activeSeries.isFavorite ? 'text-alert-yellow' : 'text-white/35 hover:text-alert-yellow'}`}
                    >
                      {activeSeries.isFavorite ? '⭐' : '☆'}
                    </button>
                  </div>

                  <h3 className="text-4xl font-black leading-tight text-text-white">{activeSeries.name}</h3>
                  <p className="mt-2 text-sm font-bold text-neon-cyan">{activeSeries.category}</p>
                  <p className="mt-4 text-sm leading-relaxed text-text-gray">{activeSeries.synopsis}</p>

                  <div className="mt-5 flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                    {activeSeries.seasons.map((season, index) => (
                      <button
                        key={season.number}
                        onClick={() => setSelectedSeason(index)}
                        className={`rounded-xl border px-4 py-2 text-sm font-black transition-all ${
                          selectedSeason === index
                            ? 'border-neon-orange bg-neon-orange/14 text-neon-orange'
                            : 'border-white/10 bg-white/[0.04] text-text-gray hover:border-neon-orange/55 hover:text-text-white'
                        }`}
                      >
                        Temporada {season.number}
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
                    {currentSeason?.episodes.map(episode => (
                      <button
                        key={episode.id}
                        onClick={() => handlePlayEpisode(activeSeries, episode)}
                        className="premium-card mb-3 flex w-full items-center gap-4 rounded-2xl p-4 text-left transition-all hover:border-neon-orange/70"
                      >
                        <span className="flex h-14 w-14 items-center justify-center rounded-xl border border-neon-orange/30 bg-neon-orange/10 text-xl font-black text-neon-orange">
                          {episode.number}
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-base font-black text-text-white">{episode.name}</span>
                          <span className="text-xs text-text-gray">{episode.duration}</span>
                          {episode.progress !== undefined && episode.progress > 0 && (
                            <ProgressBar progress={episode.progress} className="mt-2" />
                          )}
                        </span>

                        <span className="text-2xl text-neon-orange">▶</span>
                      </button>
                    ))}
                  </div>

                  <p className="mt-3 text-center text-[0.68rem] text-text-gray/60">
                    Apenas conteúdo autorizado.
                  </p>
                </>
              ) : (
                <p className="text-text-gray">Selecione uma série.</p>
              )}
            </div>
          </aside>
        </main>

        <BottomNav />
      </div>
    </AppLayout>
  );
}
