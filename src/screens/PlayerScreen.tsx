import { useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import { useAppStore } from '@/stores/appStore';
import { AppLayout } from '@/components/shared';

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
  const [showQuickList, setShowQuickList] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const content = currentChannel || currentMovie;
  const isLive = Boolean(currentChannel);
  const streamUrl = content?.url?.trim() || '';

  const quickChannels = useMemo(() => {
    const withUrl = channels.filter(channel => channel.url?.trim());
    return withUrl.length ? withUrl.slice(0, 32) : channels.slice(0, 32);
  }, [channels]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setPlayerError(null);
    setIsReady(false);

    if (!streamUrl) {
      video.removeAttribute('src');
      video.load();
      setPlayerError('Fonte autorizada não configurada para este conteúdo.');
      return;
    }

    let hls: Hls | null = null;

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: isLive,
        backBufferLength: 60,
      });

      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsReady(true);
        video.play().catch(() => {
          setShowControls(true);
        });
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setPlayerError('Não foi possível reproduzir esta fonte. Verifique se a URL está ativa e autorizada.');
          hls?.destroy();
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
      video.addEventListener('loadedmetadata', () => {
        setIsReady(true);
        video.play().catch(() => setShowControls(true));
      });
    } else {
      setPlayerError('Este navegador não suporta HLS diretamente.');
    }

    return () => {
      hls?.destroy();
    };
  }, [streamUrl, isLive]);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowControls(false), 4500);
    return () => window.clearTimeout(timer);
  }, [showControls, content?.id]);

  const handleBack = () => {
    setScreen(isLive ? 'channels' : 'home');
  };

  const handleQuickChannelClick = (channel: typeof channels[number]) => {
    setCurrentChannel(channel);
    setShowQuickList(false);
    setShowControls(true);
  };

  return (
    <AppLayout>
      <div
        className="relative h-full overflow-hidden rounded-[1.6rem] bg-black"
        onMouseMove={() => setShowControls(true)}
        onClick={() => setShowControls(current => !current)}
      >
        <video
          ref={videoRef}
          className="h-full w-full bg-black object-contain"
          controls={false}
          playsInline
          autoPlay
        />

        {!streamUrl && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-bg-primary via-bg-dark to-black">
            <div className="glass-panel max-w-xl rounded-[1.8rem] p-8 text-center">
              <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-[1.5rem] border border-alert-yellow/35 bg-alert-yellow/10 text-4xl">
                ⚠️
              </div>
              <h2 className="text-3xl font-black text-text-white">Fonte não configurada</h2>
              <p className="mt-3 text-text-gray">
                Este conteúdo ainda não tem uma URL autorizada para reprodução.
              </p>
              <button onClick={handleBack} className="btn-neon mt-6">
                Voltar
              </button>
            </div>
          </div>
        )}

        {playerError && streamUrl && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/82 backdrop-blur-sm">
            <div className="glass-panel max-w-2xl rounded-[1.8rem] p-8 text-center">
              <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-[1.5rem] border border-error-red/35 bg-error-red/10 text-4xl">
                ⛔
              </div>
              <h2 className="text-3xl font-black text-text-white">Erro na reprodução</h2>
              <p className="mt-3 text-text-gray">{playerError}</p>
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => window.location.reload()}
                  className="btn-neon flex-1"
                >
                  Tentar novamente
                </button>
                <button
                  onClick={handleBack}
                  className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-black text-text-white hover:border-neon-orange/60"
                >
                  Voltar
                </button>
              </div>
            </div>
          </div>
        )}

        {streamUrl && !playerError && !isReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/55">
            <div className="text-center">
              <div className="mx-auto mb-5 h-16 w-16 animate-spin-slow rounded-full border-4 border-neon-orange/20 border-t-neon-orange" />
              <p className="text-lg font-black text-text-white">Carregando transmissão...</p>
              <p className="mt-1 text-sm text-text-gray">Validando fonte autorizada</p>
            </div>
          </div>
        )}

        <div
          className={`absolute inset-x-0 top-0 bg-gradient-to-b from-black/88 via-black/45 to-transparent p-6 transition-opacity duration-300 ${
            showControls ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={handleBack}
                className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/12 bg-white/[0.06] text-2xl text-white transition-all hover:border-neon-orange hover:text-neon-orange"
              >
                ←
              </button>

              <div>
                <p className="text-xs uppercase tracking-[0.34em] text-neon-cyan/80">
                  {isLive ? 'Ao vivo' : 'Reprodução'}
                </p>
                <h1 className="text-3xl font-black text-text-white">
                  {content?.name || 'RonecaPlayTV'}
                </h1>
                <p className="mt-1 text-sm text-text-gray">
                  {isLive ? 'Canal autorizado' : 'Filme autorizado'} • Player premium
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {isLive && (
                <span className="rounded-full border border-active-green/30 bg-active-green/15 px-4 py-2 text-xs font-black uppercase text-active-green">
                  ● ao vivo
                </span>
              )}

              <button
                onClick={() => setShowQuickList(current => !current)}
                className="rounded-xl border border-white/12 bg-white/[0.06] px-4 py-3 text-sm font-black text-white transition-all hover:border-neon-orange hover:text-neon-orange"
              >
                Lista rápida
              </button>
            </div>
          </div>
        </div>

        <div
          className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/92 via-black/50 to-transparent p-6 transition-opacity duration-300 ${
            showControls ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <div className="glass-panel flex items-center justify-between rounded-[1.5rem] p-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  const video = videoRef.current;
                  if (!video) return;
                  if (video.paused) video.play();
                  else video.pause();
                }}
                className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neon-orange text-2xl font-black text-bg-primary glow-orange"
              >
                ▶
              </button>

              <div>
                <p className="text-sm font-black text-text-white">{content?.name || 'Sem conteúdo'}</p>
                <p className="text-xs text-text-gray">
                  {streamUrl ? 'Fonte conectada' : 'Sem URL de reprodução'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 text-sm text-text-gray">
              <span>HD</span>
              <span>•</span>
              <span>HLS</span>
              <span>•</span>
              <span>RonecaPlayTV</span>
            </div>
          </div>
        </div>

        {showQuickList && (
          <aside className="absolute bottom-28 right-6 top-28 w-[25rem] overflow-hidden rounded-[1.5rem] glass-panel p-4 animate-slide-in-right">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-text-white">Lista rápida</h2>
                <p className="text-xs text-text-gray">Troque de canal sem sair do player</p>
              </div>
              <button
                onClick={() => setShowQuickList(false)}
                className="text-text-gray hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 overflow-y-auto pr-1" style={{ maxHeight: 'calc(100vh - 260px)' }}>
              {quickChannels.map(channel => (
                <button
                  key={channel.id}
                  onClick={() => handleQuickChannelClick(channel)}
                  className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                    currentChannel?.id === channel.id
                      ? 'border-neon-orange bg-neon-orange/12 text-neon-orange'
                      : 'border-white/10 bg-white/[0.04] text-text-gray hover:border-neon-orange/60 hover:text-text-white'
                  }`}
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-xl">
                    📺
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-black">{channel.name}</span>
                    <span className="text-[0.68rem] uppercase tracking-wider text-active-green">Ao vivo</span>
                  </span>
                  <span>▶</span>
                </button>
              ))}
            </div>
          </aside>
        )}
      </div>
    </AppLayout>
  );
}
