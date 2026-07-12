import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import {
  recordPlayerDiagnostic,
  type PlayerDiagnosticEvent,
} from '@/utils/playerDiagnostics';

type StabilityStatus = 'buffering' | 'offline' | null;
type BufferSize = 'low' | 'medium' | 'high';

type NetworkInformationLike = EventTarget & {
  effectiveType?: string;
  saveData?: boolean;
  type?: string;
};

const MESSAGE_DELAYS: Record<BufferSize, number> = {
  low: 1_100,
  medium: 1_500,
  high: 2_000,
};

function getConnection() {
  return (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
}

function getConnectionMultiplier() {
  const connection = getConnection();
  const effectiveType = connection?.effectiveType?.toLowerCase() || '';
  const type = connection?.type?.toLowerCase() || '';

  if (connection?.saveData || effectiveType === 'slow-2g' || effectiveType === '2g') {
    return 1.75;
  }

  if (effectiveType === '3g' || type === 'cellular') {
    return 1.4;
  }

  return 1;
}

function isVideoActuallyWaiting(video: HTMLVideoElement) {
  return (
    video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA &&
    !video.ended &&
    (!video.paused || video.seeking)
  );
}

/**
 * Camada exclusivamente visual e de diagnóstico.
 *
 * A recuperação real pertence ao PlayerV2Screen. Este componente não chama
 * load(), play(), seek, startLoad(), recoverMediaError() nem interrompe eventos.
 * Assim HLS, MPEG-TS e reprodução nativa nunca disputam o mesmo elemento de vídeo.
 */
export function PlayerStabilityController() {
  const currentChannel = useAppStore(state => state.currentChannel);
  const currentMovie = useAppStore(state => state.currentMovie);
  const bufferSize = useAppStore(
    state => state.settings.bufferSize ?? 'medium',
  ) as BufferSize;

  const isLive = Boolean(currentChannel && !currentMovie);
  const contentId = currentMovie?.id ?? currentChannel?.id ?? '';

  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<StabilityStatus>(null);

  const messageTimerRef = useRef<number | null>(null);
  const waitingRef = useRef(false);
  const loadStartedAtRef = useRef(0);

  useLayoutEffect(() => {
    const locateVideo = () => {
      const element = document.querySelector<HTMLVideoElement>(
        '.roneca-exoplayer-video',
      );

      if (!element) return false;
      setVideo(element);
      return true;
    };

    if (locateVideo()) return;

    const observer = new MutationObserver(() => {
      if (locateVideo()) observer.disconnect();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    waitingRef.current = false;
    loadStartedAtRef.current = 0;
    setStatus(null);

    if (messageTimerRef.current !== null) {
      window.clearTimeout(messageTimerRef.current);
      messageTimerRef.current = null;
    }
  }, [contentId]);

  useEffect(() => {
    if (!video) return;

    const activeVideo = video;
    let lastDiagnosticKey = '';
    let lastDiagnosticAt = 0;

    const diagnose = (
      event: PlayerDiagnosticEvent,
      startupMs?: number,
    ) => {
      const now = performance.now();
      const key = `${event}:${activeVideo.readyState}:${activeVideo.networkState}:${activeVideo.error?.code ?? 0}`;

      if (key === lastDiagnosticKey && now - lastDiagnosticAt < 750) {
        return;
      }

      lastDiagnosticKey = key;
      lastDiagnosticAt = now;
      recordPlayerDiagnostic(event, activeVideo, {
        contentId,
        isLive,
        startupMs,
      });
    };

    const clearMessageTimer = () => {
      if (messageTimerRef.current === null) return;
      window.clearTimeout(messageTimerRef.current);
      messageTimerRef.current = null;
    };

    const markStable = () => {
      if (
        activeVideo.readyState < HTMLMediaElement.HAVE_FUTURE_DATA &&
        !activeVideo.paused
      ) {
        return;
      }

      waitingRef.current = false;
      clearMessageTimer();
      setStatus(null);
    };

    const scheduleMessage = () => {
      if (messageTimerRef.current !== null) return;

      const delay = Math.round(
        MESSAGE_DELAYS[bufferSize] * getConnectionMultiplier(),
      );

      messageTimerRef.current = window.setTimeout(() => {
        messageTimerRef.current = null;

        if (!waitingRef.current || !isVideoActuallyWaiting(activeVideo)) {
          waitingRef.current = false;
          return;
        }

        setStatus(navigator.onLine ? 'buffering' : 'offline');
      }, delay);
    };

    const handleLoadStart = () => {
      loadStartedAtRef.current = performance.now();
      diagnose('loadstart');
    };

    const handleLoadedMetadata = () => diagnose('loadedmetadata');

    const handleWaiting = (event: Event) => {
      diagnose(event.type === 'stalled' ? 'stalled' : 'waiting');

      if (activeVideo.paused && !activeVideo.seeking) {
        markStable();
        return;
      }

      waitingRef.current = true;

      if (!navigator.onLine) {
        clearMessageTimer();
        setStatus('offline');
        return;
      }

      scheduleMessage();
    };

    const handleCanPlay = () => {
      diagnose('canplay');
      markStable();
    };

    const handlePlaying = () => {
      const startupMs = loadStartedAtRef.current > 0
        ? performance.now() - loadStartedAtRef.current
        : undefined;

      diagnose('playing', startupMs);
      loadStartedAtRef.current = 0;
      markStable();
    };

    const handleProgress = () => {
      if (
        activeVideo.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA &&
        !activeVideo.seeking
      ) {
        markStable();
      }
    };

    const handleError = () => diagnose('error');
    const handleEnded = () => diagnose('ended');

    const handleOffline = () => {
      waitingRef.current = true;
      clearMessageTimer();
      setStatus('offline');
      diagnose('offline');
    };

    const handleOnline = () => {
      diagnose('online');

      if (isVideoActuallyWaiting(activeVideo)) {
        waitingRef.current = true;
        setStatus('buffering');
        return;
      }

      markStable();
    };

    activeVideo.addEventListener('loadstart', handleLoadStart);
    activeVideo.addEventListener('loadedmetadata', handleLoadedMetadata);
    activeVideo.addEventListener('waiting', handleWaiting);
    activeVideo.addEventListener('stalled', handleWaiting);
    activeVideo.addEventListener('playing', handlePlaying);
    activeVideo.addEventListener('canplay', handleCanPlay);
    activeVideo.addEventListener('timeupdate', handleProgress);
    activeVideo.addEventListener('progress', handleProgress);
    activeVideo.addEventListener('seeking', handleWaiting);
    activeVideo.addEventListener('seeked', markStable);
    activeVideo.addEventListener('error', handleError);
    activeVideo.addEventListener('ended', handleEnded);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      clearMessageTimer();
      activeVideo.removeEventListener('loadstart', handleLoadStart);
      activeVideo.removeEventListener('loadedmetadata', handleLoadedMetadata);
      activeVideo.removeEventListener('waiting', handleWaiting);
      activeVideo.removeEventListener('stalled', handleWaiting);
      activeVideo.removeEventListener('playing', handlePlaying);
      activeVideo.removeEventListener('canplay', handleCanPlay);
      activeVideo.removeEventListener('timeupdate', handleProgress);
      activeVideo.removeEventListener('progress', handleProgress);
      activeVideo.removeEventListener('seeking', handleWaiting);
      activeVideo.removeEventListener('seeked', markStable);
      activeVideo.removeEventListener('error', handleError);
      activeVideo.removeEventListener('ended', handleEnded);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [bufferSize, contentId, isLive, video]);

  if (!status) return null;

  const message = status === 'offline'
    ? 'Sem conexão. Aguardando a internet voltar…'
    : isLive
      ? 'Aguardando o sinal estabilizar…'
      : 'Carregando mais vídeo…';

  return (
    <div
      className="player-stability-status"
      data-state={status}
      role="status"
      aria-live="polite"
    >
      <span className="player-stability-spinner" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
