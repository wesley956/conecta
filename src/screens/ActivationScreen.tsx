import { useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { AppLayout } from '@/components/shared';
import { activateDeviceWithPanel, fetchDevicePanelConfig, isDevicePanelEnabled } from '@/utils/devicePanel';

const PROFILE_NAME_KEY = 'ronecaplaytv-customer-name';
const PROFILE_WPP_KEY = 'ronecaplaytv-customer-whatsapp';
const SELLER_CODE_KEY = 'ronecaplaytv-seller-code';

function getStoredValue(key: string) {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function setStoredValue(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignora
  }
}

export function ActivationScreen() {
  const { deviceCode, setScreen, setDeviceActivated, setDeviceCode, setSubscription, setActiveNotice } = useAppStore();
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [customerName, setCustomerName] = useState(() => getStoredValue(PROFILE_NAME_KEY));
  const [customerWhatsapp, setCustomerWhatsapp] = useState(() => getStoredValue(PROFILE_WPP_KEY));
  const [sellerCode, setSellerCode] = useState(() => getStoredValue(SELLER_CODE_KEY));

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
        setDeviceActivated(false);
        setActiveNotice('Atenção: painel de ativação não configurado neste build.');
        setScreen('activation');
        return;
      }

      const normalizedWhatsapp = customerWhatsapp.replace(/\D/g, '');
      const normalizedSellerCode = sellerCode.trim().toLowerCase();

      if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(normalizedSellerCode)) {
        setActiveNotice('Código público do vendedor inválido.');
        return;
      }

      setStoredValue(PROFILE_NAME_KEY, customerName.trim());
      setStoredValue(PROFILE_WPP_KEY, normalizedWhatsapp);
      setStoredValue(SELLER_CODE_KEY, normalizedSellerCode);

      const activation = await activateDeviceWithPanel({
        customerName: customerName.trim(),
        customerWhatsapp: normalizedWhatsapp,
        sellerCode: normalizedSellerCode,
      });

      const activeDeviceCode = activation.deviceCode || deviceCode;

      if (activation.deviceCode && activation.deviceCode !== deviceCode) {
        setDeviceCode(activation.deviceCode);
      }

      const config = await fetchDevicePanelConfig(activeDeviceCode);

      if (!config.active) {
        setDeviceActivated(false);
        setActiveNotice(config.message || 'Aparelho aguardando liberação no painel.');

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
      setActiveNotice(`Atenção: ${message}`);
    } finally {
      setLoading(false);
    }
  };

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
                <p className="text-lg font-light text-white/38">Player autorizado</p>
              </div>
            </div>

            <h2 className="max-w-3xl text-4xl font-light leading-tight text-white/82 sm:text-5xl lg:text-6xl">
              Ative este aparelho pelo painel.
            </h2>

            <p className="mt-6 max-w-3xl text-xl font-light leading-relaxed text-white/42 lg:mt-8 lg:text-2xl">
              Preencha seus dados para o suporte localizar seu aparelho mais rápido. O código do vendedor ajuda a organizar a liberação.
            </p>
          </section>

          <section className="self-center">
            <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-6">
              <p className="mb-4 text-2xl font-light text-white/55">Código do dispositivo</p>

              <button
                onClick={copyCode}
                className="w-full rounded-md bg-white/[0.055] px-4 py-6 text-center font-mono text-3xl font-light tracking-[0.12em] text-white transition-colors hover:bg-[#2396f2] sm:text-4xl lg:px-8 lg:py-7 lg:text-5xl"
              >
                {deviceCode}
              </button>

              <p className="mt-4 text-center text-lg font-light text-white/38">
                {copied ? 'Código copiado' : 'Clique no código para copiar'}
              </p>

              <div className="mt-7 space-y-4">
                <div>
                  <label className="mb-2 block text-lg font-light text-white/55">Seu nome</label>
                  <input
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                    placeholder="Ex: João Silva"
                    className="w-full rounded-md border border-white/10 bg-black/25 px-5 py-4 text-2xl font-light text-white outline-none"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-lg font-light text-white/55">WhatsApp</label>
                  <input
                    value={customerWhatsapp}
                    onChange={(event) => setCustomerWhatsapp(event.target.value)}
                    placeholder="Ex: 19999999999"
                    className="w-full rounded-md border border-white/10 bg-black/25 px-5 py-4 text-2xl font-light text-white outline-none"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-lg font-light text-white/55">Código público do vendedor</label>
                  <input
                    value={sellerCode}
                    onChange={(event) => setSellerCode(event.target.value)}
                    placeholder="Ex: ronaldo-123456"
                    className="w-full rounded-md border border-white/10 bg-black/25 px-5 py-4 text-2xl font-light text-white outline-none"
                  />
                </div>
              </div>

              <div className="mt-8 space-y-4">
                <button
                  onClick={retryActivation}
                  disabled={loading}
                  className="w-full rounded-md bg-[#2396f2] px-8 py-5 text-3xl font-light text-white disabled:opacity-45"
                >
                  {loading ? 'Enviando dados...' : 'Enviar dados e verificar liberação'}
                </button>

                <p className="rounded-md bg-white/[0.045] px-5 py-4 text-center text-lg font-light text-white/45">
                  Após enviar, o aparelho ficará pendente no painel do vendedor/admin até ser liberado.
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
