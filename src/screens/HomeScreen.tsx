import { useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { AppLayout, Header, NeonCard, SectionTitle, ProgressBar, LegalBanner, BottomNav, ScrollContainer } from '@/components/shared';
import type { AppState } from '@/types';

export function HomeScreen() {
  const { setScreen, watchHistory, channels, movies, series, uiMode, expiresAt, daysRemaining } = useAppStore();
  const [selectedCard, setSelectedCard] = useState(0);

  const mainCards: { screen: AppState; icon: string; title: string; desc: string; color: string }[] = [
    { screen: 'channels', icon: '📺', title: 'Canais ao Vivo', desc: `${channels.length} canais`, color: 'from-neon-orange/20 to-transparent' },
    { screen: 'movies', icon: '🎬', title: 'Filmes', desc: `${movies.length} filmes`, color: 'from-neon-cyan/20 to-transparent' },
    { screen: 'series', icon: '🎥', title: 'Séries', desc: `${series.length} séries`, color: 'from-active-green/20 to-transparent' },
    { screen: 'favorites', icon: '⭐', title: 'Favoritos', desc: 'Seus favoritos', color: 'from-alert-yellow/20 to-transparent' },
    { screen: 'settings', icon: '⚙️', title: 'Configurações', desc: 'Preferências', color: 'from-text-gray/20 to-transparent' },
    { screen: 'playlists', icon: '📋', title: 'Alternar Listas', desc: 'Gerenciar listas', color: 'from-neon-orange/20 to-transparent' },
  ];

  const recentChannels = channels.filter(c => c.isFavorite).slice(0, 4);

  return (
    <AppLayout>
      <Header showAdmin showSearch showUser />

      <ScrollContainer>
        {/* Subscription Status */}
        {daysRemaining <= 7 && (
          <div className="bg-alert-yellow/10 border border-alert-yellow/30 text-alert-yellow px-4 py-2 rounded-lg mb-4 text-sm animate-fade-in">
            ⚠️ Sua assinatura vence em {daysRemaining} dias ({expiresAt}). Renove para continuar.
          </div>
        )}

        {/* Legal Banner */}
        <LegalBanner />

        {/* Main Navigation Cards */}
        <SectionTitle title="Navegar" />
        <div className={`grid ${uiMode === 'tv' ? 'grid-cols-3 gap-4' : 'grid-cols-2 gap-3'} mb-6`}>
          {mainCards.map((card, i) => (
            <NeonCard
              key={card.screen}
              selected={selectedCard === i}
              onClick={() => { setSelectedCard(i); setScreen(card.screen); }}
              glowColor={i < 3 ? 'orange' : i === 3 ? 'cyan' : 'green'}
            >
              <div className={`p-5 relative overflow-hidden`}>
                <div className={`absolute inset-0 bg-gradient-to-br ${card.color}`} />
                <div className="relative z-10">
                  <span className={`${uiMode === 'tv' ? 'text-4xl' : 'text-3xl'} mb-3 block`}>{card.icon}</span>
                  <h3 className={`${uiMode === 'tv' ? 'text-lg' : 'text-base'} font-bold text-text-white mb-1`}>{card.title}</h3>
                  <p className="text-text-gray text-sm">{card.desc}</p>
                </div>
              </div>
            </NeonCard>
          ))}
        </div>

        {/* Continue Watching */}
        {watchHistory.length > 0 && (
          <>
            <SectionTitle title="Continuar Assistindo" action="Ver tudo" onAction={() => {}} />
            <div className="flex gap-3 overflow-x-auto pb-3 mb-6">
              {watchHistory.map(item => (
                <div
                  key={item.id}
                  onClick={() => {
                    if (item.contentType === 'channel') setScreen('channels');
                    else if (item.contentType === 'movie') setScreen('movies');
                    else setScreen('series');
                  }}
                  className="min-w-[180px] bg-card border border-border rounded-xl overflow-hidden cursor-pointer hover:border-neon-orange/50 transition-all group"
                >
                  <div className="h-24 bg-gradient-to-br from-bg-dark to-card flex items-center justify-center relative">
                    <span className="text-3xl group-hover:scale-110 transition-transform">
                      {item.contentType === 'channel' ? '📺' : item.contentType === 'movie' ? '🎬' : '🎥'}
                    </span>
                    {/* Play overlay */}
                    <div className="absolute inset-0 bg-bg-primary/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-3xl">▶️</span>
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="text-text-white text-sm font-medium truncate">{item.name}</p>
                    {item.contentType !== 'channel' && item.progress !== undefined && (
                      <div className="mt-2">
                        <ProgressBar progress={item.progress} />
                        <p className="text-text-gray/60 text-[10px] mt-1">{item.progress}% assistido</p>
                      </div>
                    )}
                    {item.seasonNum && (
                      <p className="text-neon-cyan text-[10px] mt-1">T{item.seasonNum}E{item.episodeNum}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Favorite Channels Quick Access */}
        {recentChannels.length > 0 && (
          <>
            <SectionTitle title="Canais Favoritos" action="Ver todos" onAction={() => setScreen('channels')} />
            <div className="flex gap-3 overflow-x-auto pb-3 mb-6">
              {recentChannels.map(ch => (
                <div
                  key={ch.id}
                  onClick={() => setScreen('channels')}
                  className="min-w-[120px] bg-card border border-border rounded-xl p-4 flex flex-col items-center cursor-pointer hover:border-neon-orange/50 transition-all group"
                >
                  <div className="w-12 h-12 rounded-full bg-bg-dark border border-border flex items-center justify-center mb-2 group-hover:border-neon-orange transition-colors">
                    <span className="text-xl">📺</span>
                  </div>
                  <p className="text-text-white text-xs font-medium text-center truncate w-full">{ch.name}</p>
                  <span className="text-active-green text-[10px] mt-1">● Ao vivo</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Subscription Info */}
        <div className="bg-card border border-border rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-text-gray text-xs">Assinatura válida até</p>
              <p className="text-text-white font-bold">{expiresAt}</p>
            </div>
            <div className="text-right">
              <p className="text-text-gray text-xs">Dias restantes</p>
              <p className={`font-bold text-lg ${daysRemaining > 7 ? 'text-active-green' : 'text-alert-yellow'}`}>{daysRemaining}</p>
            </div>
          </div>
        </div>
      </ScrollContainer>

      <BottomNav />
    </AppLayout>
  );
}
