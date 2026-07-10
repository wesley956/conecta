import { useEffect, useRef, useState } from 'react';
import { Check, Copy, KeyRound, LoaderCircle, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react';
import { SystemFrame } from '@/components/system/SystemFrame';
import { useAppStore } from '@/stores/appStore';
import { activateDeviceWithPanel, fetchDevicePanelConfig, isDevicePanelEnabled } from '@/utils/devicePanel';
import '@/styles/system.css';

export function ActivationScreen() {
  const deviceCode = useAppStore(state => state.deviceCode);
  const setScreen = useAppStore(state => state.setScreen);
  const setDeviceActivated = useAppStore(state => state.setDeviceActivated);
  const setDeviceCode = useAppStore(state => state.setDeviceCode);
  const setSubscription = useAppStore(state => state.setSubscription);
  const setActiveNotice = useAppStore(state => state.setActiveNotice);

  const startedRef = useRef(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(() => isDevicePanelEnabled());
  const [statusText, setStatusText] = useState(() => (
    isDevicePanelEnabled()
      ? 'Gerando código do aparelho...'
      : 'Painel de ativação não configurado neste build.'
  ));

  const normalizedDeviceCode = String(deviceCode || '').trim();
  const displayCode = loading ? 'GERANDO...' : normalizedDeviceCode || 'AGUARDANDO';

  const copyCode = async () => {
    if (!normalizedDeviceCode || loading) return;

    try {
      await navigator.clipboard.writeText(normalizedDeviceCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const applyPanelConfig = (config: Awaited<ReturnType<typeof fetchDevicePanelConfig>>) => {
    if (!config.active) {
      setDeviceActivated(false);
      setActiveNotice(config.message || 'Envie este código ao vendedor ou administrador para liberar o acesso.');

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
    setCopied(false);

    try {
      if (!isDevicePanelEnabled()) {
        setDeviceActivated(false);
        setStatusText('Painel de ativação não configurado neste build.');
        setActiveNotice('Atenção: painel de ativação não configurado neste build.');
        setScreen('activation');
        return;
      }

      setStatusText('Gerando ou consultando o código do aparelho...');

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

      setStatusText('Verificando a liberação no painel...');
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
    // A consulta inicial deve ocorrer somente uma vez durante esta montagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SystemFrame>
      <div className="system-activation-layout">
        <section className="system-activation-copy">
          <span className="system-status-pill">Ativação segura</span>
          <h1>Libere este aparelho com um código único.</h1>
          <p>
            O responsável pelo acesso utiliza o código exibido ao lado para vincular este dispositivo no painel.
            Nenhum cadastro manual de nome, telefone ou senha é necessário dentro do aplicativo.
          </p>

          <div className="system-activation-steps" aria-label="Etapas da ativação">
            <article className="system-activation-step">
              <span>1</span>
              <strong>Copie o código</strong>
              <p>Pressione o código para copiá-lo com segurança.</p>
            </article>
            <article className="system-activation-step">
              <span>2</span>
              <strong>Envie ao responsável</strong>
              <p>O aparelho será localizado e liberado pelo painel.</p>
            </article>
            <article className="system-activation-step">
              <span>3</span>
              <strong>Atualize a liberação</strong>
              <p>Após a confirmação, o catálogo será carregado automaticamente.</p>
            </article>
          </div>
        </section>

        <section className="system-activation-card">
          <div className="system-card-heading">
            <div>
              <p className="system-kicker">Seu dispositivo</p>
              <h2>Código de ativação</h2>
              <p>Identificador exclusivo deste aparelho.</p>
            </div>
            <div className="system-card-icon" aria-hidden="true">
              <Smartphone size={21} strokeWidth={1.8} />
            </div>
          </div>

          <button
            type="button"
            className="system-code-button"
            onClick={copyCode}
            disabled={loading || !normalizedDeviceCode}
            aria-label="Copiar código do aparelho"
          >
            {displayCode}
          </button>

          <div className={`system-code-help ${copied ? 'is-success' : ''}`}>
            {copied ? (
              <>
                <Check aria-hidden="true" size={13} /> Código copiado
              </>
            ) : loading ? (
              <>
                <LoaderCircle aria-hidden="true" size={13} className="animate-spin" /> Aguarde a geração
              </>
            ) : (
              <>
                <Copy aria-hidden="true" size={13} /> Pressione para copiar
              </>
            )}
          </div>

          <div className="system-activation-status" role="status" aria-live="polite">
            {loading ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : normalizedDeviceCode ? (
              <ShieldCheck aria-hidden="true" />
            ) : (
              <KeyRound aria-hidden="true" />
            )}
            <span>{statusText}</span>
          </div>

          <button
            type="button"
            className="system-primary-action"
            onClick={generateOrCheckCode}
            disabled={loading}
          >
            {loading ? (
              <LoaderCircle aria-hidden="true" size={15} className="animate-spin" />
            ) : (
              <RefreshCw aria-hidden="true" size={15} />
            )}
            {loading ? 'Verificando liberação...' : 'Atualizar liberação'}
          </button>
        </section>
      </div>
    </SystemFrame>
  );
}
