import { useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Play, Radio, Search, Star, Tv, X } from 'lucide-react';
import { StreamingShell } from '@/components/layout/StreamingShell';
import { LiveChannelCard } from '@/components/live/LiveChannelCard';
import { useAppStore } from '@/stores/appStore';
import { channelCategories } from '@/data/mock';
import { cleanLiveGroupTitle } from '@/utils/m3u';
import { useLongPressFavorite } from '@/utils/useLongPressFavorite';
import type { Channel } from '@/types';
import '@/styles/live.css';

const CHANNEL_RENDER_BATCH_SIZE = 180;

interface CategoryOption {
  id: string;
  name: string;
  count: number;
  groupId?: string;
}

function humanizeGroupName(group: string) {
  return group
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Outros';
}

function getGroupName(channel: Channel) {
  if (channel.groupTitle) return cleanLiveGroupTitle(channel.groupTitle);
  return channelCategories.find(category => category.id === channel.group)?.name || humanizeGroupName(channel.group);
}

function getSafeImageUrl(url?: string) {
  if (!url) return undefined;

  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('http://')) {
    return undefined;
  }

  return url;
}

function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function readStoredCategory() {
  const stored = window.sessionStorage.getItem('roneca:channels:selectedCategoryId') || 'all';

  if (stored === 'playback') return 'all';
  if (stored === 'all' || stored === 'favorites' || stored === 'az' || stored.startsWith('group:')) return stored;

  return `group:${stored}`;
}

export function ChannelsScreen() {
  const channels = useAppStore(state => state.channels);
  const playlists = useAppStore(state => state.playlists);
  const setScreen = useAppStore(state => state.setScreen);
  const setCurrentChannel = useAppStore(state => state.setCurrentChannel);
  const toggleChannelFavorite = useAppStore(state => state.toggleChannelFavorite);

  const [selectedCategoryId, setSelectedCategoryId] = useState(readStoredCategory);
  const [searchTerm, setSearchTerm] = useState(() => window.sessionStorage.getItem('roneca:channels:searchTerm') ?? '');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [visibleCount, setVisibleCount] = useState(() => Number(window.sessionStorage.getItem('roneca:channels:visibleCount')) || CHANNEL_RENDER_BATCH_SIZE);
  const [selectedChannelId, setSelectedChannelId] = useState(() => window.sessionStorage.getItem('roneca:channels:selectedChannelId') ?? '');
  const channelGridRef = useRef<HTMLDivElement | null>(null);
  const channelFavoriteHold = useLongPressFavorite();

  const activePlaylist = useMemo(() => {
    return playlists.find(playlist => playlist.status === 'active') ?? playlists[0] ?? null;
  }, [playlists]);

  const categoryOptions = useMemo<CategoryOption[]>(() => {
    const groups = new Map<string, CategoryOption>();
    let favoriteCount = 0;

    for (const channel of channels) {
      if (channel.isFavorite) favoriteCount += 1;

      const groupId = channel.group || 'outros';
      const id = `group:${groupId}`;
      const current = groups.get(id);

      groups.set(id, {
        id,
        groupId,
        name: current?.name || getGroupName(channel),
        count: (current?.count ?? 0) + 1,
      });
    }

    return [
      { id: 'all', name: 'Todos', count: channels.length },
      { id: 'favorites', name: 'Favoritos', count: favoriteCount },
      { id: 'az', name: 'A–Z', count: channels.length },
      ...[...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    ];
  }, [channels]);

  const selectedCategory = categoryOptions.find(category => category.id === selectedCategoryId) ?? categoryOptions[0];

  const filteredChannels = useMemo(() => {
    let result: Channel[];

    if (selectedCategoryId === 'favorites') {
      result = channels.filter(channel => channel.isFavorite);
    } else if (selectedCategoryId.startsWith('group:')) {
      const groupId = selectedCategoryId.slice('group:'.length);
      result = channels.filter(channel => (channel.group || 'outros') === groupId);
    } else {
      result = channels;
    }

    const query = normalizeSearch(deferredSearchTerm);

    if (query) {
      result = result.filter(channel => {
        const searchable = normalizeSearch(`${channel.name} ${getGroupName(channel)}`);
        return searchable.includes(query);
      });
    }

    if (selectedCategoryId === 'az') {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    }

    return result;
  }, [channels, deferredSearchTerm, selectedCategoryId]);

  const selectedChannel = useMemo(() => {
    return filteredChannels.find(channel => channel.id === selectedChannelId) ?? filteredChannels[0] ?? null;
  }, [filteredChannels, selectedChannelId]);

  const visibleChannels = useMemo(() => {
    return filteredChannels.slice(0, visibleCount);
  }, [filteredChannels, visibleCount]);

  const visibleChannelEntries = useMemo(() => {
    return visibleChannels.map(channel => ({
      channel,
      groupName: getGroupName(channel),
      logo: getSafeImageUrl(channel.logo),
    }));
  }, [visibleChannels]);

  const canLoadMore = visibleChannels.length < filteredChannels.length;
  const selectedChannelLogo = getSafeImageUrl(selectedChannel?.logo);
  const selectedChannelGroup = selectedChannel ? getGroupName(selectedChannel) : '';

  const featureStyle = {
    '--live-feature-image': selectedChannelLogo
      ? `url("${selectedChannelLogo.replace(/"/g, '%22')}")`
      : 'none',
  } as CSSProperties;

  useEffect(() => {
    if (channels.length === 0) return;

    if (!categoryOptions.some(category => category.id === selectedCategoryId)) {
      setSelectedCategoryId('all');
    }
  }, [categoryOptions, channels.length, selectedCategoryId]);

  useEffect(() => {
    const saved = Number(window.sessionStorage.getItem('roneca:channels:visibleCount'));
    setVisibleCount(Number.isFinite(saved) && saved > CHANNEL_RENDER_BATCH_SIZE ? saved : CHANNEL_RENDER_BATCH_SIZE);
  }, [selectedCategoryId, channels.length]);

  useEffect(() => {
    window.sessionStorage.setItem('roneca:channels:selectedCategoryId', selectedCategoryId);
  }, [selectedCategoryId]);

  useEffect(() => {
    window.sessionStorage.setItem('roneca:channels:searchTerm', searchTerm);
  }, [searchTerm]);

  useEffect(() => {
    window.sessionStorage.setItem('roneca:channels:visibleCount', String(visibleCount));
  }, [visibleCount]);

  useEffect(() => {
    if (!selectedChannel) return;

    if (selectedChannel.id !== selectedChannelId) {
      setSelectedChannelId(selectedChannel.id);
    }
  }, [selectedChannel, selectedChannelId]);

  useEffect(() => {
    if (!selectedChannelId) return;
    window.sessionStorage.setItem('roneca:channels:selectedChannelId', selectedChannelId);
  }, [selectedChannelId]);

  useEffect(() => {
    const node = channelGridRef.current;
    if (!node) return;

    const queryKey = normalizeSearch(deferredSearchTerm) || 'sem-busca';
    const key = `roneca:channels:scroll:${selectedCategoryId}:${queryKey}`;
    const savedScroll = Number(window.sessionStorage.getItem(key));

    if (Number.isFinite(savedScroll) && savedScroll > 0) {
      window.requestAnimationFrame(() => {
        node.scrollTop = savedScroll;
      });
    }

    const saveScroll = () => {
      window.sessionStorage.setItem(key, String(node.scrollTop));
    };

    node.addEventListener('scroll', saveScroll, { passive: true });

    return () => {
      saveScroll();
      node.removeEventListener('scroll', saveScroll);
    };
  }, [deferredSearchTerm, selectedCategoryId, visibleCount]);

  const playChannel = (channel: Channel) => {
    setCurrentChannel(channel);
    setScreen('player');
  };

  return (
    <StreamingShell>
      <div className="live-page">
        <header className="live-header">
          <div className="live-header-copy">
            <p className="stream-kicker">Lista conectada</p>
            <h1 className="live-header-title">TV ao vivo</h1>
            <p className="live-header-subtitle">
              {activePlaylist?.name || 'Sua lista de canais'}
            </p>
          </div>

          <div className="live-header-actions">
            <label className="live-search-field">
              <Search aria-hidden="true" size={17} strokeWidth={2.2} />
              <input
                value={searchTerm}
                onChange={event => setSearchTerm(event.target.value)}
                placeholder="Buscar canal"
                aria-label="Buscar canal"
              />
              {searchTerm ? (
                <button
                  type="button"
                  className="live-search-clear"
                  onClick={() => setSearchTerm('')}
                  aria-label="Limpar busca"
                >
                  <X aria-hidden="true" size={14} strokeWidth={2.4} />
                </button>
              ) : null}
            </label>

            <div className="live-count-chip">
              <Radio aria-hidden="true" size={15} strokeWidth={2.2} />
              <span>{filteredChannels.length} canais</span>
            </div>
          </div>
        </header>

        <nav className="live-category-strip" aria-label="Categorias de canais">
          {categoryOptions.map(category => (
            <button
              key={category.id}
              type="button"
              className={`live-category-chip ${selectedCategoryId === category.id ? 'is-active' : ''}`}
              onClick={() => setSelectedCategoryId(category.id)}
              title={category.name}
            >
              <span>{category.name}</span>
              <span>{category.count}</span>
            </button>
          ))}
        </nav>

        {selectedChannel ? (
          <section className="live-feature" style={featureStyle}>
            <div className="live-feature-content">
              <p className="live-feature-kicker">Transmissão ao vivo</p>
              <h2 className="live-feature-title">{selectedChannel.name}</h2>

              <div className="live-feature-meta">
                <span>{selectedChannelGroup}</span>
                <span>{selectedCategory?.name || 'TV ao vivo'}</span>
                {selectedChannel.isFavorite ? <span>Favorito</span> : null}
              </div>

              <p className="live-feature-description">
                Canal disponível na sua lista vinculada. Use o botão abaixo para iniciar a reprodução no player do aplicativo.
              </p>

              <div className="live-feature-actions">
                <button
                  type="button"
                  className="stream-primary-button"
                  onClick={() => playChannel(selectedChannel)}
                >
                  <Play aria-hidden="true" size={17} fill="currentColor" />
                  Assistir agora
                </button>

                <button
                  type="button"
                  className={`stream-secondary-button live-favorite-button ${selectedChannel.isFavorite ? 'is-favorite' : ''}`}
                  onClick={() => toggleChannelFavorite(selectedChannel.id)}
                >
                  <Star
                    aria-hidden="true"
                    size={17}
                    fill={selectedChannel.isFavorite ? 'currentColor' : 'none'}
                  />
                  {selectedChannel.isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                </button>
              </div>
            </div>

            <div className="live-feature-art" aria-hidden="true">
              <div className="live-feature-logo-panel">
                {selectedChannelLogo ? (
                  <img src={selectedChannelLogo} alt="" />
                ) : (
                  <Tv size={62} strokeWidth={1.5} />
                )}
                <span className="live-feature-live-badge">AO VIVO</span>
              </div>
            </div>
          </section>
        ) : (
          <section className="live-empty-state">
            <div>
              <Tv aria-hidden="true" size={46} strokeWidth={1.8} />
              <h2>Nenhum canal encontrado</h2>
              <p>
                {channels.length === 0
                  ? 'Aguarde o carregamento da lista vinculada ou verifique o acesso nas configurações.'
                  : 'Tente outra categoria ou limpe o campo de busca.'}
              </p>
              {channels.length === 0 ? (
                <button type="button" className="stream-secondary-button" onClick={() => setScreen('settings')}>
                  Abrir configurações
                </button>
              ) : null}
            </div>
          </section>
        )}

        {filteredChannels.length > 0 ? (
          <section className="live-library">
            <div className="live-library-heading">
              <div>
                <h2 className="live-library-title">Canais</h2>
                <p className="live-library-subtitle">Navegue com o controle e pressione para assistir. Segure para favoritar.</p>
              </div>
              <p className="live-library-count">
                Exibindo {visibleChannels.length} de {filteredChannels.length}
              </p>
            </div>

            <div ref={channelGridRef} className="live-channel-grid">
              {visibleChannelEntries.map(({ channel, groupName, logo }) => (
                <LiveChannelCard
                  key={channel.id}
                  logo={logo}
                  name={channel.name}
                  group={groupName}
                  favorite={channel.isFavorite}
                  selected={selectedChannel?.id === channel.id}
                  onFocus={() => setSelectedChannelId(channel.id)}
                  onPointerDown={() => channelFavoriteHold.start(() => toggleChannelFavorite(channel.id))}
                  onPointerUp={() => channelFavoriteHold.cancel()}
                  onPointerLeave={() => channelFavoriteHold.cancel()}
                  onPointerCancel={() => channelFavoriteHold.cancel()}
                  onPlay={() => {
                    if (channelFavoriteHold.consume()) return;
                    playChannel(channel);
                  }}
                />
              ))}
            </div>

            {canLoadMore ? (
              <button
                type="button"
                className="live-load-more"
                onClick={() => setVisibleCount(count => count + CHANNEL_RENDER_BATCH_SIZE)}
              >
                Carregar mais {Math.min(CHANNEL_RENDER_BATCH_SIZE, filteredChannels.length - visibleChannels.length)} canais
              </button>
            ) : null}
          </section>
        ) : null}
      </div>
    </StreamingShell>
  );
}
