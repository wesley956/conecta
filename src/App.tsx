import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { useTvRemoteNavigation } from '@/hooks/useTvRemoteNavigation';
import { fetchM3UContent } from '@/utils/fetchM3U';
import { fetchDevicePanelConfig, isDevicePanelEnabled } from '@/utils/devicePanel';
import { loadContentCache, saveContentCache } from '@/utils/contentCache';
import { canUsePanelCacheParts, fetchPanelPlaylistCache, fetchPanelPlaylistCacheParts, type PanelPlaylistCacheSnapshot } from '@/utils/panelPlaylistCache';
import { canLoadXtreamSeriesFromPlaylist, prewarmXtreamSeriesCatalog } from '@/utils/xtreamSeries';
import type { AppState, Playlist } from '@/types';

// Screens
import { SplashScreen } from '@/screens/SplashScreen';
import { ActivationScreen } from '@/screens/ActivationScreen';
import { HomeScreen } from '@/screens/HomeScreen';
import { ChannelsScreen } from '@/screens/ChannelsScreen';
import { MoviesScreen } from '@/screens/MoviesScreen';
import { SeriesScreen } from '@/screens/SeriesScreen';
import { PlayerScreen } from '@/screens/PlayerScreen';
import { FavoritesScreen, SearchScreen } from '@/screens/FavoritesSearchScreen';
import { SettingsScreen } from '@/screens/PlaylistsSettingsScreen';
import { ExpiredScreen, BlockedScreen, NoInternetScreen } from '@/screens/ErrorScreens';

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
    case 'settings': return <SettingsScreen />;
    default: return <HomeScreen />;
  }
}

function buildContentCacheSignature() {
  const state = useAppStore.getState();

  const playlistSignature = state.playlists
    .map(playlist => [
      playlist.id,
      playlist.url || '',
      playlist.status,
      playlist.channelCount,
      playlist.movieCount,
      playlist.seriesCount,
      playlist.lastSync || '',
    ].join(':'))
    .join('|');

  return [
    state.channels.length,
    state.movies.length,
    state.series.length,
    state.playlists.length,
    playlistSignature,
  ].join('::');
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

      const xtreamPlaylist = snapshot.playlists.find(playlist => canLoadXtreamSeriesFromPlaylist(playlist.url));
      prewarmXtreamSeriesCatalog(xtreamPlaylist?.url);
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let saveTimer: number | undefined;
    let previousSignature = buildContentCacheSignature();

    const unsubscribe = useAppStore.subscribe(() => {
      const nextSignature = buildContentCacheSignature();

      if (nextSignature === previousSignature) return;

      previousSignature = nextSignature;

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
      }, 2500);
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

const RONECA_PANEL_SYNC_COOLDOWN_MS = 60 * 1000;
const RONECA_PANEL_FORCE_SYNC_KEY = 'ronecaplaytv-force-panel-sync';
const RONECA_CACHE_SYNC_VERSION = 'panel-cache-v3';
const RONECA_DIRECT_SYNC_VERSION = 'direct-playlist-v3';

function hasForcedPanelSync() {
  try {
    return Boolean(localStorage.getItem(RONECA_PANEL_FORCE_SYNC_KEY));
  } catch {
    return false;
  }
}

function clearForcedPanelSync() {
  try {
    localStorage.removeItem(RONECA_PANEL_FORCE_SYNC_KEY);
  } catch {
    // ignora falha de storage
  }
}

function buildPanelPlaylistFallback(
  playlistName: string,
  playlistUrl: string,
  panelCache: PanelPlaylistCacheSnapshot,
): Playlist[] {
  if (Array.isArray(panelCache.playlists) && panelCache.playlists.length > 0) {
    return panelCache.playlists;
  }

  return [{
    id: panelCache.playlistId || `panel-cache-${Date.now()}`,
    name: panelCache.playlistName || playlistName || 'Lista do painel',
    type: 'm3u',
    url: panelCache.playlistUrl || playlistUrl || undefined,
    status: 'active',
    channelCount: panelCache.channels.length,
    movieCount: panelCache.movies.length,
    seriesCount: panelCache.series.length,
    lastSync: panelCache.generatedAt || new Date().toLocaleString('pt-BR'),
  }];
}

async function saveAndMarkPanelCache(
  panelCache: PanelPlaylistCacheSnapshot,
  playlistName: string,
  playlistUrl: string,
  markerKey: string,
  markerValue: string,
) {
  const playlists = buildPanelPlaylistFallback(playlistName, playlistUrl, panelCache);

  useAppStore.getState().hydrateContentCache({
    channels: panelCache.channels,
    movies: panelCache.movies,
    series: panelCache.series,
    playlists,
  });

  const afterHydrate = useAppStore.getState();

  await saveContentCache({
    channels: afterHydrate.channels,
    movies: afterHydrate.movies,
    series: afterHydrate.series,
    playlists: afterHydrate.playlists,
  });

  localStorage.setItem(markerKey, markerValue);
  clearForcedPanelSync();

  const xtreamPlaylist = afterHydrate.playlists.find(playlist => canLoadXtreamSeriesFromPlaylist(playlist.url));
  prewarmXtreamSeriesCatalog(xtreamPlaylist?.url || playlistUrl);
}

// ===== DEVICE PANEL AUTO SYNC =====
function DevicePanelSync() {
  const syncingRef = useRef(false);
  const lastPanelSyncAtRef = useRef(0);
  const deviceCode = useAppStore(state => state.deviceCode);
  const currentScreen = useAppStore(state => state.currentScreen);
  const [syncPulse, setSyncPulse] = useState(0);

  useEffect(() => {
    if (!isDevicePanelEnabled()) return;

    const requestSync = () => setSyncPulse(value => value + 1);
    const intervalId = window.setInterval(requestSync, 60 * 1000);

    const handleVisibilityChange = () => {
      if (!document.hidden) requestSync();
    };

    window.addEventListener('focus', requestSync);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', requestSync);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!isDevicePanelEnabled()) return;
    if (currentScreen === 'player') return;
    if (syncingRef.current) return;

    const forceSyncRequested = hasForcedPanelSync();
    const gateScreens: AppState[] = ['splash', 'activation', 'blocked', 'expired', 'nointernet'];
    const shouldBypassCooldown = forceSyncRequested || gateScreens.includes(currentScreen);
    const now = Date.now();

    if (!shouldBypassCooldown && now - lastPanelSyncAtRef.current < RONECA_PANEL_SYNC_COOLDOWN_MS) {
      return;
    }

    lastPanelSyncAtRef.current = now;

    let cancelled = false;

    async function syncFromPanel() {
      syncingRef.current = true;
      const { setScreen, setDeviceActivated, setSubscription, setActiveNotice } = useAppStore.getState();

      try {
        const activeDeviceCode = String(deviceCode || '').trim();

        if (!activeDeviceCode) {
          setDeviceActivated(false);
          setScreen('activation');
          return;
        }

        const config = await fetchDevicePanelConfig(activeDeviceCode);

        if (cancelled) return;

        if (!config.active) {
          setDeviceActivated(false);
          setActiveNotice(config.message || 'Aparelho aguardando liberação no painel.');

          if (config.status === 'blocked') {
            setScreen('blocked');
          } else if (config.status === 'expired') {
            setScreen('expired');
          } else {
            setScreen('activation');
          }

          return;
        }

        setDeviceActivated(true);

        if (config.expiresAt) {
          const expiresAt = new Date(config.expiresAt);
          const now = new Date();
          const days = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 86400000));
          setSubscription(days > 0, config.expiresAt, days);
        }

        const activeScreen = useAppStore.getState().currentScreen;

        if (['splash', 'activation', 'blocked', 'expired', 'nointernet'].includes(activeScreen)) {
          setScreen('home');
        }

        const playlistUrl = String(config.playlistUrl ?? '').trim();
        const playlistName = String(config.playlistName || config.clientName || 'Lista do painel');
        const playlistUpdatedAt = String(config.playlistUpdatedAt || '');
        const cacheStatus = String(config.cacheStatus || '').trim();
        const panelMarkerKey = `ronecaplaytv-panel-sync-${activeDeviceCode}`;
        const cacheMarkerValue = [
          RONECA_CACHE_SYNC_VERSION,
          String(config.cacheVersion || ''),
          String(config.cacheUpdatedAt || ''),
          String(config.cacheItemCount || ''),
          playlistUpdatedAt,
        ].join('|');
        const directMarkerValue = [
          RONECA_DIRECT_SYNC_VERSION,
          playlistUpdatedAt,
          playlistUrl,
        ].join('|');
        const preferredMarkerValue = cacheStatus === 'ready' ? cacheMarkerValue : directMarkerValue;

        const state = useAppStore.getState();
        const existingPlaylist = playlistUrl
          ? state.playlists.find(playlist => playlist.url === playlistUrl)
          : state.playlists[0];
        const hasContentInMemory = state.channels.length > 0 || state.movies.length > 0 || state.series.length > 0;
        const lastPanelUpdate = localStorage.getItem(panelMarkerKey) || '';

        const panelChanged = Boolean(preferredMarkerValue && preferredMarkerValue !== lastPanelUpdate);
        const shouldSync = forceSyncRequested || !existingPlaylist || !hasContentInMemory || panelChanged;

        if (!shouldSync) {
          setActiveNotice(null);
          return;
        }

        const cachedSnapshot = await loadContentCache();

        if (cancelled) return;

        const cachedTotal =
          (cachedSnapshot?.channels.length ?? 0) +
          (cachedSnapshot?.movies.length ?? 0) +
          (cachedSnapshot?.series.length ?? 0);

        const cachedPlaylist = playlistUrl
          ? cachedSnapshot?.playlists.find(playlist => playlist.url === playlistUrl)
          : cachedSnapshot?.playlists[0];
        const canUseLocalCache =
          !forceSyncRequested &&
          Boolean(cachedSnapshot && cachedPlaylist && cachedTotal > 0) &&
          lastPanelUpdate === preferredMarkerValue;

        if (canUseLocalCache && cachedSnapshot) {
          useAppStore.getState().hydrateContentCache({
            channels: cachedSnapshot.channels,
            movies: cachedSnapshot.movies,
            series: cachedSnapshot.series,
            playlists: cachedSnapshot.playlists,
          });

          setActiveNotice(
            `⚡ Lista aberta do cache local: ${cachedSnapshot.channels.length} canal(is), ` +
            `${cachedSnapshot.movies.length} filme(s) e ${cachedSnapshot.series.length} série(s).`
          );

          return;
        }

        let cacheErrorMessage = '';

        if (cacheStatus === 'ready' && canUsePanelCacheParts(config.cacheParts)) {
          setActiveNotice('⚡ Abrindo cache rápido do Supabase...');

          try {
            const panelCache = await fetchPanelPlaylistCacheParts(config.cacheParts!, {
              onChannels: ({ channels, playlists }) => {
                if (cancelled) return;

                useAppStore.getState().hydrateContentCache({
                  channels,
                  movies: [],
                  series: [],
                  playlists,
                });

                setActiveNotice(`✅ Cache Supabase: ${channels.length} canal(is). Carregando filmes...`);
              },
              onMovies: ({ movies }) => {
                if (cancelled) return;

                const currentState = useAppStore.getState();

                useAppStore.getState().hydrateContentCache({
                  channels: currentState.channels,
                  movies,
                  series: currentState.series,
                  playlists: currentState.playlists,
                });

                setActiveNotice(`✅ Cache Supabase: ${movies.length} filme(s). Carregando séries...`);
              },
              onSeries: ({ series }) => {
                if (cancelled) return;

                const currentState = useAppStore.getState();

                useAppStore.getState().hydrateContentCache({
                  channels: currentState.channels,
                  movies: currentState.movies,
                  series,
                  playlists: currentState.playlists,
                });
              },
            });

            if (cancelled) return;

            await saveAndMarkPanelCache(panelCache, playlistName, playlistUrl, panelMarkerKey, cacheMarkerValue);

            setActiveNotice(
              `✅ Cache Supabase pronto: ${panelCache.channels.length} canal(is), ` +
              `${panelCache.movies.length} filme(s) e ${panelCache.series.length} série(s).`
            );

            return;
          } catch (error) {
            cacheErrorMessage = error instanceof Error ? error.message : 'Cache Supabase indisponível.';
            setActiveNotice(`⚠️ Cache Supabase falhou: ${cacheErrorMessage}`);
          }
        }

        if (cacheStatus === 'ready' && config.cacheSnapshotUrl) {
          setActiveNotice('⚡ Abrindo snapshot do Supabase...');

          try {
            const panelCache = await fetchPanelPlaylistCache(config.cacheSnapshotUrl);

            if (cancelled) return;

            await saveAndMarkPanelCache(panelCache, playlistName, playlistUrl, panelMarkerKey, cacheMarkerValue);

            setActiveNotice(
              `✅ Snapshot Supabase pronto: ${panelCache.channels.length} canal(is), ` +
              `${panelCache.movies.length} filme(s) e ${panelCache.series.length} série(s).`
            );

            return;
          } catch (error) {
            cacheErrorMessage = error instanceof Error ? error.message : 'Snapshot Supabase indisponível.';
            setActiveNotice(`⚠️ Snapshot Supabase falhou: ${cacheErrorMessage}`);
          }
        }

        if (!playlistUrl) {
          setActiveNotice(
            cacheErrorMessage
              ? `Atenção: cache do painel falhou e nenhuma URL de lista foi enviada. ${cacheErrorMessage}`
              : '✅ Aparelho ativo, mas nenhuma lista foi vinculada no painel.'
          );
          return;
        }

        setActiveNotice(
          cacheErrorMessage
            ? `🔄 Cache indisponível. Baixando lista real como fallback... ${cacheErrorMessage}`
            : '🔄 Carregando lista vinculada ao painel...'
        );

        const content = await fetchM3UContent(playlistUrl);

        if (cancelled) return;

        setActiveNotice('🔄 Lista baixada. Organizando canais, filmes e séries...');

        const freshState = useAppStore.getState();
        const currentPlaylist = freshState.playlists.find(playlist => playlist.url === playlistUrl);

        const result = currentPlaylist
          ? await freshState.replaceM3UPlaylist(currentPlaylist.id, playlistName, playlistUrl, content)
          : await freshState.importM3UPlaylist(playlistName, playlistUrl, content);

        if (cancelled) return;

        setActiveNotice('💾 Salvando lista no cache local para as próximas aberturas...');

        const afterImport = useAppStore.getState();

        await saveContentCache({
          channels: afterImport.channels,
          movies: afterImport.movies,
          series: afterImport.series,
          playlists: afterImport.playlists,
        });

        localStorage.setItem(panelMarkerKey, directMarkerValue);
        clearForcedPanelSync();
        prewarmXtreamSeriesCatalog(playlistUrl);

        setActiveNotice(
          `✅ Lista pronta e salva no aparelho: ${result.imported} item(ns). ` +
          'Nas próximas vezes o app deve abrir muito mais rápido.'
        );
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Falha ao consultar painel.';
          setActiveNotice(`Atenção: ${message}`);
        }
      } finally {
        syncingRef.current = false;
      }
    }

    void syncFromPanel();

    return () => {
      cancelled = true;
    };
  }, [
    deviceCode,
    currentScreen,
    syncPulse,
  ]);

  return null;
}

// ===== MAIN APP =====
export default function App() {
  useTvRemoteNavigation();
  const currentScreen = useAppStore(state => state.currentScreen);

  // Detect UI mode changes based on window size and orientation.
  useEffect(() => {
    const handleResize = () => {
      const { setUIMode } = useAppStore.getState();
      const isTV = window.innerWidth > 1024 && window.matchMedia('(orientation: landscape)').matches;
      setUIMode(isTV ? 'tv' : 'mobile');
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return (
    <div className="h-screen w-screen bg-bg-primary overflow-hidden">
      <ContentCacheHydrator />
      <DevicePanelSync />
      <AppScreen screen={currentScreen} />
    </div>
  );
}
