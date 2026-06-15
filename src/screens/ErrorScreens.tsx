import { useAppStore } from '@/stores/appStore';
import { AppLayout } from '@/components/shared';

function nextMonthDate(days = 30) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ===== EXPIRED SCREEN =====
export function ExpiredScreen() {
  const { expiresAt, daysRemaining, setSubscription, setScreen } = useAppStore();

  const retryAccess = () => {
    setSubscription(true, nextMonthDate(30), 30);
    setScreen('home');
  };

  return (
    <AppLayout>
      <div className="h-full flex flex-col items-center justify-center">
        <div className="glass-panel rounded-[1.6rem] p-8 max-w-md w-full animate-scale-in text-center">
          <div className="w-20 h-20 bg-alert-yellow/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">⏰</span>
          </div>
          <h2 className="text-2xl font-bold text-alert-yellow mb-2">Acesso Vencido</h2>
          <p className="text-text-gray text-sm mb-1">
            Sua assinatura venceu em <strong className="text-text-white">{expiresAt}</strong>.
          </p>
          <p className="text-text-gray/60 text-xs mb-6">
            Dias em atraso: {Math.abs(daysRemaining)}
          </p>
          <div className="space-y-3">
            <a
              href="https://wa.me/5511999999999"
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full bg-active-green text-bg-primary font-bold py-3 rounded-xl hover:bg-active-green/80 transition-colors text-center"
            >
              💬 Renovar pelo WhatsApp
            </a>
            <button
              onClick={retryAccess}
              className="w-full bg-white/[0.04] border border-white/10 text-text-gray font-medium py-3 rounded-xl hover:border-neon-orange/50 transition-colors"
            >
              🔄 Tentar Novamente
            </button>
            <button
              onClick={() => setScreen('activation')}
              className="w-full bg-white/[0.04] border border-white/10 text-text-gray font-medium py-3 rounded-xl hover:border-error-red/50 transition-colors"
            >
              🚪 Sair
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

// ===== BLOCKED SCREEN =====
export function BlockedScreen() {
  const { setDeviceActivated, setScreen } = useAppStore();

  return (
    <AppLayout>
      <div className="h-full flex flex-col items-center justify-center">
        <div className="glass-panel rounded-[1.6rem] p-8 max-w-md w-full animate-scale-in text-center">
          <div className="w-20 h-20 bg-error-red/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">🚫</span>
          </div>
          <h2 className="text-2xl font-bold text-error-red mb-2">Dispositivo Bloqueado</h2>
          <p className="text-text-gray text-sm mb-6">
            Este aparelho não está autorizado a acessar o sistema.
          </p>
          <div className="space-y-3">
            <a
              href="https://wa.me/5511999999999"
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full bg-neon-orange text-bg-primary font-bold py-3 rounded-xl hover:bg-neon-orange/80 transition-colors text-center"
            >
              💬 Falar com Suporte
            </a>
            <button
              onClick={() => {
                setDeviceActivated(false);
                setScreen('activation');
              }}
              className="w-full bg-white/[0.04] border border-white/10 text-text-gray font-medium py-3 rounded-xl hover:border-neon-orange/50 transition-colors"
            >
              🔄 Tentar Novamente
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

// ===== NO INTERNET SCREEN =====
export function NoInternetScreen() {
  const { setScreen } = useAppStore();

  return (
    <AppLayout>
      <div className="h-full flex flex-col items-center justify-center">
        <div className="glass-panel rounded-[1.6rem] p-8 max-w-md w-full animate-scale-in text-center">
          <div className="w-20 h-20 bg-neon-cyan/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">📡</span>
          </div>
          <h2 className="text-2xl font-bold text-neon-cyan mb-2">Sem Conexão</h2>
          <p className="text-text-gray text-sm mb-6">
            Verifique sua internet e tente novamente.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => setScreen('home')}
              className="w-full bg-neon-orange text-bg-primary font-bold py-3 rounded-xl hover:bg-neon-orange/80 transition-colors"
            >
              🔄 Tentar Novamente
            </button>
            <button
              onClick={() => setScreen('settings')}
              className="w-full bg-white/[0.04] border border-white/10 text-text-gray font-medium py-3 rounded-xl hover:border-neon-orange/50 transition-colors"
            >
              ⚙️ Abrir Configurações
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
