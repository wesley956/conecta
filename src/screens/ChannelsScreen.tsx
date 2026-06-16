import { useMemo, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { AppLayout, BottomNav } from '@/components/shared';
import { channelCategories } from '@/data/mock';
import type { Channel } from '@/types';

function humanizeGroupName(group: string) {
  return group
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Outros';
}

function getGroupName(channel: Channel) {
  return channel.groupTitle || channelCategories.find(c => c.id === channel.group)?.name || humanizeGroupName(channel.group);
}

function getSafeImageUrl(url?: string) {
  if (!url) return undefined;

  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('http://')) {
    return undefined;
  }

  return url;
}

export function ChannelsScreen() {
  const { channels, setScreen, setCurrentChannel } = useAppStore();
  const [selectedCategoryId, setSelectedCategoryId] = useState('all');

  const categoryOptions = useMemo(() => {
    const fixed = [
      { id: 'all', name: 'Todos', icon: '▤' },
      { id: 'favorites', name: 'Favoritos', icon: '★' },
      { id: 'playback', name: 'Playback', icon: '◉' },
      { id: 'az', name: 'Tudo: A-Z', icon: '▤' },
    ];

    const seen = new Set(fixed.map(item => item.name.toLowerCase()));

    const imported = channels
      .map(channel => ({
        id: channel.group,
        name: getGroupName(channel),
        icon: '▤',
      }))
      .filter(category => {
        const key = `${category.id}-${category.name}`.toLowerCase();

        if (seen.has(key) || seen.has(category.name.toLowerCase())) return false;

        seen.add(key);
        seen.add(category.name.toLowerCase());
        return true;
      });

    return [...fixed, ...imported];
  }, [channels]);

  const selectedCategory = categoryOptions.find(category => category.id === selectedCategoryId) ?? categoryOptions[0];

  const filteredChannels = useMemo(() => {
    if (selectedCategoryId === 'favorites') return channels.filter(channel => channel.isFavorite);

    if (selectedCategoryId === 'all' || selectedCategoryId === 'playback') {
      return channels;
    }

    if (selectedCategoryId === 'az') {
      return [...channels].sort((a, b) => a.name.localeCompare(b.name));
    }

    return channels.filter(channel => channel.group === selectedCategoryId);
  }, [channels, selectedCategoryId]);

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
            {categoryOptions.map(category => (
              <button
                key={category.id}
                onClick={() => setSelectedCategoryId(category.id)}
                className={`clean-tv-row flex w-full items-center gap-4 px-5 py-4 text-left ${
                  selectedCategoryId === category.id ? 'active' : ''
                }`}
              >
                <span className="w-8 text-2xl">{category.icon}</span>
                <span className="truncate text-2xl font-light">{category.name}</span>
              </button>
            ))}
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-8 flex items-center justify-between gap-6">
            <h1 className="clean-tv-title text-4xl">{selectedCategory?.name ?? 'Canais'}</h1>
            <p className="text-xl font-light text-white/45">{filteredChannels.length} canal(is)</p>
          </div>

          {filteredChannels.length === 0 ? (
            <div className="mt-24 text-center text-white/45">
              <p className="text-5xl">▣</p>
              <p className="mt-5 text-3xl font-light">Nenhum canal encontrado</p>
              <button
                onClick={() => setScreen('playlists')}
                className="mt-8 rounded-md bg-[#2396f2] px-8 py-3 text-xl font-light text-white"
              >
                Voltar para listas
              </button>
            </div>
          ) : (
            <div className="grid max-h-[calc(100vh-120px)] grid-cols-2 gap-x-12 gap-y-2 overflow-y-auto pr-6">
              {filteredChannels.map(channel => {
                const safeLogo = getSafeImageUrl(channel.logo);

                return (
                  <button
                    key={channel.id}
                    onClick={() => playChannel(channel)}
                    className="flex h-[86px] items-center gap-5 border-l-2 border-white/20 px-4 text-left text-white/70 transition-all hover:border-[#28d850] hover:text-white focus:border-[#28d850] focus:text-white focus:outline-none"
                  >
                    <span className="flex h-12 w-20 shrink-0 items-center justify-center text-sm text-white/45">
                      {safeLogo ? (
                        <img src={safeLogo} alt="" className="max-h-10 max-w-full object-contain" />
                      ) : (
                        'TV'
                      )}
                    </span>

                    <span className="min-w-0">
                      <span className="block truncate text-2xl font-light">{channel.name}</span>
                      <span className="block truncate text-sm text-white/35">{getGroupName(channel)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </AppLayout>
  );
}
