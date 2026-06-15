import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/stores/appStore';
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
      <AppScreen screen={currentScreen} />
    </div>
  );
}
