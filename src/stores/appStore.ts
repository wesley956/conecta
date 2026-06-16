import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AppState, UIMode, AppSettings, WatchHistory, Channel, Movie, Series, Playlist } from '@/types';
import { channels as mockChannels, movies as mockMovies, series as mockSeries, playlists as mockPlaylists, watchHistory as mockHistory, DEVICE_CODE, LEGAL_NOTICE } from '@/data/mock';
import { parseM3U, isLikelyM3U } from '@/utils/m3u';

interface AppStore {
  // Navigation
  currentScreen: AppState;
  setScreen: (screen: AppState) => void;
  previousScreen: AppState | null;
  
  // UI Mode
  uiMode: UIMode;
  setUIMode: (mode: UIMode) => void;
  
  // Device
  deviceCode: string;
  deviceActivated: boolean;
  setDeviceActivated: (val: boolean) => void;
  
  // Subscription
  subscriptionActive: boolean;
  expiresAt: string;
  daysRemaining: number;
  setSubscription: (active: boolean, expiresAt: string, days: number) => void;
  
  // Content
  channels: Channel[];
  movies: Movie[];
  series: Series[];
  playlists: Playlist[];
  watchHistory: WatchHistory[];
  importM3UPlaylist: (name: string, sourceUrl: string, content: string) => { imported: number; skipped: number };
  addDirectStreamChannel: (name: string, sourceUrl: string) => { imported: number; skipped: number };
  removePlaylist: (playlistId: string) => void;
  updatePlaylist: (playlistId: string, partial: Partial<Pick<Playlist, 'name' | 'url' | 'status' | 'lastSync'>>) => void;
  replaceM3UPlaylist: (playlistId: string, name: string, sourceUrl: string, content: string) => { imported: number; skipped: number };
  resetContentToMock: () => void;
  currentChannel: Channel | null;
  currentMovie: Movie | null;
  currentSeries: Series | null;
  setCurrentChannel: (ch: Channel | null) => void;
  setCurrentMovie: (mv: Movie | null) => void;
  setCurrentSeries: (sr: Series | null) => void;
  
  // Favorites
  toggleChannelFavorite: (id: string) => void;
  toggleMovieFavorite: (id: string) => void;
  toggleSeriesFavorite: (id: string) => void;
  
  // Settings
  settings: AppSettings;
  updateSettings: (partial: Partial<AppSettings>) => void;
  
  // Admin mode
  isAdminMode: boolean;
  setAdminMode: (val: boolean) => void;
  
  // Legal
  legalNotice: string;
  
  // Notice banner
  activeNotice: string | null;
  setActiveNotice: (notice: string | null) => void;
  
  // Search
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  
  // Player
  isPlaying: boolean;
  setIsPlaying: (val: boolean) => void;
  
  // Splash done
  splashDone: boolean;
  setSplashDone: (val: boolean) => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
  // Navigation
  currentScreen: 'splash',
  setScreen: (screen) => set((state) => ({ currentScreen: screen, previousScreen: state.currentScreen })),
  previousScreen: null,
  
  // UI Mode
  uiMode: window.innerWidth > 1024 && window.matchMedia('(orientation: landscape)').matches ? 'tv' : 'mobile',
  setUIMode: (mode) => set({ uiMode: mode }),
  
  // Device
  deviceCode: DEVICE_CODE,
  deviceActivated: true, // For demo, start as activated
  setDeviceActivated: (val) => set({ deviceActivated: val }),
  
  // Subscription
  subscriptionActive: true,
  expiresAt: '2025-02-28',
  daysRemaining: 44,
  setSubscription: (active, expiresAt, days) => set({ subscriptionActive: active, expiresAt, daysRemaining: days }),
  
  // Content
  channels: mockChannels,
  movies: mockMovies,
  series: mockSeries,
  playlists: mockPlaylists,
  watchHistory: mockHistory,
  addDirectStreamChannel: (name, sourceUrl) => {
    const url = sourceUrl.trim();

    if (!/^https?:\/\//i.test(url)) {
      throw new Error('A URL precisa começar com http:// ou https://');
    }

    const channelName = name.trim() || 'Canal HLS autorizado';
    const channel: Channel = {
      id: `direct-${Date.now()}`,
      name: channelName,
      group: 'importados',
      url,
      isFavorite: false,
    };

    const playlist: Playlist = {
      id: `pl-direct-${Date.now()}`,
      name: `${channelName} - Stream direto`,
      type: 'm3u',
      url,
      status: 'active',
      channelCount: 1,
      movieCount: 0,
      seriesCount: 0,
      lastSync: new Date().toLocaleString('pt-BR'),
    };

    set((state) => ({
      playlists: [playlist, ...state.playlists],
      channels: [channel, ...state.channels],
      activeNotice: `✅ Canal direto adicionado: ${channelName}.`,
    }));

    return { imported: 1, skipped: 0 };
  },

  importM3UPlaylist: (name, sourceUrl, content) => {
    if (!isLikelyM3U(content)) {
      throw new Error('O conteúdo informado não parece ser uma lista M3U válida.');
    }

    const playlistId = `pl-${Date.now()}`;
    const result = parseM3U(content, playlistId);

    if (result.channels.length === 0) {
      throw new Error('Nenhum canal com URL reproduzível foi encontrado na lista.');
    }

    const now = new Date().toLocaleString('pt-BR');

    const playlist: Playlist = {
      id: playlistId,
      name: name.trim() || 'Lista M3U autorizada',
      type: 'm3u',
      url: sourceUrl.trim() || undefined,
      status: 'active',
      channelCount: result.channels.length,
      movieCount: 0,
      seriesCount: 0,
      lastSync: now,
    };

    set((state) => ({
      playlists: [playlist, ...state.playlists],
      channels: [...result.channels, ...state.channels],
      activeNotice: `✅ ${result.channels.length} canais importados da lista autorizada.`,
    }));

    return { imported: result.channels.length, skipped: result.skipped };
  },

  removePlaylist: (playlistId) => set((state) => {
    const playlist = state.playlists.find((item) => item.id === playlistId);
    const sourceUrl = playlist?.url;

    const shouldRemoveChannel = (channel: Channel) =>
      channel.id.startsWith(`${playlistId}-ch-`) || Boolean(sourceUrl && channel.url === sourceUrl);

    const nextChannels = state.channels.filter((channel) => !shouldRemoveChannel(channel));
    const currentChannelRemoved = state.currentChannel ? shouldRemoveChannel(state.currentChannel) : false;

    return {
      playlists: state.playlists.filter((item) => item.id !== playlistId),
      channels: nextChannels,
      currentChannel: currentChannelRemoved ? null : state.currentChannel,
      activeNotice: playlist ? `🗑️ Lista removida: ${playlist.name}.` : '🗑️ Lista removida.',
    };
  }),

  updatePlaylist: (playlistId, partial) => set((state) => ({
    playlists: state.playlists.map((playlist) =>
      playlist.id === playlistId
        ? { ...playlist, ...partial, lastSync: partial.lastSync ?? playlist.lastSync }
        : playlist
    ),
    activeNotice: '✅ Lista atualizada.',
  })),

  replaceM3UPlaylist: (playlistId, name, sourceUrl, content) => {
    if (!isLikelyM3U(content)) {
      throw new Error('O conteúdo informado não parece ser uma lista M3U válida.');
    }

    const result = parseM3U(content, playlistId);

    if (result.channels.length === 0) {
      throw new Error('Nenhum canal com URL reproduzível foi encontrado na lista.');
    }

    const now = new Date().toLocaleString('pt-BR');

    const playlist: Playlist = {
      id: playlistId,
      name: name.trim() || 'Lista M3U autorizada',
      type: 'm3u',
      url: sourceUrl.trim() || undefined,
      status: 'active',
      channelCount: result.channels.length,
      movieCount: 0,
      seriesCount: 0,
      lastSync: now,
    };

    set((state) => {
      const oldPlaylist = state.playlists.find((item) => item.id === playlistId);
      const oldUrl = oldPlaylist?.url;

      const shouldRemoveChannel = (channel: Channel) =>
        channel.id.startsWith(`${playlistId}-ch-`) || Boolean(oldUrl && channel.url === oldUrl);

      return {
        playlists: state.playlists.some((item) => item.id === playlistId)
          ? state.playlists.map((item) => item.id === playlistId ? playlist : item)
          : [playlist, ...state.playlists],
        channels: [...result.channels, ...state.channels.filter((channel) => !shouldRemoveChannel(channel))],
        activeNotice: `🔄 Lista sincronizada: ${result.channels.length} canal(is).`,
      };
    });

    return { imported: result.channels.length, skipped: result.skipped };
  },

  resetContentToMock: () => set({
    channels: mockChannels,
    movies: mockMovies,
    series: mockSeries,
    playlists: mockPlaylists,
    watchHistory: mockHistory,
    currentChannel: null,
    currentMovie: null,
    currentSeries: null,
    activeNotice: '✅ Listas e conteúdos restaurados para o estado inicial.',
  }),
  currentChannel: null,
  currentMovie: null,
  currentSeries: null,
  setCurrentChannel: (ch) => set({ currentChannel: ch }),
  setCurrentMovie: (mv) => set({ currentMovie: mv }),
  setCurrentSeries: (sr) => set({ currentSeries: sr }),
  
  // Favorites
  toggleChannelFavorite: (id) => set((state) => ({
    channels: state.channels.map(ch => ch.id === id ? { ...ch, isFavorite: !ch.isFavorite } : ch)
  })),
  toggleMovieFavorite: (id) => set((state) => ({
    movies: state.movies.map(mv => mv.id === id ? { ...mv, isFavorite: !mv.isFavorite } : mv)
  })),
  toggleSeriesFavorite: (id) => set((state) => ({
    series: state.series.map(sr => sr.id === id ? { ...sr, isFavorite: !sr.isFavorite } : sr)
  })),
  
  // Settings
  settings: {
    playerType: 'auto',
    decoding: 'auto',
    bufferSize: 'medium',
    autoReconnect: true,
    language: 'pt',
    p2pEnabled: false,
    p2pWifiOnly: true,
    p2pUploadLimit: 512,
    animationsEnabled: true,
    cardSize: 'medium',
  },
  updateSettings: (partial) => set((state) => ({ settings: { ...state.settings, ...partial } })),
  
  // Admin mode
  isAdminMode: false,
  setAdminMode: (val) => set({ isAdminMode: val }),
  
  // Legal
  legalNotice: LEGAL_NOTICE,
  
  // Notice
  activeNotice: '⚡ Nova atualização disponível! Versão 1.1.0 com melhorias no player.',
  setActiveNotice: (notice) => set({ activeNotice: notice }),
  
  // Search
  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),
  
  // Player
  isPlaying: false,
  setIsPlaying: (val) => set({ isPlaying: val }),
  
  // Splash
  splashDone: false,
  setSplashDone: (val) => set({ splashDone: val }),
    }),
    {
      name: 'ronecaplaytv-local-state-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        uiMode: state.uiMode,
        deviceActivated: state.deviceActivated,
        subscriptionActive: state.subscriptionActive,
        expiresAt: state.expiresAt,
        daysRemaining: state.daysRemaining,
        channels: state.channels,
        movies: state.movies,
        series: state.series,
        playlists: state.playlists,
        watchHistory: state.watchHistory,
        settings: state.settings,
        activeNotice: state.activeNotice,
      }),
    }
  )
);
