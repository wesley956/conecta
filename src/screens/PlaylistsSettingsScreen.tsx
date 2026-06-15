import { useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { fetchM3UContent } from '@/utils/fetchM3U';
import { AppLayout, Header, StatusBadge, ScrollContainer, BottomNav } from '@/components/shared';
import type { Playlist } from '@/types';

// ===== PLAYLISTS SCREEN =====
export function PlaylistsScreen() {
  const { playlists, setScreen, importM3UPlaylist, addDirectStreamChannel } = useAppStore();
  const [showAdd, setShowAdd] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(playlists[0]?.id ?? null);
  const [playlistName, setPlaylistName] = useState('');
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [m3uContent, setM3uContent] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedPlaylist = playlists.find(pl => pl.id === selectedId) ?? playlists[0] ?? null;

  const resetForm = () => {
    setPlaylistName('');
    setPlaylistUrl('');
    setM3uContent('');
  };

  const handleAddPlaylist = async () => {
    setMessage(null);
    setError(null);

    const url = playlistUrl.trim();
    let content = m3uContent.trim();

    if (!url && !content) {
      setError('Informe uma URL de lista/canal ou cole o conteúdo M3U.');
      return;
    }

    if (url && !/^https?:\/\//i.test(url)) {
      setError('A URL precisa começar com http:// ou https://');
      return;
    }

    setIsAdding(true);

    try {
      const isDirectStream = /\.(m3u8|mpd)(\?|#|$)/i.test(url);

      let result: { imported: number; skipped: number };

      if (!content && url && isDirectStream) {
        result = addDirectStreamChannel(playlistName, url);
      } else {
        if (!content && url) {
          content = await fetchM3UContent(url);
        }

        result = importM3UPlaylist(playlistName, url, content);
      }

      setMessage(`Lista adicionada: ${result.imported} item(ns) importado(s)${result.skipped ? `, ${result.skipped} ignorado(s)` : ''}.`);
      resetForm();
      setShowAdd(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível adicionar a lista.'
      );
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <AppLayout>
      <div className="flex h-full flex-col">
        <Header title="Listas de Reprodução" showBack onBack={() => setScreen('home')} />

        <main className="grid min-h-0 flex-1 grid-cols-[1.35fr_.8fr] gap-8">
          <section className="min-h-0">
            <div className="mb-5 flex items-end justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.34em] text-neon-cyan/75">Gerenciamento</p>
                <h2 className="text-3xl font-black text-text-white">Listas autorizadas</h2>
              </div>
              <span className="rounded-full border border-active-green/25 bg-active-green/10 px-3 py-1 text-xs font-bold text-active-green">
                {playlists.length} ativa{playlists.length !== 1 ? 's' : ''}
              </span>
            </div>

            {message && (
              <div className="mb-4 rounded-2xl border border-active-green/25 bg-active-green/10 px-4 py-3 text-sm text-active-green">
                {message}
              </div>
            )}

            {error && (
              <div className="mb-4 rounded-2xl border border-error-red/25 bg-error-red/10 px-4 py-3 text-sm text-error-red">
                {error}
              </div>
            )}

            {showAdd && (
              <div className="mb-5 rounded-[1.35rem] premium-card p-5 animate-scale-in">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-black text-text-white">Adicionar nova lista</h3>
                    <p className="text-xs text-text-gray">M3U autorizada ou canal HLS direto</p>
                  </div>
                  <button onClick={() => setShowAdd(false)} className="text-text-gray hover:text-white">✕</button>
                </div>

                <div className="grid gap-3">
                  <input
                    value={playlistName}
                    onChange={e => setPlaylistName(e.target.value)}
                    placeholder="Nome da lista"
                    className="input-dark w-full"
                  />

                  <input
                    value={playlistUrl}
                    onChange={e => setPlaylistUrl(e.target.value)}
                    placeholder="https://exemplo-autorizado.com/lista.m3u ou canal.m3u8"
                    className="input-dark w-full"
                  />

                  <textarea
                    value={m3uContent}
                    onChange={e => setM3uContent(e.target.value)}
                    rows={6}
                    placeholder={'Opcional: cole o conteúdo M3U aqui\n#EXTM3U\n#EXTINF:-1 group-title="Abertos",Canal Demo\nhttps://exemplo.com/canal.m3u8'}
                    className="input-dark w-full resize-y font-mono text-xs"
                  />

                  <div className="flex gap-3">
                    <button
                      onClick={handleAddPlaylist}
                      disabled={isAdding}
                      className="btn-neon flex-1 disabled:opacity-50"
                    >
                      {isAdding ? 'Adicionando...' : 'Adicionar Lista'}
                    </button>
                    <button
                      onClick={() => {
                        resetForm();
                        setShowAdd(false);
                      }}
                      className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-text-gray hover:border-neon-orange/60 hover:text-white"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>

                <p className="mt-3 text-[0.68rem] text-alert-yellow">
                  ⚠️ Use apenas listas e fontes autorizadas. O app não fornece canais, filmes, séries ou listas.
                </p>
              </div>
            )}

            <div className="min-h-0 space-y-4 overflow-y-auto pr-2" style={{ maxHeight: 'calc(100vh - 220px)' }}>
              {playlists.map((playlist, index) => (
                <PlaylistPremiumRow
                  key={playlist.id}
                  playlist={playlist}
                  index={index}
                  selected={selectedPlaylist?.id === playlist.id}
                  onClick={() => setSelectedId(playlist.id)}
                />
              ))}
            </div>
          </section>

          <aside className="min-h-0">
            <div className="glass-panel sticky top-0 rounded-[1.5rem] p-6">
              <h3 className="mb-5 text-2xl font-black text-text-white">Opções da lista</h3>

              {selectedPlaylist ? (
                <>
                  <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <div className="mb-3 flex items-center gap-3">
                      <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-neon-cyan/25 bg-neon-cyan/10 text-3xl">
                        {selectedPlaylist.type === 'm3u' ? '📺' : '🔗'}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-lg font-black text-text-white">{selectedPlaylist.name}</p>
                        <p className="text-xs uppercase tracking-wider text-text-gray">{selectedPlaylist.type.toUpperCase()}</p>
                      </div>
                    </div>

                    <div className="mb-2 flex items-center justify-between text-xs text-text-gray">
                      <span>Sincronização</span>
                      <span>{selectedPlaylist.channelCount} canais</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full w-full rounded-full bg-gradient-to-r from-active-green via-alert-yellow to-neon-orange" />
                    </div>
                    <p className="mt-2 text-[0.68rem] text-text-gray/70">Última sync: {selectedPlaylist.lastSync}</p>
                  </div>

                  <div className="space-y-3">
                    <button className="premium-card flex w-full items-center gap-4 rounded-2xl p-4 text-left hover:selected">
                      <span className="text-3xl text-neon-cyan">✎</span>
                      <span>
                        <span className="block text-lg font-bold text-text-white">Editar lista</span>
                        <span className="text-xs text-text-gray">Alterar nome, URL ou formato</span>
                      </span>
                    </button>

                    <button className="premium-card flex w-full items-center gap-4 rounded-2xl p-4 text-left">
                      <span className="text-3xl text-active-green">✓</span>
                      <span>
                        <span className="block text-lg font-bold text-text-white">Testar lista</span>
                        <span className="text-xs text-text-gray">Validar canais e conexão</span>
                      </span>
                    </button>

                    <button className="premium-card flex w-full items-center gap-4 rounded-2xl p-4 text-left">
                      <span className="text-3xl text-error-red">🗑</span>
                      <span>
                        <span className="block text-lg font-bold text-text-white">Remover lista</span>
                        <span className="text-xs text-text-gray">Excluir desta instalação</span>
                      </span>
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-text-gray">Nenhuma lista selecionada.</p>
              )}

              <button
                onClick={() => setShowAdd(true)}
                className="mt-6 flex h-36 w-full flex-col items-center justify-center rounded-[1.35rem] border border-white/12 bg-white/[0.04] text-text-white transition-all hover:border-neon-orange hover:bg-neon-orange/10 hover:text-neon-orange"
              >
                <span className="text-6xl leading-none">＋</span>
                <span className="mt-2 text-lg font-black uppercase">Adicionar nova lista</span>
              </button>
            </div>
          </aside>
        </main>

        <BottomNav />
      </div>
    </AppLayout>
  );
}

function PlaylistPremiumRow({
  playlist,
  index,
  selected,
  onClick,
}: {
  playlist: Playlist;
  index: number;
  selected: boolean;
  onClick: () => void;
}) {
  const icon = index % 3 === 0 ? '📺' : index % 3 === 1 ? '🎬' : '⚽';

  return (
    <button
      onClick={onClick}
      className={`premium-card flex w-full items-center gap-5 rounded-[1.35rem] p-5 text-left transition-all duration-300 ${
        selected ? 'selected glow-orange' : ''
      }`}
    >
      <span className={`flex h-20 w-20 items-center justify-center rounded-2xl border text-4xl ${
        selected
          ? 'border-neon-orange/60 bg-neon-orange/12 text-neon-orange'
          : 'border-neon-cyan/25 bg-neon-cyan/8 text-neon-cyan'
      }`}>
        {icon}
      </span>

      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-center justify-between gap-4">
          <h3 className="truncate text-xl font-black text-text-white">
            {index + 1}. {playlist.name}
          </h3>
          <span className="text-sm font-bold text-text-white/80">{playlist.channelCount} canais</span>
        </div>

        <p className="mb-3 truncate text-sm text-text-gray">
          Status: {playlist.status === 'active' ? 'Ativo' : playlist.status} • {playlist.type.toUpperCase()}
        </p>

        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div className={`h-full rounded-full ${
            selected ? 'w-[88%] bg-gradient-to-r from-neon-orange to-alert-yellow' : 'w-[70%] bg-gradient-to-r from-neon-cyan to-active-green'
          }`} />
        </div>
      </div>
    </button>
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
