import { useMemo, useState, type ReactNode } from 'react';
import {
  BadgeCheck,
  ChevronRight,
  Database,
  Info,
  LoaderCircle,
  Palette,
  Play,
  RefreshCw,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Smartphone,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { StreamingShell } from '@/components/layout/StreamingShell';
import { useAppStore } from '@/stores/appStore';
import { fetchDevicePanelConfig, isDevicePanelEnabled } from '@/utils/devicePanel';
import '@/styles/settings.css';

const RONECA_PANEL_FORCE_SYNC_KEY = 'ronecaplaytv-force-panel-sync';

type SettingsSectionId = 'access' | 'player' | 'experience' | 'device' | 'about';

type SettingsSection = {
  id: SettingsSectionId;
  label: string;
  description: string;
  icon: LucideIcon;
};

const sections: SettingsSection[] = [
  {
    id: 'access',
    label: 'Acesso e lista',
    description: 'Assinatura e sincronização',
    icon: ShieldCheck,
  },
  {
    id: 'player',
    label: 'Player',
    description: 'Reprodução e estabilidade',
    icon: Play,
  },
  {
    id: 'experience',
    label: 'Experiência',
    description: 'Idioma e aparência',
    icon: Palette,
  },
  {
    id: 'device',
    label: 'Dispositivo',
    description: 'Aparelho e recursos',
    icon: Smartphone,
  },
  {
    id: 'about',
    label: 'Sobre',
    description: 'Informações e uso correto',
    icon: Info,
  },
];

function formatExpiry(value: string) {
  if (!value) return 'Não informado';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function getPlatformLabel() {
  const userAgent = navigator.userAgent.toLowerCase();

  if (userAgent.includes('android')) return 'Android';
  if (userAgent.includes('iphone') || userAgent.includes('ipad')) return 'iOS';
  if (userAgent.includes('windows')) return 'Windows/Web';
  if (userAgent.includes('linux')) return 'Linux/Web';
  return 'Web';
}

export function SettingsScreen() {
  const settings = useAppStore(state => state.settings);
  const updateSettings = useAppStore(state => state.updateSettings);
  const setScreen = useAppStore(state => state.setScreen);
  const deviceCode = useAppStore(state => state.deviceCode);
  const deviceActivated = useAppStore(state => state.deviceActivated);
  const subscriptionActive = useAppStore(state => state.subscriptionActive);
  const setDeviceActivated = useAppStore(state => state.setDeviceActivated);
  const setSubscription = useAppStore(state => state.setSubscription);
  const setActiveNotice = useAppStore(state => state.setActiveNotice);
  const clearAllImportedContent = useAppStore(state => state.clearAllImportedContent);
  const expiresAt = useAppStore(state => state.expiresAt);
  const daysRemaining = useAppStore(state => state.daysRemaining);
  const playlists = useAppStore(state => state.playlists);
  const channels = useAppStore(state => state.channels);
  const movies = useAppStore(state => state.movies);
  const series = useAppStore(state => state.series);
  const legalNotice = useAppStore(state => state.legalNotice);

  const [activeSection, setActiveSection] = useState<SettingsSectionId>('access');
  const [accessStatus, setAccessStatus] = useState<string | null>(null);
  const [refreshingAccess, setRefreshingAccess] = useState(false);
  const [resyncArmed, setResyncArmed] = useState(false);

  const panelEnabled = isDevicePanelEnabled();
  const activePlaylist = useMemo(() => {
    return playlists.find(playlist => playlist.status === 'active') ?? playlists[0] ?? null;
  }, [playlists]);

  const currentSection = sections.find(section => section.id === activeSection) ?? sections[0];
  const contentTotal = channels.length + movies.length + series.length;
  const derivedAccessStatus = accessStatus
    ?? (!panelEnabled
      ? 'Modo local'
      : deviceActivated && subscriptionActive
        ? 'Acesso ativo'
        : deviceActivated
          ? 'Acesso vencido'
          : 'Aguardando liberação');

  const refreshAccess = async () => {
    setRefreshingAccess(true);
    setResyncArmed(false);

    try {
      if (!panelEnabled) {
        setAccessStatus('Painel não configurado');
        setActiveNotice('Atenção: painel de ativação não configurado neste build.');
        return;
      }

      const activeDeviceCode = String(deviceCode || '').trim();

      if (!activeDeviceCode) {
        setAccessStatus('Código não gerado');
        setActiveNotice('Atenção: gere o código do aparelho na tela de ativação.');
        setScreen('activation');
        return;
      }

      const config = await fetchDevicePanelConfig(activeDeviceCode);

      if (!config.active) {
        setDeviceActivated(false);
        setAccessStatus(
          config.status === 'blocked'
            ? 'Bloqueado'
            : config.status === 'expired'
              ? 'Vencido'
              : 'Aguardando liberação',
        );
        setActiveNotice(config.message || 'Aparelho aguardando liberação no painel.');

        if (config.status === 'blocked') setScreen('blocked');
        else if (config.status === 'expired') setScreen('expired');

        return;
      }

      setDeviceActivated(true);
      setAccessStatus(config.playlistUrl ? 'Ativo com conteúdo vinculado' : 'Ativo sem conteúdo vinculado');

      if (config.expiresAt) {
        const expires = new Date(config.expiresAt);
        const now = new Date();
        const days = Math.max(0, Math.ceil((expires.getTime() - now.getTime()) / 86400000));
        setSubscription(days > 0, config.expiresAt, days);
      }

      setActiveNotice(
        config.playlistUrl
          ? '✅ Acesso atualizado pelo painel.'
          : '✅ Aparelho ativo, mas ainda sem conteúdo vinculado.',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao consultar painel.';
      setAccessStatus('Erro ao verificar');
      setActiveNotice(`Atenção: ${message}`);
    } finally {
      setRefreshingAccess(false);
    }
  };

  const resyncPlaylist = () => {
    if (!resyncArmed) {
      setResyncArmed(true);
      setActiveNotice('Confirme novamente para apagar o cache atual e baixar a lista do painel.');
      return;
    }

    try {
      window.localStorage.setItem(RONECA_PANEL_FORCE_SYNC_KEY, String(Date.now()));
    } catch {
      // O marcador melhora a sincronização, mas o fluxo continua sem ele.
    }

    clearAllImportedContent();
    setActiveNotice('🔄 Ressincronização solicitada. O app vai baixar a lista real do painel novamente.');
    setScreen('activation');
  };

  const chooseSection = (section: SettingsSectionId) => {
    setActiveSection(section);
    setResyncArmed(false);
  };

  return (
    <StreamingShell>
      <div className="settings-page">
        <div className="settings-page-inner">
          <header className="settings-header">
            <div>
              <p className="stream-kicker">RonecaPlayTV</p>
              <h1 className="settings-header-title">Configurações</h1>
              <p className="settings-header-subtitle">
                Controle o acesso, a reprodução e a experiência do aplicativo sem alterar sua lista manualmente.
              </p>
            </div>

            <div className="settings-header-summary">
              <span className={`settings-summary-chip ${deviceActivated ? 'is-active' : ''}`}>
                <span className="settings-summary-dot" />
                {derivedAccessStatus}
              </span>
              <span className="settings-summary-chip">
                <Database aria-hidden="true" size={14} /> {contentTotal} itens
              </span>
            </div>
          </header>

          <div className="settings-layout">
            <aside className="settings-section-nav" aria-label="Seções das configurações">
              {sections.map(section => {
                const Icon = section.icon;
                const active = activeSection === section.id;

                return (
                  <button
                    key={section.id}
                    type="button"
                    className={`settings-section-button ${active ? 'is-active' : ''}`}
                    onClick={() => chooseSection(section.id)}
                    aria-current={active ? 'page' : undefined}
                    title={`${section.label}: ${section.description}`}
                  >
                    <Icon aria-hidden="true" />
                    <span>{section.label}</span>
                    <ChevronRight aria-hidden="true" />
                  </button>
                );
              })}
            </aside>

            <main className="settings-content">
              <header className="settings-content-header">
                <div>
                  <h2>{currentSection.label}</h2>
                  <p>{currentSection.description}</p>
                </div>
              </header>

              {activeSection === 'access' ? (
                <>
                  <section className="settings-access-hero">
                    <div className="settings-access-icon">
                      <BadgeCheck aria-hidden="true" size={28} strokeWidth={1.8} />
                    </div>
                    <div className="settings-access-copy">
                      <h3>{derivedAccessStatus}</h3>
                      <p>
                        {activePlaylist
                          ? `${activePlaylist.name} • ${contentTotal} itens carregados`
                          : 'Nenhuma lista vinculada está carregada neste momento.'}
                      </p>
                    </div>
                    <span className="settings-access-state">
                      <Zap aria-hidden="true" size={13} />
                      {daysRemaining > 0 ? `${daysRemaining} dias restantes` : 'Verificar acesso'}
                    </span>
                  </section>

                  <SettingsGroup
                    title="Assinatura e liberação"
                    description="Informações recebidas do painel administrativo."
                  >
                    <SettingsRow label="Status do acesso" description="Situação atual deste aparelho.">
                      <span className="settings-static-value">{derivedAccessStatus}</span>
                    </SettingsRow>
                    <SettingsRow label="Código do aparelho" description="Identificador usado para liberar este dispositivo.">
                      <span className="settings-static-value">{deviceCode || 'Gerando...'}</span>
                    </SettingsRow>
                    <SettingsRow label="Vencimento" description="Data informada pela assinatura vinculada.">
                      <span className="settings-static-value">{formatExpiry(expiresAt)}</span>
                    </SettingsRow>
                    <SettingsRow label="Dias restantes" description="Contagem aproximada até o vencimento.">
                      <span className="settings-static-value">
                        {daysRemaining > 0 ? `${daysRemaining} dias` : 'Verificar'}
                      </span>
                    </SettingsRow>
                    <div className="settings-actions">
                      <button
                        type="button"
                        className="settings-action-button is-primary"
                        onClick={refreshAccess}
                        disabled={refreshingAccess}
                      >
                        {refreshingAccess ? (
                          <LoaderCircle aria-hidden="true" size={15} className="animate-spin" />
                        ) : (
                          <RefreshCw aria-hidden="true" size={15} />
                        )}
                        {refreshingAccess ? 'Verificando...' : 'Atualizar acesso'}
                      </button>
                    </div>
                  </SettingsGroup>

                  <SettingsGroup
                    title="Conteúdo vinculado"
                    description="Resumo da lista carregada e opção de baixar tudo novamente."
                  >
                    <SettingsRow label="Lista ativa" description="Fonte atual de canais, filmes e séries.">
                      <span className="settings-static-value">{activePlaylist?.name || 'Nenhuma lista'}</span>
                    </SettingsRow>
                    <SettingsRow label="Última sincronização" description="Última atualização registrada para a lista.">
                      <span className="settings-static-value">{activePlaylist?.lastSync || 'Não informado'}</span>
                    </SettingsRow>
                    <SettingsRow label="Conteúdo carregado" description="Itens disponíveis no cache atual.">
                      <span className="settings-static-value">
                        {channels.length} canais • {movies.length} filmes • {series.length} séries
                      </span>
                    </SettingsRow>
                    <div className="settings-actions">
                      <button
                        type="button"
                        className={`settings-action-button ${resyncArmed ? 'is-confirm' : 'is-warning'}`}
                        onClick={resyncPlaylist}
                      >
                        <RotateCcw aria-hidden="true" size={15} />
                        {resyncArmed ? 'Confirmar ressincronização' : 'Ressincronizar lista'}
                      </button>
                    </div>
                  </SettingsGroup>
                </>
              ) : null}

              {activeSection === 'player' ? (
                <>
                  <SettingsGroup
                    title="Motor de reprodução"
                    description="Preferências usadas pelo player sem alterar os endereços da lista."
                  >
                    <SettingsRow label="Player preferencial" description="Automático é recomendado para compatibilidade.">
                      <select
                        className="settings-select"
                        value={settings.playerType}
                        onChange={event => updateSettings({ playerType: event.target.value as typeof settings.playerType })}
                      >
                        <option value="auto">Automático</option>
                        <option value="native">Nativo</option>
                        <option value="vlc">VLC</option>
                        <option value="mxplayer">MX Player</option>
                      </select>
                    </SettingsRow>
                    <SettingsRow label="Decodificação" description="Hardware economiza processamento quando compatível.">
                      <select
                        className="settings-select"
                        value={settings.decoding}
                        onChange={event => updateSettings({ decoding: event.target.value as typeof settings.decoding })}
                      >
                        <option value="auto">Automática</option>
                        <option value="hardware">Hardware</option>
                        <option value="software">Software</option>
                      </select>
                    </SettingsRow>
                    <SettingsRow label="Tamanho do buffer" description="Buffers maiores podem ajudar conexões instáveis.">
                      <select
                        className="settings-select"
                        value={settings.bufferSize}
                        onChange={event => updateSettings({ bufferSize: event.target.value as typeof settings.bufferSize })}
                      >
                        <option value="low">Baixo</option>
                        <option value="medium">Médio</option>
                        <option value="high">Alto</option>
                      </select>
                    </SettingsRow>
                    <SettingsRow label="Reconexão automática" description="Tenta recuperar a transmissão quando a conexão cai.">
                      <SettingsSwitch
                        checked={settings.autoReconnect}
                        label="Reconexão automática"
                        onChange={() => updateSettings({ autoReconnect: !settings.autoReconnect })}
                      />
                    </SettingsRow>
                  </SettingsGroup>

                  <div className="settings-legal-card">
                    <strong>O player permanece protegido</strong>
                    Essas opções alteram somente preferências já suportadas. A recuperação de URL, HLS, MPEG-TS e os controles próprios do player não são modificados nesta tela.
                  </div>
                </>
              ) : null}

              {activeSection === 'experience' ? (
                <SettingsGroup
                  title="Interface e idioma"
                  description="Aparência responsiva para celular, TV Box e telas maiores."
                >
                  <SettingsRow label="Idioma" description="Idioma principal dos textos configuráveis.">
                    <select
                      className="settings-select"
                      value={settings.language}
                      onChange={event => updateSettings({ language: event.target.value as typeof settings.language })}
                    >
                      <option value="pt">Português</option>
                      <option value="en">English</option>
                      <option value="es">Español</option>
                    </select>
                  </SettingsRow>
                  <SettingsRow label="Tamanho dos cards" description="Ajusta a densidade visual dos catálogos.">
                    <select
                      className="settings-select"
                      value={settings.cardSize}
                      onChange={event => updateSettings({ cardSize: event.target.value as typeof settings.cardSize })}
                    >
                      <option value="small">Compacto</option>
                      <option value="medium">Médio</option>
                      <option value="large">Grande</option>
                    </select>
                  </SettingsRow>
                  <SettingsRow label="Animações" description="Transições discretas de foco e navegação.">
                    <SettingsSwitch
                      checked={settings.animationsEnabled}
                      label="Animações"
                      onChange={() => updateSettings({ animationsEnabled: !settings.animationsEnabled })}
                    />
                  </SettingsRow>
                  <SettingsRow label="Tema" description="Identidade visual atual do aplicativo.">
                    <span className="settings-static-value">Cinema preto e dourado</span>
                  </SettingsRow>
                  <SettingsRow label="Layout" description="Adaptação automática conforme tela e orientação.">
                    <span className="settings-static-value">Responsivo automático</span>
                  </SettingsRow>
                </SettingsGroup>
              ) : null}

              {activeSection === 'device' ? (
                <>
                  <SettingsGroup
                    title="Este aparelho"
                    description="Informações úteis para suporte e diagnóstico."
                  >
                    <SettingsRow label="Código do dispositivo" description="Código usado para a liberação no painel.">
                      <span className="settings-static-value">{deviceCode || 'Não informado'}</span>
                    </SettingsRow>
                    <SettingsRow label="Plataforma" description="Ambiente detectado pelo aplicativo.">
                      <span className="settings-static-value">{getPlatformLabel()}</span>
                    </SettingsRow>
                    <SettingsRow label="Resolução atual" description="Área disponível para a interface.">
                      <span className="settings-static-value">{window.innerWidth} × {window.innerHeight}</span>
                    </SettingsRow>
                    <SettingsRow label="Painel de ativação" description="Integração remota deste build.">
                      <span className="settings-static-value">{panelEnabled ? 'Configurado' : 'Modo local'}</span>
                    </SettingsRow>
                  </SettingsGroup>

                  <SettingsGroup
                    title="Recursos P2P"
                    description="Use somente quando autorizado pelo serviço vinculado."
                  >
                    <SettingsRow label="P2P autorizado" description="Permite recursos P2P quando disponíveis.">
                      <SettingsSwitch
                        checked={settings.p2pEnabled}
                        label="P2P autorizado"
                        onChange={() => updateSettings({ p2pEnabled: !settings.p2pEnabled })}
                      />
                    </SettingsRow>
                    <SettingsRow label="Somente Wi-Fi" description="Evita uso P2P em conexão móvel.">
                      <SettingsSwitch
                        checked={settings.p2pWifiOnly}
                        label="P2P somente Wi-Fi"
                        disabled={!settings.p2pEnabled}
                        onChange={() => updateSettings({ p2pWifiOnly: !settings.p2pWifiOnly })}
                      />
                    </SettingsRow>
                    <SettingsRow label="Limite de upload" description="Limite aproximado em Kbps; zero significa automático.">
                      <select
                        className="settings-select"
                        value={settings.p2pUploadLimit}
                        disabled={!settings.p2pEnabled}
                        onChange={event => updateSettings({ p2pUploadLimit: Number(event.target.value) })}
                      >
                        <option value={0}>Automático</option>
                        <option value={512}>512 Kbps</option>
                        <option value={1024}>1 Mbps</option>
                        <option value={2048}>2 Mbps</option>
                        <option value={4096}>4 Mbps</option>
                      </select>
                    </SettingsRow>
                  </SettingsGroup>
                </>
              ) : null}

              {activeSection === 'about' ? (
                <>
                  <SettingsGroup
                    title="Aplicativo"
                    description="Informações essenciais sobre o RonecaPlayTV."
                  >
                    <SettingsRow label="Nome" description="Identificação do aplicativo.">
                      <span className="settings-static-value">RonecaPlayTV</span>
                    </SettingsRow>
                    <SettingsRow label="Tipo" description="Função principal do aplicativo.">
                      <span className="settings-static-value">Player IPTV/P2P</span>
                    </SettingsRow>
                    <SettingsRow label="Conteúdo incluso" description="O aplicativo não comercializa nem fornece conteúdo.">
                      <span className="settings-static-value">Não fornece conteúdo</span>
                    </SettingsRow>
                    <SettingsRow label="Uso correto" description="Acesso permitido somente para conteúdo autorizado.">
                      <span className="settings-static-value">Conteúdo vinculado pelo painel</span>
                    </SettingsRow>
                  </SettingsGroup>

                  <div className="settings-legal-card">
                    <strong>Uso responsável</strong>
                    {legalNotice || 'O aplicativo funciona como player e depende de uma lista autorizada vinculada ao aparelho. Canais, filmes e séries não são fornecidos pelo aplicativo.'}
                  </div>
                </>
              ) : null}
            </main>
          </div>
        </div>
      </div>
    </StreamingShell>
  );
}

function SettingsGroup({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-group">
      <header className="settings-group-heading">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <Settings2 aria-hidden="true" size={16} />
      </header>
      {children}
    </section>
  );
}

function SettingsRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        <span className="settings-row-label">{label}</span>
        <span className="settings-row-description">{description}</span>
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

function SettingsSwitch({
  checked,
  label,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`settings-switch ${checked ? 'is-on' : ''}`}
      onClick={onChange}
      disabled={disabled}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={`${label}: ${checked ? 'Ligado' : 'Desligado'}`}
    />
  );
}
