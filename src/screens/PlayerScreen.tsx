import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '@/stores/appStore';
import Hls from 'hls.js';

export function PlayerScreen() {
  const { currentChannel, currentMovie, setScreen } = useAppStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showControls, setShowControls] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showQuickList, setShowQuickList] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playerError, setPlayerError] = useState(false);

  const content = currentChannel || currentMovie;
  const isLive = !!currentChannel;

  // Demo: use a free HLS test stream
  const demoUrl = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });
      hls.loadSource(demoUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().then(() => setIsPlaying(true)).catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setPlayerError(true);
        }
      });
      return () => { hls.destroy(); };
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = demoUrl;
      video.addEventListener('loadedmetadata', () => {
        video.play().then(() => setIsPlaying(true)).catch(() => {});
      });
    }
  }, []);

  // Auto-hide controls
  useEffect(() => {
    if (!showControls) return;
    const timer = setTimeout(() => setShowControls(false), 5000);
    return () => clearTimeout(timer);
  }, [showControls]);

  // Keyboard controls for TV remote
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          break;
        case 'ArrowDown':
          e.preventDefault();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setShowControls(true);
          break;
        case 'ArrowRight':
          e.preventDefault();
          setShowQuickList(true);
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'Escape':
        case 'Backspace':
          e.preventDefault();
          setScreen('home');
          break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className="h-full w-full bg-black relative overflow-hidden"
      onMouseMove={() => setShowControls(true)}
      onClick={() => setShowControls(!showControls)}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
        onDurationChange={() => setDuration(videoRef.current?.duration || 0)}
      />

      {/* Demo overlay when no real content */}
      {!isPlaying && !playerError && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-primary/80">
          <div className="text-center animate-pulse-glow">
            <span className="text-6xl mb-4 block">⏳</span>
            <p className="text-text-gray">Carregando stream...</p>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {playerError && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-primary/90">
          <div className="text-center animate-scale-in max-w-md">
            <span className="text-5xl mb-4 block">⚠️</span>
            <h3 className="text-xl font-bold text-error-red mb-2">Canal Indisponível</h3>
            <p className="text-text-gray text-sm mb-4">Este canal não respondeu. Tente novamente ou escolha outro.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setPlayerError(false)} className="bg-neon-orange text-bg-primary px-6 py-2 rounded-lg font-bold">
                Tentar Novamente
              </button>
              <button onClick={() => setScreen('channels')} className="bg-card border border-border text-text-gray px-6 py-2 rounded-lg">
                Próximo Canal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Controls Overlay */}
      {showControls && (
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none animate-fade-in">
          {/* Top Bar */}
          <div className="bg-gradient-to-b from-black/80 to-transparent p-4 pointer-events-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button onClick={() => setScreen('home')} className="text-white text-xl hover:text-neon-orange transition-colors">
                  ←
                </button>
                <div>
                  <h3 className="text-white font-bold text-lg">{content?.name || 'Reproduzindo'}</h3>
                  {isLive && <span className="text-active-green text-xs flex items-center gap-1"><span className="w-1.5 h-1.5 bg-active-green rounded-full animate-pulse" />AO VIVO</span>}
                  {!isLive && currentMovie && <span className="text-text-gray text-xs">{currentMovie.category} • {currentMovie.year}</span>}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button onClick={() => setShowQuickList(!showQuickList)} className="text-text-gray hover:text-neon-cyan transition-colors text-sm">
                  📋 Lista
                </button>
                <button onClick={() => setShowOptions(!showOptions)} className="text-text-gray hover:text-neon-cyan transition-colors text-sm">
                  ⚙️ Opções
                </button>
              </div>
            </div>
          </div>

          {/* Center Play Button */}
          <div className="flex items-center justify-center pointer-events-auto">
            <button onClick={togglePlay} className="w-16 h-16 rounded-full bg-bg-primary/50 border border-white/20 flex items-center justify-center text-white text-2xl hover:bg-neon-orange/30 hover:border-neon-orange transition-all">
              {isPlaying ? '⏸' : '▶️'}
            </button>
          </div>

          {/* Bottom Bar */}
          <div className="bg-gradient-to-t from-black/80 to-transparent p-4 pointer-events-auto">
            {/* Progress bar (VOD only) */}
            {!isLive && duration > 0 && (
              <div className="mb-3">
                <div className="h-1 bg-white/20 rounded-full cursor-pointer">
                  <div className="h-full bg-neon-orange rounded-full" style={{ width: `${(currentTime / duration) * 100}%` }} />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-text-gray text-xs">{formatTime(currentTime)}</span>
                  <span className="text-text-gray text-xs">{formatTime(duration)}</span>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button onClick={togglePlay} className="text-white text-xl hover:text-neon-orange transition-colors">
                  {isPlaying ? '⏸' : '▶️'}
                </button>
                <span className="text-text-gray text-sm">
                  {isLive ? '● Ao Vivo' : `${formatTime(currentTime)} / ${formatTime(duration)}`}
                </span>
              </div>
              <button className="text-text-gray hover:text-white transition-colors text-sm">
                🔲 Tela Cheia
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Channel List Sidebar */}
      {showQuickList && (
        <div className="absolute right-0 top-0 bottom-0 w-72 bg-bg-dark/95 border-l border-border overflow-y-auto animate-slide-in-right">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-text-white font-bold">Canais</h3>
              <button onClick={() => setShowQuickList(false)} className="text-text-gray hover:text-white">✕</button>
            </div>
            {useAppStore.getState().channels.slice(0, 15).map(ch => (
              <div key={ch.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-card cursor-pointer transition-colors">
                <span className="text-sm">📺</span>
                <div className="flex-1 min-w-0">
                  <p className="text-text-white text-sm truncate">{ch.name}</p>
                </div>
                {ch.id === currentChannel?.id && <span className="text-neon-orange text-xs">▶</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Options Panel */}
      {showOptions && (
        <div className="absolute right-0 top-0 bottom-0 w-72 bg-bg-dark/95 border-l border-border overflow-y-auto animate-slide-in-right">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-text-white font-bold">Opções do Player</h3>
              <button onClick={() => setShowOptions(false)} className="text-text-gray hover:text-white">✕</button>
            </div>
            <div className="space-y-2">
              {[
                { icon: '🖥️', label: 'Player Nativo', active: true },
                { icon: '🔧', label: 'VLC Externo', active: false },
                { icon: '📱', label: 'MX Player', active: false },
                { icon: '⚡', label: 'Decodificação: Auto', active: true },
                { icon: '📦', label: 'Buffer: Médio', active: true },
                { icon: '🔄', label: 'Reconexão Auto', active: true },
                { icon: '🔁', label: 'Recarregar Stream', active: false },
                { icon: '⚠️', label: 'Reportar Erro', active: false },
              ].map(opt => (
                <button key={opt.label} className="w-full flex items-center gap-3 p-3 rounded-lg bg-card border border-border hover:border-neon-orange/50 transition-all text-left">
                  <span>{opt.icon}</span>
                  <span className="text-text-white text-sm flex-1">{opt.label}</span>
                  {opt.active && <span className="text-active-green text-xs">●</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
