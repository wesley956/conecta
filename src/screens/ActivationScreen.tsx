import { useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { AppLayout } from '@/components/shared';

export function ActivationScreen() {
  const { deviceCode, setScreen, setDeviceActivated } = useAppStore();
  const [requested, setRequested] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRequest = () => {
    setRequested(true);
  };

  const handleRetry = () => {
    setLoading(true);
    setTimeout(() => {
      // For demo: always activate on retry
      setDeviceActivated(true);
      setScreen('home');
      setLoading(false);
    }, 2000);
  };

  return (
    <AppLayout>
      <div className="h-full flex flex-col items-center justify-center relative">
        {/* Background decorations */}
        <div className="absolute top-1/4 left-1/4 w-48 h-48 bg-neon-orange/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-48 h-48 bg-neon-cyan/5 rounded-full blur-3xl" />

        {/* Logo */}
        <div className="relative z-10 mb-8 animate-fade-in">
          <h1 className="text-3xl font-extrabold tracking-wider text-center">
            <span className="text-neon-orange glow-orange-text">RONECA</span>
            <span className="text-neon-cyan glow-cyan-text">PLAY</span>
            <span className="text-text-gray text-xl ml-1">TV</span>
          </h1>
        </div>

        {/* Card */}
        <div className="relative z-10 bg-card border border-border rounded-2xl p-8 max-w-md w-full animate-scale-in">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-neon-orange/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">🔐</span>
            </div>
            <h2 className="text-xl font-bold text-text-white mb-2">Login do Provedor</h2>
            <p className="text-text-gray text-sm">Acesso restrito via código do dispositivo</p>
          </div>

          {/* Device Code */}
          <div className="bg-bg-dark border border-border rounded-xl p-4 mb-6 text-center">
            <p className="text-text-gray text-xs mb-2">Código do Dispositivo</p>
            <p className="text-2xl font-mono font-bold text-neon-cyan tracking-widest glow-cyan-text">{deviceCode}</p>
          </div>

          {/* Info message */}
          <div className="bg-neon-orange/5 border border-neon-orange/20 rounded-xl p-4 mb-6">
            <p className="text-text-gray text-sm leading-relaxed text-center">
              Para acessar este provedor, envie o código acima para o suporte. 
              O acesso será liberado em breve.
            </p>
          </div>

          {/* Buttons */}
          <div className="space-y-3">
            {!requested ? (
              <button
                onClick={handleRequest}
                className="w-full bg-neon-orange text-bg-primary font-bold py-3 rounded-xl hover:bg-neon-orange/80 transition-colors glow-orange"
              >
                📨 Solicitar Acesso
              </button>
            ) : (
              <button
                onClick={handleRetry}
                disabled={loading}
                className="w-full bg-active-green text-bg-primary font-bold py-3 rounded-xl hover:bg-active-green/80 transition-colors disabled:opacity-50"
              >
                {loading ? '⏳ Verificando...' : '✅ Tentar Novamente'}
              </button>
            )}
            <button
              onClick={() => setScreen('home')}
              className="w-full bg-card border border-border text-text-gray font-medium py-3 rounded-xl hover:border-neon-orange/50 hover:text-text-white transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>

        {/* Legal notice */}
        <p className="relative z-10 text-text-gray/40 text-xs text-center mt-6 max-w-sm">
          ⚖️ RonecaPlayTV é um player legal. Apenas conteúdo autorizado.
        </p>
      </div>
    </AppLayout>
  );
}
