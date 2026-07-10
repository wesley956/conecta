import { useEffect, useState } from 'react';
import { Clapperboard, Film, RadioTower, ShieldCheck } from 'lucide-react';
import { SystemFrame } from '@/components/system/SystemFrame';
import { useAppStore } from '@/stores/appStore';
import '@/styles/system.css';

type SplashStatus = 'loading' | 'checking_net' | 'checking_device' | 'checking_sub' | 'done';

const statusMessages: Record<SplashStatus, string> = {
  loading: 'Preparando o aplicativo',
  checking_net: 'Verificando conexão',
  checking_device: 'Identificando o aparelho',
  checking_sub: 'Validando o acesso',
  done: 'Tudo pronto',
};

export function SplashScreen() {
  const setScreen = useAppStore(state => state.setScreen);
  const setSplashDone = useAppStore(state => state.setSplashDone);
  const deviceActivated = useAppStore(state => state.deviceActivated);
  const subscriptionActive = useAppStore(state => state.subscriptionActive);
  const [status, setStatus] = useState<SplashStatus>('loading');
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
        currentIndex += 1;
        timeout = setTimeout(runStep, step.delay);
        return;
      }

      setSplashDone(true);

      if (!deviceActivated) {
        setScreen('activation');
      } else if (!subscriptionActive) {
        setScreen('expired');
      } else {
        setScreen('home');
      }
    };

    timeout = setTimeout(runStep, 300);
    return () => clearTimeout(timeout);
  }, [deviceActivated, setScreen, setSplashDone, subscriptionActive]);

  const checkpoints = [
    { label: 'Inicialização', icon: RadioTower, threshold: 20 },
    { label: 'Catálogo', icon: Film, threshold: 45 },
    { label: 'Séries', icon: Clapperboard, threshold: 70 },
    { label: 'Acesso', icon: ShieldCheck, threshold: 90 },
  ];

  return (
    <SystemFrame className="system-splash-frame">
      <section className="system-splash" aria-live="polite">
        <div className="system-splash-emblem" aria-hidden="true">
          <div className="system-splash-ring" />
          <div className="system-splash-logo">RP</div>
        </div>

        <p className="system-kicker">Experiência de streaming</p>
        <h1>RonecaPlayTV</h1>
        <p className="system-splash-description">
          Organizando seu acesso, catálogo e preferências para abrir o aplicativo com segurança.
        </p>

        <div className="system-splash-progress">
          <div className="system-progress-track" aria-hidden="true">
            <span className="system-progress-value" style={{ width: `${progress}%` }} />
          </div>
          <div className="system-splash-status">
            <strong>{statusMessages[status]}</strong>
            <span>{progress}%</span>
          </div>
        </div>

        <div className="system-splash-checkpoints" aria-label="Etapas de inicialização">
          {checkpoints.map(item => {
            const Icon = item.icon;
            const active = progress >= item.threshold;

            return (
              <div key={item.label} className={`system-checkpoint ${active ? 'is-active' : ''}`}>
                <Icon aria-hidden="true" strokeWidth={1.9} />
                <span>{item.label}</span>
              </div>
            );
          })}
        </div>
      </section>
    </SystemFrame>
  );
}
