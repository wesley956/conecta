import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { AppLayout, BottomNav, ProgressBar } from '@/components/shared';
import type { AppState } from '@/types';

type MainCard = {
  screen: AppState;
  icon: string;
  title: string;
  subtitle: string;
  metric: string;
  accent: 'orange' | 'cyan' | 'green';
  previews: string[];
};

function LogoLockup() {
  return (
    <div className="flex items-center gap-3">
      <div className="relative w-16 h-16 rounded-[1.35rem] bg-gradient-to-br from-neon-orange via-neon-orange to-neon-cyan shadow-[0_0_32px_rgba(255,122,26,.28)] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-black/10" />
        <span className="relative text-bg-primary text-4xl font-black leading-none">R</span>
        <span className="absolute right-2 top-2 text-bg-primary text-sm">▶</span>
      </div>
      <div>
        <h1 className="text-4xl font-black tracking-tight">
          <span className="text-text-white">Roneca</span>
          <span className="text-text-white/90 font-medium">PlayTV</span>
        </h1>
        <p className="text-text-gray text-xs tracking-[0.32em] uppercase">Premium TV Experience</p>
      </div>
    </div>
  );
}

function TopStatus() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center gap-4 text-text-white">
      <span className="text-3xl font-light tracking-tight">
        {time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
      </span>
      <div className="w-11 h-11 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-xl">👤</div>
      <div className="h-11 px-3 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-xl">📶</div>
    </div>
  );
}

function PreviewStrip({ items, accent }: { items: string[]; accent: MainCard['accent'] }) {
  const accentClass = accent === 'cyan' ? 'border-neon-cyan/50' : accent === 'green' ? 'border-active-green/50' : 'border-neon-orange/50';

  return (
    <div className="flex items-end gap-2 mt-5 min-h-[3.8rem]">
      {items.map((item, index) => (
        <div
          key={`${item}-${index}`}
          className={`w-14 h-16 rounded-lg ${accentClass} border bg-gradient-to-br from-white/16 to-white/5 flex items-center justify-center text-[0.65rem] text-center leading-tight text-white/80 shadow-lg overflow-hidden`}
        >
          <span className="px-1">{item}</span>
        </div>
      ))}
    </div>
  );
}

function MainFeatureCard({
  card,
  selected,
  onClick,
}: {
  card: MainCard;
  selected: boolean;
  onClick: () => void;
}) {
  const accentText = card.accent === 'cyan' ? 'text-neon-cyan' : card.accent === 'green' ? 'text-active-green' : 'text-neon-orange';

  return (
    <button
      onClick={onClick}
      className={`premium-card relative flex h-[18.2rem] min-w-[16.8rem] flex-col justify-between rounded-[1.4rem] p-6 text-left transition-all duration-300 ${
        selected ? 'selected glow-orange' : ''
      }`}
    >
      <div className="absolute inset-0 rounded-[1.4rem] bg-gradient-to-br from-white/7 via-transparent to-transparent pointer-events-none" />
      <div className="relative z-10">
        <div className={`mb-5 text-6xl ${accentText} drop-shadow-[0_0_18px_rgba(255,122,26,.5)]`}>
          {card.icon}
        </div>
        <h2 className="text-2xl font-black uppercase leading-tight text-text-white">{card.title}</h2>
        <p className="mt-2 text-sm text-text-gray">{card.subtitle}</p>
        <PreviewStrip items={card.previews} accent={card.accent} />
      </div>

      <div className="relative z-10 flex items-end justify-between">
        <span className={`text-lg font-black uppercase ${selected ? 'text-neon-orange' : 'text-text-gray'}`}>
          {card.metric}
        </span>
        <span className={`text-3xl transition-transform ${selected ? 'translate-x-1 text-neon-orange' : 'text-white/35'}`}>›</span>
      </div>
    </button>
  );
}

function ContinueWatchingCard({ item }: { item: ReturnType<typeof useAppStore.getState>['watchHistory'][number] }) {
  return (
    <button className="group min-w-[12.8rem] overflow-hidden rounded-[1.1rem] premium-card text-left transition-all hover:border-neon-orange/70">
      <div className="relative flex h-24 items-center justify-center bg-gradient-to-br from-neon-cyan/16 via-white/6 to-neon-orange/12">
        <span className="text-4xl transition-transform group-hover:scale-110">
          {item.contentType === 'channel' ? '📺' : item.contentType === 'movie' ? '🎬' : '🎥'}
        </span>
        <div className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="text-3xl">▶</span>
        </div>
      </div>
      <div className="p-3">
        <p className="truncate text-sm font-bold text-text-white">{item.name}</p>
        {item.contentType !== 'channel' && item.progress !== undefined ? (
          <div className="mt-2">
            <ProgressBar progress={item.progress} />
            <p className="mt-1 text-[0.65rem] text-text-gray/65">{item.progress}% assistido</p>
          </div>
        ) : (
          <p className="mt-1 text-[0.65rem] text-active-green">● Ao vivo</p>
        )}
      </div>
    </button>
  );
}

export function HomeScreen() {
  const {
    setScreen,
    setCurrentChannel,
    watchHistory,
    channels,
    movies,
    series,
    expiresAt,
    daysRemaining,
  } = useAppStore();

  const [selectedCard, setSelectedCard] = useState(1);

  const favoriteChannels = useMemo(() => channels.filter(c => c.isFavorite).slice(0, 4), [channels]);

  const mainCards: MainCard[] = [
    {
      screen: 'channels',
      icon: '📺',
      title: 'Canais ao Vivo',
      subtitle: 'Acesse seus canais autorizados',
      metric: `${channels.length} canais`,
      accent: 'cyan',
      previews: favoriteChannels.length ? favoriteChannels.map(ch => ch.name.slice(0, 8)) : ['LIVE', 'HD', '24H'],
    },
    {
      screen: 'movies',
      icon: '🎬',
      title: 'Filmes',
      subtitle: 'Catálogo do seu provedor',
      metric: `${movies.length} filmes`,
      accent: 'orange',
      previews: movies.slice(0, 4).map(movie => movie.name.slice(0, 8)),
    },
    {
      screen: 'series',
      icon: '📺',
      title: 'Séries',
      subtitle: 'Temporadas e episódios',
      metric: `${series.length} séries`,
      accent: 'cyan',
      previews: series.slice(0, 4).map(item => item.name.slice(0, 8)),
    },
    {
      screen: 'settings',
      icon: '⚙️',
      title: 'Configurações',
      subtitle: 'Player, idioma e vencimento',
      metric: 'Ajustes',
      accent: 'orange',
      previews: ['Player', 'Lista', 'P2P'],
    },
    {
      screen: 'playlists',
      icon: '🔁',
      title: 'Alternar Listas',
      subtitle: 'Gerencie listas autorizadas',
      metric: 'Listas',
      accent: 'green',
      previews: ['M3U', 'URL', 'Sync'],
    },
  ];

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT') return;

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setSelectedCard(current => Math.min(current + 1, mainCards.length - 1));
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setSelectedCard(current => Math.max(current - 1, 0));
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        setScreen(mainCards[selectedCard].screen);
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [mainCards, selectedCard, setScreen]);

  return (
    <AppLayout>
      <div className="clean-tv-page flex h-full flex-col">
        <header className="mb-10 flex items-start justify-between">
          <LogoLockup />
          <TopStatus />
        </header>

        {daysRemaining <= 7 && (
          <div className="mb-5 rounded-2xl border border-alert-yellow/30 bg-alert-yellow/10 px-5 py-3 text-sm text-alert-yellow">
            ⚠️ Sua assinatura vence em {daysRemaining} dias ({expiresAt}). Renove para continuar.
          </div>
        )}

        <main className="flex-1 overflow-hidden">
          <section className="mb-8">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.35em] text-neon-cyan/75">Menu principal</p>
                <h2 className="text-3xl font-black text-text-white">Escolha uma categoria</h2>
              </div>
              <p className="hidden text-sm text-text-gray lg:block">Use ← → e ENTER no controle remoto</p>
            </div>

            <div className="flex gap-5 overflow-x-auto pb-7 no-scrollbar">
              {mainCards.map((card, index) => (
                <MainFeatureCard
                  key={card.screen}
                  card={card}
                  selected={selectedCard === index}
                  onClick={() => {
                    setSelectedCard(index);
                    setScreen(card.screen);
                  }}
                />
              ))}
            </div>
          </section>

          <section className="grid grid-cols-[1.35fr_.75fr] gap-6">
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-2xl font-bold text-text-white">Continuar assistindo</h3>
                <button className="text-sm font-bold text-neon-orange hover:text-neon-cyan">Ver tudo →</button>
              </div>

              <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
                {watchHistory.slice(0, 6).map(item => (
                  <ContinueWatchingCard key={item.id} item={item} />
                ))}
              </div>
            </div>

            <aside className="glass-panel rounded-[1.35rem] p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-black text-text-white">Canais favoritos</h3>
                <span className="text-xs text-active-green">● Online</span>
              </div>

              <div className="space-y-3">
                {favoriteChannels.length > 0 ? favoriteChannels.map(channel => (
                  <button
                    key={channel.id}
                    onClick={() => {
                      setCurrentChannel(channel);
                      setScreen('player');
                    }}
                    className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left transition-all hover:border-neon-orange/70 hover:bg-white/[0.07]"
                  >
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-neon-cyan/25 bg-neon-cyan/10 text-xl">📺</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-text-white">{channel.name}</span>
                      <span className="text-[0.68rem] uppercase tracking-wider text-active-green">Ao vivo</span>
                    </span>
                    <span className="text-neon-orange">▶</span>
                  </button>
                )) : (
                  <p className="text-sm text-text-gray">Favorite canais para aparecerem aqui.</p>
                )}
              </div>
            </aside>
          </section>
        </main>

        <BottomNav />
      </div>
    </AppLayout>
  );
}
