import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  Maximize,
  Pause as PauseIcon,
  Play as PlayIcon,
  RotateCcw,
  RotateCw,
  Tv as TvIcon,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { AppLayout } from '@/components/shared';
import { usePlaybackProgress } from '@/hooks/usePlaybackProgress';
import { useAppStore } from '@/stores/appStore';
import type { AppSettings, Episode, Movie, Season } from '@/types';

const MAX_RECOVERY_ATTEMPTS = 6;
const PLAYER_MEDIA_PREFS_KEY = 'ronecaplaytv-player-media-v1';

type BufferSize = AppSettings['bufferSize'];

interface BufferProfile {
  startupTimeoutMs: number;
  stallRecoveryDelayMs: number;
  hls: {
    liveBackBuffer: number;
    vodBackBuffer: number;
    liveMaxBuffer: number;
    vodMaxBuffer: number;
    liveMaxMaxBuffer: number;
    vodMaxMaxBuffer: number;
    maxBufferSize: number;
  };
  mpegts: {
    liveLatency: number;
    liveStashSize: number;
    vodStashSize: number;
    cleanupMax: number;
    cleanupMin: number;
  };
}

const BUFFER_PROFILES: Record<BufferSize, BufferProfile> = {
  low: {
    startupTimeoutMs: 14_000,
    stallRecoveryDelayMs: 4_500,
    hls: {
      liveBackBuffer: 4,
      vodBackBuffer: 10,
      liveMaxBuffer: 8,
      vodMaxBuffer: 18,
      liveMaxMaxBuffer: 16,
      vodMaxMaxBuffer: 36,
      maxBufferSize: 20 * 1000 * 1000,
    },
    mpegts: {
      liveLatency: 3,
      liveStashSize: 192 * 1024,
      vodStashSize: 384 * 1024,
      cleanupMax: 6,
      cleanupMin: 3,
    },
  },
  medium: {
    startupTimeoutMs: 18_000,
    stallRecoveryDelayMs: 6_000,
    hls: {
      liveBackBuffer: 6,
      vodBackBuffer: 18,
      liveMaxBuffer: 14,
      vodMaxBuffer: 28,
      liveMaxMaxBuffer: 28,
      vodMaxMaxBuffer: 56,
      maxBufferSize: 30 * 1000 * 1000,
    },
    mpegts: {
      liveLatency: 5,
      liveStashSize: 384 * 1024,
      vodStashSize: 512 * 1024,
      cleanupMax: 8,
      cleanupMin: 4,
    },
  },
  high: {
    startupTimeoutMs: 24_000,
    stallRecoveryDelayMs: 8_000,
    hls: {
      liveBackBuffer: 10,
      vodBackBuffer: 30,
      liveMaxBuffer: 22,
      vodMaxBuffer: 45,
      liveMaxMaxBuffer: 44,
      vodMaxMaxBuffer: 90,
      maxBufferSize: 60 * 1000 * 1000,
    },
    mpegts: {
      liveLatency: 8,
      liveStashSize: 640 * 1024,
      vodStashSize: 1024 * 1024,
      cleanupMax: 14,
      cleanupMin: 7,
    },
  },
};

interface StoredMediaPreferences {
  volume: number;
  muted: boolean;
  playbackRate: number;
}

function readMediaPreferences(): StoredMediaPreferences {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PLAYER_MEDIA_PREFS_KEY) || '{}') as Partial<StoredMediaPreferences>;
    return {
      volume: Number.isFinite(parsed.volume) ? Math.min(1, Math.max(0, Number(parsed.volume))) : 1,
      muted: Boolean(parsed.muted),
      playbackRate: Number.isFinite(parsed.playbackRate) ? Math.min(2, Math.max(0.5, Number(parsed.playbackRate))) : 1,
    };
  } catch {
    return { volume: 1, muted: false, playbackRate: 1 };
  }
}

function writeMediaPreferences(preferences: StoredMediaPreferences) {
  try {
    window.localStorage.setItem(PLAYER_MEDIA_PREFS_KEY, JSON.stringify(preferences));
  } catch {
    // Preferências de mídia não devem impedir a reprodução.
  }
}

function isHttpUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

function isNativeRuntime() {
  const capacitor = (window as typeof window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(capacitor?.isNativePlatform?.());
}

function toMediaProxyUrl(url: string) {
  if (!isHttpUrl(url)) return url;
  if (isNativeRuntime()) return url;

  const path = `/api/media-proxy?url=${encodeURIComponent(url)}`;
  if (typeof window === 'undefined') return path;
  return new URL(path, window.location.origin).toString();
}

function isHlsUrl(url: string) {
  return /\.m3u8(\?|#|$)/i.test(url);
}

function isMpegTsUrl(url: string) {
  return /\.(ts|m2ts|mpegts)(\?|#|$)/i.test(url);
}

function replaceKnownMediaExtension(url: string, extension: string) {
  return url.replace(/\.(m3u8|ts|m2ts|mpegts)(\?|#|$)/i, `.${extension}$2`);
}

function buildXtreamLivePlaybackVariants(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl.trim());
    const parts = parsed.pathname.split('/').filter(Boolean).map(part => decodeURIComponent(part));
    const offset = parts[0]?.toLowerCase() === 'live' ? 1 : 0;

    if (parts.length - offset < 3) return [];

    const username = parts[offset];
    const password = parts[offset + 1];
    const streamFile = parts[offset + 2];
    const streamMatch = streamFile.match(/^([^/.]+)(?:\.[a-z0-9]+)?$/i);

    if (!username || !password || !streamMatch?.[1]) return [];

    const streamId = streamMatch[1];
    const user = encodeURIComponent(username);
    const pass = encodeURIComponent(password);
    const suffix = `${parsed.search}${parsed.hash}`;

    return [
      `${parsed.origin}/live/${user}/${pass}/${streamId}.m3u8${suffix}`,
      `${parsed.origin}/${user}/${pass}/${streamId}.m3u8${suffix}`,
      `${parsed.origin}/live/${user}/${pass}/${streamId}.ts${suffix}`,
      `${parsed.origin}/${user}/${pass}/${streamId}.ts${suffix}`,
    ];
  } catch {
    return [];
  }
}

function buildPlaybackUrlVariants(rawUrl: string) {
  const url = rawUrl.trim();
  if (!url) return [];

  const xtreamLiveVariants = buildXtreamLivePlaybackVariants(url);
  if (xtreamLiveVariants.length > 0) {
    return [...new Set([...xtreamLiveVariants, url])];
  }

  const variants: string[] = [];

  if (/\.(ts|m2ts|mpegts)(\?|#|$)/i.test(url)) {
    variants.push(replaceKnownMediaExtension(url, 'm3u8'), url);
  } else if (/\.m3u8(\?|#|$)/i.test(url)) {
    variants.push(url, replaceKnownMediaExtension(url, 'ts'));
  } else {
    variants.push(url);
  }

  return [...new Set(variants)];
}

function getVideoErrorMessage(video: HTMLVideoElement, fallback: string) {
  const error = video.error;
  if (!error) return fallback;

  const descriptions: Record<number, string> = {
    1: 'carregamento cancelado',
    2: 'falha de rede',
    3: 'falha ao decodificar o vídeo',
    4: 'formato não suportado pelo aparelho',
  };

  return `${fallback} Código ${error.code}: ${descriptions[error.code] || error.message || 'erro desconhecido'}.`;
}

function formatTime(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '00:00';

  const seconds = Math.floor(totalSeconds % 60);
  const minutes = Math.floor((totalSeconds / 60) % 60);
  const hours = Math.floor(totalSeconds / 3600);
  const two = (value: number) => String(value).padStart(2, '0');

  return hours > 0
    ? `${hours}:${two(minutes)}:${two(seconds)}`
    : `${two(minutes)}:${two(seconds)}`;
}

function makeEpisodeMovie(seriesName: string, season: Season, episode: Episode, template: Movie): Movie {
  return {
    id: episode.id,
    name: `${seriesName} - T${season.number}E${episode.number}`,
    year: 0,
    duration: episode.duration,
    synopsis: template.synopsis,
    cover: template.cover,
    category: template.category,
    url: episode.url,
    playbackUrls: episode.playbackUrls,
    progress: episode.progress,
    isFavorite: template.isFavorite,
  };
}

export function PlayerV2Screen() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerShellRef = useRef<HTMLDivElement>(null);
  const recoveryAttemptsRef = useRef(0);
  const mediaPreferencesRef = useRef(readMediaPreferences());

  const currentChannel = useAppStore(state => state.currentChannel);
  const currentMovie = useAppStore(state => state.currentMovie);
  const currentSeries = useAppStore(state => state.currentSeries);
  const channels = useAppStore(state => state.channels);
  const settings = useAppStore(state => state.settings);
  const setCurrentChannel = useAppStore(state => state.setCurrentChannel);
  const setCurrentMovie = useAppStore(state => state.setCurrentMovie);
  const setScreen = useAppStore(state => state.setScreen);

  const [showControls, setShowControls] = useState(true);
  const [showList, setShowList] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(mediaPreferencesRef.current.volume);
  const [muted, setMuted] = useState(mediaPreferencesRef.current.muted);
  const [playbackRate, setPlaybackRate] = useState(mediaPreferencesRef.current.playbackRate);
  const [playbackUrlIndex, setPlaybackUrlIndex] = useState(0);
  const [reloadNonce, setReloadNonce] = useState(0);

  const content = currentMovie || currentChannel;
  const isLive = Boolean(currentChannel && !currentMovie);
  const bufferSize = settings.bufferSize ?? 'medium';
  const bufferProfile = BUFFER_PROFILES[bufferSize];
  const autoReconnect = settings.autoReconnect ?? true;

  const { saveNow } = usePlaybackProgress({
    videoRef,
    content: isLive ? null : currentMovie,
    currentSeries,
    isLive,
  });

  const playbackCandidates = useMemo(() => {
    if (!content) return [];

    const extraUrls = Array.isArray(content.playbackUrls) ? content.playbackUrls : [];
    const rawUrls = [content.url, ...extraUrls]
      .map(url => url?.trim())
      .filter(Boolean) as string[];

    return [...new Set(rawUrls.flatMap(buildPlaybackUrlVariants))];
  }, [content]);

  const streamUrl = playbackCandidates[playbackUrlIndex] || '';
  const playbackUrl = useMemo(() => toMediaProxyUrl(streamUrl), [streamUrl]);
  const hasNextPlaybackUrl = playbackUrlIndex + 1 < playbackCandidates.length;

  const seriesEpisodes = useMemo(() => {
    if (!currentSeries?.seasons?.length) return [];

    return currentSeries.seasons.flatMap(season => (
      season.episodes.map(episode => ({ season, episode }))
    ));
  }, [currentSeries]);

  const currentEpisodeIndex = useMemo(() => {
    if (!content || seriesEpisodes.length === 0) return -1;

    return seriesEpisodes.findIndex(({ episode }) => (
      episode.id === content.id || episode.url === content.url
    ));
  }, [content, seriesEpisodes]);

  const hasEpisodeControls = !isLive && currentEpisodeIndex >= 0 && seriesEpisodes.length > 1;

  const quickChannels = useMemo(() => {
    return channels.filter(channel => channel.url?.trim()).slice(0, 36);
  }, [channels]);

  const recoverPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    setError(null);
    setReady(false);
    setIsBuffering(true);

    try {
      video.pause();
      video.removeAttribute('src');
      video.load();
    } catch {
      // Falhas de limpeza não devem impedir uma nova tentativa.
    }

    setReloadNonce(value => value + 1);
    setShowControls(true);
  }, [streamUrl]);

  useEffect(() => {
    setPlaybackUrlIndex(0);
    recoveryAttemptsRef.current = 0;
    setCurrentTime(0);
    setDuration(0);
    setError(null);
    setReady(false);
    setIsBuffering(false);
  }, [content?.id]);

  useEffect(() => {
    recoveryAttemptsRef.current = 0;
  }, [streamUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setReady(false);
    setError(null);
    setIsBuffering(true);

    video.pause();
    video.removeAttribute('src');
    video.load();

    video.volume = mediaPreferencesRef.current.volume;
    video.muted = mediaPreferencesRef.current.muted;
    video.playbackRate = mediaPreferencesRef.current.playbackRate;

    if (!streamUrl) {
      setIsBuffering(false);
      setError('Fonte não configurada.');
      return;
    }

    let hls: any = null;
    let tsPlayer: any = null;
    let cancelled = false;
    let recoveryTimer: number | null = null;
    let initialLoadTimer: number | null = null;
    let markMpegReady: (() => void) | null = null;
    let markMpegError: (() => void) | null = null;

    const clearRecoveryTimer = () => {
      if (recoveryTimer !== null) {
        window.clearTimeout(recoveryTimer);
        recoveryTimer = null;
      }
    };

    const clearInitialLoadTimer = () => {
      if (initialLoadTimer !== null) {
        window.clearTimeout(initialLoadTimer);
        initialLoadTimer = null;
      }
    };

    const markReady = () => {
      if (cancelled) return;
      clearRecoveryTimer();
      clearInitialLoadTimer();
      setReady(true);
      setIsBuffering(false);
    };

    const tryNextPlaybackUrl = (message: string) => {
      if (cancelled) return;
      clearRecoveryTimer();
      clearInitialLoadTimer();
      setIsBuffering(false);

      if (playbackUrlIndex + 1 < playbackCandidates.length) {
        setError(`${message} Tentando outra fonte (${playbackUrlIndex + 2}/${playbackCandidates.length})...`);
        setPlaybackUrlIndex(index => index + 1);
        return;
      }

      setError(message);
    };

    const attemptAutomaticRecovery = (action: () => void, fallbackMessage: string, delayMs = 1_200) => {
      if (!autoReconnect || recoveryAttemptsRef.current >= MAX_RECOVERY_ATTEMPTS) {
        tryNextPlaybackUrl(fallbackMessage);
        return;
      }

      if (recoveryTimer !== null) return;

      recoveryAttemptsRef.current += 1;
      setIsBuffering(true);
      recoveryTimer = window.setTimeout(() => {
        recoveryTimer = null;
        if (!cancelled) action();
      }, delayMs);
    };

    const scheduleInitialLoadTimeout = () => {
      clearInitialLoadTimer();
      initialLoadTimer = window.setTimeout(() => {
        if (video.readyState >= 2 || cancelled) return;

        tryNextPlaybackUrl(getVideoErrorMessage(
          video,
          'A mídia demorou demais para iniciar. Pode ser fonte offline ou formato não suportado.',
        ));
      }, bufferProfile.startupTimeoutMs);
    };

    const scheduleStallRecovery = () => {
      setIsBuffering(true);
      if (!isLive || !autoReconnect) return;

      clearRecoveryTimer();
      recoveryTimer = window.setTimeout(() => {
        recoveryTimer = null;

        if (recoveryAttemptsRef.current >= MAX_RECOVERY_ATTEMPTS) {
          setIsBuffering(false);
          setError('A transmissão travou várias vezes. Tente trocar de canal ou reproduzir novamente.');
          return;
        }

        recoveryAttemptsRef.current += 1;
        recoverPlayback();
      }, bufferProfile.stallRecoveryDelayMs);
    };

    const handlePlaying = () => {
      markReady();
      setIsPlaying(true);
    };
    const handleCanPlay = () => markReady();
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('waiting', scheduleStallRecovery);
    video.addEventListener('stalled', scheduleStallRecovery);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('loadedmetadata', clearInitialLoadTimer);
    scheduleInitialLoadTimeout();

    const attachNativePlayback = () => {
      if (cancelled) return;

      video.src = playbackUrl;
      video.onloadedmetadata = () => {
        markReady();
        video.play().catch(() => setShowControls(true));
      };
      video.onerror = () => tryNextPlaybackUrl(getVideoErrorMessage(video, 'Não foi possível reproduzir esta fonte.'));
    };

    if (isMpegTsUrl(streamUrl)) {
      void import('mpegts.js')
        .then(module => {
          if (cancelled) return;

          const mpegts = (module as any).default ?? module;
          const features = mpegts?.getFeatureList?.();

          if (!features?.mseLivePlayback && !features?.msePlayback) {
            tryNextPlaybackUrl('Este aparelho não tem suporte para MPEG-TS via MSE.');
            return;
          }

          tsPlayer = mpegts.createPlayer(
            {
              type: 'mpegts',
              isLive,
              url: playbackUrl,
            },
            {
              enableWorker: !isNativeRuntime(),
              liveBufferLatencyChasing: true,
              enableStashBuffer: !isLive || bufferSize !== 'low',
              lazyLoad: false,
              liveBufferLatencyMaxLatency: bufferProfile.mpegts.liveLatency,
              stashInitialSize: isLive
                ? bufferProfile.mpegts.liveStashSize
                : bufferProfile.mpegts.vodStashSize,
              autoCleanupSourceBuffer: true,
              autoCleanupMaxBackwardDuration: bufferProfile.mpegts.cleanupMax,
              autoCleanupMinBackwardDuration: bufferProfile.mpegts.cleanupMin,
            },
          );

          if (cancelled) {
            tsPlayer?.destroy?.();
            return;
          }

          tsPlayer.attachMediaElement(video);
          tsPlayer.load();
          const playResult = tsPlayer.play?.();
          playResult?.catch?.(() => setShowControls(true));

          markMpegReady = () => markReady();
          markMpegError = () => tryNextPlaybackUrl('Não foi possível reproduzir esta fonte MPEG-TS.');

          video.addEventListener('loadedmetadata', markMpegReady);
          video.addEventListener('canplay', markMpegReady);
          video.addEventListener('error', markMpegError);
          tsPlayer.on?.(mpegts.Events.ERROR, markMpegError);
        })
        .catch(() => {
          if (!cancelled) {
            tryNextPlaybackUrl('Não foi possível carregar o suporte MPEG-TS.');
          }
        });
    } else if (isHlsUrl(streamUrl) && !isNativeRuntime()) {
      void import('hls.js')
        .then(module => {
          if (cancelled) return;

          const Hls = (module as any).default ?? module;
          if (!Hls?.isSupported?.()) {
            attachNativePlayback();
            return;
          }

          hls = new Hls({
            enableWorker: !isNativeRuntime(),
            lowLatencyMode: false,
            backBufferLength: isLive ? bufferProfile.hls.liveBackBuffer : bufferProfile.hls.vodBackBuffer,
            maxBufferLength: isLive ? bufferProfile.hls.liveMaxBuffer : bufferProfile.hls.vodMaxBuffer,
            maxMaxBufferLength: isLive ? bufferProfile.hls.liveMaxMaxBuffer : bufferProfile.hls.vodMaxMaxBuffer,
            maxBufferSize: bufferProfile.hls.maxBufferSize,
            maxBufferHole: bufferSize === 'low' ? 0.25 : bufferSize === 'high' ? 0.6 : 0.4,
            manifestLoadingMaxRetry: autoReconnect ? 4 : 0,
            manifestLoadingRetryDelay: 1_000,
            levelLoadingMaxRetry: autoReconnect ? 4 : 0,
            levelLoadingRetryDelay: 1_000,
            fragLoadingMaxRetry: autoReconnect ? 6 : 0,
            fragLoadingRetryDelay: 1_000,
          });

          hls.loadSource(playbackUrl);
          hls.attachMedia(video);

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (cancelled) return;
            markReady();
            video.play().catch(() => setShowControls(true));
          });

          hls.on(Hls.Events.ERROR, (_event: unknown, data: any) => {
            if (cancelled || !data.fatal) return;

            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              attemptAutomaticRecovery(
                () => hls?.startLoad(),
                'Não foi possível recuperar a conexão desta fonte HLS.',
              );
              return;
            }

            if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              attemptAutomaticRecovery(
                () => hls?.recoverMediaError(),
                'Não foi possível recuperar a decodificação desta fonte HLS.',
                500,
              );
              return;
            }

            hls?.destroy();
            tryNextPlaybackUrl('Não foi possível reproduzir esta fonte HLS.');
          });
        })
        .catch(() => attachNativePlayback());
    } else {
      attachNativePlayback();
    }

    return () => {
      cancelled = true;
      clearRecoveryTimer();
      clearInitialLoadTimer();
      video.removeEventListener('waiting', scheduleStallRecovery);
      video.removeEventListener('stalled', scheduleStallRecovery);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('loadedmetadata', clearInitialLoadTimer);

      if (markMpegReady) {
        video.removeEventListener('loadedmetadata', markMpegReady);
        video.removeEventListener('canplay', markMpegReady);
      }
      if (markMpegError) {
        video.removeEventListener('error', markMpegError);
      }

      hls?.destroy?.();
      tsPlayer?.destroy?.();
      video.onloadedmetadata = null;
      video.onerror = null;
    };
  }, [
    autoReconnect,
    bufferProfile,
    bufferSize,
    isLive,
    playbackCandidates.length,
    playbackUrl,
    playbackUrlIndex,
    recoverPlayback,
    reloadNonce,
    streamUrl,
  ]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let lastTimeSyncAt = 0;
    let lastCurrentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    let lastDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;

    const syncTimeState = (force = false) => {
      const now = performance.now();
      if (!force && now - lastTimeSyncAt < 450) return;

      lastTimeSyncAt = now;
      const safeCurrentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      const safeDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;

      if (force || Math.abs(safeCurrentTime - lastCurrentTime) >= 0.25) {
        lastCurrentTime = safeCurrentTime;
        setCurrentTime(safeCurrentTime);
      }
      if (force || Math.abs(safeDuration - lastDuration) >= 0.25) {
        lastDuration = safeDuration;
        setDuration(safeDuration);
      }
    };

    const syncPlayback = () => {
      setIsPlaying(!video.paused && !video.ended);
      syncTimeState(true);
    };

    const syncMediaSettings = () => {
      const next = {
        volume: video.volume,
        muted: video.muted,
        playbackRate: video.playbackRate || 1,
      };

      mediaPreferencesRef.current = next;
      setVolume(next.volume);
      setMuted(next.muted);
      setPlaybackRate(next.playbackRate);
      writeMediaPreferences(next);
    };

    const handleTimeUpdate = () => syncTimeState(false);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('durationchange', syncPlayback);
    video.addEventListener('loadedmetadata', syncPlayback);
    video.addEventListener('play', syncPlayback);
    video.addEventListener('pause', syncPlayback);
    video.addEventListener('ended', syncPlayback);
    video.addEventListener('volumechange', syncMediaSettings);
    video.addEventListener('ratechange', syncMediaSettings);

    syncPlayback();
    syncMediaSettings();

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', syncPlayback);
      video.removeEventListener('loadedmetadata', syncPlayback);
      video.removeEventListener('play', syncPlayback);
      video.removeEventListener('pause', syncPlayback);
      video.removeEventListener('ended', syncPlayback);
      video.removeEventListener('volumechange', syncMediaSettings);
      video.removeEventListener('ratechange', syncMediaSettings);
    };
  }, [content?.id, streamUrl]);

  useEffect(() => {
    if (!showControls || showSettings) return;
    const timer = window.setTimeout(() => setShowControls(false), 7_000);
    return () => window.clearTimeout(timer);
  }, [content?.id, showControls, showSettings]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      const video = videoRef.current;
      if (!video || !document.hidden) return;

      try {
        video.pause();
      } catch {
        // O hook de progresso já salvou a posição.
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const goBack = useCallback(() => {
    saveNow(false);

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    }

    setShowControls(true);
    setShowSettings(false);
    setShowList(false);
    setScreen(isLive ? 'channels' : currentSeries ? 'series' : 'movies');
  }, [currentSeries, isLive, saveNow, setScreen]);

  const playEpisodeAt = useCallback((index: number) => {
    if (!currentSeries || !currentMovie || index < 0 || index >= seriesEpisodes.length) return;

    saveNow(false);
    const { season, episode } = seriesEpisodes[index];
    setCurrentMovie(makeEpisodeMovie(currentSeries.name, season, episode, currentMovie));
    setPlaybackUrlIndex(0);
    setShowSettings(false);
    setShowControls(true);
  }, [currentMovie, currentSeries, saveNow, seriesEpisodes, setCurrentMovie]);

  const playEpisodeByOffset = (offset: number) => {
    if (!hasEpisodeControls) return;
    playEpisodeAt(currentEpisodeIndex + offset);
  };

  const isSeekable = !isLive && duration > 0;
  const progressPercent = isSeekable ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 100;
  const playbackRates = [0.5, 1, 1.25, 1.5, 2];

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().catch(() => setShowControls(true));
    } else {
      video.pause();
    }

    setShowControls(true);
  };

  const seekBy = (seconds: number) => {
    const video = videoRef.current;
    if (!video || !isSeekable) return;

    const nextTime = Math.min(duration, Math.max(0, video.currentTime + seconds));
    video.currentTime = nextTime;
    setCurrentTime(nextTime);
    setShowControls(true);
  };

  const handleSeek = (value: string) => {
    const video = videoRef.current;
    if (!video || !isSeekable) return;

    const nextTime = Number(value);
    if (!Number.isFinite(nextTime)) return;

    video.currentTime = nextTime;
    setCurrentTime(nextTime);
    setShowControls(true);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !video.muted;
    setShowControls(true);
  };

  const handlePlaybackRate = (rate: number) => {
    const video = videoRef.current;
    if (!video) return;

    video.playbackRate = rate;
    setShowSettings(false);
    setShowControls(true);
  };

  const toggleFullscreen = () => {
    const container = playerShellRef.current || videoRef.current?.parentElement;
    if (!container) return;

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    } else {
      container.requestFullscreen?.().catch(() => undefined);
    }
  };

  useEffect(() => {
    const handlePlayerKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const stop = () => {
        event.preventDefault();
        event.stopPropagation();
        (event as KeyboardEvent & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.();
      };

      if (event.key === 'Escape' || event.key === 'Backspace' || event.key === 'GoBack') {
        stop();
        goBack();
        return;
      }

      if (event.key === 'Enter' || event.key === 'NumpadEnter' || event.key === ' ') {
        stop();
        if (!showControls) {
          setShowControls(true);
        } else {
          togglePlayPause();
        }
        return;
      }

      if (event.key === 'ArrowLeft') {
        stop();
        setShowControls(true);
        if (!isLive) seekBy(-10);
        return;
      }

      if (event.key === 'ArrowRight') {
        stop();
        setShowControls(true);
        if (!isLive) seekBy(10);
        return;
      }

      if (event.key === 'ArrowUp') {
        stop();
        setShowControls(true);
        return;
      }

      if (event.key === 'ArrowDown') {
        stop();
        setShowSettings(false);
        setShowControls(current => !current);
      }
    };

    window.addEventListener('keydown', handlePlayerKeyDown, true);
    return () => window.removeEventListener('keydown', handlePlayerKeyDown, true);
  }, [goBack, isLive, showControls, duration]);

  const progressStyle = {
    '--player-progress-value': `${progressPercent}%`,
  } as CSSProperties;

  return (
    <AppLayout>
      <div
        ref={playerShellRef}
        className="roneca-exoplayer-shell relative h-full bg-black"
        onMouseMove={() => setShowControls(true)}
        onPointerDown={() => setShowControls(true)}
        onTouchStart={() => setShowControls(true)}
        onDoubleClick={toggleFullscreen}
        onClick={() => {
          setShowSettings(false);
          setShowControls(true);
        }}
      >
        <video
          ref={videoRef}
          className="roneca-exoplayer-video h-full w-full bg-black object-contain"
          autoPlay
          playsInline
          controls={false}
        />

        {!ready && !error && streamUrl ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black">
            <div className="text-center">
              <div className="mx-auto mb-5 h-12 w-12 animate-spin rounded-full border-2 border-white/12 border-t-[#d8b15b]" />
              <p className="text-2xl font-light text-white/72">Preparando reprodução</p>
              <p className="mt-2 text-sm text-white/38">Buffer {bufferSize} • {autoReconnect ? 'reconexão ativa' : 'reconexão manual'}</p>
            </div>
          </div>
        ) : null}

        {ready && isBuffering && !error ? (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <div className="rounded-full border border-white/10 bg-black/62 px-5 py-3 text-sm text-white/72 backdrop-blur-xl">
              Reconectando transmissão...
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black">
            <div className="w-[min(90vw,580px)] text-center">
              <p className="flex justify-center text-[#d8b15b]/70"><AlertTriangle aria-hidden="true" size={64} strokeWidth={1.8} /></p>
              <h1 className="mt-6 text-[clamp(22px,3.4vw,36px)] font-light text-white/88">Reprodução indisponível</h1>
              <p className="mt-4 text-[clamp(15px,2vw,20px)] font-light text-white/48">{error}</p>

              <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    if (hasNextPlaybackUrl) {
                      setPlaybackUrlIndex(index => index + 1);
                      setError(null);
                    } else {
                      recoveryAttemptsRef.current = 0;
                      recoverPlayback();
                    }
                  }}
                  className="flex-1 rounded-full bg-[#d8b15b] px-8 py-4 text-[clamp(16px,2vw,22px)] font-semibold text-[#171209]"
                >
                  {hasNextPlaybackUrl ? 'Tentar próxima fonte' : 'Tentar novamente'}
                </button>
                <button
                  type="button"
                  onClick={goBack}
                  className="flex-1 rounded-full border border-white/10 bg-white/[0.055] px-8 py-4 text-[clamp(16px,2vw,22px)] font-light text-white/72"
                >
                  Voltar
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {!error && streamUrl ? (
          <div
            className={`roneca-exoplayer-center-controls pointer-events-none absolute inset-0 z-30 flex items-center justify-center transition-opacity ${
              showControls ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <div className="pointer-events-auto flex items-center gap-[clamp(34px,7vw,118px)] drop-shadow-[0_28px_80px_rgba(0,0,0,0.65)]">
              {!isLive ? (
                <button
                  type="button"
                  onClick={event => {
                    event.stopPropagation();
                    seekBy(-10);
                  }}
                  className="group flex h-[clamp(62px,8vw,106px)] w-[clamp(62px,8vw,106px)] items-center justify-center rounded-full border border-white/15 bg-white/[0.075] text-white backdrop-blur-2xl transition-all hover:border-[#d8b15b]/65"
                  aria-label="Retroceder 10 segundos"
                >
                  <RotateCcw aria-hidden="true" size={28} strokeWidth={2.3} /><span>10</span>
                </button>
              ) : <div className="h-[clamp(58px,8vw,104px)] w-[clamp(58px,8vw,104px)]" />}

              <button
                type="button"
                onClick={event => {
                  event.stopPropagation();
                  togglePlayPause();
                }}
                className="group flex h-[clamp(82px,10vw,138px)] w-[clamp(82px,10vw,138px)] items-center justify-center rounded-full border border-[#d8b15b]/75 bg-[#d8b15b] text-[#171209] shadow-[0_24px_90px_rgba(216,177,91,0.2)] transition-all hover:scale-105"
                aria-label={isPlaying ? 'Pausar' : 'Reproduzir'}
              >
                {isPlaying
                  ? <PauseIcon aria-hidden="true" size={28} fill="currentColor" />
                  : <PlayIcon aria-hidden="true" size={28} fill="currentColor" />}
              </button>

              {!isLive ? (
                <button
                  type="button"
                  onClick={event => {
                    event.stopPropagation();
                    seekBy(10);
                  }}
                  className="group flex h-[clamp(62px,8vw,106px)] w-[clamp(62px,8vw,106px)] items-center justify-center rounded-full border border-white/15 bg-white/[0.075] text-white backdrop-blur-2xl transition-all hover:border-[#d8b15b]/65"
                  aria-label="Avançar 10 segundos"
                >
                  <span>10</span><RotateCw aria-hidden="true" size={28} strokeWidth={2.3} />
                </button>
              ) : <div className="h-[clamp(58px,8vw,104px)] w-[clamp(58px,8vw,104px)]" />}
            </div>
          </div>
        ) : null}

        {(streamUrl || ready || error) ? (
          <div
            className={`roneca-exoplayer-bottom player-bottom-panel absolute inset-x-3 bottom-3 z-40 rounded-[18px] border px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-4 backdrop-blur-xl transition-all duration-300 sm:inset-x-6 sm:bottom-5 sm:px-6 md:inset-x-10 md:px-7 ${
              showControls || error ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
            }`}
            onClick={event => event.stopPropagation()}
            onMouseMove={() => setShowControls(true)}
          >
            <div className="mb-3 flex items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate text-[clamp(15px,1.55vw,24px)] font-medium tracking-[-0.03em] text-white/95">
                  {content?.name ?? 'Reprodução'}
                </p>
                <p className="mt-1 text-[clamp(11px,1.05vw,15px)] font-light tabular-nums text-white/48">
                  {isLive ? 'Transmissão ao vivo' : `${formatTime(currentTime)} / ${formatTime(duration)}`}
                </p>
              </div>

              {isLive ? (
                <div className="rounded-full border border-red-400/35 bg-red-500/15 px-4 py-1.5 text-[clamp(10px,1vw,14px)] font-semibold tracking-[0.24em] text-red-100">
                  AO VIVO
                </div>
              ) : (
                <div className="text-[clamp(11px,1.1vw,16px)] font-light tabular-nums text-white/50">
                  {Math.round(progressPercent)}%
                </div>
              )}
            </div>

            <input
              type="range"
              min={0}
              max={isSeekable ? duration : 100}
              step="1"
              value={isSeekable ? currentTime : 100}
              disabled={!isSeekable}
              onChange={event => handleSeek(event.target.value)}
              style={progressStyle}
              className="player-progress player-progress-slim w-full cursor-pointer disabled:cursor-default disabled:opacity-45"
              aria-label="Progresso da reprodução"
            />

            <div className="relative mt-3 grid grid-cols-3 items-center gap-4">
              <button
                type="button"
                onClick={toggleMute}
                className="justify-self-start rounded-full border border-white/10 bg-white/[0.075] px-4 py-2 text-white/82"
                aria-label={muted || volume === 0 ? 'Ativar som' : 'Silenciar'}
              >
                {muted || volume === 0
                  ? <VolumeX aria-hidden="true" size={24} strokeWidth={2.4} />
                  : <Volume2 aria-hidden="true" size={24} strokeWidth={2.4} />}
              </button>

              <button
                type="button"
                onClick={() => setShowSettings(current => !current)}
                aria-label="Abrir opções do player"
                className="player-settings-arrow justify-self-center rounded-full border border-white/10 bg-white/[0.09] px-6 py-2 text-white/90"
              >
                <ChevronDown aria-hidden="true" size={34} strokeWidth={2.5} />
              </button>

              <button
                type="button"
                onClick={toggleFullscreen}
                className="justify-self-end rounded-full border border-white/10 bg-white/[0.075] px-4 py-2 text-white/82"
                aria-label="Tela cheia"
              >
                <Maximize aria-hidden="true" size={24} strokeWidth={2.4} />
              </button>

              {showSettings ? (
                <div className="player-settings-extension col-span-3 mt-3 w-full rounded-[24px] border border-white/12 bg-black/82 p-4 text-white backdrop-blur-2xl">
                  <div className="grid gap-4 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/38">Velocidade</p>
                      <div className="flex flex-wrap gap-2">
                        {playbackRates.map(rate => (
                          <button
                            key={rate}
                            type="button"
                            onClick={() => handlePlaybackRate(rate)}
                            className={`rounded-full border px-3.5 py-2 text-sm ${
                              playbackRate === rate
                                ? 'border-[#d8b15b]/70 bg-[#d8b15b] text-[#171209]'
                                : 'border-white/10 bg-white/[0.07] text-white/75'
                            }`}
                          >
                            {rate}x
                          </button>
                        ))}
                      </div>

                      <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.045] px-3.5 py-3 text-sm leading-relaxed text-white/52">
                        Buffer: <strong className="text-white/75">{bufferSize}</strong> • Reconexão: <strong className="text-white/75">{autoReconnect ? 'automática' : 'manual'}</strong>
                      </div>
                    </div>

                    {hasEpisodeControls ? (
                      <div className="min-w-0">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/38">Episódios</p>
                        <div className="mb-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => playEpisodeByOffset(-1)}
                            disabled={currentEpisodeIndex <= 0}
                            className="flex-1 rounded-2xl border border-white/10 bg-white/[0.07] px-3 py-2.5 text-sm text-white/75 disabled:opacity-35"
                          >
                            Anterior
                          </button>
                          <button
                            type="button"
                            onClick={() => playEpisodeByOffset(1)}
                            disabled={currentEpisodeIndex >= seriesEpisodes.length - 1}
                            className="flex-1 rounded-2xl border border-white/10 bg-white/[0.07] px-3 py-2.5 text-sm text-white/75 disabled:opacity-35"
                          >
                            Próximo
                          </button>
                        </div>

                        <div className="player-episode-picker max-h-[28vh] space-y-1 overflow-y-auto rounded-2xl border border-white/8 bg-black/18 p-2">
                          {seriesEpisodes.map(({ season, episode }, index) => (
                            <button
                              key={`${episode.id}-${index}`}
                              type="button"
                              onClick={() => playEpisodeAt(index)}
                              className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left ${
                                index === currentEpisodeIndex
                                  ? 'bg-[#d8b15b] text-[#171209]'
                                  : 'bg-white/[0.045] text-white/78'
                              }`}
                            >
                              <span className="min-w-0 flex-1 truncate text-sm font-bold">
                                {episode.number}. {episode.name}
                              </span>
                              <span className="shrink-0 text-xs opacity-70">T{season.number}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-white/8 bg-white/[0.045] px-3.5 py-3 text-sm leading-relaxed text-white/52">
                        Episódios aparecem aqui durante a reprodução de uma série.
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div
          className={`roneca-exoplayer-top absolute inset-x-0 top-0 bg-gradient-to-b from-black/78 via-black/28 to-transparent px-10 py-7 transition-opacity ${
            showControls ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-7">
              <button
                type="button"
                onClick={goBack}
                className="roneca-exoplayer-back player-back-button rounded-full p-3 text-white/76"
                aria-label="Voltar"
              >
                <ArrowLeft aria-hidden="true" size={44} strokeWidth={2.2} />
              </button>

              <div>
                <p className="text-lg font-light text-white/38">{isLive ? 'Ao vivo' : currentSeries ? 'Série' : 'Filme'}</p>
                <h1 className="text-4xl font-light text-white/85">{content?.name || 'RonecaPlayTV'}</h1>
              </div>
            </div>

            {isLive ? (
              <button
                type="button"
                onClick={() => setShowList(current => !current)}
                className="rounded-full border border-white/10 bg-black/28 px-6 py-2.5 text-xl font-light text-white/78 backdrop-blur"
              >
                Lista
              </button>
            ) : null}
          </div>
        </div>

        {showList ? (
          <aside className="player-channel-drawer absolute bottom-0 right-0 top-0 z-50 w-[min(82vw,430px)] border-l border-white/10 bg-black/94 px-5 py-8 backdrop-blur-xl">
            <h2 className="mb-7 text-3xl font-light text-white/82">Canais</h2>
            <div className="max-h-[calc(100vh-110px)] space-y-1 overflow-y-auto">
              {quickChannels.map(channel => (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => {
                    setCurrentChannel(channel);
                    setShowList(false);
                    setShowControls(true);
                  }}
                  className={`player-channel-row flex w-full items-center gap-4 rounded-xl px-5 py-4 text-left ${
                    currentChannel?.id === channel.id ? 'is-active' : ''
                  }`}
                >
                  <TvIcon aria-hidden="true" size={24} strokeWidth={2} className="w-8" />
                  <span className="truncate text-lg font-light">{channel.name}</span>
                </button>
              ))}
            </div>
          </aside>
        ) : null}
      </div>
    </AppLayout>
  );
}
