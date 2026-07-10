import type { ReactNode } from 'react';
import { Ban, Clock3, RefreshCw, Settings, WifiOff } from 'lucide-react';
import { SystemFrame } from '@/components/system/SystemFrame';
import { useAppStore } from '@/stores/appStore';
import '@/styles/system.css';

type StateTone = 'warning' | 'danger' | 'offline';

interface StateScreenProps {
  tone: StateTone;
  icon: ReactNode;
  title: string;
  description: string;
  detailLabel?: string;
  detailValue?: string;
  children: ReactNode;
}

function StateScreen({
  tone,
  icon,
  title,
  description,
  detailLabel,
  detailValue,
  children,
}: StateScreenProps) {
  return (
    <SystemFrame>
      <div className="system-state-layout">
        <section className="system-state-card" data-tone={tone}>
          <div className="system-state-symbol" aria-hidden="true">{icon}</div>
          <h1>{title}</h1>
          <p className="system-state-description">{description}</p>

          {detailLabel && detailValue ? (
            <div className="system-state-detail">
              <span>{detailLabel}</span>
              <strong>{detailValue}</strong>
            </div>
          ) : null}

          <div className="system-state-actions">{children}</div>
        </section>
      </div>
    </SystemFrame>
  );
}

function formatExpiry(value: string) {
  if (!value) return 'Data não informada';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function ExpiredScreen() {
  const expiresAt = useAppStore(state => state.expiresAt);
  const daysRemaining = useAppStore(state => state.daysRemaining);
  const setScreen = useAppStore(state => state.setScreen);
  const overdueDays = Math.max(0, Math.abs(daysRemaining));

  return (
    <StateScreen
      tone="warning"
      icon={<Clock3 size={34} strokeWidth={1.7} />}
      title="Acesso vencido"
      description="A liberação deste aparelho precisa ser renovada pelo responsável antes que o catálogo volte a ficar disponível."
      detailLabel="Situação da assinatura"
      detailValue={`${formatExpiry(expiresAt)}${overdueDays > 0 ? ` • ${overdueDays} dia(s) em atraso` : ''}`}
    >
      <button type="button" className="system-primary-action" onClick={() => setScreen('activation')}>
        <RefreshCw aria-hidden="true" size={15} />
        Verificar nova liberação
      </button>
    </StateScreen>
  );
}

export function BlockedScreen() {
  const setDeviceActivated = useAppStore(state => state.setDeviceActivated);
  const setScreen = useAppStore(state => state.setScreen);

  const retryActivation = () => {
    setDeviceActivated(false);
    setScreen('activation');
  };

  return (
    <StateScreen
      tone="danger"
      icon={<Ban size={34} strokeWidth={1.7} />}
      title="Dispositivo bloqueado"
      description="Este aparelho não está autorizado a acessar o sistema. Entre em contato com o responsável pela liberação antes de tentar novamente."
      detailLabel="Próximo passo"
      detailValue="Solicite a revisão deste dispositivo no painel administrativo"
    >
      <button type="button" className="system-primary-action" onClick={retryActivation}>
        <RefreshCw aria-hidden="true" size={15} />
        Consultar novamente
      </button>
    </StateScreen>
  );
}

export function NoInternetScreen() {
  const setScreen = useAppStore(state => state.setScreen);

  return (
    <StateScreen
      tone="offline"
      icon={<WifiOff size={34} strokeWidth={1.7} />}
      title="Sem conexão"
      description="Não foi possível acessar os serviços online. Confira a rede do aparelho e tente abrir o aplicativo novamente."
      detailLabel="Conteúdo local"
      detailValue="Itens já salvos em cache podem continuar disponíveis"
    >
      <button type="button" className="system-primary-action" onClick={() => setScreen('home')}>
        <RefreshCw aria-hidden="true" size={15} />
        Tentar novamente
      </button>
      <button type="button" className="system-secondary-action" onClick={() => setScreen('settings')}>
        <Settings aria-hidden="true" size={15} />
        Abrir configurações
      </button>
    </StateScreen>
  );
}
