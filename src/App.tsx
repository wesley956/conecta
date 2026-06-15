import { Clapperboard, Film, ListVideo, MonitorPlay, Search, Settings, ShieldCheck, Tv } from 'lucide-react';

const cards = [
  {
    title: 'Canais ao vivo',
    description: 'Grade visual para canais IPTV autorizados, categorias, favoritos e EPG.',
    icon: <Tv size={34} />,
  },
  {
    title: 'Filmes',
    description: 'Área VOD preparada para capas, sinopse, progresso e continuar assistindo.',
    icon: <Film size={34} />,
  },
  {
    title: 'Séries',
    description: 'Temporadas, episódios, histórico e retomada de reprodução.',
    icon: <Clapperboard size={34} />,
  },
  {
    title: 'Listas',
    description: 'Base para M3U, Xtream Codes e fontes autorizadas pelo administrador.',
    icon: <ListVideo size={34} />,
  },
  {
    title: 'Busca',
    description: 'Busca unificada para canais, filmes, séries e categorias.',
    icon: <Search size={34} />,
  },
  {
    title: 'Configurações',
    description: 'Player, vencimento, cache, aparência, P2P autorizado e informações do app.',
    icon: <Settings size={34} />,
  },
];

export function App() {
  return (
    <main className="roneca-shell">
      <header className="roneca-topbar">
        <div className="roneca-logo" aria-label="RonecaPlayTV">
          <div className="roneca-logo-mark">
            <MonitorPlay size={27} color="#ff7a1a" />
          </div>
          <div>
            <div>RonecaPlayTV</div>
            <small style={{ color: '#00E6E6', letterSpacing: '0.18em' }}>IPTV / P2P LEGAL</small>
          </div>
        </div>
        <div className="roneca-status">Protótipo inicial • Android • TV Box • Android TV</div>
      </header>

      <section className="roneca-hero">
        <div className="roneca-hero-content">
          <div className="roneca-eyebrow">Novo projeto conectado ao GitHub</div>
          <h1 className="roneca-title">
            Player escuro neon para <span>IPTV autorizado</span> e TV Box.
          </h1>
          <p className="roneca-description">
            Esta é a base inicial do RonecaPlayTV: visual escuro, foco em controle remoto,
            cards grandes para TV, fluxo de assinatura por dispositivo e arquitetura preparada
            para player HLS, painel admin, APK Android e P2P somente com conteúdo autorizado.
          </p>
        </div>
      </section>

      <section className="roneca-grid" aria-label="Módulos do aplicativo">
        {cards.map((card) => (
          <button className="roneca-card" key={card.title} type="button">
            <div className="roneca-card-icon">{card.icon}</div>
            <h2>{card.title}</h2>
            <p>{card.description}</p>
          </button>
        ))}
      </section>

      <footer className="roneca-footer">
        <span>Próxima fase: importar o ZIP completo ou implementar PlayerScreen + M3U parser.</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <ShieldCheck size={18} color="#31D67B" /> Uso apenas com listas e fontes autorizadas.
        </span>
      </footer>
    </main>
  );
}
