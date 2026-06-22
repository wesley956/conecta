import { useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { AppLayout, BottomNav } from '@/components/shared';
import { activateDeviceWithPanel, fetchDevicePanelConfig, isDevicePanelEnabled } from '@/utils/devicePanel';

// ===== SETTINGS SCREEN =====
export function SettingsScreen() {
  const {
    settings,
    updateSettings,
    setScreen,
    deviceCode,
    setDeviceCode,
    setDeviceActivated,
    setSubscription,
    setActiveNotice,
    expiresAt,
    daysRemaining,
    uiMode,
    setUIMode,
  } = useAppStore();

  const [activeSection, setActiveSection] = useState<'player' | 'access' | 'language' | 'appearance' | 'device' | 'about'>('access');

  const sections = [
    { id: 'access' as const, icon: '✓', label: 'Acesso' },
    { id: 'player' as const, icon: '▷', label: 'Player' },
    { id: 'language' as const, icon: '◎', label: 'Idioma' },
    { id: 'appearance' as const, icon: '◇', label: 'Aparência' },
    { id: 'device' as const, icon: '▣', label: 'Dispositivo' },
    { id: 'about' as const, icon: 'ⓘ', label: 'Sobre' },
  ];

  const title = sections.find(section => section.id === activeSection)?.label ?? 'Configurações';
  const [accessStatus, setAccessStatus] = useState('Não verificado');
  const [refreshingAccess, setRefreshingAccess] = useState(false);

  const refreshAccess = async () => {
    setRefreshingAccess(true);

    try {
      if (!isDevicePanelEnabled()) {
        setAccessStatus('Painel não configurado');
        setActiveNotice('⚠️ Painel de ativação não configurado neste build.');
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
        setAccessStatus(config.status === 'blocked' ? 'Bloqueado' : config.status === 'expired' ? 'Vencido' : 'Aguardando liberação');
        setActiveNotice(config.message || '⏳ Aparelho aguardando liberação no painel.');

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

      setActiveNotice(config.playlistUrl ? '✅ Acesso atualizado pelo painel.' : '✅ Aparelho ativo, mas ainda sem conteúdo vinculado.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao consultar painel.';
      setAccessStatus('Erro ao verificar');
      setActiveNotice(`⚠️ ${message}`);
    } finally {
      setRefreshingAccess(false);
    }
  };

  return (
    <AppLayout>
      <div className="clean-tv-page flex h-full px-14 py-8">
        <BottomNav />

        <aside className="w-[330px] shrink-0 pr-10">
          <button
            onClick={() => setScreen('home')}
            className="mb-8 text-5xl text-white/45 hover:text-white"
          >
            ⌂
          </button>

          <h1 className="clean-tv-title mb-8 text-5xl">Config</h1>

          <div className="space-y-1">
            {sections.map(section => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`clean-tv-row flex w-full items-center gap-4 px-5 py-4 text-left ${
                  activeSection === section.id ? 'active' : ''
                }`}
              >
                <span className="w-8 text-2xl">{section.icon}</span>
                <span className="text-2xl font-light">{section.label}</span>
              </button>
            ))}
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto pb-16 pr-6">
          <h2 className="clean-tv-title mb-8 text-4xl">{title}</h2>

          {activeSection === 'access' && (
            <div className="max-w-5xl divide-y divide-white/10">
              <SettingRow label="Status do acesso" value={accessStatus} />
              <SettingRow label="Código do aparelho" value={deviceCode || 'Gerando...'} />
              <SettingRow label="Vencimento" value={expiresAt || 'Não informado'} />
              <SettingRow label="Dias restantes" value={daysRemaining > 0 ? `${daysRemaining}` : 'Verificar'} />
              <SettingRow label="Atualizar com o painel" value="Verificar agora">
                <button
                  onClick={refreshAccess}
                  disabled={refreshingAccess}
                  className="rounded-md bg-[#2396f2] px-7 py-3 text-xl font-light text-white disabled:opacity-45"
                >
                  {refreshingAccess ? 'Verificando...' : 'Atualizar acesso'}
                </button>
              </SettingRow>
            </div>
          )}

          {activeSection === 'player' && (
            <div className="max-w-5xl divide-y divide-white/10">
              <SettingRow label="Player preferencial" value={settings.playerType}>
                <select
                  value={settings.playerType}
                  onChange={e => updateSettings({ playerType: e.target.value as typeof settings.playerType })}
                  className="min-w-[220px] bg-transparent text-right text-2xl font-light text-white outline-none"
                >
                  <option value="auto">Automático</option>
                  <option value="native">Nativo</option>
                  <option value="vlc">VLC</option>
                  <option value="mxplayer">MX Player</option>
                </select>
              </SettingRow>

              <SettingRow label="Decodificação" value={settings.decoding}>
                <select
                  value={settings.decoding}
                  onChange={e => updateSettings({ decoding: e.target.value as typeof settings.decoding })}
                  className="min-w-[220px] bg-transparent text-right text-2xl font-light text-white outline-none"
                >
                  <option value="auto">Automático</option>
                  <option value="hardware">Hardware</option>
                  <option value="software">Software</option>
                </select>
              </SettingRow>

              <SettingRow label="Buffer" value={settings.bufferSize}>
                <select
                  value={settings.bufferSize}
                  onChange={e => updateSettings({ bufferSize: e.target.value as typeof settings.bufferSize })}
                  className="min-w-[220px] bg-transparent text-right text-2xl font-light text-white outline-none"
                >
                  <option value="low">Baixo</option>
                  <option value="medium">Médio</option>
                  <option value="high">Alto</option>
                </select>
              </SettingRow>

              <SettingRow label="Reconexão automática" value={settings.autoReconnect ? 'Ligado' : 'Desligado'}>
                <button
                  onClick={() => updateSettings({ autoReconnect: !settings.autoReconnect })}
                  className="text-2xl font-light text-white hover:text-[#2396f2]"
                >
                  {settings.autoReconnect ? 'Ligado' : 'Desligado'}
                </button>
              </SettingRow>
            </div>
          )}

          {activeSection === 'language' && (
            <div className="max-w-5xl divide-y divide-white/10">
              <SettingRow label="Idioma" value={settings.language}>
                <select
                  value={settings.language}
                  onChange={e => updateSettings({ language: e.target.value as typeof settings.language })}
                  className="min-w-[220px] bg-transparent text-right text-2xl font-light text-white outline-none"
                >
                  <option value="pt">Português</option>
                  <option value="en">English</option>
                  <option value="es">Español</option>
                </select>
              </SettingRow>

              <SettingRow label="Região" value="Brasil" />
              <SettingRow label="Formato de data" value="DD/MM/AAAA" />
            </div>
          )}

          {activeSection === 'appearance' && (
            <div className="max-w-5xl divide-y divide-white/10">
              <SettingRow label="Modo de interface" value={uiMode}>
                <button
                  onClick={() => setUIMode(uiMode === 'tv' ? 'mobile' : 'tv')}
                  className="text-2xl font-light text-white hover:text-[#2396f2]"
                >
                  {uiMode === 'tv' ? 'TV Box' : 'Mobile'}
                </button>
              </SettingRow>

              <SettingRow label="Tema" value="Clean TV" />
              <SettingRow label="Menu lateral" value="Ativo" />
              <SettingRow label="Foco azul" value="Ativo" />
            </div>
          )}

          {activeSection === 'device' && (
            <div className="max-w-5xl divide-y divide-white/10">
              <SettingRow label="Código do dispositivo" value={deviceCode} />
              <SettingRow label="Vencimento" value={expiresAt} />
              <SettingRow label="Dias restantes" value={`${daysRemaining}`} />
              <SettingRow label="P2P autorizado" value={settings.p2pEnabled ? 'Ligado' : 'Desligado'}>
                <button
                  onClick={() => updateSettings({ p2pEnabled: !settings.p2pEnabled })}
                  className="text-2xl font-light text-white hover:text-[#2396f2]"
                >
                  {settings.p2pEnabled ? 'Ligado' : 'Desligado'}
                </button>
              </SettingRow>
            </div>
          )}

          {activeSection === 'about' && (
            <div className="max-w-4xl">
              <p className="mb-8 text-2xl font-light leading-relaxed text-white/62">
                RonecaPlayTV é um player autorizado para conteúdo vinculado pelo painel.
              </p>

              <div className="divide-y divide-white/10">
                <SettingRow label="Aplicativo" value="RonecaPlayTV" />
                <SettingRow label="Tipo" value="Player IPTV/P2P" />
                <SettingRow label="Conteúdo incluso" value="Não fornece conteúdo" />
                <SettingRow label="Uso correto" value="Somente conteúdo autorizado pelo painel" />
              </div>

              <p className="mt-10 text-lg font-light leading-relaxed text-white/42">
                O app não fornece canais, filmes, séries ou conteúdo próprio. O acesso depende de liberação e vínculo no painel administrativo.
              </p>
            </div>
          )}
        </main>
      </div>
    </AppLayout>
  );
}


function SettingRow({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[76px] items-center justify-between gap-8 py-4">
      <span className="text-2xl font-light text-white/62">{label}</span>
      <span className="text-right text-2xl font-light text-white/85">{children ?? value}</span>
    </div>
  );
}
