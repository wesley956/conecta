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
