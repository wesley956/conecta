import { useMemo } from 'react';
import { useAppStore } from '@/stores/appStore';
import { AppLayout, BottomNav } from '@/components/shared';

export function HomeScreen() {
  const {
    setScreen,
    channels,
    movies,
    series,
    playlists,
    deviceCode,
    daysRemaining,
  } = useAppStore();

  const today = useMemo(() => {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date());
  }, []);

  const menuItems = [
    { icon: '▣', title: 'TV ao vivo', subtitle: `${channels.length} canais`, action: () => setScreen('channels') },
    { icon: '▷', title: 'Filmes', subtitle: `${movies.length} títulos`, action: () => setScreen('movies') },
    { icon: '▤', title: 'Séries', subtitle: `${series.length} séries`, action: () => setScreen('series') },
    { icon: '◷', title: 'Playback', subtitle: 'Continue assistindo', action: () => setScreen('favorites') },
    { icon: '◇', title: 'Configurações', subtitle: 'Sistema e listas', action: () => setScreen('settings') },
  ];

  const quickStats = [
    { label: 'Listas', value: playlists.length },
    { label: 'Canais', value: channels.length },
    { label: 'Filmes', value: movies.length },
    { label: 'Séries', value: series.length },
  ];

  return (
    <AppLayout>
      <div className="clean-tv-page flex h-full flex-col px-14 py-8">
        <BottomNav />

        <header className="mb-14 flex items-center gap-12 text-white/55">
          <div className="flex items-center gap-3">
            <span className="text-3xl text-[#2396f2]">⌾</span>
            <span className="text-2xl font-light">{deviceCode || 'RonecaPlayTV'}</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-3xl text-[#2396f2]">▣</span>
            <span className="text-2xl font-light">{today}</span>
          </div>

          <div className="ml-auto text-right">
            <p className="text-sm uppercase tracking-[0.28em] text-white/35">Acesso</p>
            <p className="text-xl font-light text-white/70">
              {daysRemaining > 0 ? `${daysRemaining} dias restantes` : 'Verificar liberação'}
            </p>
          </div>
        </header>

        <main className="grid flex-1 grid-cols-[360px_1fr] gap-12">
          <section>
            <h1 className="clean-tv-title mb-8 text-5xl">Início</h1>

            <div className="space-y-2">
              {menuItems.map((item, index) => (
                <button
                  key={item.title}
                  onClick={item.action}
                  className={`clean-tv-row flex w-full items-center gap-5 px-7 py-5 text-left ${
                    index === 0 ? 'active' : ''
                  }`}
                >
                  <span className="w-12 text-4xl">{item.icon}</span>
                  <span>
                    <span className="block text-3xl font-light">{item.title}</span>
                    <span className="block text-base opacity-65">{item.subtitle}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="pt-14">
            <h2 className="clean-tv-title mb-8 text-4xl">Resumo</h2>

            <div className="mb-14 grid max-w-4xl grid-cols-4 gap-5">
              {quickStats.map(stat => (
                <div key={stat.label} className="clean-tv-tile rounded-md px-6 py-5">
                  <p className="text-lg font-light opacity-70">{stat.label}</p>
                  <p className="mt-2 text-4xl font-light text-white">{stat.value}</p>
                </div>
              ))}
            </div>

            <h2 className="clean-tv-title mb-7 text-4xl">Acesso rápido</h2>

            <div className="grid max-w-5xl grid-cols-3 gap-5">
              <button onClick={() => setScreen('channels')} className="clean-tv-tile active rounded-md p-7 text-left">
                <p className="text-5xl">▣</p>
                <p className="mt-6 text-3xl font-light">Assistir TV</p>
                <p className="mt-2 text-lg opacity-65">Abrir canais ao vivo</p>
              </button>

              <button onClick={() => setScreen('playlists')} className="clean-tv-tile rounded-md p-7 text-left">
                <p className="text-5xl">▤</p>
                <p className="mt-6 text-3xl font-light">Listas</p>
                <p className="mt-2 text-lg opacity-65">Gerenciar fontes</p>
              </button>

              <button onClick={() => setScreen('settings')} className="clean-tv-tile rounded-md p-7 text-left">
                <p className="text-5xl">◇</p>
                <p className="mt-6 text-3xl font-light">Sistema</p>
                <p className="mt-2 text-lg opacity-65">Ajustes do app</p>
              </button>
            </div>
          </section>
        </main>
      </div>
    </AppLayout>
  );
}
