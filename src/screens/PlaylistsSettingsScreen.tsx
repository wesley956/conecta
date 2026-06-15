import { useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { fetchM3UContent } from '@/utils/fetchM3U';
import { AppLayout, Header, StatusBadge, BottomNav } from '@/components/shared';
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
      <div className="clean-tv-page flex h-full flex-col">
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
  const {
    settings,
    updateSettings,
    setScreen,
    deviceCode,
    expiresAt,
    daysRemaining,
    uiMode,
    setUIMode,
  } = useAppStore();

  const [activeSection, setActiveSection] = useState<string>('player');

  const sections = [
    { id: 'player', icon: '▶', label: 'Player', description: 'Reprodução e buffer' },
    { id: 'format', icon: '▤', label: 'Formato', description: 'M3U, Xtream e Stalker' },
    { id: 'language', icon: '🌐', label: 'Linguagem', description: 'Idioma do app' },
    { id: 'subscription', icon: '◷', label: 'Vencimento', description: 'Plano e dias restantes' },
    { id: 'appearance', icon: '◈', label: 'Aparência', description: 'TV ou mobile' },
    { id: 'p2p', icon: '⛓', label: 'P2P', description: 'Conexão distribuída' },
    { id: 'cache', icon: '▣', label: 'Cache', description: 'Memória e limpeza' },
    { id: 'about', icon: 'ⓘ', label: 'Sobre', description: 'Legal e versão' },
  ];

  return (
    <AppLayout>
      <div className="clean-tv-page flex h-full flex-col">
        <Header title="Configurações" showBack onBack={() => setScreen('home')} />

        <main className="grid min-h-0 flex-1 grid-cols-[20rem_1fr] gap-8">
          <aside className="glass-panel rounded-[1.5rem] p-4">
            <div className="mb-5 rounded-2xl border border-neon-orange/25 bg-neon-orange/10 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-neon-orange/80">Dispositivo</p>
              <p className="mt-2 font-mono text-2xl font-black text-text-white">{deviceCode}</p>
              <p className="mt-1 text-xs text-text-gray">Modo atual: {uiMode === 'tv' ? 'TV Box' : 'Mobile'}</p>
            </div>

            <div className="space-y-2">
              {sections.map(section => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-all ${
                    activeSection === section.id
                      ? 'border-neon-orange bg-neon-orange/10 text-neon-orange glow-orange'
                      : 'border-white/10 bg-white/[0.035] text-text-gray hover:border-neon-orange/60 hover:text-text-white'
                  }`}
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-xl">
                    {section.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black">{section.label}</span>
                    <span className="block truncate text-[0.68rem] text-text-gray/65">{section.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <section className="min-h-0 overflow-y-auto pr-2" style={{ maxHeight: 'calc(100vh - 150px)' }}>
            {activeSection === 'player' && (
              <PremiumSection
                title="Player"
                subtitle="Controle como o RonecaPlayTV reproduz canais, filmes e séries."
                icon="▶"
              >
                <div className="grid grid-cols-2 gap-4">
                  <PremiumSelect
                    title="Player preferencial"
                    description="Escolha o motor de reprodução padrão."
                    value={settings.playerType}
                    options={[
                      { value: 'auto', label: 'Automático' },
                      { value: 'native', label: 'Player nativo' },
                      { value: 'vlc', label: 'VLC externo' },
                      { value: 'mxplayer', label: 'MX Player' },
                    ]}
                    onChange={v => updateSettings({ playerType: v as typeof settings.playerType })}
                  />

                  <PremiumSelect
                    title="Decodificação"
                    description="Hardware costuma ser melhor em TV Box."
                    value={settings.decoding}
                    options={[
                      { value: 'auto', label: 'Automático' },
                      { value: 'hardware', label: 'Hardware' },
                      { value: 'software', label: 'Software' },
                    ]}
                    onChange={v => updateSettings({ decoding: v as typeof settings.decoding })}
                  />

                  <PremiumSelect
                    title="Buffer"
                    description="Mais buffer reduz travamentos, mas aumenta atraso."
                    value={settings.bufferSize}
                    options={[
                      { value: 'low', label: 'Baixo' },
                      { value: 'medium', label: 'Médio' },
                      { value: 'high', label: 'Alto' },
                    ]}
                    onChange={v => updateSettings({ bufferSize: v as typeof settings.bufferSize })}
                  />

                  <PremiumToggle
                    title="Reconexão automática"
                    description="Tenta retomar o canal se a transmissão cair."
                    value={settings.autoReconnect}
                    onChange={v => updateSettings({ autoReconnect: v })}
                  />
                </div>
              </PremiumSection>
            )}

            {activeSection === 'format' && (
              <PremiumSection
                title="Formato de lista"
                subtitle="Fontes autorizadas aceitas pelo aplicativo."
                icon="▤"
              >
                <div className="grid grid-cols-2 gap-4">
                  <CapabilityCard title="M3U URL" description="Importação por URL ou conteúdo colado." status="Ativo" />
                  <CapabilityCard title="Canal HLS direto" description="Aceita links .m3u8 como canal único." status="Ativo" />
                  <CapabilityCard title="Xtream Codes" description="Login por servidor, usuário e senha." status="Próxima fase" muted />
                  <CapabilityCard title="Stalker autorizado" description="Portal/mac autorizado pelo provedor." status="Próxima fase" muted />
                </div>
              </PremiumSection>
            )}

            {activeSection === 'language' && (
              <PremiumSection
                title="Linguagem"
                subtitle="Escolha o idioma da interface."
                icon="🌐"
              >
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { value: 'pt', label: '🇧🇷 Português' },
                    { value: 'en', label: '🇺🇸 English' },
                    { value: 'es', label: '🇪🇸 Español' },
                  ].map(option => (
                    <button
                      key={option.value}
                      onClick={() => updateSettings({ language: option.value as typeof settings.language })}
                      className={`premium-card rounded-[1.35rem] p-5 text-left ${
                        settings.language === option.value ? 'selected glow-orange' : ''
                      }`}
                    >
                      <span className="text-3xl">{option.label.split(' ')[0]}</span>
                      <span className="mt-3 block text-lg font-black text-text-white">{option.label.replace(/^.. /, '')}</span>
                      <span className="text-xs text-text-gray">Interface do app</span>
                    </button>
                  ))}
                </div>
              </PremiumSection>
            )}

            {activeSection === 'subscription' && (
              <PremiumSection
                title="Vencimento"
                subtitle="Acompanhe a liberação deste dispositivo."
                icon="◷"
              >
                <div className="grid grid-cols-[1fr_.8fr] gap-5">
                  <div className="premium-card rounded-[1.5rem] p-6">
                    <div className="mb-5 flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-text-gray">Status</p>
                        <h3 className="mt-1 text-3xl font-black text-text-white">Plano ativo</h3>
                      </div>
                      <StatusBadge status={daysRemaining > 0 ? 'active' : 'expired'} />
                    </div>

                    <div className="mb-5 grid grid-cols-2 gap-4">
                      <InfoTile label="Vencimento" value={expiresAt} />
                      <InfoTile label="Dias restantes" value={`${daysRemaining}`} highlight={daysRemaining <= 7} />
                    </div>

                    <div className="mb-5 h-3 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-active-green via-alert-yellow to-neon-orange"
                        style={{ width: `${Math.max(8, Math.min(100, daysRemaining * 3))}%` }}
                      />
                    </div>

                    <div className="flex gap-3">
                      <button className="btn-neon flex-1">Sincronizar acesso</button>
                      <a
                        href="https://wa.me/5511999999999"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 rounded-xl border border-active-green/35 bg-active-green/12 px-4 py-3 text-center text-sm font-black text-active-green hover:bg-active-green/18"
                      >
                        Renovar no WhatsApp
                      </a>
                    </div>
                  </div>

                  <div className="glass-panel rounded-[1.5rem] p-6">
                    <p className="text-xs uppercase tracking-[0.3em] text-neon-cyan/80">Resumo</p>
                    <h3 className="mt-2 text-2xl font-black text-text-white">Dispositivo liberado</h3>
                    <p className="mt-3 text-sm leading-relaxed text-text-gray">
                      Este painel é local/demo por enquanto. A liberação real por cliente, plano e aparelho entra na fase backend.
                    </p>
                  </div>
                </div>
              </PremiumSection>
            )}

            {activeSection === 'appearance' && (
              <PremiumSection
                title="Aparência"
                subtitle="Ajuste o layout para TV Box ou celular."
                icon="◈"
              >
                <div className="grid grid-cols-2 gap-4">
                  <ModeCard
                    title="Modo TV Box"
                    description="Cards maiores, controle remoto e distância de sofá."
                    icon="📺"
                    selected={uiMode === 'tv'}
                    onClick={() => setUIMode('tv')}
                  />
                  <ModeCard
                    title="Modo Mobile"
                    description="Layout compacto com navegação inferior."
                    icon="📱"
                    selected={uiMode === 'mobile'}
                    onClick={() => setUIMode('mobile')}
                  />
                </div>
              </PremiumSection>
            )}

            {activeSection === 'p2p' && (
              <PremiumSection
                title="P2P"
                subtitle="Configurações planejadas para distribuição autorizada."
                icon="⛓"
              >
                <div className="grid grid-cols-2 gap-4">
                  <PremiumToggle
                    title="P2P autorizado"
                    description="Modo reservado para provedores compatíveis."
                    value={settings.p2pEnabled}
                    onChange={v => updateSettings({ p2pEnabled: v })}
                  />
                  <CapabilityCard title="Proteção legal" description="Sem burlar DRM, sem redistribuir conteúdo não autorizado." status="Obrigatório" />
                </div>
              </PremiumSection>
            )}

            {activeSection === 'cache' && (
              <PremiumSection
                title="Cache"
                subtitle="Limpeza e otimização local."
                icon="▣"
              >
                <div className="grid grid-cols-2 gap-4">
                  <CapabilityCard title="Cache de listas" description="Guarda listas importadas no dispositivo." status="Ativo" />
                  <CapabilityCard title="Histórico local" description="Continua de onde parou." status="Ativo" />
                  <button className="premium-card rounded-[1.35rem] p-5 text-left">
                    <span className="text-3xl">🧹</span>
                    <span className="mt-3 block text-lg font-black text-text-white">Limpar cache</span>
                    <span className="text-xs text-text-gray">Em breve com confirmação segura.</span>
                  </button>
                </div>
              </PremiumSection>
            )}

            {activeSection === 'about' && (
              <PremiumSection
                title="Sobre"
                subtitle="Informações do RonecaPlayTV."
                icon="ⓘ"
              >
                <div className="premium-card rounded-[1.5rem] p-6">
                  <h3 className="text-3xl font-black text-text-white">
                    <span className="text-neon-orange">Roneca</span>PlayTV
                  </h3>
                  <p className="mt-3 max-w-3xl text-sm leading-relaxed text-text-gray">
                    Player legal para listas e fontes autorizadas. O app não fornece canais, filmes, séries ou listas. 
                    O usuário/provedor é responsável por usar apenas conteúdo permitido.
                  </p>
                  <div className="mt-5 grid grid-cols-3 gap-4">
                    <InfoTile label="Versão" value="0.1.0" />
                    <InfoTile label="Build" value="Singlefile" />
                    <InfoTile label="Modo" value={uiMode === 'tv' ? 'TV' : 'Mobile'} />
                  </div>
                </div>
              </PremiumSection>
            )}
          </section>
        </main>

        <BottomNav />
      </div>
    </AppLayout>
  );
}

function PremiumSection({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center gap-4">
        <span className="flex h-20 w-20 items-center justify-center rounded-[1.35rem] border border-neon-orange/35 bg-neon-orange/10 text-4xl text-neon-orange glow-orange">
          {icon}
        </span>
        <div>
          <p className="text-sm uppercase tracking-[0.34em] text-neon-cyan/75">Configuração</p>
          <h2 className="text-4xl font-black text-text-white">{title}</h2>
          <p className="mt-1 text-text-gray">{subtitle}</p>
        </div>
      </div>

      {children}
    </div>
  );
}

function PremiumSelect({
  title,
  description,
  value,
  options,
  onChange,
}: {
  title: string;
  description: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="premium-card rounded-[1.35rem] p-5">
      <h3 className="text-lg font-black text-text-white">{title}</h3>
      <p className="mt-1 text-xs text-text-gray">{description}</p>

      <div className="mt-4 grid gap-2">
        {options.map(option => (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={`rounded-xl border px-4 py-3 text-left text-sm font-bold transition-all ${
              value === option.value
                ? 'border-neon-orange bg-neon-orange/12 text-neon-orange'
                : 'border-white/10 bg-white/[0.035] text-text-gray hover:border-neon-orange/60 hover:text-text-white'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function PremiumToggle({
  title,
  description,
  value,
  onChange,
}: {
  title: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`premium-card rounded-[1.35rem] p-5 text-left ${value ? 'selected glow-orange' : ''}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-black text-text-white">{title}</h3>
          <p className="mt-1 text-xs text-text-gray">{description}</p>
        </div>

        <span className={`relative h-8 w-14 rounded-full border transition-all ${
          value ? 'border-neon-orange bg-neon-orange/25' : 'border-white/10 bg-white/10'
        }`}>
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${
            value ? 'left-7 bg-neon-orange' : 'left-1'
          }`} />
        </span>
      </div>

      <p className={`mt-5 text-sm font-black ${value ? 'text-neon-orange' : 'text-text-gray'}`}>
        {value ? 'Ativado' : 'Desativado'}
      </p>
    </button>
  );
}

function CapabilityCard({
  title,
  description,
  status,
  muted,
}: {
  title: string;
  description: string;
  status: string;
  muted?: boolean;
}) {
  return (
    <div className={`premium-card rounded-[1.35rem] p-5 ${muted ? 'opacity-70' : ''}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-lg font-black text-text-white">{title}</h3>
        <span className={`rounded-full border px-3 py-1 text-[0.68rem] font-black ${
          muted
            ? 'border-alert-yellow/25 bg-alert-yellow/10 text-alert-yellow'
            : 'border-active-green/25 bg-active-green/10 text-active-green'
        }`}>
          {status}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-text-gray">{description}</p>
    </div>
  );
}

function ModeCard({
  title,
  description,
  icon,
  selected,
  onClick,
}: {
  title: string;
  description: string;
  icon: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className={`premium-card rounded-[1.35rem] p-6 text-left ${selected ? 'selected glow-orange' : ''}`}>
      <span className="text-5xl">{icon}</span>
      <h3 className="mt-5 text-2xl font-black text-text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-text-gray">{description}</p>
      <p className={`mt-5 text-sm font-black ${selected ? 'text-neon-orange' : 'text-text-gray'}`}>
        {selected ? 'Selecionado' : 'Selecionar'}
      </p>
    </button>
  );
}

function InfoTile({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-[0.68rem] uppercase tracking-[0.24em] text-text-gray/65">{label}</p>
      <p className={`mt-2 text-xl font-black ${highlight ? 'text-alert-yellow' : 'text-text-white'}`}>{value}</p>
    </div>
  );
}
