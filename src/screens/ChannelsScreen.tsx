import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { AppLayout, BottomNav } from '@/components/shared';
import { channelCategories } from '@/data/mock';
import { fetchM3UContent } from '@/utils/fetchM3U';
import { cleanLiveGroupTitle } from '@/utils/m3u';
import type { Channel } from '@/types';

const CHANNEL_RENDER_BATCH_SIZE = 120;

function humanizeGroupName(group: string) {
  return group
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Outros';
}

function getGroupName(channel: Channel) {
  if (channel.groupTitle) return cleanLiveGroupTitle(channel.groupTitle);
  return channelCategories.find(c => c.id === channel.group)?.name || humanizeGroupName(channel.group);
}

function getSafeImageUrl(url?: string) {
  if (!url) return undefined;

  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('http://')) {
    return undefined;
  }

  return url;
}

export function ChannelsScreen() {
  const {
    channels,
    playlists,
    setScreen,
    setCurrentChannel,
    replaceM3UPlaylist,
  } = useAppStore();

  const [selectedCategoryId, setSelectedCategoryId] = useState('all');
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoMessage, setAutoMessage] = useState<string | null>(null);
  const [autoError, setAutoError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(CHANNEL_RENDER_BATCH_SIZE);
  const loadingRef = useRef(false);
  const attemptedKeyRef = useRef('');

  const pendingPlaylists = useMemo(() => {
    return playlists.filter(playlist => {
      if (playlist.status !== 'active') return false;
      if (!playlist.url) return false;

      const hasChannelsInMemory = channels.some(channel => channel.id.startsWith(`${playlist.id}-ch-`));
      return !hasChannelsInMemory;
    });
  }, [channels, playlists]);

  const pendingKey = pendingPlaylists
    .map(playlist => `${playlist.id}:${playlist.url}`)
    .join('|');

  useEffect(() => {
    if (!pendingKey) return;
    if (loadingRef.current) return;
    if (attemptedKeyRef.current === pendingKey) return;

    attemptedKeyRef.current = pendingKey;
    loadingRef.current = true;
    setAutoLoading(true);
    setAutoError(null);
    setAutoMessage('Carregando lista para TV Ao Vivo...');

    let cancelled = false;

    async function loadPendingPlaylists() {
      let totalImported = 0;

      try {
        for (const playlist of pendingPlaylists) {
          const playlistUrl = playlist.url;

          if (!playlistUrl) continue;

          const content = await fetchM3UContent(playlistUrl);
          const result = replaceM3UPlaylist(playlist.id, playlist.name, playlistUrl, content);
          totalImported += result.imported;
        }

        if (!cancelled) {
          setAutoMessage(totalImported > 0 ? `${totalImported} canal(is) carregado(s).` : null);
        }
      } catch (error) {
        if (!cancelled) {
          setAutoError(error instanceof Error ? error.message : 'Não foi possível carregar a lista.');
        }
      } finally {
        if (!cancelled) {
          setAutoLoading(false);
        }

        loadingRef.current = false;
      }
    }

    void loadPendingPlaylists();

    return () => {
      cancelled = true;
    };
  }, [pendingKey, pendingPlaylists, replaceM3UPlaylist]);

  const categoryOptions = useMemo(() => {
    const fixed = [
      { id: 'all', name: 'Todos', icon: '▤' },
      { id: 'favorites', name: 'Favoritos', icon: '★' },
      { id: 'playback', name: 'Playback', icon: '◉' },
      { id: 'az', name: 'Tudo: A-Z', icon: 'A-Z' },
    ];

    const byId = new Map<string, { id: string; name: string; icon: string }>();

    for (const category of fixed) {
      byId.set(category.id, category);
    }

    for (const channel of channels) {
      const id = channel.group || 'outros';

      if (byId.has(id)) continue;

      byId.set(id, {
        id,
        name: getGroupName(channel),
        icon: '▤',
      });
    }

    return [...byId.values()];
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

  useEffect(() => {
    setVisibleCount(CHANNEL_RENDER_BATCH_SIZE);
  }, [selectedCategoryId, channels.length]);

  const visibleChannels = useMemo(() => {
    return filteredChannels.slice(0, visibleCount);
  }, [filteredChannels, visibleCount]);

  const canLoadMore = visibleChannels.length < filteredChannels.length;

  const playChannel = (channel: Channel) => {
    setCurrentChannel(channel);
    setScreen('player');
  };

  return (
    <AppLayout>
      <div className="clean-tv-page flex h-full px-14 py-8">
        <BottomNav />

        <aside className="clean-tv-categories w-[310px] shrink-0 pr-8">
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
            <div>
              <h1 className="clean-tv-title text-4xl">{selectedCategory?.name ?? 'TV Ao Vivo'}</h1>
              {autoMessage && <p className="mt-2 text-base text-white/45">{autoMessage}</p>}
              {autoError && <p className="mt-2 text-base text-red-200/80">{autoError}</p>}
            </div>

            <p className="text-xl font-light text-white/45">
              {autoLoading ? 'Carregando...' : `${visibleChannels.length}/${filteredChannels.length} canal(is)`}
            </p>
          </div>

          {autoLoading && filteredChannels.length === 0 ? (
            <div className="mt-24 text-center text-white/45">
              <p className="text-5xl">◌</p>
              <p className="mt-5 text-3xl font-light">Carregando conteúdo da lista...</p>
              <p className="mt-3 text-lg font-light">Isso pode levar alguns segundos em listas grandes.</p>
            </div>
          ) : filteredChannels.length === 0 ? (
            <div className="mt-24 text-center text-white/45">
              <p className="text-5xl">▣</p>
              <p className="mt-5 text-3xl font-light">Nenhum canal encontrado</p>
              <p className="mx-auto mt-3 max-w-2xl text-lg font-light">
                Adicione uma lista autorizada em Listas. Depois disso, ao entrar em TV Ao Vivo, o conteúdo será carregado automaticamente.
              </p>
              <button
                onClick={() => setScreen('playlists')}
                className="mt-8 rounded-md bg-[#2396f2] px-8 py-3 text-xl font-light text-white"
              >
                Adicionar lista
              </button>
            </div>
          ) : (
            <div className="roneca-channel-grid max-h-[calc(100vh-135px)] overflow-y-auto pr-3">
              {visibleChannels.map(channel => {
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

              {canLoadMore && (
                <button
                  onClick={() => setVisibleCount(count => count + CHANNEL_RENDER_BATCH_SIZE)}
                  className="roneca-load-more"
                >
                  Carregar mais {Math.min(CHANNEL_RENDER_BATCH_SIZE, filteredChannels.length - visibleChannels.length)} canal(is)
                </button>
              )}
            </div>
          )}
        </main>
      </div>
    </AppLayout>
  );
}
