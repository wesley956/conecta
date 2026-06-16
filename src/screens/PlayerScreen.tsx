import { useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import mpegts from 'mpegts.js';
import { useAppStore } from '@/stores/appStore';
import { AppLayout } from '@/components/shared';

function isHttpUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

function isNativeRuntime() {
  if (typeof window === 'undefined') return false;

  const capacitor = (window as any).Capacitor;
  const protocol = window.location.protocol;

  return (
    protocol === 'capacitor:' ||
    protocol === 'ionic:' ||
    protocol === 'http:' && window.location.hostname === 'localhost' ||
    Boolean(capacitor?.isNativePlatform?.())
  );
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
  const {
    currentChannel,
    currentMovie,
    channels,
    setCurrentChannel,
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
  const [playbackUrlIndex, setPlaybackUrlIndex] = useState(0);

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

    let hls: Hls | null = null;
    let tsPlayer: any = null;
    const isHls = isHlsUrl(streamUrl);
    const isMpegTs = isMpegTsUrl(streamUrl);

    const tryNextPlaybackUrl = (message: string) => {
      if (playbackUrlIndex + 1 < playbackCandidates.length) {
        setError(`${message} Tentando outra fonte (${playbackUrlIndex + 2}/${playbackCandidates.length})...`);
        setPlaybackUrlIndex(index => index + 1);
        return;
      }

      setError(message);
    };

    if (isMpegTs) {
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
          enableWorker: false,
          liveBufferLatencyChasing: true,
          stashInitialSize: 384 * 1024,
        }
      );

      tsPlayer.attachMediaElement(video);
      tsPlayer.load();

      const playResult = tsPlayer.play?.();

      if (playResult?.catch) {
        playResult.catch(() => setShowControls(true));
      }

      const markReady = () => setReady(true);
      const markError = () => tryNextPlaybackUrl('Não foi possível reproduzir este canal MPEG-TS.');

      video.addEventListener('loadedmetadata', markReady);
      video.addEventListener('canplay', markReady);
      video.addEventListener('error', markError);

      tsPlayer.on?.(mpegts.Events.ERROR, markError);

      return () => {
        video.removeEventListener('loadedmetadata', markReady);
        video.removeEventListener('canplay', markReady);
        video.removeEventListener('error', markError);
        tsPlayer?.destroy?.();
      };
    }

    if (isHls && Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: isLive,
        backBufferLength: 60,
      });

      hls.loadSource(playbackUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setReady(true);
        video.play().catch(() => setShowControls(true));
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          hls?.destroy();
          tryNextPlaybackUrl('Não foi possível reproduzir esta fonte HLS.');
        }
      });
    } else {
      video.src = playbackUrl;
      video.onloadedmetadata = () => {
        setReady(true);
        video.play().catch(() => setShowControls(true));
      };
      video.onerror = () => tryNextPlaybackUrl('Não foi possível reproduzir esta fonte.');
    }

    return () => {
      hls?.destroy();
      tsPlayer?.destroy?.();
      video.onloadedmetadata = null;
      video.onerror = null;
    };
  }, [streamUrl, playbackUrl, isLive, playbackUrlIndex, playbackCandidates]);

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
    if (!showControls) return;
    const timer = window.setTimeout(() => setShowControls(false), 3800);
    return () => window.clearTimeout(timer);
  }, [showControls, content?.id]);

  const goBack = () => setScreen(isLive ? 'channels' : 'movies');

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

  const handleVolume = (value: string) => {
    const video = videoRef.current;
    if (!video) return;

    const nextVolume = Math.min(1, Math.max(0, Number(value)));
    video.volume = nextVolume;
    video.muted = nextVolume === 0;

    setVolume(nextVolume);
    setMuted(video.muted);
    setShowControls(true);
  };

  const toggleFullscreen = () => {
    const container = videoRef.current?.parentElement;
    if (!container) return;

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
      return;
    }

    container.requestFullscreen?.().catch(() => undefined);
  };

  return (
    <AppLayout>
      <div
        className="relative h-full bg-black"
        onMouseMove={() => setShowControls(true)}
        onClick={() => setShowControls(current => !current)}
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
            <div className="w-[560px] text-center">
              <p className="text-6xl text-white/35">⚠</p>
              <h1 className="mt-6 text-4xl font-light text-white/82">Reprodução indisponível</h1>
              <p className="mt-4 text-xl font-light text-white/42">{error}</p>

              <div className="mt-10 flex gap-4">
                <button
                  onClick={() => {
                    if (hasNextPlaybackUrl) {
                      setPlaybackUrlIndex(index => index + 1);
                      setError(null);
                    } else {
                      window.location.reload();
                    }
                  }}
                  className="flex-1 rounded-md bg-[#2396f2] px-8 py-4 text-2xl font-light text-white"
                >
                  {hasNextPlaybackUrl ? 'Tentar próxima fonte' : 'Tentar novamente'}
                </button>
                <button
                  onClick={goBack}
                  className="flex-1 rounded-md bg-white/[0.055] px-8 py-4 text-2xl font-light text-white/72"
                >
                  Voltar
                </button>
              </div>
            </div>
          </div>
        )}

        {(streamUrl || ready || error) && (
          <div
            className={`absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/95 via-black/75 to-transparent px-5 pb-[max(14px,env(safe-area-inset-bottom))] pt-14 transition-opacity sm:px-8 md:px-12 ${
              showControls || error ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
            onClick={event => event.stopPropagation()}
            onMouseMove={() => setShowControls(true)}
          >
            <div className="mb-3 flex items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate text-[clamp(14px,1.6vw,24px)] font-light text-white/90">
                  {content?.name ?? 'Reprodução'}
                </p>
                <p className="mt-1 text-[clamp(11px,1.1vw,16px)] font-light text-white/45">
                  {isLive ? 'Transmissão ao vivo' : `${formatTime(currentTime)} / ${formatTime(duration)}`}
                </p>
              </div>

              {isLive ? (
                <div className="rounded-full border border-red-400/40 bg-red-500/15 px-4 py-1 text-[clamp(11px,1.1vw,16px)] font-semibold tracking-[0.22em] text-red-200">
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
              className="h-2 w-full cursor-pointer accent-[#2396f2] disabled:cursor-default disabled:opacity-45"
              aria-label="Progresso da reprodução"
            />

            <div className="mt-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <button type="button" onClick={togglePlayPause} className="rounded-full bg-white/12 px-4 py-2 text-[clamp(16px,1.7vw,24px)] text-white hover:bg-white/18">
                  {isPlaying ? '⏸' : '▶'}
                </button>

                {!isLive && (
                  <>
                    <button type="button" onClick={() => seekBy(-10)} className="rounded-full bg-white/10 px-4 py-2 text-[clamp(12px,1.2vw,18px)] text-white/82 hover:bg-white/16">
                      -10s
                    </button>
                    <button type="button" onClick={() => seekBy(10)} className="rounded-full bg-white/10 px-4 py-2 text-[clamp(12px,1.2vw,18px)] text-white/82 hover:bg-white/16">
                      +10s
                    </button>
                  </>
                )}

                <button type="button" onClick={toggleMute} className="rounded-full bg-white/10 px-4 py-2 text-[clamp(13px,1.3vw,19px)] text-white/82 hover:bg-white/16">
                  {muted || volume === 0 ? '🔇' : '🔊'}
                </button>

                <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={event => handleVolume(event.target.value)} className="hidden h-2 w-28 accent-[#2396f2] sm:block" aria-label="Volume" />
              </div>

              <button type="button" onClick={toggleFullscreen} className="rounded-full bg-white/10 px-4 py-2 text-[clamp(13px,1.3vw,19px)] text-white/82 hover:bg-white/16">
                ⛶ Tela cheia
              </button>
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
                className="text-5xl font-light text-white/62 hover:text-white"
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

        <div
          className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/82 to-transparent px-12 py-8 transition-opacity ${
            showControls ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                const video = videoRef.current;
                if (!video) return;
                if (video.paused) video.play();
                else video.pause();
              }}
              className="flex items-center gap-5 text-3xl font-light text-white/82 hover:text-white"
            >
              <span className="text-5xl">▷</span>
              <span>{content?.name || 'Sem conteúdo'}</span>
            </button>

            <p className="text-xl font-light text-white/38">
              {streamUrl ? (isMpegTsUrl(streamUrl) ? 'MPEG-TS via proxy' : 'Fonte conectada') : 'Sem fonte'}
            </p>
          </div>
        </div>

        {showList && (
          <aside className="absolute bottom-0 right-0 top-0 w-[430px] bg-[#071a31]/96 px-5 py-8">
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
                  <span className="w-8 text-2xl">▣</span>
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
