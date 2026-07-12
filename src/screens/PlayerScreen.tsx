import { useEffect, useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { PlayerAdvancedControls } from '@/components/player/PlayerAdvancedControls';
import { PlayerDiagnosticsController } from '@/components/player/PlayerDiagnosticsController';
import { PlayerRemoteController } from '@/components/player/PlayerRemoteController';
import { PlayerStabilityController } from '@/components/player/PlayerStabilityController';
import { useAppStore } from '@/stores/appStore';
import { installHlsObserver } from '@/utils/hlsObserver';
import { PlayerV2Screen } from './PlayerV2Screen';
import '@/styles/player-stability.css';

function needsHlsObserver(urls: Array<string | undefined>) {
  // No APK o Android reproduz HLS nativamente. Importar hls.js antes de cada
  // vídeo só gastaria memória e atrasaria a abertura sem habilitar controles.
  if (Capacitor.isNativePlatform()) return false;

  return urls.some(url => /\.(m3u8|ts|m2ts|mpegts)(\?|#|$)/i.test(url?.trim() || ''));
}

export function PlayerScreen() {
  const currentChannel = useAppStore(state => state.currentChannel);
  const currentMovie = useAppStore(state => state.currentMovie);

  const shouldObserveHls = useMemo(() => {
    const content = currentMovie || currentChannel;
    if (!content) return false;

    return needsHlsObserver([
      content.url,
      ...(Array.isArray(content.playbackUrls) ? content.playbackUrls : []),
    ]);
  }, [currentChannel, currentMovie]);

  const [observerReady, setObserverReady] = useState(!shouldObserveHls);

  useEffect(() => {
    let cancelled = false;

    if (!shouldObserveHls) {
      setObserverReady(true);
      return () => {
        cancelled = true;
      };
    }

    setObserverReady(false);
    void installHlsObserver().finally(() => {
      if (!cancelled) setObserverReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [shouldObserveHls]);

  if (!observerReady) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black text-center">
        <div>
          <div className="mx-auto mb-5 h-11 w-11 animate-spin rounded-full border-2 border-white/10 border-t-[#d8b15b]" />
          <p className="text-lg font-light text-white/65">Preparando player avançado</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <PlayerRemoteController />
      <PlayerV2Screen />
      <PlayerDiagnosticsController />
      <PlayerStabilityController />
      <PlayerAdvancedControls />
    </>
  );
}
