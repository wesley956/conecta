// RonecaPlayTV - Application State Store (Zustand)

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { 
  Subscription, 
  Playlist, 
  Channel, 
  Movie, 
  Series, 
  AppSettings,
  Notice,
  WatchHistory,
  Favorite 
} from '../types';
import { getDeviceId, detectDeviceType } from '../utils/helpers';
import { mockPlaylists, mockChannels, mockMovies, mockSeries, mockNotices } from '../data/mockData';

interface AppState {
  // Device info
  deviceId: string;
  deviceType: 'mobile' | 'tablet' | 'tvbox' | 'android_tv' | 'google_tv';
  appVersion: string;
  
  // Activation status
  isActivated: boolean;
  activationStatus: 'pending' | 'approved' | 'blocked';
  activationMessage?: string;
  
  // Subscription
  subscription: Subscription | null;
  daysUntilExpiration: number;
  
  // Content
  playlists: Playlist[];
  activePlaylist: Playlist | null;
  channels: Channel[];
  movies: Movie[];
  series: Series[];
  
  // User data
  favorites: Favorite[];
  watchHistory: WatchHistory[];
  
  // Notices
  notices: Notice[];
  unreadNotices: number;
  
  // Settings
  settings: AppSettings;
  
  // UI state
  isLoading: boolean;
  error: string | null;
  currentRoute: string;
  
  // Actions
  setDeviceId: (id: string) => void;
  setActivationStatus: (status: 'pending' | 'approved' | 'blocked', message?: string) => void;
  setSubscription: (sub: Subscription | null) => void;
  setActivePlaylist: (playlist: Playlist | null) => void;
  loadPlaylists: () => void;
  loadContent: () => void;
  toggleFavorite: (type: 'channel' | 'movie' | 'series', id: string) => void;
  addToHistory: (history: WatchHistory) => void;
  updateSettings: (settings: Partial<AppSettings>) => void;
  clearNotices: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setCurrentRoute: (route: string) => void;
  logout: () => void;
}

const defaultSettings: AppSettings = {
  player: 'auto',
  decoding: 'auto',
  buffer: 'medium',
  language: 'pt',
  p2p_enabled: false,
  p2p_wifi_only: true,
  p2p_upload_limit: 100,
  theme: 'dark_neon',
  card_size: 'medium',
  animations: true,
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      deviceId: getDeviceId(),
      deviceType: detectDeviceType(),
      appVersion: '1.0.0',
      
      isActivated: false,
      activationStatus: 'pending',
      
      subscription: null,
      daysUntilExpiration: 0,
      
      playlists: [],
      activePlaylist: null,
      channels: [],
      movies: [],
      series: [],
      
      favorites: [],
      watchHistory: [],
      
      notices: [],
      unreadNotices: 0,
      
      settings: defaultSettings,
      
      isLoading: true,
      error: null,
      currentRoute: '/',
      
      // Actions
      setDeviceId: (id: string) => set({ deviceId: id }),
      
      setActivationStatus: (status, message) => set({ 
        activationStatus: status, 
        activationMessage: message,
        isActivated: status === 'approved',
      }),
      
      setSubscription: (sub) => set({ 
        subscription: sub,
        daysUntilExpiration: sub ? calculateDaysUntilExpiration(sub.expires_at) : 0,
      }),
      
      setActivePlaylist: (playlist) => set({ activePlaylist: playlist }),
      
      loadPlaylists: () => {
        // In production, this would fetch from API
        set({ playlists: mockPlaylists });
      },
      
      loadContent: () => {
        // In production, this would fetch from API based on active playlist
        set({ 
          channels: mockChannels, 
          movies: mockMovies, 
          series: mockSeries,
          notices: mockNotices,
          unreadNotices: mockNotices.filter(n => n.active).length,
        });
      },
      
      toggleFavorite: (type, id) => {
        const { favorites } = get();
        const existing = favorites.find(f => f.type === type && f.content_id === id);
        
        if (existing) {
          set({ favorites: favorites.filter(f => f.id !== existing.id) });
        } else {
          set({ 
            favorites: [...favorites, {
              id: Date.now().toString(),
              device_id: get().deviceId,
              type,
              content_id: id,
              created_at: new Date().toISOString(),
            }] 
          });
        }
      },
      
      addToHistory: (history) => {
        const { watchHistory } = get();
        const existing = watchHistory.find(h => h.content_id === history.content_id);
        
        if (existing) {
          set({
            watchHistory: watchHistory.map(h => 
              h.content_id === history.content_id ? { ...h, ...history } : h
            ),
          });
        } else {
          set({ watchHistory: [history, ...watchHistory].slice(0, 100) });
        }
      },
      
      updateSettings: (newSettings) => set({ 
        settings: { ...get().settings, ...newSettings } 
      }),
      
      clearNotices: () => set({ notices: [], unreadNotices: 0 }),
      
      setLoading: (loading) => set({ isLoading: loading }),
      
      setError: (error) => set({ error }),
      
      setCurrentRoute: (route) => set({ currentRoute: route }),
      
      logout: () => {
        set({
          isActivated: false,
          activationStatus: 'pending',
          subscription: null,
          activePlaylist: null,
          channels: [],
          movies: [],
          series: [],
          currentRoute: '/activation',
        });
      },
    }),
    {
      name: 'ronecaplaytv-storage',
      partialize: (state) => ({
        deviceId: state.deviceId,
        deviceType: state.deviceType,
        isActivated: state.isActivated,
        activationStatus: state.activationStatus,
        settings: state.settings,
        favorites: state.favorites,
        watchHistory: state.watchHistory,
      }),
    }
  )
);

function calculateDaysUntilExpiration(expirationDate: string): number {
  const now = new Date();
  const exp = new Date(expirationDate);
  const diffMs = exp.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}
