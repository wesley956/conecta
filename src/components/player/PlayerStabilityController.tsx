import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { subscribeObservedHls, type ObservedHlsInstance } from '@/utils/hlsObserver';

type StabilityStatus = 'buffering' | 'recovering' | 'offline' | null;
type BufferSize = 'low' | 'medium' | 'high';

type NetworkInformationLike = EventTarget & {
  effectiveType?: string;
  saveData?: boolean;
  type?: string;
};

const MAX_ASSISTED_RECOVERIES = 4;
const STABLE_PLAYBACK_RESET_MS = 18_000;

const BASE_DELAYS: Record<BufferSize, { message: number; liveRecovery: number; vodRecovery: number }> = {
  low: { message: 1_100, liveRecovery: 8_000, vodRecovery: 16_000 },
  medium: { message: 1_500, liveRecovery: 11_000, vodRecovery: 21_000 },
  high: { message: 2_000, liveRecovery: 15_000, vodRecovery: 28_000 },
};

function getConnection() {
  return (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
}

function getMobileDataMultiplier() {
  const connection = getConnection();
  const effectiveType = connection?.effectiveType?.toLowerCase() || '';
  const type = connection?.type?.toLowerCase() || '';

  if (connection?.saveData || effectiveType === 'slow-2g' || effectiveType === '2g') return 1.75;
  if (effectiveType === '3g' || type === 'cellular') return 1.4;
  return 1;
}

function isVideoStillWaiting(video: HTMLVideoElement) {
  return (
    video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA &&
    !video.ended &&
    (!video.paused || video.seeking)
  );
}

function seekToLiveEdge(video: HTMLVideoElement) {
  if (video.seekable.length === 0) return false;

  try {
    const liveEdge = video.seekable.end(video.seekable.length - 1);
    if (!Number.isFinite(liveEdge)) return false;
    video.currentTime = Math.max(0, liveEdge - 0.35);
    return true;
  } catch {
    return false;
  }
}

export function PlayerStabilityController() {
  const currentChannel = useAppStore(state => state.currentChannel);
  const currentMovie = useAppStore(state => state.currentMovie);
  const bufferSize = useAppStore(state => state.settings.bufferSize ?? 'medium') as BufferSize;
  const autoReconnect = useAppStore(state => state.settings.autoReconnect ?? true);

  const isLive = Boolean(currentChannel && !currentMovie);
  const contentId = currentMovie?.id ?? currentChannel?.id ?? '';

  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [hls, setHls] = useState<ObservedHlsInstance | null>(null);
  const [status, setStatus] = useState<StabilityStatus>(null);

  const messageTimerRef = useRef<number | null>(null);
  const recoveryTimerRef = useRef<number | null>(null);
  const recoveryUnlockTimerRef = useRef<number | null>(null);
  const stableTimerRef = useRef<number | null>(null);
  const restoreTimerRef = useRef<number | null>(null);
  const recoveryAttemptsRef = useRef(0);
  const recoveryInFlightRef = useRef(false);
  const waitingRef = useRef(false);
  const savedPositionRef = useRef(0);

  useLayoutEffect(() => {
    const locateVideo = () => {
      const element = document.querySelector<HTMLVideoElement>('.roneca-exoplayer-video');
      if (!element) return false;
      setVideo(element);
      return true;
    };

    if (locateVideo()) return;

    const observer = new MutationObserver(() => {
      if (locateVideo()) observer.disconnect();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => subscribeObservedHls(setHls), []);

  useEffect(() => {
    recoveryAttemptsRef.current = 0;
    recoveryInFlightRef.current = false;
    waitingRef.current = false;
    savedPositionRef.current = 0;
    setStatus(null);
  }, [contentId]);

  useEffect(() => {
    if (!video) return;

    // A referência local imutável mantém o estreitamento de tipo dentro dos
    // callbacks assíncronos e garante que todos removam eventos do mesmo vídeo.
    const activeVideo = video;

    const clearTimer = (ref: { current: number | null }) => {
      if (ref.current !== null) {
        window.clearTimeout(ref.current);
        ref.current = null;
      }
    };

    const clearWaitingTimers = () => {
      clearTimer(messageTimerRef);
      clearTimer(recoveryTimerRef);
      clearTimer(recoveryUnlockTimerRef);
    };

    const clearAllTimers = () => {
      clearWaitingTimers();
      clearTimer(stableTimerRef);
      clearTimer(restoreTimerRef);
    };

    const markStablePlayback = () => {
      waitingRef.current = false;
      recoveryInFlightRef.current = false;
      clearWaitingTimers();
      setStatus(null);

      clearTimer(stableTimerRef);
      stableTimerRef.current = window.setTimeout(() => {
        recoveryAttemptsRef.current = 0;
        stableTimerRef.current = null;
      }, STABLE_PLAYBACK_RESET_MS);
    };

    const restoreVodAfterReload = () => {
      if (isLive || savedPositionRef.current <= 0) return;

      const restore = () => {
        if (!Number.isFinite(activeVideo.duration) || activeVideo.duration <= 0) return;
        activeVideo.currentTime = Math.min(savedPositionRef.current, Math.max(0, activeVideo.duration - 3));
        activeVideo.play().catch(() => undefined);
      };

      activeVideo.addEventListener('loadedmetadata', restore, { once: true });
      restoreTimerRef.current = window.setTimeout(() => {
        activeVideo.removeEventListener('loadedmetadata', restore);
        restoreTimerRef.current = null;
      }, 12_000);
    };

    function scheduleRecovery() {
      if (!autoReconnect || recoveryTimerRef.current !== null || !navigator.onLine) return;
      if (!waitingRef.current || !isVideoStillWaiting(activeVideo)) return;

      const multiplier = getMobileDataMultiplier();
      const baseDelay = isLive ? BASE_DELAYS[bufferSize].liveRecovery : BASE_DELAYS[bufferSize].vodRecovery;
      const backoff = 1 + recoveryAttemptsRef.current * 0.45;

      recoveryTimerRef.current = window.setTimeout(
        performRecovery,
        Math.round(baseDelay * multiplier * backoff),
      );
    }

    function armNextRecoveryAttempt() {
      clearTimer(recoveryUnlockTimerRef);

      const wait = Math.max(3_500, Math.round(BASE_DELAYS[bufferSize].message * 2.5));
      recoveryUnlockTimerRef.current = window.setTimeout(() => {
        recoveryUnlockTimerRef.current = null;
        recoveryInFlightRef.current = false;

        if (waitingRef.current && isVideoStillWaiting(activeVideo)) {
          setStatus('buffering');
          scheduleRecovery();
        }
      }, wait);
    }

    function performRecovery() {
      recoveryTimerRef.current = null;

      if (!waitingRef.current || !isVideoStillWaiting(activeVideo) || !autoReconnect || !navigator.onLine) {
        recoveryInFlightRef.current = false;
        return;
      }

      if (recoveryInFlightRef.current || recoveryAttemptsRef.current >= MAX_ASSISTED_RECOVERIES) {
        setStatus('buffering');
        return;
      }

      recoveryInFlightRef.current = true;
      recoveryAttemptsRef.current += 1;
      setStatus('recovering');

      try {
        if (hls?.startLoad) {
          hls.startLoad(-1);
          activeVideo.play().catch(() => undefined);
          armNextRecoveryAttempt();
          return;
        }

        if (isLive) {
          const movedToEdge = seekToLiveEdge(activeVideo);

          if (!movedToEdge && recoveryAttemptsRef.current >= 2) {
            activeVideo.load();
          }

          activeVideo.play().catch(() => undefined);
          armNextRecoveryAttempt();
          return;
        }

        savedPositionRef.current = Number.isFinite(activeVideo.currentTime) ? activeVideo.currentTime : 0;

        if (recoveryAttemptsRef.current === 1) {
          activeVideo.play().catch(() => undefined);
          armNextRecoveryAttempt();
          return;
        }

        restoreVodAfterReload();
        activeVideo.load();
        armNextRecoveryAttempt();
      } catch {
        recoveryInFlightRef.current = false;
        setStatus('buffering');
        scheduleRecovery();
      }
    }

    const scheduleMessage = () => {
      if (messageTimerRef.current !== null) return;

      const delay = Math.round(BASE_DELAYS[bufferSize].message * getMobileDataMultiplier());
      messageTimerRef.current = window.setTimeout(() => {
        messageTimerRef.current = null;

        if (!waitingRef.current || !isVideoStillWaiting(activeVideo)) {
          waitingRef.current = false;
          return;
        }

        setStatus(navigator.onLine ? 'buffering' : 'offline');
      }, delay);
    };

    const handleWaiting = (event: Event) => {
      // O núcleo antigo reagia imediatamente a qualquer microbuffer. Esta camada
      // assume o evento e só mostra/recupera quando a interrupção é sustentada.
      event.stopImmediatePropagation();

      if (activeVideo.paused && !activeVideo.seeking) {
        waitingRef.current = false;
        clearWaitingTimers();
        setStatus(null);
        return;
      }

      waitingRef.current = true;
      recoveryInFlightRef.current = false;
      clearTimer(stableTimerRef);

      if (!navigator.onLine) {
        setStatus('offline');
        return;
      }

      scheduleMessage();
      scheduleRecovery();
    };

    const handlePlaying = () => markStablePlayback();
    const handleCanPlay = () => {
      if (activeVideo.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) markStablePlayback();
    };

    const handleOffline = () => {
      waitingRef.current = true;
      recoveryInFlightRef.current = false;
      clearWaitingTimers();
      setStatus('offline');
    };

    const handleOnline = () => {
      if (!waitingRef.current && activeVideo.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
        setStatus(null);
        return;
      }

      setStatus('buffering');
      clearTimer(recoveryTimerRef);
      recoveryTimerRef.current = window.setTimeout(performRecovery, 650);
    };

    activeVideo.addEventListener('waiting', handleWaiting, true);
    activeVideo.addEventListener('stalled', handleWaiting, true);
    activeVideo.addEventListener('playing', handlePlaying, true);
    activeVideo.addEventListener('canplay', handleCanPlay, true);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      clearAllTimers();
      activeVideo.removeEventListener('waiting', handleWaiting, true);
      activeVideo.removeEventListener('stalled', handleWaiting, true);
      activeVideo.removeEventListener('playing', handlePlaying, true);
      activeVideo.removeEventListener('canplay', handleCanPlay, true);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [autoReconnect, bufferSize, hls, isLive, video]);

  if (!status) return null;

  const message = status === 'offline'
    ? 'Sem conexão. Aguardando a internet voltar…'
    : status === 'recovering'
      ? isLive
        ? 'Sinal instável. Restabelecendo a transmissão…'
        : 'Conexão instável. Recuperando o vídeo…'
      : isLive
        ? 'Aguardando o sinal estabilizar…'
        : 'Carregando mais vídeo…';

  return (
    <div className="player-stability-status" data-state={status} role="status" aria-live="polite">
      <span className="player-stability-spinner" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
