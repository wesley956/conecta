import { useState, useMemo } from 'react';
import { useAppStore } from '@/stores/appStore';
import { AppLayout, Header, CategoryPills, NeonCard, ScrollContainer, BottomNav } from '@/components/shared';
import { channelCategories } from '@/data/mock';

export function ChannelsScreen() {
  const { channels, setScreen, setCurrentChannel, toggleChannelFavorite, uiMode } = useAppStore();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);

  const categories = channelCategories.map(c => c.name);

  const filteredChannels = useMemo(() => {
    if (selectedCategory === 'Todos') return channels;
    if (selectedCategory === 'Favoritos') return channels.filter(c => c.isFavorite);
    const cat = channelCategories.find(c => c.name === selectedCategory);
    if (cat) return channels.filter(c => c.group === cat.id);
    return channels;
  }, [channels, selectedCategory]);

  const handleChannelClick = (ch: typeof channels[0]) => {
    setCurrentChannel(ch);
    setScreen('player');
  };

  // EPG mock data for current program
  const getMockEPG = (channelName: string) => {
    const programs = [
      'Jornal da Noite', 'Programa Esportivo', 'Série: Episódio 12', 'Filme: Ação Total',
      'Documentário Natureza', 'Notícias ao Vivo', 'Talk Show', 'Desenho Animado',
    ];
    return programs[Math.abs(channelName.charCodeAt(0) * 7) % programs.length];
  };

  return (
    <AppLayout>
      <Header title="Canais ao Vivo" showBack showSearch onBack={() => setScreen('home')} />

      <ScrollContainer>
        <CategoryPills categories={categories} selected={selectedCategory} onSelect={setSelectedCategory} />

        {filteredChannels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <span className="text-5xl mb-4">📺</span>
            <h3 className="text-lg font-bold text-text-white mb-2">Nenhum canal encontrado</h3>
            <p className="text-text-gray text-sm">Tente outra categoria</p>
          </div>
        ) : (
          <div className={`grid ${uiMode === 'tv' ? 'grid-cols-3 gap-3' : 'grid-cols-1 gap-2'}`}>
            {filteredChannels.map(ch => (
              <NeonCard
                key={ch.id}
                selected={selectedChannel === ch.id}
                onClick={() => { setSelectedChannel(ch.id); handleChannelClick(ch); }}
              >
                <div className="flex items-center gap-3 p-3">
                  {/* Channel Logo */}
                  <div className="w-12 h-12 rounded-lg bg-bg-dark border border-border flex items-center justify-center flex-shrink-0">
                    <span className="text-lg">📺</span>
                  </div>
                  
                  {/* Channel Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-text-white font-medium text-sm truncate">{ch.name}</h3>
                      <span className="text-active-green text-[10px] flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-active-green rounded-full animate-pulse" />
                        AO VIVO
                      </span>
                    </div>
                    <p className="text-text-gray text-xs truncate mt-0.5">{getMockEPG(ch.name)}</p>
                    <span className="text-text-gray/50 text-[10px]">{channelCategories.find(c => c.id === ch.group)?.name || ch.group}</span>
                  </div>

                  {/* Favorite Button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleChannelFavorite(ch.id); }}
                    className={`text-lg flex-shrink-0 transition-colors ${ch.isFavorite ? 'text-alert-yellow' : 'text-text-gray/30 hover:text-alert-yellow/50'}`}
                  >
                    {ch.isFavorite ? '⭐' : '☆'}
                  </button>
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
