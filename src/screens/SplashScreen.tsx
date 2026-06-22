import { useEffect, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { isDevicePanelEnabled } from '@/utils/devicePanel';

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
        if (isDevicePanelEnabled() && !deviceActivated) {
          setScreen('activation');
        } else if (!deviceActivated) {
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
      {/* Logo real */}
      <div className="relative z-10 mb-8 flex flex-col items-center animate-fade-in">
        <img
          src="/roneca.png"
          alt="RonecaPlayTV"
          className="h-36 w-auto max-w-[86vw] object-contain drop-shadow-[0_0_28px_rgba(35,150,242,.38)] sm:h-48 md:h-56"
        />
        <p className="mt-4 text-center text-xs uppercase tracking-[0.32em] text-text-gray/70">Conteúdo autorizado apenas pelo painel</p>
      </div>

      {/* Status icons row */}

      <div className="relative z-10 flex items-center gap-6 mb-6 animate-fade-in">
        <div className={`flex flex-col items-center gap-1 ${progress >= 20 ? 'opacity-100' : 'opacity-30'} transition-opacity`}>
          <span className="text-xl">📡</span>
          <span className="text-[10px] text-text-gray">Live</span>
        </div>
        <div className={`flex flex-col items-center gap-1 ${progress >= 45 ? 'opacity-100' : 'opacity-30'} transition-opacity`}>
          <span className="text-xl">🎬</span>
          <span className="text-[10px] text-text-gray">Filmes</span>
        </div>
        <div className={`flex flex-col items-center gap-1 ${progress >= 70 ? 'opacity-100' : 'opacity-30'} transition-opacity`}>
          <span className="text-xl">🎥</span>
          <span className="text-[10px] text-text-gray">Séries</span>
        </div>
        <div className={`flex flex-col items-center gap-1 ${progress >= 90 ? 'opacity-100' : 'opacity-30'} transition-opacity`}>
          <span className="text-xl">⚙️</span>
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
