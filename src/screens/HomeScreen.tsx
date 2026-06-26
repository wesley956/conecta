import { useMemo } from 'react';
import { useAppStore } from '@/stores/appStore';
import { AppLayout, BottomNav } from '@/components/shared';
import { Tv, Film, Library, Star } from 'lucide-react';

export function HomeScreen() {
  const {
    setScreen,
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


  const quickActions = [
    { icon: <Tv aria-hidden="true" size={30} strokeWidth={2.4} />, title: 'Assistir TV', subtitle: 'Abrir canais ao vivo', action: () => setScreen('channels') },
    { icon: <Film aria-hidden="true" size={30} strokeWidth={2.4} />, title: 'Filmes', subtitle: 'Catálogo de filmes', action: () => setScreen('movies') },
    { icon: <Library aria-hidden="true" size={30} strokeWidth={2.4} />, title: 'Séries', subtitle: 'Catálogo de séries', action: () => setScreen('series') },
    { icon: <Star aria-hidden="true" size={30} strokeWidth={2.4} />, title: 'Favoritos', subtitle: 'Seus conteúdos salvos', action: () => setScreen('favorites') },
  ];

  return (
    <AppLayout>
      <div className="clean-tv-page roneca-page h-full overflow-y-auto">
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
            <h2 className="roneca-section-title">Acesso rápido</h2>
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
