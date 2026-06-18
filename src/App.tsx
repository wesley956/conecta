import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '@/stores/appStore';
import { fetchM3UContent } from '@/utils/fetchM3U';
import { fetchDevicePanelConfig, isDevicePanelEnabled } from '@/utils/devicePanel';
import { loadContentCache, saveContentCache } from '@/utils/contentCache';
import type { AppState, AdminView } from '@/types';

// Screens
import { SplashScreen } from '@/screens/SplashScreen';
import { ActivationScreen } from '@/screens/ActivationScreen';
import { HomeScreen } from '@/screens/HomeScreen';
import { ChannelsScreen } from '@/screens/ChannelsScreen';
import { MoviesScreen } from '@/screens/MoviesScreen';
import { SeriesScreen } from '@/screens/SeriesScreen';
import { PlayerScreen } from '@/screens/PlayerScreen';
import { FavoritesScreen, SearchScreen } from '@/screens/FavoritesSearchScreen';
import { PlaylistsScreen, SettingsScreen } from '@/screens/PlaylistsSettingsScreen';
import { ExpiredScreen, BlockedScreen, NoInternetScreen } from '@/screens/ErrorScreens';

// Admin
import { AdminLayout, AdminDashboard } from '@/admin/AdminLayout';
import { AdminCustomers, AdminDevices } from '@/admin/CustomersDevices';
import { AdminPlans, AdminPlaylists, AdminNotices, AdminLogs, AdminSettings } from '@/admin/AdminModules';

// ===== SCREEN ROUTER =====
function AppScreen({ screen }: { screen: AppState }) {
  switch (screen) {
    case 'splash': return <SplashScreen />;
    case 'activation': return <ActivationScreen />;
    case 'expired': return <ExpiredScreen />;
    case 'blocked': return <BlockedScreen />;
    case 'nointernet': return <NoInternetScreen />;
    case 'home': return <HomeScreen />;
    case 'channels': return <ChannelsScreen />;
    case 'movies': return <MoviesScreen />;
    case 'series': return <SeriesScreen />;
    case 'player': return <PlayerScreen />;
    case 'favorites': return <FavoritesScreen />;
    case 'search': return <SearchScreen />;
    case 'playlists': return <PlaylistsScreen />;
    case 'settings': return <SettingsScreen />;
    default: return <HomeScreen />;
  }
}

// ===== ADMIN PANEL =====
function AdminPanel() {
  const [activeView, setActiveView] = useState<AdminView>('dashboard');

  const renderView = () => {
    switch (activeView) {
      case 'dashboard': return <AdminDashboard />;
      case 'customers': return <AdminCustomers />;
      case 'devices': return <AdminDevices />;
      case 'plans': return <AdminPlans />;
      case 'playlists': return <AdminPlaylists />;
      case 'notices': return <AdminNotices />;
      case 'logs': return <AdminLogs />;
      case 'settings': return <AdminSettings />;
      default: return <AdminDashboard />;
    }
  };

  return (
    <AdminLayout activeView={activeView} onViewChange={setActiveView}>
      {renderView()}
    </AdminLayout>
  );
}



// ===== CONTENT CACHE HYDRATOR =====
function ContentCacheHydrator() {
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;

    hydratedRef.current = true;
    let cancelled = false;

    async function hydrate() {
      const snapshot = await loadContentCache();

      if (cancelled || !snapshot) return;

      const total = snapshot.channels.length + snapshot.movies.length + snapshot.series.length;

      if (total === 0 && snapshot.playlists.length === 0) return;

      useAppStore.getState().hydrateContentCache({
        channels: snapshot.channels,
        movies: snapshot.movies,
        series: snapshot.series,
        playlists: snapshot.playlists,
      });
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let saveTimer: number | undefined;
    let previous = {
      channels: useAppStore.getState().channels,
      movies: useAppStore.getState().movies,
      series: useAppStore.getState().series,
      playlists: useAppStore.getState().playlists,
    };

    const unsubscribe = useAppStore.subscribe((state) => {
      const contentChanged =
        previous.channels !== state.channels ||
        previous.movies !== state.movies ||
        previous.series !== state.series ||
        previous.playlists !== state.playlists;

      if (!contentChanged) return;

      previous = {
        channels: state.channels,
        movies: state.movies,
        series: state.series,
        playlists: state.playlists,
      };

      if (saveTimer) {
        window.clearTimeout(saveTimer);
      }

      saveTimer = window.setTimeout(() => {
        const latest = useAppStore.getState();

        void saveContentCache({
          channels: latest.channels,
          movies: latest.movies,
          series: latest.series,
          playlists: latest.playlists,
        });
      }, 900);
    });

    return () => {
      unsubscribe();

      if (saveTimer) {
        window.clearTimeout(saveTimer);
      }
    };
  }, []);

  return null;
}

// ===== DEVICE PANEL AUTO SYNC =====
function DevicePanelSync() {
  const syncingRef = useRef(false);
  const deviceCode = useAppStore(state => state.deviceCode);
  const setDeviceActivated = useAppStore(state => state.setDeviceActivated);
  const setSubscription = useAppStore(state => state.setSubscription);
  const setActiveNotice = useAppStore(state => state.setActiveNotice);

  useEffect(() => {
    if (!isDevicePanelEnabled()) return;
    if (!deviceCode) return;
    if (syncingRef.current) return;

    let cancelled = false;

    async function syncFromPanel() {
      syncingRef.current = true;

      try {
        const config = await fetchDevicePanelConfig(deviceCode);

        if (cancelled) return;

        if (!config.active) {
          setDeviceActivated(false);
          setActiveNotice(config.message || '⏳ Aparelho aguardando liberação no painel.');
          return;
        }

        setDeviceActivated(true);

        if (config.expiresAt) {
          const expiresAt = new Date(config.expiresAt);
          const now = new Date();
          const days = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 86400000));
          setSubscription(days > 0, config.expiresAt, days);
        }

        const playlistUrl = String(config.playlistUrl ?? '').trim();

        if (!playlistUrl) {
          setActiveNotice('✅ Aparelho ativo, mas nenhuma lista foi vinculada no painel.');
          return;
        }

        const playlistName = String(config.playlistName || config.clientName || 'Lista do painel');
        const playlistUpdatedAt = String(config.playlistUpdatedAt || '');
        const panelMarkerKey = `ronecaplaytv-panel-sync-${deviceCode}`;

        const state = useAppStore.getState();
        const existingPlaylist = state.playlists.find(playlist => playlist.url === playlistUrl);
        const hasContentInMemory = state.channels.length > 0 || state.movies.length > 0 || state.series.length > 0;
        const lastPanelUpdate = localStorage.getItem(panelMarkerKey) || '';

        const shouldSync =
          !existingPlaylist ||
          !hasContentInMemory ||
          Boolean(playlistUpdatedAt && playlistUpdatedAt !== lastPanelUpdate);

        if (!shouldSync) {
          return;
        }

        setActiveNotice('🔄 Carregando lista vinculada ao painel...');

        const content = await fetchM3UContent(playlistUrl);

        if (cancelled) return;

        const freshState = useAppStore.getState();
        const currentPlaylist = freshState.playlists.find(playlist => playlist.url === playlistUrl);

        if (currentPlaylist) {
          freshState.replaceM3UPlaylist(currentPlaylist.id, playlistName, playlistUrl, content);
        } else {
          freshState.importM3UPlaylist(playlistName, playlistUrl, content);
        }

        localStorage.setItem(panelMarkerKey, playlistUpdatedAt || new Date().toISOString());
        setActiveNotice('✅ Lista carregada automaticamente pelo painel.');
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Falha ao consultar painel.';
          setActiveNotice(`⚠️ ${message}`);
        }
      } finally {
        syncingRef.current = false;
      }
    }

    void syncFromPanel();

    return () => {
      cancelled = true;
    };
  }, [deviceCode, setActiveNotice, setDeviceActivated, setSubscription]);

  return null;
}

// ===== MAIN APP =====
export default function App() {
  const { currentScreen, isAdminMode } = useAppStore();

  // Keyboard navigation for TV remote control
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const { setScreen, currentScreen: screen } = useAppStore.getState();
    
    // Global back navigation
    if (e.key === 'Escape' || (e.key === 'Backspace' && screen !== 'splash' && screen !== 'home')) {
      if (screen === 'player') {
        setScreen('home');
      }
    }

    // Quick access keys
    if (e.ctrlKey || e.metaKey) return;
    
    // Number keys for quick navigation on home
    if (screen === 'home') {
      switch (e.key) {
        case '1': setScreen('channels'); break;
        case '2': setScreen('movies'); break;
        case '3': setScreen('series'); break;
        case '4': setScreen('favorites'); break;
        case '5': setScreen('settings'); break;
        case '6': setScreen('playlists'); break;
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Detect UI mode changes based on window size
  useEffect(() => {
    const handleResize = () => {
      const { setUIMode } = useAppStore.getState();
      const isTV = window.innerWidth > 1024 && window.matchMedia('(orientation: landscape)').matches;
      setUIMode(isTV ? 'tv' : 'mobile');
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (isAdminMode) {
    return <AdminPanel />;
  }

  return (
    <div className="h-screen w-screen bg-bg-primary overflow-hidden">
      <ContentCacheHydrator />
      <DevicePanelSync />
      <AppScreen screen={currentScreen} />
    </div>
  );
}
