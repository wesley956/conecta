import { useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { AppLayout } from '@/components/shared';

export function ActivationScreen() {
  const { deviceCode, setScreen, setDeviceActivated } = useAppStore();
  const [requested, setRequested] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleRequest = () => {
    setRequested(true);
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(deviceCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const handleRetry = () => {
    setLoading(true);

    setTimeout(() => {
      setDeviceActivated(true);
      setScreen('home');
      setLoading(false);
    }, 1600);
  };

  return (
    <AppLayout>
      <div className="relative flex h-full items-center justify-center overflow-hidden">
        <div className="absolute left-[8vw] top-[12vh] h-72 w-72 rounded-full bg-neon-orange/12 blur-3xl" />
        <div className="absolute bottom-[8vh] right-[10vw] h-80 w-80 rounded-full bg-neon-cyan/10 blur-3xl" />

        <div className="absolute inset-y-0 right-0 hidden w-[38vw] items-center justify-center opacity-[0.07] lg:flex">
          <div className="grid grid-cols-3 gap-10 text-7xl">
            <span>📺</span>
            <span>▶</span>
            <span>📡</span>
            <span>🔐</span>
            <span>R</span>
            <span>⚙️</span>
            <span>🎬</span>
            <span>📶</span>
            <span>▣</span>
          </div>
        </div>

        <main className="relative z-10 grid w-full max-w-6xl grid-cols-[1fr_.85fr] gap-10">
          <section className="flex flex-col justify-center">
            <div className="mb-8 flex items-center gap-4">
              <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-[1.7rem] bg-gradient-to-br from-neon-orange to-neon-cyan shadow-[0_0_45px_rgba(255,122,26,.34)]">
                <span className="text-5xl font-black text-bg-primary">R</span>
                <span className="absolute right-3 top-3 text-bg-primary">▶</span>
              </div>

              <div>
                <h1 className="text-5xl font-black tracking-tight text-text-white">
                  Roneca<span className="font-medium text-text-white/90">PlayTV</span>
                </h1>
                <p className="text-sm uppercase tracking-[0.42em] text-neon-cyan/80">
                  Acesso premium autorizado
                </p>
              </div>
            </div>

            <h2 className="max-w-3xl text-5xl font-black leading-tight text-text-white">
              Ative seu dispositivo com o seu provedor.
            </h2>

            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-text-gray">
              Envie o código do aparelho para o suporte. Assim que o provedor liberar, este dispositivo acessará apenas listas, canais e conteúdos autorizados.
            </p>

            <div className="mt-8 grid max-w-3xl grid-cols-3 gap-4">
              <InfoBox icon="🔐" title="Seguro" text="Liberação por dispositivo" />
              <InfoBox icon="📺" title="TV Box" text="Interface para controle remoto" />
              <InfoBox icon="⚖️" title="Legal" text="Somente fontes autorizadas" />
            </div>
          </section>

          <section className="glass-panel rounded-[2rem] p-7 shadow-[0_0_65px_rgba(0,0,0,.34)]">
            <div className="mb-7 text-center">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-[1.6rem] border border-neon-orange/35 bg-neon-orange/12 text-4xl text-neon-orange glow-orange">
                🔐
              </div>
              <h3 className="text-3xl font-black text-text-white">Login do Provedor</h3>
              <p className="mt-2 text-sm text-text-gray">
                Use o código abaixo para solicitar a liberação.
              </p>
            </div>

            <div className="mb-5 rounded-[1.5rem] border border-neon-cyan/30 bg-neon-cyan/8 p-5 text-center">
              <p className="mb-2 text-xs uppercase tracking-[0.34em] text-neon-cyan/80">
                Código do dispositivo
              </p>
              <button
                onClick={handleCopyCode}
                className="w-full rounded-2xl border border-white/10 bg-bg-dark/70 px-4 py-5 font-mono text-4xl font-black tracking-[0.18em] text-neon-cyan glow-cyan-text transition-all hover:border-neon-cyan"
              >
                {deviceCode}
              </button>
              <p className="mt-2 text-xs text-text-gray">
                {copied ? 'Código copiado!' : 'Clique no código para copiar'}
              </p>
            </div>

            <div className="mb-6 rounded-[1.35rem] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-sm leading-relaxed text-text-gray">
                Depois de solicitar o acesso, aguarde a confirmação do provedor e clique em
                <strong className="text-text-white"> Tentar novamente</strong>.
              </p>
            </div>

            <div className="space-y-3">
              {!requested ? (
                <button
                  onClick={handleRequest}
                  className="btn-neon w-full py-4 text-base"
                >
                  Solicitar acesso
                </button>
              ) : (
                <button
                  onClick={handleRetry}
                  disabled={loading}
                  className="w-full rounded-xl border border-active-green/35 bg-active-green/15 px-4 py-4 text-base font-black text-active-green transition-all hover:bg-active-green/22 disabled:opacity-50"
                >
                  {loading ? 'Verificando liberação...' : 'Tentar novamente'}
                </button>
              )}

              <a
                href={`https://wa.me/5511999999999?text=${encodeURIComponent(`Olá, preciso liberar meu RonecaPlayTV. Código do dispositivo: ${deviceCode}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-4 text-center text-sm font-black text-text-white transition-all hover:border-active-green/60 hover:text-active-green"
              >
                Enviar código pelo WhatsApp
              </a>

              <button
                onClick={() => setScreen('home')}
                className="w-full rounded-xl border border-white/10 bg-transparent px-4 py-3 text-sm font-bold text-text-gray transition-all hover:border-neon-orange/60 hover:text-text-white"
              >
                Entrar em modo demonstração
              </button>
            </div>

            <p className="mt-6 text-center text-[0.7rem] leading-relaxed text-text-gray/65">
              RonecaPlayTV é um player legal. O app não fornece canais, filmes, séries ou listas.
            </p>
          </section>
        </main>
      </div>
    </AppLayout>
  );
}

function InfoBox({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <div className="premium-card rounded-[1.25rem] p-4">
      <span className="text-3xl">{icon}</span>
      <h3 className="mt-3 text-lg font-black text-text-white">{title}</h3>
      <p className="mt-1 text-xs text-text-gray">{text}</p>
    </div>
  );
}
