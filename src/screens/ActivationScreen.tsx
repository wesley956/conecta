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
      <div className="flex h-full items-center px-24 py-16">
        <main className="grid w-full grid-cols-[1fr_520px] gap-20">
          <section className="flex flex-col justify-center">
            <div className="mb-14 flex items-center gap-5">
              <div className="flex h-16 w-16 items-center justify-center rounded-md bg-[#2396f2] text-4xl font-light text-white">
                R
              </div>
              <div>
                <h1 className="text-4xl font-light text-white/82">Cruz Stars</h1>
                <p className="text-lg font-light text-white/38">Player autorizado</p>
              </div>
            </div>

            <h2 className="max-w-3xl text-6xl font-light leading-tight text-white/82">
              Ative este aparelho pelo painel.
            </h2>

            <p className="mt-8 max-w-3xl text-2xl font-light leading-relaxed text-white/42">
              Envie este código para o suporte. Depois que o aparelho for liberado no painel, o app carregará somente o conteúdo autorizado para este dispositivo.
            </p>
          </section>

          <section className="self-center">
            <p className="mb-4 text-2xl font-light text-white/55">Código do dispositivo</p>

            <button
              onClick={copyCode}
              className="w-full rounded-md bg-white/[0.055] px-8 py-8 text-center font-mono text-6xl font-light tracking-[0.16em] text-white transition-colors hover:bg-[#2396f2]"
            >
              {deviceCode}
            </button>

            <p className="mt-4 text-center text-lg font-light text-white/38">
              {copied ? 'Código copiado' : 'Clique no código para copiar'}
            </p>

            <div className="mt-10 space-y-4">
              <button
                onClick={retryActivation}
                disabled={loading}
                className="w-full rounded-md bg-[#2396f2] px-8 py-5 text-3xl font-light text-white disabled:opacity-45"
              >
                {loading ? 'Verificando acesso...' : 'Verificar liberação'}
              </button>

              <a
                href={`https://wa.me/5511999999999?text=${encodeURIComponent(`Olá, preciso liberar meu Cruz Stars. Código: ${deviceCode}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full rounded-md bg-white/[0.055] px-8 py-5 text-center text-2xl font-light text-white/72 hover:text-white"
              >
                Enviar pelo WhatsApp
              </a>

            </div>

            <p className="mt-10 text-center text-base font-light leading-relaxed text-white/28">
              O Cruz Stars não fornece conteúdo. O acesso depende da liberação do aparelho no painel.
            </p>
          </section>
        </main>
      </div>
    </AppLayout>
  );
}
