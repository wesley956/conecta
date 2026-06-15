import { useMemo, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { AppLayout, BottomNav } from '@/components/shared';
import { channelCategories } from '@/data/mock';
import type { Channel } from '@/types';

function getGroupName(group: string) {
  return channelCategories.find(c => c.id === group)?.name || group;
}

export function ChannelsScreen() {
  const { channels, setScreen, setCurrentChannel } = useAppStore();
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(channels[0]?.id ?? null);

  const categories = useMemo(() => {
    return ['Buscar', 'Favoritos', 'Playback', 'Tudo: A-Z', ...channelCategories.map(c => c.name)];
  }, []);

  const filteredChannels = useMemo(() => {
    if (selectedCategory === 'Favoritos') return channels.filter(channel => channel.isFavorite);
    if (['Todos', 'Buscar', 'Playback', 'Tudo: A-Z'].includes(selectedCategory)) {
      return [...channels].sort((a, b) => a.name.localeCompare(b.name));
    }

    const category = channelCategories.find(c => c.name === selectedCategory);
    if (!category) return channels;
    return channels.filter(channel => channel.group === category.id);
  }, [channels, selectedCategory]);

  const selectedChannel = selectedChannelId
    ? filteredChannels.find(channel => channel.id === selectedChannelId) ?? filteredChannels[0] ?? null
    : filteredChannels[0] ?? null;

  const playChannel = (channel: Channel) => {
    setCurrentChannel(channel);
    setScreen('player');
  };

  return (
    <AppLayout>
      <div className="clean-tv-page flex h-full px-14 py-8">
        <BottomNav />

        <aside className="w-[310px] shrink-0 pr-8">
          <button
            onClick={() => setScreen('home')}
            className="mb-7 text-5xl text-white/45 transition-colors hover:text-white"
          >
            ⌂
          </button>

          <div className="space-y-1">
            {categories.map((category, index) => (
              <button
                key={category}
                onClick={() => {
                  setSelectedCategory(category);
                  setSelectedChannelId(null);
                }}
                className={`clean-tv-row flex w-full items-center gap-4 px-5 py-4 text-left ${
                  selectedCategory === category || (index === 0 && selectedCategory === 'Todos') ? 'active' : ''
                }`}
              >
                <span className="w-8 text-2xl">
                  {category === 'Buscar' ? '⌕' : category === 'Favoritos' ? '★' : category === 'Playback' ? '◉' : '▤'}
                </span>
                <span className="truncate text-2xl font-light">{category}</span>
              </button>
            ))}
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <h1 className="clean-tv-title mb-8 text-4xl">
            {selectedCategory === 'Buscar' ? 'Buscar' : selectedCategory}
          </h1>

          {filteredChannels.length === 0 ? (
            <div className="mt-24 text-center text-white/45">
              <p className="text-5xl">▣</p>
              <p className="mt-5 text-3xl font-light">Nenhum canal encontrado</p>
            </div>
          ) : (
            <div className="grid max-h-[calc(100vh-120px)] grid-cols-2 gap-x-12 gap-y-2 overflow-y-auto pr-6">
              {filteredChannels.map(channel => (
                <button
                  key={channel.id}
                  onClick={() => setSelectedChannelId(channel.id)}
                  onDoubleClick={() => playChannel(channel)}
                  className={`flex h-[86px] items-center gap-5 border-l-2 px-4 text-left transition-all ${
                    selectedChannel?.id === channel.id
                      ? 'border-[#28d850] text-white'
                      : 'border-white/20 text-white/62 hover:border-[#2396f2] hover:text-white'
                  }`}
                >
                  <span className="flex h-12 w-20 shrink-0 items-center justify-center text-sm text-white/45">
                    {channel.logo ? (
                      <img src={channel.logo} alt="" className="max-h-10 max-w-full object-contain" />
                    ) : (
                      'TV'
                    )}
                  </span>

                  <span className="min-w-0">
                    <span className="block truncate text-2xl font-light">{channel.name}</span>
                    <span className="block truncate text-sm text-white/35">{getGroupName(channel.group)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </main>
      </div>
    </AppLayout>
  );
}
