import { create } from 'zustand';
import type { AppState, UIMode, AppSettings, WatchHistory, Channel, Movie, Series, Playlist } from '@/types';
import { channels as mockChannels, movies as mockMovies, series as mockSeries, playlists as mockPlaylists, watchHistory as mockHistory, DEVICE_CODE, LEGAL_NOTICE } from '@/data/mock';

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

export const useAppStore = create<AppStore>((set) => ({
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
}));
