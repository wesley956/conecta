import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { AppLayout } from '@/components/shared';
import { activateDeviceWithPanel, fetchDevicePanelConfig, isDevicePanelEnabled } from '@/utils/devicePanel';

export function ActivationScreen() {
  const {
    deviceCode,
    setScreen,
    setDeviceActivated,
    setDeviceCode,
    setSubscription,
    setActiveNotice,
  } = useAppStore();

  const startedRef = useRef(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(() => isDevicePanelEnabled());
  const [statusText, setStatusText] = useState(() =>
    isDevicePanelEnabled()
      ? 'Gerando código do aparelho...'
      : 'Painel de ativação não configurado neste build.'
  );

  const normalizedDeviceCode = String(deviceCode || '').trim();
  const displayCode = loading ? 'GERANDO...' : normalizedDeviceCode || 'AGUARDANDO';

  const copyCode = async () => {
    if (!normalizedDeviceCode || loading) return;

    try {
      await navigator.clipboard.writeText(normalizedDeviceCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const applyPanelConfig = (config: Awaited<ReturnType<typeof fetchDevicePanelConfig>>) => {
    if (!config.active) {
      setDeviceActivated(false);
      setActiveNotice(config.message || 'Envie este código ao vendedor/admin para liberar o acesso.');

      if (config.status === 'blocked') {
        setScreen('blocked');
      } else if (config.status === 'expired') {
        setScreen('expired');
      } else {
        setScreen('activation');
      }

      setStatusText(config.message || 'Aparelho aguardando liberação no painel.');
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
  };

  const generateOrCheckCode = async () => {
    setLoading(true);

    try {
      if (!isDevicePanelEnabled()) {
        setDeviceActivated(false);
        setStatusText('Painel de ativação não configurado neste build.');
        setActiveNotice('Atenção: painel de ativação não configurado neste build.');
        setScreen('activation');
        return;
      }

      setStatusText('Gerando/consultando código do aparelho...');

      const activation = await activateDeviceWithPanel();
      const activeDeviceCode = String(activation.deviceCode || normalizedDeviceCode || '').trim();

      if (activeDeviceCode && activeDeviceCode !== normalizedDeviceCode) {
        setDeviceCode(activeDeviceCode);
      }

      if (!activeDeviceCode) {
        setStatusText('Não foi possível gerar o código do aparelho.');
        setActiveNotice('Atenção: não foi possível gerar o código do aparelho.');
        return;
      }

      setStatusText('Verificando liberação no painel...');

      const config = await fetchDevicePanelConfig(activeDeviceCode);
      applyPanelConfig(config);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao consultar painel.';
      setStatusText(message);
      setActiveNotice(`Atenção: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    void generateOrCheckCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppLayout>
      <div className="flex min-h-full items-center px-4 py-6 sm:px-8 lg:px-20 lg:py-12">
        <main className="grid w-full grid-cols-1 gap-8 lg:grid-cols-[1fr_560px] lg:gap-16">
          <section className="flex flex-col justify-center">
            <div className="mb-12 flex items-center gap-5">
              <div className="flex h-16 w-16 items-center justify-center rounded-md bg-[#2396f2] text-4xl font-light text-white">
                R
              </div>
              <div>
                <h1 className="text-4xl font-light text-white/82">RonecaPlayTV</h1>
                <p className="text-lg font-light text-white/38">Ativação do aparelho</p>
              </div>
            </div>

            <h2 className="max-w-3xl text-4xl font-light leading-tight text-white/82 sm:text-5xl lg:text-6xl">
              Envie este código para liberar seu acesso.
            </h2>

            <p className="mt-6 max-w-3xl text-xl font-light leading-relaxed text-white/42 lg:mt-8 lg:text-2xl">
              O vendedor ou administrador libera este aparelho pelo painel. Você não precisa preencher nome,
              WhatsApp ou código de vendedor no aplicativo.
            </p>
          </section>

          <section className="self-center">
            <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-6">
              <p className="mb-4 text-2xl font-light text-white/55">Código do aparelho</p>

              <button
                onClick={copyCode}
                disabled={loading || !normalizedDeviceCode}
                className="w-full rounded-md bg-white/[0.055] px-4 py-6 text-center font-mono text-3xl font-light tracking-[0.12em] text-white transition-colors hover:bg-[#2396f2] disabled:opacity-50 sm:text-4xl lg:px-8 lg:py-7 lg:text-5xl"
              >
                {displayCode}
              </button>

              <p className="mt-4 text-center text-lg font-light text-white/38">
                {copied ? 'Código copiado' : loading ? 'Aguarde...' : 'Clique no código para copiar'}
              </p>

              <div className="mt-7 rounded-md bg-white/[0.045] px-5 py-4 text-center text-lg font-light text-white/50">
                {statusText}
              </div>

              <div className="mt-8 space-y-4">
                <button
                  onClick={generateOrCheckCode}
                  disabled={loading}
                  className="w-full rounded-md bg-[#2396f2] px-8 py-5 text-3xl font-light text-white disabled:opacity-45"
                >
                  {loading ? 'Verificando...' : 'Atualizar liberação'}
                </button>

                <p className="rounded-md bg-white/[0.045] px-5 py-4 text-center text-lg font-light text-white/45">
                  Após o vendedor/admin liberar este código no painel, toque em “Atualizar liberação”.
                </p>
              </div>
            </div>

            <p className="mt-8 text-center text-base font-light leading-relaxed text-white/28">
              O RonecaPlayTV não fornece conteúdo. O acesso depende da liberação do aparelho no painel.
            </p>
          </section>
        </main>
      </div>
    </AppLayout>
  );
}
