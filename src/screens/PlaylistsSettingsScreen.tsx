import { useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { AppLayout, Header, NeonCard, StatusBadge, ScrollContainer, BottomNav, LegalBanner } from '@/components/shared';
import type { Playlist } from '@/types';

// ===== PLAYLISTS SCREEN =====
export function PlaylistsScreen() {
  const { playlists, setScreen, importM3UPlaylist } = useAppStore();
  const [showAdd, setShowAdd] = useState(false);
  const [playlistName, setPlaylistName] = useState('');
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [m3uContent, setM3uContent] = useState('');
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleImportM3U = () => {
    setImportMessage(null);
    setImportError(null);

    try {
      const result = importM3UPlaylist(playlistName, playlistUrl, m3uContent);
      setImportMessage(`Lista importada: ${result.imported} canais adicionados${result.skipped ? `, ${result.skipped} itens ignorados` : ''}.`);
      setPlaylistName('');
      setPlaylistUrl('');
      setM3uContent('');
      setShowAdd(false);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Erro ao importar lista M3U.');
    }
  };

  return (
    <AppLayout>
      <Header title="Listas de Reprodução" showBack onBack={() => setScreen('home')} />

      <ScrollContainer>
        <LegalBanner />

        <div className="flex items-center justify-between mb-4">
          <p className="text-text-gray text-sm">{playlists.length} lista{playlists.length !== 1 ? 's' : ''} ativa{playlists.length !== 1 ? 's' : ''}</p>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="bg-neon-orange text-bg-primary px-4 py-2 rounded-lg font-bold text-sm hover:bg-neon-orange/80 transition-colors"
          >
            + Adicionar Lista
          </button>
        </div>

        {/* Add New Playlist Form */}
        {showAdd && (
          <div className="bg-card border border-neon-orange/30 rounded-xl p-4 mb-4 animate-scale-in">
            <h3 className="text-text-white font-bold mb-3">Adicionar Lista M3U Autorizada</h3>

            <div className="space-y-3">
              <div>
                <label className="text-text-gray text-xs block mb-1">Nome da Lista</label>
                <input
                  type="text"
                  value={playlistName}
                  onChange={e => setPlaylistName(e.target.value)}
                  placeholder="Ex: Lista autorizada do meu provedor"
                  className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-text-white text-sm focus:border-neon-orange focus:outline-none"
                />
              </div>

              <div>
                <label className="text-text-gray text-xs block mb-1">URL de origem, opcional</label>
                <input
                  type="text"
                  value={playlistUrl}
                  onChange={e => setPlaylistUrl(e.target.value)}
                  placeholder="https://exemplo-autorizado.com/lista.m3u"
                  className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-text-white text-sm focus:border-neon-orange focus:outline-none"
                />
                <p className="text-text-gray/60 text-[10px] mt-1">
                  Por enquanto o app importa o conteúdo colado abaixo. A busca automática por URL entra na próxima etapa por causa de CORS/autenticação.
                </p>
              </div>

              <div>
                <label className="text-text-gray text-xs block mb-1">Conteúdo M3U</label>
                <textarea
                  value={m3uContent}
                  onChange={e => setM3uContent(e.target.value)}
                  rows={8}
                  placeholder={'#EXTM3U\n#EXTINF:-1 tvg-id="canal-demo" group-title="Abertos",Canal Demo\nhttps://exemplo-autorizado.com/stream/canal.m3u8'}
                  className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-text-white text-xs font-mono focus:border-neon-orange focus:outline-none resize-y"
                />
              </div>

              {importMessage && (
                <p className="text-active-green text-xs bg-active-green/10 border border-active-green/20 rounded-lg p-2">
                  {importMessage}
                </p>
              )}

              {importError && (
                <p className="text-error-red text-xs bg-error-red/10 border border-error-red/20 rounded-lg p-2">
                  {importError}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleImportM3U}
                  className="flex-1 bg-neon-orange text-bg-primary py-2 rounded-lg font-bold text-sm"
                >
                  Importar M3U
                </button>
                <button
                  onClick={() => setShowAdd(false)}
                  className="flex-1 bg-card border border-border text-text-gray py-2 rounded-lg text-sm"
                >
                  Cancelar
                </button>
              </div>
            </div>

            <p className="text-alert-yellow text-[10px] mt-3">
              ⚠️ Use apenas listas e fontes autorizadas. O app não fornece canais, filmes, séries ou listas.
            </p>
          </div>
        )}

        {/* Playlist Cards */}
        <div className="space-y-3 mb-4">
          {playlists.map(pl => (
            <PlaylistCard key={pl.id} playlist={pl} />
          ))}
        </div>
      </ScrollContainer>

      <BottomNav />
    </AppLayout>
  );
}

function PlaylistCard({ playlist }: { playlist: Playlist }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <NeonCard onClick={() => setExpanded(!expanded)} glowColor={playlist.status === 'active' ? 'green' : 'orange'}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-bg-dark border border-border flex items-center justify-center">
              <span>📋</span>
            </div>
            <div>
              <h3 className="text-text-white font-medium">{playlist.name}</h3>
              <div className="flex items-center gap-2">
                <span className="text-text-gray/60 text-xs">{playlist.type.toUpperCase()}</span>
                <StatusBadge status={playlist.status} />
              </div>
            </div>
          </div>
          <span className="text-text-gray/40">{expanded ? '▲' : '▼'}</span>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 mt-3 text-xs text-text-gray">
          <span>📺 {playlist.channelCount} canais</span>
          <span>🎬 {playlist.movieCount} filmes</span>
          <span>🎥 {playlist.seriesCount} séries</span>
        </div>

        {/* Progress bar for sync */}
        <div className="mt-2 h-1 bg-border rounded-full overflow-hidden">
          <div className="h-full bg-active-green rounded-full w-full" />
        </div>
        <p className="text-text-gray/40 text-[10px] mt-1">Última sincronização: {playlist.lastSync}</p>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-border flex gap-2 animate-fade-in">
            <button className="flex-1 bg-card border border-border text-text-gray py-2 rounded-lg text-xs hover:border-neon-orange/50 transition-colors">
              ✏️ Editar
            </button>
            <button className="flex-1 bg-card border border-border text-text-gray py-2 rounded-lg text-xs hover:border-neon-cyan/50 transition-colors">
              🧪 Testar
            </button>
            <button className="flex-1 bg-card border border-border text-text-gray py-2 rounded-lg text-xs hover:border-error-red/50 transition-colors">
              🗑️ Remover
            </button>
          </div>
        )}
      </div>
    </NeonCard>
  );
}

// ===== SETTINGS SCREEN =====
export function SettingsScreen() {
  const { settings, updateSettings, setScreen, deviceCode, expiresAt, daysRemaining, legalNotice, uiMode, setUIMode } = useAppStore();
  const [activeSection, setActiveSection] = useState<string>('player');

  const sections = [
    { id: 'player', icon: '🖥️', label: 'Player' },
    { id: 'format', icon: '📋', label: 'Formato' },
    { id: 'language', icon: '🌐', label: 'Linguagem' },
    { id: 'subscription', icon: '📅', label: 'Vencimento' },
    { id: 'appearance', icon: '🎨', label: 'Aparência' },
    { id: 'p2p', icon: '🔗', label: 'P2P' },
    { id: 'cache', icon: '💾', label: 'Cache' },
    { id: 'about', icon: 'ℹ️', label: 'Sobre' },
  ];

  return (
    <AppLayout>
      <Header title="Configurações" showBack onBack={() => setScreen('home')} />

      <ScrollContainer>
        <div className="flex gap-4">
          {/* Sidebar */}
          <div className={`${uiMode === 'tv' ? 'w-48' : 'w-36'} flex-shrink-0 space-y-1`}>
            {sections.map(s => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left transition-all ${
                  activeSection === s.id
                    ? 'bg-neon-orange/10 border border-neon-orange/30 text-neon-orange'
                    : 'text-text-gray hover:bg-card hover:text-text-white'
                }`}
              >
                <span className="text-sm">{s.icon}</span>
                <span className="text-sm font-medium">{s.label}</span>
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 animate-fade-in">
            {activeSection === 'player' && (
              <div className="space-y-4">
                <h3 className="text-text-white font-bold text-lg mb-4">Player</h3>
                <SettingSelect label="Player Preferencial" value={settings.playerType} options={[
                  { value: 'auto', label: 'Automático' },
                  { value: 'native', label: 'Player Nativo' },
                  { value: 'vlc', label: 'VLC Externo' },
                  { value: 'mxplayer', label: 'MX Player' },
                ]} onChange={v => updateSettings({ playerType: v as typeof settings.playerType })} />
                <SettingSelect label="Decodificação" value={settings.decoding} options={[
                  { value: 'auto', label: 'Automático' },
                  { value: 'hardware', label: 'Hardware' },
                  { value: 'software', label: 'Software' },
                ]} onChange={v => updateSettings({ decoding: v as typeof settings.decoding })} />
                <SettingSelect label="Buffer" value={settings.bufferSize} options={[
                  { value: 'low', label: 'Baixo (menos delay)' },
                  { value: 'medium', label: 'Médio (equilibrado)' },
                  { value: 'high', label: 'Alto (mais estável)' },
                ]} onChange={v => updateSettings({ bufferSize: v as typeof settings.bufferSize })} />
                <SettingToggle label="Reconexão Automática" value={settings.autoReconnect} onChange={v => updateSettings({ autoReconnect: v })} />
              </div>
            )}

            {activeSection === 'format' && (
              <div className="space-y-4">
                <h3 className="text-text-white font-bold text-lg mb-4">Formato de Lista</h3>
                <p className="text-text-gray text-sm mb-4">Formatos suportados para importação de listas autorizadas.</p>
                {['M3U URL', 'Xtream Codes', 'Stalker (Autorizado)', 'Arquivo Local'].map(f => (
                  <div key={f} className="bg-card border border-border rounded-lg p-3 flex items-center justify-between">
                    <span className="text-text-white text-sm">{f}</span>
                    <span className="text-active-green text-xs">✓ Suportado</span>
                  </div>
                ))}
              </div>
            )}

            {activeSection === 'language' && (
              <div className="space-y-4">
                <h3 className="text-text-white font-bold text-lg mb-4">Linguagem</h3>
                <SettingSelect label="Idioma" value={settings.language} options={[
                  { value: 'pt', label: '🇧🇷 Português' },
                  { value: 'en', label: '🇺🇸 English' },
                  { value: 'es', label: '🇪🇸 Español' },
                ]} onChange={v => updateSettings({ language: v as typeof settings.language })} />
              </div>
            )}

            {activeSection === 'subscription' && (
              <div className="space-y-4">
                <h3 className="text-text-white font-bold text-lg mb-4">Vencimento</h3>
                <div className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-text-gray text-sm">Status</span>
                    <StatusBadge status={daysRemaining > 0 ? 'active' : 'expired'} />
                  </div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-text-gray text-sm">Vencimento</span>
                    <span className="text-text-white font-bold">{expiresAt}</span>
                  </div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-text-gray text-sm">Dias Restantes</span>
                    <span className={`font-bold text-lg ${daysRemaining > 7 ? 'text-active-green' : 'text-alert-yellow'}`}>{daysRemaining}</span>
                  </div>
                  <div className="flex gap-2">
                    <button className="flex-1 bg-neon-orange text-bg-primary py-2 rounded-lg font-bold text-sm">🔄 Sincronizar</button>
                    <a href="https://wa.me/5511999999999" target="_blank" rel="noopener noreferrer" className="flex-1 bg-active-green text-bg-primary py-2 rounded-lg font-bold text-sm text-center">💬 Renovar</a>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'appearance' && (
              <div className="space-y-4">
                <h3 className="text-text-white font-bold text-lg mb-4">Aparência</h3>
                <SettingSelect label="Modo de Interface" value={uiMode} options={[
                  { value: 'tv', label: '📺 Modo TV' },
                  { value: 'mobile', label: '📱 Modo Mobile' },
                ]} onChange={v => setUIMode(v as 'tv' | 'mobile')} />
                <SettingSelect label="Tamanho dos Cards" value={settings.cardSize} options={[
                  { value: 'small', label: 'Pequeno' },
                  { value: 'medium', label: 'Médio' },
                  { value: 'large', label: 'Grande' },
                ]} onChange={v => updateSettings({ cardSize: v as typeof settings.cardSize })} />
                <SettingToggle label="Animações" value={settings.animationsEnabled} onChange={v => updateSettings({ animationsEnabled: v })} />
                <div className="bg-card border border-border rounded-xl p-4">
                  <p className="text-text-gray text-sm mb-2">Tema Ativo</p>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-bg-primary border-2 border-neon-orange" />
                    <span className="text-text-white text-sm font-medium">Escuro Neon</span>
                    <span className="text-active-green text-xs ml-auto">Ativo</span>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'p2p' && (
              <div className="space-y-4">
                <h3 className="text-text-white font-bold text-lg mb-4">P2P (Conteúdo Autorizado)</h3>
                <div className="bg-alert-yellow/5 border border-alert-yellow/20 rounded-xl p-4 mb-4">
                  <p className="text-alert-yellow text-xs leading-relaxed">
                    ⚖️ O recurso P2P funciona apenas com conteúdos autorizados e pode usar parte da sua conexão para melhorar a transmissão.
                  </p>
                </div>
                <SettingToggle label="Ativar P2P" value={settings.p2pEnabled} onChange={v => updateSettings({ p2pEnabled: v })} />
                <SettingToggle label="P2P somente no Wi-Fi" value={settings.p2pWifiOnly} onChange={v => updateSettings({ p2pWifiOnly: v })} />
                <SettingSelect label="Limite de Upload" value={String(settings.p2pUploadLimit)} options={[
                  { value: '256', label: '256 KB/s' },
                  { value: '512', label: '512 KB/s' },
                  { value: '1024', label: '1 MB/s' },
                  { value: '2048', label: '2 MB/s' },
                ]} onChange={v => updateSettings({ p2pUploadLimit: Number(v) })} />
                <button className="w-full bg-card border border-border text-text-gray py-2 rounded-lg text-sm hover:border-neon-orange/50 transition-colors">
                  🗑️ Limpar Cache P2P
                </button>
                <div className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-text-gray text-sm">Status P2P</span>
                    <span className="text-text-gray/40 text-sm">{settings.p2pEnabled ? '🟢 Ativo' : '🔴 Desativado'}</span>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'cache' && (
              <div className="space-y-3">
                <h3 className="text-text-white font-bold text-lg mb-4">Cache e Dados</h3>
                {[
                  { icon: '🗑️', label: 'Limpar Cache', desc: 'Remove arquivos de cache temporários' },
                  { icon: '🔄', label: 'Sincronizar Listas', desc: 'Baixar listas atualizadas do servidor' },
                  { icon: '📡', label: 'Sincronizar EPG', desc: 'Atualizar guia de programação' },
                  { icon: '📊', label: 'Limpar Histórico', desc: 'Remove todo o histórico de visualização' },
                  { icon: '⏱️', label: 'Limpar Progresso', desc: 'Remove progresso dos vídeos' },
                ].map(item => (
                  <button key={item.label} className="w-full bg-card border border-border rounded-xl p-4 flex items-center gap-3 hover:border-neon-orange/50 transition-all text-left">
                    <span className="text-xl">{item.icon}</span>
                    <div>
                      <p className="text-text-white text-sm font-medium">{item.label}</p>
                      <p className="text-text-gray/60 text-xs">{item.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {activeSection === 'about' && (
              <div className="space-y-4">
                <h3 className="text-text-white font-bold text-lg mb-4">Sobre</h3>
                <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-text-gray text-sm">Aplicativo</span>
                    <span className="text-text-white font-bold">RonecaPlayTV</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-gray text-sm">Versão</span>
                    <span className="text-text-white">1.0.0</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-gray text-sm">ID do Dispositivo</span>
                    <span className="text-neon-cyan font-mono text-sm">{deviceCode}</span>
                  </div>
                </div>
                <div className="bg-card border border-border rounded-xl p-4">
                  <h4 className="text-text-white font-medium mb-2">Termos de Uso</h4>
                  <p className="text-text-gray text-xs leading-relaxed">{legalNotice}</p>
                </div>
                <div className="bg-card border border-border rounded-xl p-4">
                  <h4 className="text-text-white font-medium mb-2">Política de Privacidade</h4>
                  <p className="text-text-gray text-xs leading-relaxed">
                    Seus dados são armazenados de forma segura. Não compartilhamos informações pessoais com terceiros.
                    O histórico e favoritos são armazenados apenas no seu dispositivo e sincronizados com sua conta.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </ScrollContainer>

      <BottomNav />
    </AppLayout>
  );
}

// ===== REUSABLE SETTING COMPONENTS =====

function SettingSelect({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (val: string) => void;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <label className="text-text-gray text-xs block mb-2">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-text-white text-sm focus:border-neon-orange focus:outline-none"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function SettingToggle({ label, value, onChange }: {
  label: string;
  value: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
      <span className="text-text-white text-sm">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`w-12 h-6 rounded-full transition-colors ${value ? 'bg-neon-orange' : 'bg-border'} relative`}
      >
        <span className={`absolute top-0.5 ${value ? 'right-0.5' : 'left-0.5'} w-5 h-5 bg-white rounded-full transition-all shadow`} />
      </button>
    </div>
  );
}
