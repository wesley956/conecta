import { useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { AppLayout, BottomNav } from '@/components/shared';
import { fetchM3UContent } from '@/utils/fetchM3U';

// ===== PLAYLISTS SCREEN =====
export function PlaylistsScreen() {
  const {
    playlists,
    setScreen,
    importM3UPlaylist,
    addDirectStreamChannel,
  } = useAppStore();

  const [showAdd, setShowAdd] = useState(false);
  const [playlistName, setPlaylistName] = useState('');
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [m3uContent, setM3uContent] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setPlaylistName('');
    setPlaylistUrl('');
    setM3uContent('');
  };

  const handleAdd = async () => {
    setMessage(null);
    setError(null);

    const url = playlistUrl.trim();
    const pasted = m3uContent.trim();

    if (!url && !pasted) {
      setError('Informe uma URL M3U ou cole o conteúdo da lista.');
      return;
    }

    if (url && !/^https?:\/\//i.test(url)) {
      setError('A URL precisa começar com http:// ou https://');
      return;
    }

    if (url.startsWith('http://') && window.location.protocol === 'https:') {
      setError('URL HTTP bloqueada pelo navegador em HTTPS. Use HTTPS ou cole o conteúdo M3U manualmente.');
      return;
    }

    setIsAdding(true);

    try {
      const isDirectStream = /\.(m3u8|mpd)(\?|#|$)/i.test(url);
      let result;

      if (isDirectStream && !pasted) {
        result = addDirectStreamChannel(playlistName || 'Canal direto', url);
      } else {
        const content = pasted || await fetchM3UContent(url);
        result = importM3UPlaylist(playlistName || 'Lista M3U', url, content);
      }

      setMessage(`${result.imported} canal(is) importado(s).`);
      reset();
      setShowAdd(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível adicionar a lista.');
    } finally {
      setIsAdding(false);
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

          <h1 className="clean-tv-title mb-8 text-5xl">Listas</h1>

          <div className="space-y-1">
            <button
              onClick={() => setShowAdd(false)}
              className={`clean-tv-row active flex w-full items-center gap-4 px-5 py-4 text-left`}
            >
              <span className="w-8 text-2xl">▤</span>
              <span className="text-2xl font-light">Minhas listas</span>
            </button>

            <button
              onClick={() => setShowAdd(true)}
              className="clean-tv-row flex w-full items-center gap-4 px-5 py-4 text-left"
            >
              <span className="w-8 text-2xl">＋</span>
              <span className="text-2xl font-light">Adicionar lista</span>
            </button>

            <button
              onClick={() => setScreen('settings')}
              className="clean-tv-row flex w-full items-center gap-4 px-5 py-4 text-left"
            >
              <span className="w-8 text-2xl">◇</span>
              <span className="text-2xl font-light">Configurações</span>
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          {showAdd ? (
            <section className="max-w-4xl">
              <h2 className="clean-tv-title mb-8 text-4xl">Adicionar lista</h2>

              {error && <Notice tone="error">{error}</Notice>}
              {message && <Notice tone="success">{message}</Notice>}

              <div className="space-y-5">
                <label className="block">
                  <span className="mb-2 block text-xl font-light text-white/58">Nome da lista</span>
                  <input
                    value={playlistName}
                    onChange={e => setPlaylistName(e.target.value)}
                    placeholder="Minha lista"
                    className="w-full border-b border-white/15 bg-transparent px-1 py-4 text-3xl font-light text-white outline-none placeholder:text-white/25 focus:border-[#2396f2]"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xl font-light text-white/58">URL M3U autorizada</span>
                  <input
                    value={playlistUrl}
                    onChange={e => setPlaylistUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full border-b border-white/15 bg-transparent px-1 py-4 text-3xl font-light text-white outline-none placeholder:text-white/25 focus:border-[#2396f2]"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xl font-light text-white/58">Conteúdo M3U manual</span>
                  <textarea
                    value={m3uContent}
                    onChange={e => setM3uContent(e.target.value)}
                    rows={7}
                    placeholder="#EXTM3U"
                    className="w-full resize-none rounded-md bg-white/[0.045] px-5 py-4 font-mono text-base text-white outline-none placeholder:text-white/25 focus:ring-1 focus:ring-[#2396f2]"
                  />
                </label>

                <div className="flex gap-4 pt-4">
                  <button
                    onClick={handleAdd}
                    disabled={isAdding}
                    className="rounded-md bg-[#2396f2] px-10 py-4 text-2xl font-light text-white disabled:opacity-45"
                  >
                    {isAdding ? 'Adicionando...' : 'Adicionar'}
                  </button>

                  <button
                    onClick={() => setShowAdd(false)}
                    className="rounded-md bg-white/[0.055] px-10 py-4 text-2xl font-light text-white/65 hover:text-white"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <section>
              <h2 className="clean-tv-title mb-8 text-4xl">Minhas listas</h2>

              {message && <Notice tone="success">{message}</Notice>}
              {error && <Notice tone="error">{error}</Notice>}

              <div className="max-w-5xl space-y-1">
                {playlists.map((playlist, index) => (
                  <div
                    key={playlist.id}
                    className={`flex items-center justify-between px-6 py-5 ${
                      index === 0 ? 'bg-[#2396f2] text-white' : 'text-white/62 hover:bg-white/[0.055] hover:text-white'
                    }`}
                  >
                    <div>
                      <p className="text-3xl font-light">{playlist.name}</p>
                      <p className="mt-1 text-base opacity-55">
                        {playlist.type.toUpperCase()} • Sync: {playlist.lastSync}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-2xl font-light">{playlist.channelCount} canais</p>
                      <p className="mt-1 text-base opacity-55">
                        {playlist.movieCount} filmes • {playlist.seriesCount} séries
                      </p>
                    </div>
                  </div>
                ))}

                {playlists.length === 0 && (
                  <div className="clean-tv-tile max-w-[460px] rounded-md p-7">
                    <p className="text-4xl">▤</p>
                    <p className="mt-4 text-3xl font-light">Nenhuma lista adicionada</p>
                    <p className="mt-2 text-lg opacity-55">Adicione uma fonte autorizada para começar.</p>
                  </div>
                )}
              </div>
            </section>
          )}
        </main>
      </div>
    </AppLayout>
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

  const [activeSection, setActiveSection] = useState<'player' | 'list' | 'language' | 'appearance' | 'device' | 'about'>('player');

  const sections = [
    { id: 'player' as const, icon: '▷', label: 'Player' },
    { id: 'list' as const, icon: '▤', label: 'Lista' },
    { id: 'language' as const, icon: '◎', label: 'Idioma' },
    { id: 'appearance' as const, icon: '◇', label: 'Aparência' },
    { id: 'device' as const, icon: '▣', label: 'Dispositivo' },
    { id: 'about' as const, icon: 'ⓘ', label: 'Sobre' },
  ];

  const title = sections.find(section => section.id === activeSection)?.label ?? 'Configurações';

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

          {activeSection === 'list' && (
            <div className="max-w-5xl divide-y divide-white/10">
              <SettingRow label="Gerenciar listas" value="Abrir">
                <button
                  onClick={() => setScreen('playlists')}
                  className="rounded-md bg-[#2396f2] px-7 py-3 text-xl font-light text-white"
                >
                  Abrir listas
                </button>
              </SettingRow>

              <SettingRow label="Importação M3U" value="Ativa" />
              <SettingRow label="Fontes autorizadas" value="Obrigatório" />
              <SettingRow label="HTTP em HTTPS" value="Bloqueado pelo navegador" />
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
                RonecaPlayTV é um player legal para fontes autorizadas.
              </p>

              <div className="divide-y divide-white/10">
                <SettingRow label="Aplicativo" value="RonecaPlayTV" />
                <SettingRow label="Tipo" value="Player IPTV/P2P" />
                <SettingRow label="Conteúdo incluso" value="Não fornece conteúdo" />
                <SettingRow label="Uso correto" value="Somente listas autorizadas" />
              </div>

              <p className="mt-10 text-lg font-light leading-relaxed text-white/42">
                O app não fornece canais, filmes, séries, listas piratas, desbloqueio de conteúdo pago, DRM bypass ou qualquer conteúdo sem autorização.
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

function Notice({ children, tone }: { children: React.ReactNode; tone: 'success' | 'error' }) {
  return (
    <div className={`mb-6 max-w-4xl rounded-md px-5 py-4 text-xl font-light ${
      tone === 'success' ? 'bg-[#28d850]/15 text-[#8fffa8]' : 'bg-red-500/15 text-red-200'
    }`}>
      {children}
    </div>
  );
}
