import { useEffect, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { RadioTower, Film, Clapperboard, Settings } from 'lucide-react';

export function SplashScreen() {
  const { setScreen, setSplashDone, deviceActivated, subscriptionActive } = useAppStore();
  const [status, setStatus] = useState<'loading' | 'checking_net' | 'checking_device' | 'checking_sub' | 'done'>('loading');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const steps = [
      { status: 'loading' as const, delay: 600, progress: 20 },
      { status: 'checking_net' as const, delay: 800, progress: 45 },
      { status: 'checking_device' as const, delay: 700, progress: 70 },
      { status: 'checking_sub' as const, delay: 600, progress: 90 },
      { status: 'done' as const, delay: 400, progress: 100 },
    ];

    let timeout: ReturnType<typeof setTimeout>;
    let currentIndex = 0;

    const runStep = () => {
      if (currentIndex < steps.length) {
        const step = steps[currentIndex];
        setStatus(step.status);
        setProgress(step.progress);
        currentIndex++;
        timeout = setTimeout(runStep, step.delay);
      } else {
        setSplashDone(true);
        // Determine next screen
        if (!deviceActivated) {
          setScreen('activation');
        } else if (!subscriptionActive) {
          setScreen('expired');
        } else {
          setScreen('home');
        }
      }
    };

    timeout = setTimeout(runStep, 300);
    return () => clearTimeout(timeout);
  }, [deviceActivated, subscriptionActive, setScreen, setSplashDone]);

  const statusMessages: Record<string, string> = {
    loading: 'Iniciando...',
    checking_net: 'Verificando conexão...',
    checking_device: 'Verificando dispositivo...',
    checking_sub: 'Validando assinatura...',
    done: 'Pronto!',
  };

  return (
    <div className="h-full w-full flex flex-col items-center justify-center bg-bg-primary relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 bg-pattern opacity-50" />
      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-neon-orange/5 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-neon-cyan/5 rounded-full blur-3xl" />

      {/* Spinning ring */}
      <div className="relative mb-8">
        <div className="w-32 h-32 rounded-full border-4 border-white/10 animate-spin-slow">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 w-4 h-4 bg-neon-orange rounded-full glow-orange" />
        </div>
        {/* Inner logo area */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-3xl font-extrabold">
              <span className="text-neon-orange glow-orange-text">R</span>
              <span className="text-neon-cyan glow-cyan-text">P</span>
            </div>
            <div className="text-[8px] text-text-gray tracking-widest mt-1">TV</div>
          </div>
        </div>
      </div>

      {/* Logo Text */}
      <div className="relative z-10 mb-8 animate-fade-in">
        <h1 className="text-4xl font-extrabold tracking-wider text-center">
          <span className="text-neon-orange glow-orange-text">RONECA</span>
          <span className="text-neon-cyan glow-cyan-text">PLAY</span>
          <span className="text-text-gray text-2xl ml-1">TV</span>
        </h1>
        <p className="text-text-gray/60 text-xs text-center mt-2 tracking-wider">PLAYER IPTV/P2P LEGAL</p>
      </div>

      {/* Status icons row */}
      <div className="relative z-10 flex items-center gap-6 mb-6 animate-fade-in">
        <div className={`flex flex-col items-center gap-1 ${progress >= 20 ? 'opacity-100' : 'opacity-30'} transition-opacity`}>
          <RadioTower aria-hidden="true" size={22} strokeWidth={2.4} />
          <span className="text-[10px] text-text-gray">Live</span>
        </div>
        <div className={`flex flex-col items-center gap-1 ${progress >= 45 ? 'opacity-100' : 'opacity-30'} transition-opacity`}>
          <Film aria-hidden="true" size={22} strokeWidth={2.4} />
          <span className="text-[10px] text-text-gray">Filmes</span>
        </div>
        <div className={`flex flex-col items-center gap-1 ${progress >= 70 ? 'opacity-100' : 'opacity-30'} transition-opacity`}>
          <Clapperboard aria-hidden="true" size={22} strokeWidth={2.4} />
          <span className="text-[10px] text-text-gray">Séries</span>
        </div>
        <div className={`flex flex-col items-center gap-1 ${progress >= 90 ? 'opacity-100' : 'opacity-30'} transition-opacity`}>
          <Settings aria-hidden="true" size={22} strokeWidth={2.4} />
          <span className="text-[10px] text-text-gray">Config</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative z-10 w-64 h-1.5 bg-white/[0.06] rounded-full overflow-hidden mb-4">
        <div
          className="h-full bg-gradient-to-r from-neon-orange to-neon-cyan rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Status text */}
      <p className="relative z-10 text-text-gray text-sm animate-pulse-glow">
        {statusMessages[status]}
      </p>

      {/* Version */}
      <p className="absolute bottom-6 text-text-gray/40 text-xs">v1.0.0 • Conteúdo autorizado apenas</p>
    </div>
  );
}
