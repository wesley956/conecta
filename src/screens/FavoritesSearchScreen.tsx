import { useState, useMemo } from 'react';
import { useAppStore } from '@/stores/appStore';
import { AppLayout, Header, ScrollContainer, BottomNav, NeonCard, ProgressBar, VirtualKeyboard, EmptyState } from '@/components/shared';

// ===== FAVORITES SCREEN =====
export function FavoritesScreen() {
  const { channels, movies, series, setScreen, toggleChannelFavorite, uiMode } = useAppStore();
  const [tab, setTab] = useState<'channels' | 'movies' | 'series'>('channels');

  const favChannels = channels.filter(c => c.isFavorite);
  const favMovies = movies.filter(m => m.isFavorite);
  const favSeries = series.filter(s => s.isFavorite);

  return (
    <AppLayout>
      <Header title="Favoritos" showBack onBack={() => setScreen('home')} />

      <ScrollContainer>
        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {[
            { key: 'channels' as const, label: `📺 Canais (${favChannels.length})` },
            { key: 'movies' as const, label: `🎬 Filmes (${favMovies.length})` },
            { key: 'series' as const, label: `🎥 Séries (${favSeries.length})` },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                tab === t.key ? 'bg-neon-orange text-bg-primary' : 'bg-card border border-border text-text-gray hover:border-neon-orange/50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'channels' && (
          favChannels.length > 0 ? (
            <div className={`grid ${uiMode === 'tv' ? 'grid-cols-3 gap-3' : 'grid-cols-1 gap-2'}`}>
              {favChannels.map(ch => (
                <NeonCard key={ch.id} onClick={() => setScreen('player')} glowColor="cyan">
                  <div className="flex items-center gap-3 p-3">
                    <div className="w-10 h-10 rounded-lg bg-bg-dark border border-border flex items-center justify-center">
                      <span>📺</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-text-white text-sm font-medium truncate">{ch.name}</h3>
                      <span className="text-active-green text-[10px]">● Ao vivo</span>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); toggleChannelFavorite(ch.id); }} className="text-alert-yellow">⭐</button>
                  </div>
                </NeonCard>
              ))}
            </div>
          ) : (
            <EmptyState icon="📺" title="Nenhum canal favorito" description="Favorite canais para vê-los aqui" />
          )
        )}

        {tab === 'movies' && (
          favMovies.length > 0 ? (
            <div className={`grid ${uiMode === 'tv' ? 'grid-cols-4 gap-4' : 'grid-cols-3 gap-3'}`}>
              {favMovies.map(mv => (
                <NeonCard key={mv.id} onClick={() => setScreen('movies')} glowColor="orange">
                  <div className="h-32 bg-gradient-to-br from-bg-dark to-card flex items-center justify-center">
                    <span className="text-3xl">🎬</span>
                  </div>
                  <div className="p-3">
                    <h3 className="text-text-white text-sm font-medium truncate">{mv.name}</h3>
                    <span className="text-text-gray/60 text-xs">{mv.year} • {mv.duration}</span>
                    {mv.progress !== undefined && mv.progress > 0 && <ProgressBar progress={mv.progress} className="mt-2" />}
                  </div>
                </NeonCard>
              ))}
            </div>
          ) : (
            <EmptyState icon="🎬" title="Nenhum filme favorito" description="Favorite filmes para vê-los aqui" />
          )
        )}

        {tab === 'series' && (
          favSeries.length > 0 ? (
            <div className={`grid ${uiMode === 'tv' ? 'grid-cols-4 gap-4' : 'grid-cols-3 gap-3'}`}>
              {favSeries.map(sr => (
                <NeonCard key={sr.id} onClick={() => setScreen('series')} glowColor="cyan">
                  <div className="h-32 bg-gradient-to-br from-bg-dark to-card flex items-center justify-center">
                    <span className="text-3xl">🎥</span>
                  </div>
                  <div className="p-3">
                    <h3 className="text-text-white text-sm font-medium truncate">{sr.name}</h3>
                    <span className="text-neon-cyan text-xs">{sr.category}</span>
                  </div>
                </NeonCard>
              ))}
            </div>
          ) : (
            <EmptyState icon="🎥" title="Nenhuma série favorita" description="Favorite séries para vê-las aqui" />
          )
        )}
      </ScrollContainer>

      <BottomNav />
    </AppLayout>
  );
}

// ===== SEARCH SCREEN =====
export function SearchScreen() {
  const { channels, movies, series, setScreen, searchQuery, setSearchQuery, uiMode } = useAppStore();
  const [query, setQuery] = useState(searchQuery);

  const results = useMemo(() => {
    if (!query.trim()) return { channels: [], movies: [], series: [] };
    const q = query.toLowerCase();
    return {
      channels: channels.filter(c => c.name.toLowerCase().includes(q)),
      movies: movies.filter(m => m.name.toLowerCase().includes(q)),
      series: series.filter(s => s.name.toLowerCase().includes(q)),
    };
  }, [query, channels, movies, series]);

  const totalResults = results.channels.length + results.movies.length + results.series.length;

  return (
    <AppLayout>
      <Header title="Busca" showBack onBack={() => setScreen('home')} />

      <ScrollContainer>
        <VirtualKeyboard value={query} onChange={setQuery} onSearch={() => setSearchQuery(query)} />

        {query.trim() && (
          <div className="mt-6 animate-fade-in">
            <p className="text-text-gray text-sm mb-4">
              {totalResults} resultado{totalResults !== 1 ? 's' : ''} para "{query}"
            </p>

            {results.channels.length > 0 && (
              <div className="mb-6">
                <h3 className="text-text-white font-bold mb-2">📺 Canais ({results.channels.length})</h3>
                <div className="space-y-2">
                  {results.channels.slice(0, 5).map(ch => (
                    <div key={ch.id} onClick={() => setScreen('channels')} className="flex items-center gap-3 bg-card border border-border rounded-lg p-3 cursor-pointer hover:border-neon-orange/50 transition-all">
                      <span>📺</span>
                      <span className="text-text-white text-sm">{ch.name}</span>
                      <span className="text-active-green text-[10px] ml-auto">AO VIVO</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {results.movies.length > 0 && (
              <div className="mb-6">
                <h3 className="text-text-white font-bold mb-2">🎬 Filmes ({results.movies.length})</h3>
                <div className={`grid ${uiMode === 'tv' ? 'grid-cols-4 gap-3' : 'grid-cols-3 gap-2'}`}>
                  {results.movies.slice(0, 6).map(mv => (
                    <NeonCard key={mv.id} onClick={() => setScreen('movies')}>
                      <div className="h-24 bg-gradient-to-br from-bg-dark to-card flex items-center justify-center">
                        <span className="text-2xl">🎬</span>
                      </div>
                      <div className="p-2">
                        <p className="text-text-white text-xs font-medium truncate">{mv.name}</p>
                        <span className="text-text-gray/60 text-[10px]">{mv.year}</span>
                      </div>
                    </NeonCard>
                  ))}
                </div>
              </div>
            )}

            {results.series.length > 0 && (
              <div className="mb-6">
                <h3 className="text-text-white font-bold mb-2">🎥 Séries ({results.series.length})</h3>
                <div className={`grid ${uiMode === 'tv' ? 'grid-cols-4 gap-3' : 'grid-cols-3 gap-2'}`}>
                  {results.series.slice(0, 6).map(sr => (
                    <NeonCard key={sr.id} onClick={() => setScreen('series')} glowColor="cyan">
                      <div className="h-24 bg-gradient-to-br from-bg-dark to-card flex items-center justify-center">
                        <span className="text-2xl">🎥</span>
                      </div>
                      <div className="p-2">
                        <p className="text-text-white text-xs font-medium truncate">{sr.name}</p>
                        <span className="text-neon-cyan text-[10px]">{sr.category}</span>
                      </div>
                    </NeonCard>
                  ))}
                </div>
              </div>
            )}

            {totalResults === 0 && (
              <EmptyState icon="🔍" title="Nenhum resultado" description={`Não encontramos nada para "${query}". Tente outra busca.`} />
            )}
          </div>
        )}
      </ScrollContainer>
    </AppLayout>
  );
}
