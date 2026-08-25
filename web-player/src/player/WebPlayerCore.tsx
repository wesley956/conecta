import Hls from 'hls.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiError,
  fetchLibrary,
  getActiveAccessToken,
  recoverPlayback,
  reportWebDiagnostic,
} from '../api';
import type { EpgProgram, PlaybackAuthorization, WebChannel, WebEpisode } from '../types';
import { playerClock, resolveLiveEpg, selectQuickChannels, type PlayerEpisodeItem } from './premiumModel';

type AspectMode = 'contain' | 'cover' | 'fill';

type Props = {
  authorization: PlaybackAuthorization;
  title: string;
  epg?: EpgProgram[];
  initialPosition?: number;
  liveChannels?: WebChannel[];
  favoriteChannelIds?: string[];
  activeContentId?: string;
  episodeItems?: PlayerEpisodeItem[];
  onSwitchChannel?: (channel: WebChannel) => void;
  onSwitchEpisode?: (episode: WebEpisode) => void;
  onProgress?: (position: number, duration: number) => void;
  onClose: () => void;
};

const STABLE_WINDOW_MS = 10_000;
const WATCHDOG_TICK_MS = 2_500;
const WATCHDOG_STALL_TICKS = 3;
const HLS_LOCAL_MEDIA_RECOVERIES = 1;
const HLS_LOCAL_NETWORK_RECOVERIES = 1;
const HLS_LOCAL_STALL_RECOVERIES = 1;
const BUFFERING_UI_DELAY_MS = 1_500;
const CHROME_HIDE_MS = 2_900;

function aspectLabel(mode: AspectMode) { return mode === 'cover' ? 'Preencher' : mode === 'fill' ? 'Estender' : 'Original'; }
function nativeMediaErrorCode(video: HTMLVideoElement) {
  const code = video.error?.code || 0;
  if (code === MediaError.MEDIA_ERR_NETWORK) return 'WEB_MEDIA_NETWORK_ERROR';
  if (code === MediaError.MEDIA_ERR_DECODE) return 'WEB_MEDIA_DECODER_ERROR';
  if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) return 'WEB_MEDIA_CODEC_ERROR';
  return 'WEB_MEDIA_ERROR';
}

export function WebPlayer({
  authorization,
  title,
  epg = [],
  initialPosition = 0,
  liveChannels = [],
  favoriteChannelIds = [],
  activeContentId,
  episodeItems = [],
  onSwitchChannel,
  onSwitchEpisode,
  onProgress,
  onClose,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const authorizationRef = useRef(authorization);
  const lastCheckpointRef = useRef(0);
  const resumePositionRef = useRef(initialPosition);
  const recoveryBusyRef = useRef(false);
  const recoveryTimerRef = useRef<number | null>(null);
  const stableTimerRef = useRef<number | null>(null);
  const watchdogRef = useRef<number | null>(null);
  const renewalTimerRef = useRef<number | null>(null);
  const bufferingTimerRef = useRef<number | null>(null);
  const chromeTimerRef = useRef<number | null>(null);
  const watchdogLastTimeRef = useRef(0);
  const watchdogStallsRef = useRef(0);
  const watchdogSoftRecoveriesRef = useRef(0);
  const hlsMediaRecoveriesRef = useRef(0);
  const hlsNetworkRecoveriesRef = useRef(0);
  const recoveryCorrelationRef = useRef<string | null>(null);
  const offlinePendingRef = useRef(false);
  const generationRef = useRef(0);

  const [activeAuthorization, setActiveAuthorization] = useState(authorization);
  const [aspect, setAspect] = useState<AspectMode>('contain');
  const [error, setError] = useState<string | null>(null);
  const [recoveryStatus, setRecoveryStatus] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [channelDrawer, setChannelDrawer] = useState(false);
  const [channelQuery, setChannelQuery] = useState('');
  const [channelCategory, setChannelCategory] = useState('Todos');
  const [chromeVisible, setChromeVisible] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(initialPosition);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [audioTracks, setAudioTracks] = useState<Array<{ id: number; name: string }>>([]);
  const [subtitleTracks, setSubtitleTracks] = useState<Array<{ id: number; name: string }>>([]);
  const live = activeAuthorization.contentType === 'channel';

  const favoriteChannels = useMemo(() => new Set(favoriteChannelIds), [favoriteChannelIds]);
  const quickChannels = useMemo(
    () => selectQuickChannels(liveChannels, activeContentId, 8),
    [activeContentId, liveChannels],
  );
  const liveEpg = useMemo(() => resolveLiveEpg(epg), [epg]);
  const channelCategories = useMemo(() => [
    'Todos',
    ...(favoriteChannels.size ? ['Favoritos'] : []),
    ...[...new Set(liveChannels.map(channel => channel.category).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b)),
  ], [favoriteChannels.size, liveChannels]);
  const drawerChannels = useMemo(() => {
    const term = channelQuery.trim().toLocaleLowerCase('pt-BR');
    return liveChannels.filter(channel => {
      if (channelCategory === 'Favoritos' && !favoriteChannels.has(channel.contentId)) return false;
      if (channelCategory !== 'Todos' && channelCategory !== 'Favoritos' && channel.category !== channelCategory) return false;
      return !term || `${channel.title} ${channel.category || ''}`.toLocaleLowerCase('pt-BR').includes(term);
    });
  }, [channelCategory, channelQuery, favoriteChannels, liveChannels]);

  const clearChromeTimer = useCallback(() => {
    if (chromeTimerRef.current) window.clearTimeout(chromeTimerRef.current);
    chromeTimerRef.current = null;
  }, []);

  const scheduleChromeHide = useCallback(() => {
    clearChromeTimer();
    if (!playing || expanded || channelDrawer) return;
    chromeTimerRef.current = window.setTimeout(() => {
      setChromeVisible(false);
      chromeTimerRef.current = null;
    }, CHROME_HIDE_MS);
  }, [channelDrawer, clearChromeTimer, expanded, playing]);

  const revealChrome = useCallback(() => {
    setChromeVisible(true);
    scheduleChromeHide();
  }, [scheduleChromeHide]);

  useEffect(() => {
    if (expanded || channelDrawer || !playing) {
      clearChromeTimer();
      setChromeVisible(true);
      return;
    }
    scheduleChromeHide();
    return clearChromeTimer;
  }, [channelDrawer, clearChromeTimer, expanded, playing, scheduleChromeHide]);

  useEffect(() => {
    generationRef.current += 1;
    recoveryBusyRef.current = false;
    offlinePendingRef.current = false;
    resumePositionRef.current = initialPosition;
    watchdogSoftRecoveriesRef.current = 0;
    hlsMediaRecoveriesRef.current = 0;
    hlsNetworkRecoveriesRef.current = 0;
    authorizationRef.current = authorization;
    setActiveAuthorization(authorization);
    setError(null);
    setRecoveryStatus(null);
    setCurrentTime(initialPosition);
  }, [authorization.recoveryToken, initialPosition]);

  useEffect(() => {
    const token = getActiveAccessToken();
    if (!token) return;
    void fetchLibrary(token).then(snapshot => {
      const preferred = snapshot.preferences?.aspectMode;
      if (preferred === 'contain' || preferred === 'cover' || preferred === 'fill') setAspect(preferred);
    }).catch(() => undefined);
  }, []);

  const checkpoint = useCallback(() => {
    const video = videoRef.current;
    if (!video || live || !onProgress || !Number.isFinite(video.duration) || video.duration <= 0) return;
    onProgress(video.currentTime, video.duration);
  }, [live, onProgress]);

  const syncTracks = useCallback((hls: Hls) => {
    setAudioTracks(hls.audioTracks.map((track, index) => ({ id: index, name: track.name || track.lang || `Áudio ${index + 1}` })));
    setSubtitleTracks(hls.subtitleTracks.map((track, index) => ({ id: index, name: track.name || track.lang || `Legenda ${index + 1}` })));
  }, []);

  const requestRecovery = useCallback(async (errorCode: string, quiet = false) => {
    if (recoveryBusyRef.current) return;
    const token = getActiveAccessToken();
    if (!token) {
      setError('Sua sessão Web terminou. Entre novamente para continuar.');
      window.dispatchEvent(new CustomEvent('roneca:web-session-invalid'));
      return;
    }
    const currentAuthorization = authorizationRef.current;
    const video = videoRef.current;
    if (!live && video && Number.isFinite(video.currentTime)) resumePositionRef.current = video.currentTime;
    if (!navigator.onLine) {
      if (!quiet) {
        offlinePendingRef.current = true;
        setRecoveryStatus('Sem conexão. A reprodução será retomada quando a internet voltar.');
      }
      return;
    }

    recoveryBusyRef.current = true;
    if (!quiet) {
      setError(null);
      setRecoveryStatus('Verificando uma alternativa segura…');
      const correlationId = crypto.randomUUID();
      recoveryCorrelationRef.current = correlationId;
      void reportWebDiagnostic(token, {
        correlationId,
        stage: 'recovery',
        errorCode,
        contentType: currentAuthorization.contentType,
        playlistRole: currentAuthorization.playlistRole,
        recovered: false,
      }).catch(() => undefined);
    }

    try {
      const next = await recoverPlayback(token, currentAuthorization.recoveryToken, errorCode);
      if (quiet) {
        authorizationRef.current = next;
        const position = Number(video?.currentTime || 0);
        const hls = hlsRef.current;
        if (hls && currentAuthorization.mediaKind === 'hls' && next.mediaKind === 'hls') {
          hls.loadSource(next.playbackUrl);
          hls.startLoad(live ? -1 : Math.max(0, position - 0.5));
          setActiveAuthorization(current => ({ ...next, playbackUrl: current.playbackUrl }));
        } else setActiveAuthorization(next);
        recoveryBusyRef.current = false;
        return;
      }
      const generation = generationRef.current;
      const apply = () => {
        if (generationRef.current !== generation) return;
        authorizationRef.current = next;
        setRecoveryStatus(next.recovery?.failover
          ? 'Origem principal indisponível. Usando a lista reserva.'
          : 'Retomando reprodução…');
        setActiveAuthorization(next);
        recoveryBusyRef.current = false;
      };
      const delay = Math.max(0, Number(next.recovery?.backoffMs || 0));
      if (delay > 0) {
        setRecoveryStatus(`Reconectando em ${Math.ceil(delay / 1000)}s…`);
        recoveryTimerRef.current = window.setTimeout(apply, delay);
      } else apply();
    } catch (caught) {
      recoveryBusyRef.current = false;
      const apiError = caught instanceof ApiError ? caught : null;
      if (quiet && apiError?.status !== 401 && !apiError?.code.startsWith('WEB_SESSION_')) return;
      if (apiError?.code === 'WEB_OFFLINE') {
        offlinePendingRef.current = true;
        setRecoveryStatus('Sem conexão. Aguardando internet…');
        return;
      }
      if (apiError?.status === 401 || apiError?.code.startsWith('WEB_SESSION_')) {
        setError('Sua sessão foi encerrada ou o aparelho não está mais autorizado.');
        setRecoveryStatus(null);
        window.dispatchEvent(new CustomEvent('roneca:web-session-invalid'));
        return;
      }
      setError(apiError?.code === 'WEB_RECOVERY_EXHAUSTED'
        ? 'Todas as origens autorizadas para este conteúdo foram testadas.'
        : 'Não foi possível recuperar esta reprodução.');
      setRecoveryStatus(null);
    }
  }, [live]);

  useEffect(() => {
    if (activeAuthorization.mode !== 'gateway') return;
    const renewIn = Math.max(5_000, new Date(activeAuthorization.expiresAt).getTime() - Date.now() - 90_000);
    renewalTimerRef.current = window.setTimeout(() => void requestRecovery('WEB_PLAYBACK_TOKEN_EXPIRED', true), renewIn);
    return () => {
      if (renewalTimerRef.current) window.clearTimeout(renewalTimerRef.current);
      renewalTimerRef.current = null;
    };
  }, [activeAuthorization.expiresAt, activeAuthorization.mode, requestRecovery]);

  useEffect(() => {
    const onOnline = () => {
      if (!offlinePendingRef.current) return;
      offlinePendingRef.current = false;
      void requestRecovery('WEB_NETWORK_RECOVERED');
    };
    const onOffline = () => {
      offlinePendingRef.current = true;
      if (recoveryTimerRef.current) window.clearTimeout(recoveryTimerRef.current);
      recoveryBusyRef.current = false;
      setRecoveryStatus('Sem conexão. Aguardando internet…');
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [requestRecovery]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setError(null);
    setReady(false);
    setAudioTracks([]);
    setSubtitleTracks([]);
    lastCheckpointRef.current = 0;
    watchdogLastTimeRef.current = 0;
    watchdogStallsRef.current = 0;
    watchdogSoftRecoveriesRef.current = 0;
    hlsMediaRecoveriesRef.current = 0;
    hlsNetworkRecoveriesRef.current = 0;
    const generation = ++generationRef.current;
    let disposed = false;

    const clearStable = () => {
      if (stableTimerRef.current) window.clearTimeout(stableTimerRef.current);
      stableTimerRef.current = null;
    };
    const clearBuffering = () => {
      if (bufferingTimerRef.current) window.clearTimeout(bufferingTimerRef.current);
      bufferingTimerRef.current = null;
    };
    const clearBufferingStatus = () => {
      clearBuffering();
      if (!recoveryBusyRef.current) setRecoveryStatus(current => current === 'Carregando buffer…' ? null : current);
    };
    const markStable = () => {
      clearStable();
      stableTimerRef.current = window.setTimeout(() => {
        if (disposed || generationRef.current !== generation) return;
        setRecoveryStatus(null);
        hlsMediaRecoveriesRef.current = 0;
        hlsNetworkRecoveriesRef.current = 0;
        watchdogSoftRecoveriesRef.current = 0;
        const token = getActiveAccessToken();
        const correlationId = recoveryCorrelationRef.current;
        if (token && correlationId) void reportWebDiagnostic(token, {
          correlationId,
          stage: 'recovery',
          errorCode: 'WEB_RECOVERY_STABLE',
          contentType: activeAuthorization.contentType,
          playlistRole: activeAuthorization.playlistRole,
          recovered: true,
        }).catch(() => undefined);
        recoveryCorrelationRef.current = null;
      }, STABLE_WINDOW_MS);
    };

    const markReady = () => {
      if (disposed) return;
      if (!live && resumePositionRef.current >= 8 && Number.isFinite(video.duration)) {
        video.currentTime = Math.min(resumePositionRef.current, Math.max(0, video.duration - 1));
      }
      if (Number.isFinite(video.duration)) setDuration(video.duration);
      setCurrentTime(video.currentTime || 0);
      setReady(true);
      markStable();
    };
    const onPlaying = () => {
      if (disposed) return;
      clearBufferingStatus();
      setReady(true);
      setPlaying(true);
      setRecoveryStatus(null);
      watchdogStallsRef.current = 0;
      hlsNetworkRecoveriesRef.current = 0;
      markStable();
    };
    const onCanPlay = () => {
      if (disposed) return;
      clearBufferingStatus();
      setReady(true);
      if (!recoveryBusyRef.current) setRecoveryStatus(null);
    };
    const onWaiting = () => {
      if (disposed || recoveryBusyRef.current) return;
      clearBuffering();
      bufferingTimerRef.current = window.setTimeout(() => {
        if (disposed || recoveryBusyRef.current) return;
        setRecoveryStatus('Carregando buffer…');
        bufferingTimerRef.current = null;
      }, BUFFERING_UI_DELAY_MS);
    };
    const onNativeError = () => { if (!disposed) void requestRecovery(nativeMediaErrorCode(video)); };
    const onPause = () => {
      clearBuffering();
      setPlaying(false);
      checkpoint();
    };
    const onEnded = () => {
      clearBuffering();
      setPlaying(false);
      checkpoint();
      setChromeVisible(true);
    };
    const onVolumeChange = () => setMuted(video.muted || video.volume <= 0);
    const onTimeUpdate = () => {
      clearBufferingStatus();
      setCurrentTime(video.currentTime || 0);
      if (Number.isFinite(video.duration)) setDuration(video.duration);
      if (!live && onProgress) {
        const now = Date.now();
        if (now - lastCheckpointRef.current >= 10_000) {
          lastCheckpointRef.current = now;
          checkpoint();
        }
      }
    };
    video.addEventListener('loadedmetadata', markReady);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('error', onNativeError);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    video.addEventListener('volumechange', onVolumeChange);
    video.addEventListener('timeupdate', onTimeUpdate);

    const destroyHls = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
    const attachNative = () => {
      destroyHls();
      video.src = activeAuthorization.playbackUrl;
      video.load();
    };

    if (activeAuthorization.mediaKind === 'hls') {
      const nativeHls = video.canPlayType('application/vnd.apple.mpegurl') || video.canPlayType('application/x-mpegURL');
      if (nativeHls) attachNative();
      else if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          capLevelToPlayerSize: true,
          backBufferLength: live ? 30 : 60,
          maxBufferLength: live ? 30 : 60,
          maxMaxBufferLength: live ? 60 : 90,
          maxBufferSize: 32 * 1024 * 1024,
          liveSyncDurationCount: live ? 4 : undefined,
          liveMaxLatencyDurationCount: live ? 12 : undefined,
          maxBufferHole: 0.5,
          fragLoadingTimeOut: 12_000,
          manifestLoadingTimeOut: 10_000,
          levelLoadingTimeOut: 10_000,
        });
        hlsRef.current = hls;
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!disposed) {
            syncTracks(hls);
            setReady(true);
            markStable();
          }
        });
        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => syncTracks(hls));
        hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => syncTracks(hls));
        hls.on(Hls.Events.FRAG_LOADED, () => { hlsNetworkRecoveriesRef.current = 0; });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal || disposed) return;
          const httpCode = Number((data as any).response?.code || 0);
          if (!httpCode && data.type === Hls.ErrorTypes.MEDIA_ERROR && hlsMediaRecoveriesRef.current < HLS_LOCAL_MEDIA_RECOVERIES) {
            hlsMediaRecoveriesRef.current += 1;
            setRecoveryStatus('Ajustando vídeo…');
            hls.recoverMediaError();
            return;
          }
          if (!httpCode && data.type === Hls.ErrorTypes.NETWORK_ERROR && hlsNetworkRecoveriesRef.current < HLS_LOCAL_NETWORK_RECOVERIES) {
            hlsNetworkRecoveriesRef.current += 1;
            setRecoveryStatus('Recuperando conexão…');
            hls.startLoad(-1);
            return;
          }
          const code = httpCode ? `WEB_HLS_HTTP_${httpCode}`
            : data.type === Hls.ErrorTypes.MEDIA_ERROR ? 'WEB_HLS_DECODER_ERROR'
              : String(data.details || '').toLowerCase().includes('manifest') ? 'WEB_HLS_MANIFEST_ERROR'
                : 'WEB_HLS_NETWORK_ERROR';
          void requestRecovery(code);
        });
        hls.attachMedia(video);
        hls.loadSource(activeAuthorization.playbackUrl);
      } else void requestRecovery('WEB_HLS_CODEC_UNSUPPORTED');
    } else attachNative();

    watchdogRef.current = window.setInterval(() => {
      if (disposed || recoveryBusyRef.current || video.paused || video.seeking || video.ended || document.hidden) return;
      const current = Number(video.currentTime || 0);
      if (current > watchdogLastTimeRef.current + 0.35) {
        watchdogLastTimeRef.current = current;
        watchdogStallsRef.current = 0;
        watchdogSoftRecoveriesRef.current = 0;
        return;
      }
      watchdogStallsRef.current += 1;
      if (watchdogStallsRef.current >= WATCHDOG_STALL_TICKS) {
        watchdogStallsRef.current = 0;
        const hls = hlsRef.current;
        if (hls && watchdogSoftRecoveriesRef.current < HLS_LOCAL_STALL_RECOVERIES) {
          watchdogSoftRecoveriesRef.current += 1;
          setRecoveryStatus('Conexão instável. Recuperando…');
          hls.startLoad(-1);
          void video.play().catch(() => undefined);
          return;
        }
        void requestRecovery('WEB_WATCHDOG_STALL');
      }
    }, WATCHDOG_TICK_MS);

    return () => {
      disposed = true;
      checkpoint();
      clearStable();
      clearBuffering();
      if (watchdogRef.current) window.clearInterval(watchdogRef.current);
      watchdogRef.current = null;
      video.removeEventListener('loadedmetadata', markReady);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('error', onNativeError);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('volumechange', onVolumeChange);
      video.removeEventListener('timeupdate', onTimeUpdate);
      destroyHls();
      video.pause();
      video.removeAttribute('src');
      video.load();
      setAudioTracks([]);
      setSubtitleTracks([]);
    };
  }, [
    activeAuthorization.contentType,
    activeAuthorization.mediaKind,
    activeAuthorization.playbackUrl,
    activeAuthorization.playlistRole,
    checkpoint,
    live,
    onProgress,
    requestRecovery,
    syncTracks,
  ]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.style.objectFit = aspect;
  }, [aspect]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      revealChrome();
      if (event.key === 'Escape') {
        if (channelDrawer) setChannelDrawer(false);
        else if (expanded) setExpanded(false);
        else if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
        else onClose();
        return;
      }
      if (event.key === ' ' || event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (video.paused) void video.play().catch(() => undefined);
        else video.pause();
      }
      if (!live && event.key === 'ArrowLeft') video.currentTime = Math.max(0, video.currentTime - 10);
      if (!live && event.key === 'ArrowRight' && Number.isFinite(video.duration)) video.currentTime = Math.min(video.duration, video.currentTime + 10);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [channelDrawer, expanded, live, onClose, revealChrome]);

  useEffect(() => () => {
    if (recoveryTimerRef.current) window.clearTimeout(recoveryTimerRef.current);
    if (stableTimerRef.current) window.clearTimeout(stableTimerRef.current);
    if (watchdogRef.current) window.clearInterval(watchdogRef.current);
    if (renewalTimerRef.current) window.clearTimeout(renewalTimerRef.current);
    if (bufferingTimerRef.current) window.clearTimeout(bufferingTimerRef.current);
    clearChromeTimer();
    recoveryBusyRef.current = false;
  }, [clearChromeTimer]);

  const cycleAspect = () => setAspect(current => current === 'contain' ? 'cover' : current === 'cover' ? 'fill' : 'contain');
  const toggleFullscreen = async () => {
    const frame = frameRef.current;
    if (!frame) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await frame.requestFullscreen();
    } catch {
      setError('O navegador não permitiu abrir em tela cheia.');
    }
  };
  const togglePip = async () => {
    const video = videoRef.current;
    if (!video || !document.pictureInPictureEnabled || typeof video.requestPictureInPicture !== 'function') return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch {
      setError('O modo picture-in-picture não está disponível neste momento.');
    }
  };
  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  };
  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };
  const seekTo = (value: number) => {
    const video = videoRef.current;
    if (!video || live || !Number.isFinite(video.duration)) return;
    video.currentTime = Math.max(0, Math.min(video.duration, value));
    setCurrentTime(video.currentTime);
  };

  const openChannelDrawer = () => {
    setChannelDrawer(true);
    setExpanded(true);
    setChromeVisible(true);
  };

  return (
    <div className="player-overlay" role="dialog" aria-modal="true" aria-label={`Reproduzindo ${title}`}>
      <div
        className="player-frame premium-player"
        ref={frameRef}
        onPointerMove={revealChrome}
        onPointerDown={revealChrome}
        onMouseLeave={scheduleChromeHide}
      >
        <video
          ref={videoRef}
          className={`player-video aspect-${aspect}`}
          playsInline
          autoPlay
          preload="auto"
          crossOrigin="anonymous"
          onClick={() => setChromeVisible(value => !value)}
        />

        <div className={`player-chrome ${chromeVisible ? 'is-visible' : 'is-hidden'}`}>
          <div className="player-topbar">
            <div>
              <span className="player-kicker">{live ? 'AO VIVO' : 'RONECAPLAYTV'}</span>
              <strong>{title}</strong>
              {live && liveEpg.now ? <small>{liveEpg.now.title}</small> : null}
              {activeAuthorization.playlistRole === 'backup' ? <small>Lista reserva em uso</small> : null}
            </div>
            <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar player">✕</button>
          </div>

          <div className="premium-controls" onPointerDown={event => event.stopPropagation()}>
            {expanded ? (
              <div className="player-context-slot">
                {episodeItems.length ? (
                  <>
                    <div className="player-context-title"><span>Episódios</span></div>
                    <div className="player-episode-strip" aria-label="Episódios da temporada atual">
                      {episodeItems.map(item => (
                        <button
                          type="button"
                          key={item.episode.contentId}
                          className={`player-episode-chip ${item.state} ${item.active ? 'active' : ''}`}
                          aria-current={item.active ? 'true' : undefined}
                          onClick={() => onSwitchEpisode?.(item.episode)}
                        >
                          E{item.episode.number}
                          {item.state === 'in_progress' ? (
                            <span className="player-episode-progress" aria-hidden="true"><span style={{ width: `${item.progressRatio * 100}%` }} /></span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}

                {live && quickChannels.length ? (
                  <>
                    <div className="player-context-title"><span>Canais</span><button type="button" className="text-button" onClick={openChannelDrawer}>Ver todos</button></div>
                    <div className="player-quick-channels" aria-label="Troca rápida de canais">
                      {quickChannels.map(channel => (
                        <button
                          type="button"
                          key={channel.contentId}
                          className={`player-channel-chip ${channel.contentId === activeContentId ? 'active' : ''}`}
                          aria-current={channel.contentId === activeContentId ? 'true' : undefined}
                          onClick={() => onSwitchChannel?.(channel)}
                        >
                          {channel.title}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}

                {live && liveEpg.now ? (
                  <div className="player-live-epg" aria-label="Programação atual">
                    <small>AGORA</small>
                    <strong>{liveEpg.now.title}</strong>
                    <small>{new Date(liveEpg.now.start).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} - {new Date(liveEpg.now.end).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small>
                    {liveEpg.progressRatio !== null ? <div className="player-live-epg-progress" aria-hidden="true"><span style={{ width: `${liveEpg.progressRatio * 100}%` }} /></div> : null}
                    {liveEpg.next ? <small>Próximo: {liveEpg.next.title} · {new Date(liveEpg.next.start).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small> : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="premium-timeline-row">
              <button className="premium-icon-button" type="button" onClick={togglePlayback} aria-label={playing ? 'Pausar' : 'Reproduzir'}>{playing ? 'Ⅱ' : '▶'}</button>
              {live ? (
                <div className="player-live-badge">AO VIVO</div>
              ) : (
                <div className="premium-timeline">
                  <input
                    className="premium-range"
                    type="range"
                    min="0"
                    max={Math.max(0, duration)}
                    step="1"
                    value={Math.min(currentTime, Math.max(0, duration))}
                    onChange={event => seekTo(Number(event.target.value))}
                    aria-label="Progresso da reprodução"
                  />
                  <div className="premium-time"><span>{playerClock(currentTime)}</span><span>{playerClock(duration)}</span></div>
                </div>
              )}
              <button className="premium-icon-button" type="button" onClick={toggleMute} aria-label={muted ? 'Ativar som' : 'Silenciar'}>{muted ? '🔇' : '🔊'}</button>
            </div>

            <button
              className="player-expand-toggle"
              type="button"
              aria-expanded={expanded}
              aria-label={expanded ? 'Fechar opções do player' : 'Abrir opções do player'}
              onClick={() => setExpanded(value => !value)}
            >
              {expanded ? '⌃' : '⌄'}
            </button>

            {expanded ? (
              <div className="player-expanded-settings" aria-label="Opções do player">
                <div className="player-setting"><span>Aspecto</span><button type="button" onClick={cycleAspect}>{aspectLabel(aspect)}</button></div>
                {audioTracks.length > 1 ? (
                  <div className="player-setting"><label htmlFor="player-audio-track">Áudio</label><select id="player-audio-track" defaultValue={hlsRef.current?.audioTrack ?? -1} onChange={event => { if (hlsRef.current) hlsRef.current.audioTrack = Number(event.target.value); }}>{audioTracks.map(track => <option key={track.id} value={track.id}>{track.name}</option>)}</select></div>
                ) : <div className="player-setting"><span>Áudio</span><button type="button" disabled>Original</button></div>}
                {subtitleTracks.length ? (
                  <div className="player-setting"><label htmlFor="player-subtitle-track">Legenda</label><select id="player-subtitle-track" defaultValue="-1" onChange={event => { if (hlsRef.current) hlsRef.current.subtitleTrack = Number(event.target.value); }}><option value="-1">Desativada</option>{subtitleTracks.map(track => <option key={track.id} value={track.id}>{track.name}</option>)}</select></div>
                ) : <div className="player-setting"><span>Legenda</span><button type="button" disabled>Desativada</button></div>}
                {document.pictureInPictureEnabled ? <div className="player-setting"><span>PiP</span><button type="button" onClick={() => void togglePip()}>Abrir</button></div> : null}
                <div className="player-setting"><span>Tela cheia</span><button type="button" onClick={() => void toggleFullscreen()}>Alternar</button></div>
                {live && liveChannels.length ? <div className="player-setting"><span>Canais</span><button type="button" onClick={openChannelDrawer}>Abrir lista</button></div> : null}
              </div>
            ) : null}
          </div>
        </div>

        {!ready && !error ? <div className="player-status">{recoveryStatus || 'Preparando reprodução…'}</div> : null}
        {ready && recoveryStatus ? <div className="player-status">{recoveryStatus}</div> : null}
        {error ? <div className="player-error" role="alert">{error}</div> : null}

        {live && channelDrawer ? (
          <aside className="player-channel-drawer premium-drawer" aria-label="Trocar canal">
            <div className="drawer-heading"><strong>Canais</strong><button type="button" onClick={() => setChannelDrawer(false)}>Fechar</button></div>
            <div className="player-drawer-tools">
              <input className="player-drawer-search" value={channelQuery} onChange={event => setChannelQuery(event.target.value)} placeholder="Buscar canal…" aria-label="Buscar canal" />
              <div className="player-drawer-categories" aria-label="Categorias de canais">
                {channelCategories.map(item => <button type="button" key={item} className={channelCategory === item ? 'active' : ''} onClick={() => setChannelCategory(item)}>{item === 'Favoritos' ? '★ Favoritos' : item}</button>)}
              </div>
            </div>
            <div className="drawer-list">
              {drawerChannels.map(channel => (
                <button
                  type="button"
                  key={channel.contentId}
                  className={channel.contentId === activeContentId ? 'active' : ''}
                  onClick={() => onSwitchChannel?.(channel)}
                >
                  {channel.logo ? <img src={channel.logo} alt="" loading="lazy" /> : <span className="channel-placeholder">TV</span>}
                  <span>{channel.title}</span>
                </button>
              ))}
              {!drawerChannels.length ? <div className="muted">Nenhum canal encontrado.</div> : null}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
