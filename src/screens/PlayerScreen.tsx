import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { AppLayout } from '@/components/shared';
import { Play as PlayIcon, Pause as PauseIcon, Tv as TvIcon } from 'lucide-react';

function isHttpUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

function isNativeRuntime() {
  const capacitor = (window as any).Capacitor;
  return Boolean(capacitor?.isNativePlatform?.());
}

function toMediaProxyUrl(url: string) {
  if (!isHttpUrl(url)) return url;

  // No APK/Capacitor não existe servidor Vite. Tenta tocar direto.
  if (isNativeRuntime()) return url;

  const path = `/api/media-proxy?url=${encodeURIComponent(url)}`;

  if (typeof window === 'undefined') return path;

  // mpegts.js usa Worker/Blob; dentro do Worker URL relativa quebra.
  return new URL(path, window.location.origin).toString();
}

function isHlsUrl(url: string) {
  return /\.m3u8(\?|#|$)/i.test(url);
}

function isMpegTsUrl(url: string) {
  return /\.(ts|m2ts|mpegts)(\?|#|$)/i.test(url);
}

function formatTime(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return '00:00';
  }

  const seconds = Math.floor(totalSeconds % 60);
  const minutes = Math.floor((totalSeconds / 60) % 60);
  const hours = Math.floor(totalSeconds / 3600);

  const two = (value: number) => String(value).padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${two(minutes)}:${two(seconds)}`;
  }

  return `${two(minutes)}:${two(seconds)}`;
}

export function PlayerScreen() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerShellRef = useRef<HTMLDivElement>(null);
  const {
    currentChannel,
    currentMovie,
    currentSeries,
    channels,
    setCurrentChannel,
    setCurrentMovie,
    setScreen,
  } = useAppStore();

  const [showControls, setShowControls] = useState(true);
  const [showList, setShowList] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [playbackUrlIndex, setPlaybackUrlIndex] = useState(0);
  const [reloadNonce, setReloadNonce] = useState(0);

  const content = currentMovie || currentChannel;
  const isLive = Boolean(currentChannel && !currentMovie);

  const playbackCandidates = useMemo(() => {
    if (!content) return [];

    const extraUrls = Array.isArray(content.playbackUrls) ? content.playbackUrls : [];

    return [...new Set([content.url, ...extraUrls].map(url => url?.trim()).filter(Boolean))];
  }, [content]);

  const streamUrl = playbackCandidates[playbackUrlIndex] || '';
  const playbackUrl = useMemo(() => toMediaProxyUrl(streamUrl), [streamUrl]);
  const hasNextPlaybackUrl = playbackUrlIndex + 1 < playbackCandidates.length;

  const recoverPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    setError(null);
    setReady(false);

    try {
      video.pause();
      video.removeAttribute('src');
      video.load();
    } catch {
      // ignora falha do elemento de vídeo
    }

    setReloadNonce(value => value + 1);
    setShowControls(true);
  }, [streamUrl]);

  const quickChannels = useMemo(() => {
    return channels.filter(channel => channel.url?.trim()).slice(0, 36);
  }, [channels]);

  useEffect(() => {
    setPlaybackUrlIndex(0);
  }, [content?.id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setReady(false);
    setError(null);

    video.pause();
    video.removeAttribute('src');
    video.load();

    if (!streamUrl) {
      setError('Fonte não configurada.');
      return;
    }

    let hls: any = null;
    let tsPlayer: any = null;
    const isHls = isHlsUrl(streamUrl);
    const isMpegTs = isMpegTsUrl(streamUrl);
    let recoveryTimer: number | null = null;

    const clearRecoveryTimer = () => {
      if (recoveryTimer !== null) {
        window.clearTimeout(recoveryTimer);
        recoveryTimer = null;
      }
    };

    const scheduleStallRecovery = () => {
      if (!isLive) return;
      clearRecoveryTimer();

      recoveryTimer = window.setTimeout(() => {
        recoverPlayback();
      }, 8000);
    };

    video.addEventListener('waiting', scheduleStallRecovery);
    video.addEventListener('stalled', scheduleStallRecovery);
    video.addEventListener('playing', clearRecoveryTimer);
    video.addEventListener('canplay', clearRecoveryTimer);

    const tryNextPlaybackUrl = (message: string) => {
      if (playbackUrlIndex + 1 < playbackCandidates.length) {
        setError(`${message} Tentando outra fonte (${playbackUrlIndex + 2}/${playbackCandidates.length})...`);
        setPlaybackUrlIndex(index => index + 1);
        return;
      }

      setError(message);
    };

      if (isMpegTs) {
        let cancelled = false;
        let markReady: (() => void) | null = null;
        let markError: (() => void) | null = null;

        void import('mpegts.js')
          .then((module) => {
            if (cancelled) return;

            const mpegts = (module as any).default ?? module;

            if (!mpegts?.getFeatureList?.().mseLivePlayback && !mpegts?.getFeatureList?.().msePlayback) {
              setError('Este navegador não tem suporte para MPEG-TS via MSE.');
              return;
            }

            tsPlayer = mpegts.createPlayer(
              {
                type: 'mpegts',
                isLive,
                url: playbackUrl,
              },
              {
                enableWorker: true,
                liveBufferLatencyChasing: true,
                enableStashBuffer: true,
                lazyLoad: false,
                liveBufferLatencyMaxLatency: 10,
                stashInitialSize: isLive ? 1024 * 1024 : 512 * 1024,
              }
            );

            if (cancelled) {
              tsPlayer?.destroy?.();
              return;
            }

            tsPlayer.attachMediaElement(video);
            tsPlayer.load();

            const playResult = tsPlayer.play?.();

            if (playResult?.catch) {
              playResult.catch(() => setShowControls(true));
            }

            markReady = () => setReady(true);
            markError = () => tryNextPlaybackUrl('Não foi possível reproduzir este canal MPEG-TS.');

            video.addEventListener('loadedmetadata', markReady);
            video.addEventListener('canplay', markReady);
            video.addEventListener('error', markError);

            tsPlayer.on?.(mpegts.Events.ERROR, markError);
          })
          .catch(() => {
            if (!cancelled) {
              tryNextPlaybackUrl('Não foi possível carregar o suporte MPEG-TS.');
            }
          });

        return () => {
          cancelled = true;
          clearRecoveryTimer();
          video.removeEventListener('waiting', scheduleStallRecovery);
          video.removeEventListener('stalled', scheduleStallRecovery);
          video.removeEventListener('playing', clearRecoveryTimer);
          video.removeEventListener('canplay', clearRecoveryTimer);

          if (markReady) {
            video.removeEventListener('loadedmetadata', markReady);
            video.removeEventListener('canplay', markReady);
          }

          if (markError) {
            video.removeEventListener('error', markError);
          }

          tsPlayer?.destroy?.();
        };
      }
    if (isHls) {
      let cancelled = false;

      const attachNativePlayback = () => {
        if (cancelled) return;

        video.src = playbackUrl;
        video.onloadedmetadata = () => {
          setReady(true);
          video.play().catch(() => setShowControls(true));
        };
        video.onerror = () => tryNextPlaybackUrl('Não foi possível reproduzir esta fonte.');
      };

      void import('hls.js')
        .then((module) => {
          if (cancelled) return;

          const Hls = (module as any).default ?? module;

          if (!Hls?.isSupported?.()) {
            attachNativePlayback();
            return;
          }

          hls = new Hls({
            enableWorker: true,
            lowLatencyMode: false,
            backBufferLength: isLive ? 30 : 60,
            maxBufferLength: isLive ? 60 : 90,
            maxMaxBufferLength: isLive ? 120 : 180,
            maxBufferSize: 60 * 1000 * 1000,
            maxBufferHole: 0.5,
            manifestLoadingMaxRetry: 4,
            manifestLoadingRetryDelay: 1000,
            levelLoadingMaxRetry: 4,
            levelLoadingRetryDelay: 1000,
            fragLoadingMaxRetry: 6,
            fragLoadingRetryDelay: 1000,
          });

          hls.loadSource(playbackUrl);
          hls.attachMedia(video);

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (cancelled) return;

            setReady(true);
            video.play().catch(() => setShowControls(true));
          });

          hls.on(Hls.Events.ERROR, (_event: unknown, data: any) => {
            if (cancelled || !data.fatal) return;

            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              window.setTimeout(() => hls?.startLoad(), 1200);
              return;
            }

            if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              hls?.recoverMediaError();
              return;
            }

            hls?.destroy();
            tryNextPlaybackUrl('Não foi possível reproduzir esta fonte HLS.');
          });
        })
        .catch(() => {
          attachNativePlayback();
        });

      return () => {
        cancelled = true;
        clearRecoveryTimer();
        video.removeEventListener('waiting', scheduleStallRecovery);
        video.removeEventListener('stalled', scheduleStallRecovery);
        video.removeEventListener('playing', clearRecoveryTimer);
        video.removeEventListener('canplay', clearRecoveryTimer);
        hls?.destroy();
        tsPlayer?.destroy?.();
        video.onloadedmetadata = null;
        video.onerror = null;
      };
    }

    video.src = playbackUrl;
    video.onloadedmetadata = () => {
      setReady(true);
      video.play().catch(() => setShowControls(true));
    };
    video.onerror = () => tryNextPlaybackUrl('Não foi possível reproduzir esta fonte.');
    return () => {
      clearRecoveryTimer();
      video.removeEventListener('waiting', scheduleStallRecovery);
      video.removeEventListener('stalled', scheduleStallRecovery);
      video.removeEventListener('playing', clearRecoveryTimer);
      video.removeEventListener('canplay', clearRecoveryTimer);
      hls?.destroy();
      tsPlayer?.destroy?.();
      video.onloadedmetadata = null;
      video.onerror = null;
    };
  }, [streamUrl, playbackUrl, isLive, playbackUrlIndex, playbackCandidates, reloadNonce, recoverPlayback]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const syncPlaybackState = () => {
      const safeCurrentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      const safeDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;

      setCurrentTime(safeCurrentTime);
      setDuration(safeDuration);
      setIsPlaying(!video.paused && !video.ended);
      setVolume(video.volume);
      setMuted(video.muted);
      setPlaybackRate(video.playbackRate || 1);
    };

    video.addEventListener('timeupdate', syncPlaybackState);
    video.addEventListener('durationchange', syncPlaybackState);
    video.addEventListener('loadedmetadata', syncPlaybackState);
    video.addEventListener('play', syncPlaybackState);
    video.addEventListener('pause', syncPlaybackState);
    video.addEventListener('volumechange', syncPlaybackState);
    video.addEventListener('ended', syncPlaybackState);

    syncPlaybackState();

    return () => {
      video.removeEventListener('timeupdate', syncPlaybackState);
      video.removeEventListener('durationchange', syncPlaybackState);
      video.removeEventListener('loadedmetadata', syncPlaybackState);
      video.removeEventListener('play', syncPlaybackState);
      video.removeEventListener('pause', syncPlaybackState);
      video.removeEventListener('volumechange', syncPlaybackState);
      video.removeEventListener('ended', syncPlaybackState);
    };
  }, [content?.id, streamUrl]);

  useEffect(() => {
    if (!showControls || showSettings) return;
    const timer = window.setTimeout(() => setShowControls(false), 7000);
    return () => window.clearTimeout(timer);
  }, [showControls, showSettings, content?.id]);

  useEffect(() => {
    if (!content?.id) return;

    const autoFullscreenTimer = window.setTimeout(() => {
      const container = playerShellRef.current || videoRef.current?.parentElement;

      if (!container || document.fullscreenElement) return;

      container.requestFullscreen?.().catch(() => undefined);
    }, 180);

    return () => window.clearTimeout(autoFullscreenTimer);
  }, [content?.id]);

  const goBack = () => setScreen(isLive ? 'channels' : currentSeries ? 'series' : 'movies');

  const seriesEpisodes = useMemo(() => {
    const seasons = (currentSeries as any)?.seasons;

    if (!Array.isArray(seasons)) return [];

    return seasons.flatMap((season: any) => {
      const episodes = Array.isArray(season?.episodes) ? season.episodes : [];

      return episodes.map((episode: any, index: number) => ({
        ...episode,
        seasonTitle: season?.name ?? season?.title ?? season?.number ?? season?.seasonNumber ?? '',
        episodeIndex: index,
      }));
    });
  }, [currentSeries]);

  const currentEpisodeIndex = useMemo(() => {
    if (!content || seriesEpisodes.length === 0) return -1;

    return seriesEpisodes.findIndex((episode: any) => {
      return episode?.id === content.id || episode?.url === content.url;
    });
  }, [content, seriesEpisodes]);

  const hasEpisodeControls = !isLive && currentEpisodeIndex >= 0 && seriesEpisodes.length > 1;

  const playEpisodeByOffset = (offset: number) => {
    if (!hasEpisodeControls) return;

    const nextIndex = currentEpisodeIndex + offset;

    if (nextIndex < 0 || nextIndex >= seriesEpisodes.length) return;

    const nextEpisode = seriesEpisodes[nextIndex];

    setCurrentMovie(nextEpisode as any);
    setPlaybackUrlIndex(0);
    setShowSettings(false);
    setShowControls(true);
  };

  const playbackRates = [0.5, 1, 1.25, 1.5, 2];

  const isSeekable = !isLive && duration > 0;
  const progressPercent = isSeekable ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 100;

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
    setMuted(video.muted);
    setShowControls(true);
  };


  const handlePlaybackRate = (rate: number) => {
    const video = videoRef.current;
    if (!video) return;

    video.playbackRate = rate;
    setPlaybackRate(rate);
    setShowSettings(false);
    setShowControls(true);
  };

  const toggleFullscreen = () => {
    const container = playerShellRef.current || videoRef.current?.parentElement;
    if (!container) return;

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
      return;
    }

    container.requestFullscreen?.().catch(() => undefined);
  };

  const revealControls = () => {
    setShowControls(true);
  };

  const handlePlayerSurfaceClick = () => {
    setShowSettings(false);
    setShowControls(true);
  };

  return (
    <AppLayout>
      <div
        ref={playerShellRef}
        className="relative h-full bg-black"
        onMouseMove={revealControls}
        onPointerDown={revealControls}
        onTouchStart={revealControls}
        onDoubleClick={toggleFullscreen}
        onClick={handlePlayerSurfaceClick}
      >
        <video
          ref={videoRef}
          className="h-full w-full bg-black object-contain"
          autoPlay
          playsInline
          controls={false}
        />

        {!ready && !error && streamUrl && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <div className="text-center">
              <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-2 border-white/12 border-t-white/80" />
              <p className="text-3xl font-light text-white/72">Carregando</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <div className="w-[min(90vw,560px)] text-center">
              <p className="text-6xl text-white/35">⚠</p>
              <h1 className="mt-6 text-[clamp(22px,3.4vw,36px)] font-light text-white/82">Reprodução indisponível</h1>
              <p className="mt-4 text-[clamp(15px,2vw,20px)] font-light text-white/42">{error}</p>

              <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                <button
                  onClick={() => {
                    if (hasNextPlaybackUrl) {
                      setPlaybackUrlIndex(index => index + 1);
                      setError(null);
                    } else {
                      window.location.reload();
                    }
                  }}
                  className="flex-1 rounded-md bg-[#2396f2] px-8 py-4 text-[clamp(16px,2vw,22px)] font-light text-white"
                >
                  {hasNextPlaybackUrl ? 'Tentar próxima fonte' : 'Tentar novamente'}
                </button>
                <button
                  onClick={goBack}
                  className="flex-1 rounded-md bg-white/[0.055] px-8 py-4 text-[clamp(16px,2vw,22px)] font-light text-white/72"
                >
                  Voltar
                </button>
              </div>
            </div>
          </div>
        )}

        {!error && streamUrl && (
          <div
            className={`pointer-events-none absolute inset-0 z-30 flex items-center justify-center transition-opacity ${
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
                  className="group flex h-[clamp(62px,8vw,106px)] w-[clamp(62px,8vw,106px)] items-center justify-center rounded-full border border-white/15 bg-white/[0.075] text-[clamp(17px,2.1vw,30px)] font-light text-white shadow-[0_20px_70px_rgba(0,0,0,0.55)] backdrop-blur-2xl transition-all duration-200 hover:scale-105 hover:border-white/30 hover:bg-white/[0.14] active:scale-95"
                  aria-label="Retroceder 10 segundos"
                >
                  ↺ 10
                </button>
              ) : (
                <div className="h-[clamp(58px,8vw,104px)] w-[clamp(58px,8vw,104px)]" />
              )}

              <button
                type="button"
                onClick={event => {
                  event.stopPropagation();
                  togglePlayPause();
                }}
                className="group flex h-[clamp(82px,10vw,138px)] w-[clamp(82px,10vw,138px)] items-center justify-center rounded-full border border-white/25 bg-white/[0.16] text-[clamp(34px,4.3vw,58px)] text-white shadow-[0_24px_90px_rgba(35,150,242,0.22)] backdrop-blur-2xl transition-all duration-200 hover:scale-105 hover:border-white/40 hover:bg-white/[0.24] active:scale-95"
                aria-label={isPlaying ? 'Pausar' : 'Reproduzir'}
              >
                {isPlaying ? <PauseIcon aria-hidden="true" size={22} fill="currentColor" /> : <PlayIcon aria-hidden="true" size={22} fill="currentColor" />}
              </button>

              {!isLive ? (
                <button
                  type="button"
                  onClick={event => {
                    event.stopPropagation();
                    seekBy(10);
                  }}
                  className="group flex h-[clamp(62px,8vw,106px)] w-[clamp(62px,8vw,106px)] items-center justify-center rounded-full border border-white/15 bg-white/[0.075] text-[clamp(17px,2.1vw,30px)] font-light text-white shadow-[0_20px_70px_rgba(0,0,0,0.55)] backdrop-blur-2xl transition-all duration-200 hover:scale-105 hover:border-white/30 hover:bg-white/[0.14] active:scale-95"
                  aria-label="Avançar 10 segundos"
                >
                  10 ↻
                </button>
              ) : (
                <div className="h-[clamp(58px,8vw,104px)] w-[clamp(58px,8vw,104px)]" />
              )}
            </div>
          </div>
        )}

        {(streamUrl || ready || error) && (
          <div
            className={`player-bottom-panel absolute inset-x-3 bottom-3 z-40 rounded-[28px] border border-white/10 bg-[#020817]/72 px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-5 shadow-[0_30px_90px_rgba(0,0,0,0.65)] backdrop-blur-2xl transition-all duration-300 sm:inset-x-6 sm:bottom-6 sm:px-6 md:inset-x-10 md:px-8 ${
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
                <div className="rounded-full border border-red-400/35 bg-red-500/15 px-4 py-1.5 text-[clamp(10px,1vw,14px)] font-semibold tracking-[0.24em] text-red-100 shadow-[0_0_30px_rgba(239,68,68,0.18)]">
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
              style={{ '--player-progress-value': `${progressPercent}%` } as any}
              className="player-progress player-progress-slim w-full cursor-pointer disabled:cursor-default disabled:opacity-45"
              aria-label="Progresso da reprodução"
            />

            <div className="relative mt-3 grid grid-cols-3 items-center gap-4">
              <button
                type="button"
                onClick={toggleMute}
                className="justify-self-start rounded-full border border-white/10 bg-white/[0.075] px-4 py-2 text-[clamp(13px,1.25vw,18px)] text-white/82 shadow-lg backdrop-blur transition-all duration-200 hover:border-white/20 hover:bg-white/[0.13] active:scale-95"
              >
                {muted || volume === 0 ? '🔇' : '🔊'}
              </button>

              <div className="contents">
                <button
                  type="button"
                  onClick={() => setShowSettings(current => !current)}
                  aria-label="Abrir opções do player"
                  title="Opções"
                  className="player-settings-arrow justify-self-center rounded-full border border-white/10 bg-white/[0.09] px-6 py-2 text-[clamp(28px,3.4vw,42px)] font-black leading-none text-white/90 shadow-lg backdrop-blur transition-all duration-200 hover:border-white/20 hover:bg-white/[0.15] active:scale-95"
                >
                  ⌄
                </button>

                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="justify-self-end rounded-full border border-white/10 bg-white/[0.075] px-4 py-2 text-[clamp(13px,1.25vw,18px)] text-white/82 shadow-lg backdrop-blur transition-all duration-200 hover:border-white/20 hover:bg-white/[0.13] active:scale-95"
                >
                  ⛶
                </button>
              </div>

              {showSettings && (
                <div className="player-settings-extension col-span-3 mt-3 w-full rounded-[24px] border border-white/12 bg-[#05101f]/82 p-4 text-white shadow-[0_18px_55px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
                  <div className="grid gap-4 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/38">Velocidade</p>
                      <div className="flex flex-wrap gap-2">
                        {playbackRates.map(rate => (
                          <button
                            key={rate}
                            type="button"
                            onClick={() => handlePlaybackRate(rate)}
                            className={`rounded-full border px-3.5 py-2 text-sm transition-all duration-200 ${
                              playbackRate === rate
                                ? 'border-[#2396f2]/70 bg-[#2396f2] text-white shadow-[0_0_28px_rgba(35,150,242,0.32)]'
                                : 'border-white/10 bg-white/[0.07] text-white/75 hover:border-white/20 hover:bg-white/[0.13]'
                            }`}
                          >
                            {rate}x
                          </button>
                        ))}
                      </div>

                      <div className="mt-4">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/38">Áudio / idioma</p>
                        <p className="rounded-2xl border border-white/8 bg-white/[0.045] px-3.5 py-3 text-sm leading-relaxed text-white/52">
                          Disponível quando a fonte possuir múltiplas trilhas de áudio.
                        </p>
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
                            className="flex-1 rounded-2xl border border-white/10 bg-white/[0.07] px-3 py-2.5 text-sm text-white/75 transition-all duration-200 hover:bg-white/[0.13] disabled:opacity-35"
                          >
                            Anterior
                          </button>

                          <button
                            type="button"
                            onClick={() => playEpisodeByOffset(1)}
                            disabled={currentEpisodeIndex >= seriesEpisodes.length - 1}
                            className="flex-1 rounded-2xl border border-white/10 bg-white/[0.07] px-3 py-2.5 text-sm text-white/75 transition-all duration-200 hover:bg-white/[0.13] disabled:opacity-35"
                          >
                            Próximo
                          </button>
                        </div>

                        <div className="player-episode-picker max-h-[28vh] space-y-1 overflow-y-auto rounded-2xl border border-white/8 bg-black/18 p-2">
                          {seriesEpisodes.map((episode: any, index: number) => (
                            <button
                              key={`${episode.id}-${index}`}
                              type="button"
                              onClick={() => {
                                const offset = index - currentEpisodeIndex;
                                if (offset !== 0) {
                                  playEpisodeByOffset(offset);
                                }
                                setShowSettings(false);
                                setShowControls(true);
                              }}
                              className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-all ${
                                index === currentEpisodeIndex
                                  ? 'bg-sky-400 text-slate-950'
                                  : 'bg-white/[0.045] text-white/78 hover:bg-white/[0.1] hover:text-white'
                              }`}
                            >
                              <span className="min-w-0 flex-1 truncate text-sm font-black">
                                {index + 1}. {episode.name}
                              </span>
                              <span className="shrink-0 text-xs opacity-70">
                                {episode.seasonTitle ? `T${episode.seasonTitle}` : 'EP'}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-white/8 bg-white/[0.045] px-3.5 py-3 text-sm leading-relaxed text-white/52">
                        Episódios aparecem aqui quando você estiver assistindo uma série.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div
          className={`absolute inset-x-0 top-0 bg-gradient-to-b from-black/82 to-transparent px-12 py-8 transition-opacity ${
            showControls ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-7">
              <button
                onClick={goBack}
                className="player-back-button text-7xl font-light leading-none text-white/76 hover:text-white"
              >
                ←
              </button>

              <div>
                <p className="text-lg font-light text-white/38">
                  {isLive ? 'Ao vivo' : 'VOD'}
                </p>
                <h1 className="text-4xl font-light text-white/85">
                  {content?.name || 'RonecaPlayTV'}
                </h1>
              </div>
            </div>

            {isLive && (
              <button
                onClick={() => setShowList(current => !current)}
                className="rounded-md bg-white/[0.055] px-7 py-3 text-2xl font-light text-white/75 hover:bg-[#2396f2] hover:text-white"
              >
                Lista
              </button>
            )}
          </div>
        </div>

        {/* Barra inferior duplicada removida: os controles principais ficam no painel de progresso. */}

        {showList && (
          <aside className="absolute bottom-0 right-0 top-0 w-[min(82vw,430px)] bg-[#071a31]/96 px-5 py-8">
            <h2 className="mb-7 text-4xl font-light text-white/82">Canais</h2>

            <div className="max-h-[calc(100vh-110px)] space-y-1 overflow-y-auto">
              {quickChannels.map(channel => (
                <button
                  key={channel.id}
                  onClick={() => {
                    setCurrentChannel(channel);
                    setShowList(false);
                    setShowControls(true);
                  }}
                  className={`clean-tv-row flex w-full items-center gap-4 px-5 py-4 text-left ${
                    currentChannel?.id === channel.id ? 'active' : ''
                  }`}
                >
                  <TvIcon aria-hidden="true" size={26} strokeWidth={2.4} className="w-8" />
                  <span className="truncate text-2xl font-light">{channel.name}</span>
                </button>
              ))}
            </div>
          </aside>
        )}
      </div>
    </AppLayout>
  );
}
