import { useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { AppLayout } from '@/components/shared';
import { activateDeviceWithPanel, fetchDevicePanelConfig, isDevicePanelEnabled } from '@/utils/devicePanel';

export function ActivationScreen() {
  const { deviceCode, setScreen, setDeviceActivated, setDeviceCode, setSubscription, setActiveNotice } = useAppStore();
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(deviceCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const retryActivation = async () => {
    setLoading(true);

    try {
      if (!isDevicePanelEnabled()) {
        setDeviceActivated(true);
        setScreen('home');
        return;
      }

      const activation = await activateDeviceWithPanel();
      const activeDeviceCode = activation.deviceCode || deviceCode;

      if (activation.deviceCode && activation.deviceCode !== deviceCode) {
        setDeviceCode(activation.deviceCode);
      }

      const config = await fetchDevicePanelConfig(activeDeviceCode);

      if (!config.active) {
        setDeviceActivated(false);
        setActiveNotice(config.message || '⏳ Aparelho aguardando liberação no painel.');

        if (config.status === 'blocked') {
          setScreen('blocked');
        } else if (config.status === 'expired') {
          setScreen('expired');
        } else {
          setScreen('activation');
        }

        return;
      }

      setDeviceActivated(true);

      if (config.expiresAt) {
        const expiresAt = new Date(config.expiresAt);
        const now = new Date();
        const days = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 86400000));
        setSubscription(days > 0, config.expiresAt, days);
      }

      setActiveNotice('✅ Aparelho liberado pelo painel. Carregando conteúdo...');
      setScreen('home');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao consultar painel.';
      setActiveNotice(`⚠️ ${message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="min-h-full overflow-y-auto px-4 py-6 sm:px-8 lg:px-24 lg:py-16">
        <main className="grid w-full grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_520px] lg:gap-20">
          <section className="flex flex-col justify-center">
            <div className="mb-8 flex flex-col items-start gap-4 sm:mb-12 sm:flex-row sm:items-center sm:gap-5">
              <div className="flex items-center gap-4">
                <img
                  src="/roneca.png"
                  alt="RonecaPlayTV"
                  className="h-28 max-h-[28vh] w-auto max-w-[78vw] object-contain drop-shadow-[0_0_22px_rgba(35,150,242,.35)] sm:h-36 lg:h-32"
                />
                <div>
                  <h1 className="text-3xl font-light text-white/82 sm:text-4xl">RonecaPlayTV</h1>
                  <p className="text-base font-light text-white/38 sm:text-lg">Player autorizado</p>
                </div>
              </div>
            </div>

            <h2 className="max-w-3xl text-3xl font-light leading-tight text-white/82 sm:text-4xl lg:text-6xl">
              Ative este aparelho pelo painel.
            </h2>

            <p className="mt-5 max-w-3xl text-base font-light leading-relaxed text-white/50 sm:mt-8 sm:text-xl lg:text-2xl">
              Envie este código para o suporte. Depois que o aparelho for liberado no painel, o app carregará somente o conteúdo autorizado para este dispositivo.
            </p>
          </section>

          <section className="self-center">
            <p className="mb-3 text-lg font-light text-white/55 sm:mb-4 sm:text-2xl">Código do dispositivo</p>

            <button
              onClick={copyCode}
              className="w-full rounded-md bg-white/[0.055] px-4 py-5 text-center font-mono text-3xl font-light tracking-[0.12em] text-white transition-colors hover:bg-[#2396f2] sm:px-8 sm:py-8 sm:text-5xl lg:text-6xl"
            >
              {deviceCode}
            </button>

            <p className="mt-3 text-center text-sm font-light text-white/38 sm:mt-4 sm:text-lg">
              {copied ? 'Código copiado' : 'Clique no código para copiar'}
            </p>

            <div className="mt-10 space-y-4">
              <button
                onClick={retryActivation}
                disabled={loading}
                className="w-full rounded-md bg-[#2396f2] px-6 py-4 text-xl font-light text-white disabled:opacity-45 sm:px-8 sm:py-5 sm:text-2xl lg:text-3xl"
              >
                {loading ? 'Verificando acesso...' : 'Verificar liberação'}
              </button>

              <a
                href={`https://wa.me/5511999999999?text=${encodeURIComponent(`Olá, preciso liberar meu RonecaPlayTV. Código: ${deviceCode}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full rounded-md bg-white/[0.055] px-6 py-4 text-center text-lg font-light text-white/72 hover:text-white sm:px-8 sm:py-5 sm:text-xl lg:text-2xl"
              >
                Enviar pelo WhatsApp
              </a>

            </div>

            <p className="mt-10 text-center text-base font-light leading-relaxed text-white/28">
              O RonecaPlayTV não fornece conteúdo. O acesso depende da liberação do aparelho no painel.
            </p>
          </section>
        </main>
      </div>
    </AppLayout>
  );
}
