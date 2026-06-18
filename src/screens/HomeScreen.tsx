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

  const quickStats = [
    { label: 'Listas', value: playlists.length },
    { label: 'Canais', value: channels.length },
    { label: 'Filmes', value: movies.length },
    { label: 'Séries', value: series.length },
  ];

  const quickActions = [
    { icon: '▣', title: 'Assistir TV', subtitle: 'Abrir canais ao vivo', action: () => setScreen('channels') },
    { icon: '▶', title: 'Filmes', subtitle: 'Catálogo de filmes', action: () => setScreen('movies') },
    { icon: '☰', title: 'Listas', subtitle: 'Gerenciar fontes', action: () => setScreen('playlists') },
  ];

  return (
    <AppLayout>
      <div className="clean-tv-page roneca-page">
        <BottomNav />

        <header className="roneca-topbar">
          <div>
            <p className="roneca-eyebrow">RonecaPlayTV</p>
            <h1 className="roneca-page-title">Início</h1>
          </div>

          <div className="roneca-topbar-info">
            <span>{deviceCode || 'RonecaPlayTV'}</span>
            <span>{today}</span>
            <span>{daysRemaining > 0 ? `${daysRemaining} dias` : 'Verificar acesso'}</span>
          </div>
        </header>

        <main className="roneca-home-grid">
          <section className="roneca-hero-card">
            <p className="roneca-eyebrow">Sua central</p>
            <h2>TV, filmes e listas em um só lugar.</h2>
            <p>
              Use o menu lateral para navegar. A lista autorizada fica salva no app e carrega TV e filmes de forma rápida.
            </p>

            <div className="roneca-hero-actions">
              <button onClick={() => setScreen('channels')} className="roneca-primary-action">
                Assistir TV
              </button>
              <button onClick={() => setScreen('movies')} className="roneca-secondary-action">
                Ver filmes
              </button>
            </div>
          </section>

          <section>
            <h2 className="roneca-section-title">Resumo</h2>
            <div className="roneca-stats-grid">
              {quickStats.map(stat => (
                <div key={stat.label} className="roneca-stat-card">
                  <p>{stat.label}</p>
                  <strong>{stat.value}</strong>
                </div>
              ))}
            </div>

            <h2 className="roneca-section-title roneca-section-gap">Acesso rápido</h2>
            <div className="roneca-actions-grid">
              {quickActions.map(action => (
                <button key={action.title} onClick={action.action} className="roneca-action-card">
                  <span>{action.icon}</span>
                  <strong>{action.title}</strong>
                  <small>{action.subtitle}</small>
                </button>
              ))}
            </div>
          </section>
        </main>
      </div>
    </AppLayout>
  );
}
