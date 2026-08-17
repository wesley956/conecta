import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ApiError,
  authorizePlayback,
  fetchCatalog,
  fetchEpg,
  fetchSeries,
} from './api';
import { recommendMovies, recommendSeries, selectHeroItems, type DiscoveryItem } from './experience';
import { clearLocalLibrary, useSessionLibrary } from './library';
import { WebPlayer } from './player/WebPlayer';
import { useWebAuth } from './session';
import type {
  Catalog,
  EpgProgram,
  PlaybackAuthorization,
  WebChannel,
  WebEpisode,
  WebMovie,
  WebSeries,
} from './types';

type Section = 'home' | 'search' | 'live' | 'movies' | 'series' | 'library';
type Detail = { kind: 'movie'; item: WebMovie } | { kind: 'series'; item: WebSeries } | null;
type PlayItem = WebChannel | WebMovie | WebEpisode;
type PlayerState = {
  contentId: string;
  title: string;
  authorization: PlaybackAuthorization;
  epg: EpgProgram[];
};

const emptyCatalog: Catalog = {
  sourceRole: 'primary',
  usingBackup: false,
  channels: [],
  movies: [],
  series: [],
};

const particles = Array.from({ length: 26 }, (_, index) => ({
  left: `${4 + ((index * 37) % 92)}%`,
  size: `${2 + (index % 4)}px`,
  delay: `${-((index * 1.7) % 14)}s`,
  duration: `${10 + (index % 7) * 1.35}s`,
  drift: `${-26 + ((index * 19) % 52)}px`,
  opacity: `${0.12 + (index % 5) * 0.055}`,
  tone: index % 5 === 0 ? 'gold' : index % 3 === 0 ? 'white' : 'red',
}));

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

function ParticleField() {
  return (
    <div className="ambient-particles" aria-hidden="true">
      {particles.map((particle, index) => (
        <span
          key={index}
          className={`ambient-particle ${particle.tone}`}
          style={{
            left: particle.left,
            width: particle.size,
            height: particle.size,
            animationDelay: particle.delay,
            animationDuration: particle.duration,
            opacity: Number(particle.opacity),
            '--particle-drift': particle.drift,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}

function LoginScreen({
  error,
  onLogin,
}: {
  error: string | null;
  onLogin: (code: string, pin: string) => Promise<void>;
}) {
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await onLogin(code.trim().toUpperCase(), pin.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-page experience-login-page">
      <ParticleField />
      <section className="login-brand experience-login-brand" aria-label="Roneca Player TV">
        <div className="login-brand-glow" aria-hidden="true" />
        <img src="/brand/ronecaplaytv-symbol.svg" className="login-symbol" alt="" />
        <img src="/brand/ronecaplaytv-wordmark.svg" className="login-wordmark" alt="Roneca Player TV" />
        <p>Seu conteúdo, agora também no navegador.</p>
      </section>
      <section className="login-card experience-login-card">
        <span className="eyebrow">ACESSO WEB</span>
        <h1>Entrar com seu aparelho</h1>
        <p className="muted">Use o código do dispositivo ativo e o PIN Web configurado para ele.</p>
        <form onSubmit={event => void submit(event)}>
          <label>
            Código do dispositivo
            <input
              value={code}
              onChange={event => setCode(event.target.value.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80))}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              inputMode="text"
              placeholder="Ex.: ABCD-1234"
              required
            />
          </label>
          <label>
            PIN Web
            <input
              value={pin}
              onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
              type="password"
              inputMode="numeric"
              pattern="[0-9]{6}"
              autoComplete="off"
              placeholder="••••••"
              required
            />
          </label>
          {error ? <div className="form-error" role="alert">{error}</div> : null}
          <button className="primary-button full" type="submit" disabled={busy || pin.length !== 6 || code.length < 4}>
            {busy ? 'Verificando…' : 'Entrar no RonecaPlayTV'}
          </button>
        </form>
        <p className="login-help">O PIN Web é diferente da credencial técnica do aplicativo. Ele pode ser redefinido sem desvincular sua TV ou celular.</p>
      </section>
    </main>
  );
}

function LaunchSplash({ onDone }: { onDone: () => void }) {
  const reducedMotion = useReducedMotion();
  const [fading, setFading] = useState(false);
  const doneRef = useRef(false);
  const fadeTimerRef = useRef<number | null>(null);

  const finish = useCallback((delay = 0) => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (delay > 0) fadeTimerRef.current = window.setTimeout(onDone, delay);
    else onDone();
  }, [onDone]);

  useEffect(() => {
    if (reducedMotion) {
      setFading(true);
      const timer = window.setTimeout(() => finish(), 420);
      return () => window.clearTimeout(timer);
    }
    const fallback = window.setTimeout(() => {
      setFading(true);
      finish(260);
    }, 10_500);
    return () => {
      window.clearTimeout(fallback);
      if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
    };
  }, [finish, reducedMotion]);

  if (reducedMotion) {
    return (
      <div className={`launch-splash reduced ${fading ? 'is-fading' : ''}`} aria-label="Abrindo Roneca Player TV">
        <img src="/brand/ronecaplaytv-wordmark.svg" alt="Roneca Player TV" />
      </div>
    );
  }

  return (
    <div className={`launch-splash ${fading ? 'is-fading' : ''}`} aria-label="Abrindo Roneca Player TV">
      <video
        className="launch-splash-video"
        src="/brand/roneca_launch_video.mp4"
        autoPlay
        muted
        playsInline
        preload="auto"
        onTimeUpdate={event => {
          if (event.currentTarget.currentTime >= 6.5) setFading(true);
        }}
        onEnded={() => finish()}
        onError={() => {
          setFading(true);
          finish(220);
        }}
      />
    </div>
  );
}

function MediaImage({ src, alt, kind }: { src?: string; alt: string; kind: 'poster' | 'channel' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) {
    return <div className={`media-placeholder ${kind}`} aria-hidden="true"><img src="/brand/ronecaplaytv-symbol.svg" alt="" /></div>;
  }
  return <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

function FavoriteButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`favorite-button ${active ? 'active' : ''}`}
      onClick={event => {
        event.stopPropagation();
        onClick();
      }}
      aria-label={active ? 'Remover da Minha Lista' : 'Adicionar à Minha Lista'}
      aria-pressed={active}
    >
      {active ? '★' : '☆'}
    </button>
  );
}

function HoverPosterCard({
  item,
  favorite,
  progress,
  onFavorite,
  onOpen,
  onPlay,
}: {
  item: WebMovie | WebSeries;
  favorite: boolean;
  progress?: number;
  onFavorite: () => void;
  onOpen: () => void;
  onPlay?: () => void;
}) {
  const cardRef = useRef<HTMLElement | null>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPosition, setPreviewPosition] = useState({ left: 16, top: 16 });

  const clearTimers = useCallback(() => {
    if (openTimer.current) window.clearTimeout(openTimer.current);
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const openPreview = useCallback(() => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect || window.matchMedia('(hover: none), (pointer: coarse)').matches) return;
    const width = Math.min(350, Math.max(286, window.innerWidth - 32));
    const estimatedHeight = 470;
    const left = rect.left + width > window.innerWidth - 16
      ? Math.max(16, rect.right - width)
      : Math.max(16, rect.left);
    const top = Math.max(16, Math.min(rect.top - 22, window.innerHeight - estimatedHeight));
    setPreviewPosition({ left, top });
    setPreviewOpen(true);
  }, []);

  const scheduleOpen = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    if (previewOpen || openTimer.current) return;
    openTimer.current = window.setTimeout(() => {
      openTimer.current = null;
      openPreview();
    }, 600);
  };

  const scheduleClose = () => {
    if (openTimer.current) window.clearTimeout(openTimer.current);
    openTimer.current = null;
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setPreviewOpen(false), 120);
  };

  const meta = item.type === 'movie'
    ? [item.year ? String(item.year) : null, item.duration || null, item.category || 'Filme'].filter(Boolean).join(' • ')
    : ['Série', item.category || null].filter(Boolean).join(' • ');

  const preview = previewOpen ? createPortal(
    <div
      className="hover-preview"
      style={{ left: previewPosition.left, top: previewPosition.top }}
      onMouseEnter={() => {
        if (closeTimer.current) window.clearTimeout(closeTimer.current);
      }}
      onMouseLeave={scheduleClose}
      role="group"
      aria-label={`Informações rápidas de ${item.title}`}
    >
      <div className="hover-preview-art"><MediaImage src={item.cover} alt={`Capa de ${item.title}`} kind="poster" /></div>
      <div className="hover-preview-copy">
        <strong>{item.title}</strong>
        <small>{meta}</small>
        <p>{item.synopsis || 'Detalhes adicionais disponíveis ao abrir este conteúdo.'}</p>
        <div className="hover-preview-actions">
          {onPlay ? <button type="button" className="primary-button" onClick={onPlay}>▶ Assistir</button> : null}
          <button type="button" onClick={onOpen}>Detalhes</button>
          <button type="button" onClick={onFavorite}>{favorite ? '★ Na Lista' : '☆ Minha Lista'}</button>
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <div className="poster-card-shell" onMouseEnter={scheduleOpen} onMouseLeave={scheduleClose}>
      <article
        ref={cardRef}
        className="poster-card"
        tabIndex={0}
        role="button"
        aria-label={`${item.title}. ${meta}`}
        onClick={onOpen}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') onOpen();
        }}
      >
        <div className="poster-art">
          <MediaImage src={item.cover} alt={`Capa de ${item.title}`} kind="poster" />
          <FavoriteButton active={favorite} onClick={onFavorite} />
          {progress && progress > 0 ? <div className="progress-track"><span style={{ width: `${Math.min(100, progress)}%` }} /></div> : null}
        </div>
        <div className="card-copy">
          <strong>{item.title}</strong>
          <small>{item.category || (item.type === 'movie' ? 'Filme' : 'Série')}</small>
        </div>
      </article>
      {preview}
    </div>
  );
}

function ChannelCard({
  item,
  favorite,
  onFavorite,
  onPlay,
}: {
  item: WebChannel;
  favorite: boolean;
  onFavorite: () => void;
  onPlay: () => void;
}) {
  return (
    <article className="channel-card" tabIndex={0} role="button" onClick={onPlay} onKeyDown={event => {
      if (event.key === 'Enter' || event.key === ' ') onPlay();
    }}>
      <div className="channel-logo"><MediaImage src={item.logo} alt={`Logo de ${item.title}`} kind="channel" /></div>
      <div className="channel-copy"><strong>{item.title}</strong><small>{item.category || 'TV ao vivo'}</small></div>
      <FavoriteButton active={favorite} onClick={onFavorite} />
    </article>
  );
}

function Shelf({ title, children, action, className = '' }: { title: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <section className={`shelf ${className}`}>
      <div className="section-heading"><h2>{title}</h2>{action}</div>
      <div className="horizontal-list">{children}</div>
    </section>
  );
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return <div className="empty-state"><img src="/brand/ronecaplaytv-symbol.svg" alt="" /><h3>{title}</h3><p>{copy}</p></div>;
}

function HeroCarousel({
  items,
  onOpen,
  onPlay,
  isFavorite,
  onFavorite,
}: {
  items: DiscoveryItem[];
  onOpen: (item: DiscoveryItem) => void;
  onPlay: (item: WebMovie) => void;
  isFavorite: (item: DiscoveryItem) => boolean;
  onFavorite: (item: DiscoveryItem) => void;
}) {
  const reducedMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const active = items[activeIndex] || null;

  useEffect(() => {
    setActiveIndex(current => Math.min(current, Math.max(0, items.length - 1)));
  }, [items.length]);

  useEffect(() => {
    if (items.length < 2 || paused || reducedMotion) return;
    const timer = window.setInterval(() => setActiveIndex(current => (current + 1) % items.length), 7000);
    return () => window.clearInterval(timer);
  }, [items.length, paused, reducedMotion]);

  useEffect(() => {
    if (items.length < 2) return;
    const next = items[(activeIndex + 1) % items.length];
    if (!next?.cover) return;
    const image = new Image();
    image.src = next.cover;
  }, [activeIndex, items]);

  if (!active) {
    return (
      <section className="experience-hero fallback">
        <div className="hero-copy">
          <span className="eyebrow">RONECAPLAYTV WEB</span>
          <h1>Seu conteúdo em qualquer tela</h1>
          <p>TV ao vivo, filmes e séries em uma experiência feita para o navegador.</p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="experience-hero"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      <div
        key={active.contentId}
        className="experience-hero-backdrop"
        style={active.cover ? { backgroundImage: `url(${active.cover})` } : undefined}
        aria-hidden="true"
      />
      <div className="experience-hero-scrim" aria-hidden="true" />
      <div key={`copy-${active.contentId}`} className="hero-copy experience-hero-copy">
        <span className="eyebrow">{active.type === 'movie' ? 'FILME' : 'SÉRIE'} • RONECAPLAYTV WEB</span>
        <h1>{active.title}</h1>
        <p>{active.synopsis || 'Descubra este título no seu catálogo Roneca Player TV.'}</p>
        <div className="hero-actions">
          {active.type === 'movie' ? <button className="primary-button" type="button" onClick={() => onPlay(active)}>▶ Assistir</button> : null}
          <button type="button" onClick={() => onOpen(active)}>{active.type === 'movie' ? 'Ver detalhes' : 'Ver série'}</button>
          <button type="button" onClick={() => onFavorite(active)}>{isFavorite(active) ? '★ Na Minha Lista' : '☆ Minha Lista'}</button>
        </div>
      </div>
      {items.length > 1 ? (
        <div className="hero-indicators" aria-label="Destaques da Home">
          {items.map((item, index) => (
            <button
              key={item.contentId}
              type="button"
              className={index === activeIndex ? 'active' : ''}
              aria-label={`Mostrar destaque ${index + 1}: ${item.title}`}
              aria-pressed={index === activeIndex}
              onClick={() => setActiveIndex(index)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function MovieDetail({
  item,
  recommendations,
  favorite,
  progress,
  playbackLoading,
  onClose,
  onFavorite,
  onPlay,
  onOpenMovie,
  isFavorite,
  onToggleFavorite,
}: {
  item: WebMovie;
  recommendations: WebMovie[];
  favorite: boolean;
  progress?: { position: number; duration: number };
  playbackLoading: string | null;
  onClose: () => void;
  onFavorite: () => void;
  onPlay: () => void;
  onOpenMovie: (movie: WebMovie) => void;
  isFavorite: (movie: WebMovie) => boolean;
  onToggleFavorite: (movie: WebMovie) => void;
}) {
  return (
    <div className="detail-overlay experience-detail-overlay" role="dialog" aria-modal="true" aria-label={`Detalhes de ${item.title}`}>
      <div className="experience-detail-surface">
        {item.cover ? <div className="experience-detail-backdrop" style={{ backgroundImage: `url(${item.cover})` }} aria-hidden="true" /> : null}
        <div className="experience-detail-shade" aria-hidden="true" />
        <button className="detail-close" type="button" onClick={onClose} aria-label="Fechar detalhes">✕</button>
        <section className="experience-detail-header">
          <div className="experience-detail-poster"><MediaImage src={item.cover} alt={`Capa de ${item.title}`} kind="poster" /></div>
          <div className="experience-detail-copy">
            <span className="eyebrow">FILME</span>
            <h2>{item.title}</h2>
            <div className="metadata"><span>{item.year || '—'}</span><span>{item.duration || 'Duração não informada'}</span><span>{item.category || 'Filme'}</span></div>
            <p>{item.synopsis || 'Sinopse não informada.'}</p>
            {progress ? <p className="resume-note">Continuar de {Math.floor(progress.position / 60)} min</p> : null}
            <div className="detail-actions">
              <button className="primary-button" type="button" disabled={playbackLoading === item.contentId} onClick={onPlay}>{progress ? '▶ Continuar' : '▶ Assistir'}</button>
              <button type="button" onClick={onFavorite}>{favorite ? '★ Na Minha Lista' : '☆ Minha Lista'}</button>
            </div>
          </div>
        </section>
        {recommendations.length ? (
          <Shelf title="Você também pode gostar" className="detail-recommendations">
            {recommendations.map(movie => (
              <HoverPosterCard
                key={movie.contentId}
                item={movie}
                favorite={isFavorite(movie)}
                onFavorite={() => onToggleFavorite(movie)}
                onOpen={() => onOpenMovie(movie)}
              />
            ))}
          </Shelf>
        ) : null}
      </div>
    </div>
  );
}

function SeriesDetail({
  item,
  seasons,
  status,
  recommendations,
  favorite,
  playbackLoading,
  onClose,
  onFavorite,
  onPlayEpisode,
  onOpenSeries,
  isFavorite,
  onToggleFavorite,
}: {
  item: WebSeries;
  seasons: Array<{ number: number; episodes: WebEpisode[] }>;
  status: 'idle' | 'loading' | 'ready' | 'error';
  recommendations: WebSeries[];
  favorite: boolean;
  playbackLoading: string | null;
  onClose: () => void;
  onFavorite: () => void;
  onPlayEpisode: (episode: WebEpisode) => void;
  onOpenSeries: (series: WebSeries) => void;
  isFavorite: (series: WebSeries) => boolean;
  onToggleFavorite: (series: WebSeries) => void;
}) {
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);

  useEffect(() => {
    setSelectedSeason(seasons[0]?.number ?? null);
  }, [item.contentId, seasons]);

  const activeSeason = seasons.find(season => season.number === selectedSeason) || seasons[0] || null;

  return (
    <div className="detail-overlay experience-detail-overlay" role="dialog" aria-modal="true" aria-label={`Detalhes de ${item.title}`}>
      <div className="experience-detail-surface series-surface">
        {item.cover ? <div className="experience-detail-backdrop" style={{ backgroundImage: `url(${item.cover})` }} aria-hidden="true" /> : null}
        <div className="experience-detail-shade" aria-hidden="true" />
        <button className="detail-close" type="button" onClick={onClose} aria-label="Fechar detalhes">✕</button>
        <section className="experience-detail-header series-header">
          <div className="experience-detail-poster"><MediaImage src={item.cover} alt={`Capa de ${item.title}`} kind="poster" /></div>
          <div className="experience-detail-copy">
            <span className="eyebrow">SÉRIE</span>
            <h2>{item.title}</h2>
            <p>{item.synopsis || 'Sinopse não informada.'}</p>
            <div className="detail-actions"><button type="button" onClick={onFavorite}>{favorite ? '★ Na Minha Lista' : '☆ Minha Lista'}</button></div>
          </div>
        </section>

        <section className="series-seasons-area">
          {status === 'loading' ? <div className="loading-inline">Carregando episódios…</div> : null}
          {status === 'error' ? <div className="form-error">Não foi possível carregar os episódios.</div> : null}
          {status === 'ready' && !seasons.length ? <p className="muted">Os episódios ainda não estão disponíveis no catálogo Web seguro.</p> : null}
          {seasons.length ? (
            <>
              <div className="season-selector-heading"><h3>Temporadas</h3>{activeSeason ? <span>{activeSeason.episodes.length} episódios</span> : null}</div>
              <div className="season-tabs" role="tablist" aria-label="Temporadas">
                {seasons.map(season => (
                  <button
                    key={season.number}
                    type="button"
                    role="tab"
                    aria-selected={activeSeason?.number === season.number}
                    className={activeSeason?.number === season.number ? 'active' : ''}
                    onClick={() => setSelectedSeason(season.number)}
                  >
                    T{season.number}
                  </button>
                ))}
              </div>
              {activeSeason ? (
                <div className="episode-list experience-episode-list" role="tabpanel" aria-label={`Temporada ${activeSeason.number}`}>
                  {activeSeason.episodes.length ? activeSeason.episodes.map(episode => (
                    <button type="button" key={episode.contentId} onClick={() => onPlayEpisode(episode)} disabled={playbackLoading === episode.contentId}>
                      <span className="episode-number">E{episode.number}</span>
                      <span><strong>{episode.title}</strong><small>{episode.duration || 'Duração não informada'}</small></span>
                      <span className="play-glyph">▶</span>
                    </button>
                  )) : <p className="muted">Nenhum episódio disponível nesta temporada.</p>}
                </div>
              ) : null}
            </>
          ) : null}
        </section>

        {recommendations.length ? (
          <Shelf title="Séries semelhantes" className="detail-recommendations">
            {recommendations.map(series => (
              <HoverPosterCard
                key={series.contentId}
                item={series}
                favorite={isFavorite(series)}
                onFavorite={() => onToggleFavorite(series)}
                onOpen={() => onOpenSeries(series)}
              />
            ))}
          </Shelf>
        ) : null}
      </div>
    </div>
  );
}

export default function ExperienceApp() {
  const auth = useWebAuth();
  const [section, setSection] = useState<Section>('home');
  const [catalog, setCatalog] = useState<Catalog>(emptyCatalog);
  const [catalogStatus, setCatalogStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todos');
  const [detail, setDetail] = useState<Detail>(null);
  const [seriesSeasons, setSeriesSeasons] = useState<Array<{ number: number; episodes: WebEpisode[] }>>([]);
  const [seriesStatus, setSeriesStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [playbackLoading, setPlaybackLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showSplash, setShowSplash] = useState(false);

  const sessionId = auth.session?.id || 'anonymous';
  const library = useSessionLibrary(sessionId);

  const loadCatalog = useCallback(async () => {
    if (!auth.accessToken) return;
    setCatalogStatus('loading');
    setCatalogError(null);
    try {
      const next = await fetchCatalog(auth.accessToken);
      setCatalog(next);
      setCatalogStatus('ready');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) auth.invalidate();
      setCatalogError(error instanceof Error ? error.message : 'Falha ao carregar o catálogo.');
      setCatalogStatus('error');
    }
  }, [auth.accessToken, auth.invalidate]);

  useEffect(() => {
    if (auth.accessToken) void loadCatalog();
    else {
      setCatalog(emptyCatalog);
      setCatalogStatus('idle');
      setPlayer(null);
      setDetail(null);
      setShowSplash(false);
    }
  }, [auth.accessToken, loadCatalog]);

  useEffect(() => {
    setCategory('Todos');
    setDetail(null);
  }, [section]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const openSeries = useCallback(async (item: WebSeries) => {
    if (!auth.accessToken) return;
    setDetail({ kind: 'series', item });
    setSeriesSeasons([]);
    setSeriesStatus('loading');
    try {
      const result = await fetchSeries(auth.accessToken, item.contentId);
      setSeriesSeasons(result.seasons);
      setSeriesStatus('ready');
      if (!result.detailsReady && result.message) setToast(result.message);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) auth.invalidate();
      setSeriesStatus('error');
    }
  }, [auth.accessToken, auth.invalidate]);

  const play = useCallback(async (item: PlayItem) => {
    if (!auth.accessToken || playbackLoading) return;
    setPlaybackLoading(item.contentId);
    try {
      const [authorization, epg] = await Promise.all([
        authorizePlayback(auth.accessToken, item.contentId),
        item.type === 'channel' ? fetchEpg(auth.accessToken, item.contentId).catch(() => []) : Promise.resolve([]),
      ]);
      setPlayer({ contentId: item.contentId, title: item.title, authorization, epg });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) auth.invalidate();
      setToast(error instanceof Error ? error.message : 'Não foi possível iniciar a reprodução.');
    } finally {
      setPlaybackLoading(null);
    }
  }, [auth.accessToken, auth.invalidate, playbackLoading]);

  const allCategories = useMemo(() => {
    const values = section === 'live'
      ? catalog.channels.map(item => item.category)
      : section === 'movies'
        ? catalog.movies.map(item => item.category)
        : catalog.series.map(item => item.category);
    return ['Todos', ...[...new Set(values.filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b))];
  }, [catalog.channels, catalog.movies, catalog.series, section]);

  const filteredChannels = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('pt-BR');
    return catalog.channels.filter(item => {
      if (section === 'live' && category !== 'Todos' && item.category !== category) return false;
      if (!term) return true;
      return `${item.title} ${item.category || ''}`.toLocaleLowerCase('pt-BR').includes(term);
    });
  }, [catalog.channels, category, query, section]);

  const filteredMovies = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('pt-BR');
    return catalog.movies.filter(item => {
      if (section === 'movies' && category !== 'Todos' && item.category !== category) return false;
      if (!term) return true;
      return `${item.title} ${item.category || ''} ${item.year || ''}`.toLocaleLowerCase('pt-BR').includes(term);
    });
  }, [catalog.movies, category, query, section]);

  const filteredSeries = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('pt-BR');
    return catalog.series.filter(item => {
      if (section === 'series' && category !== 'Todos' && item.category !== category) return false;
      if (!term) return true;
      return `${item.title} ${item.category || ''}`.toLocaleLowerCase('pt-BR').includes(term);
    });
  }, [catalog.series, category, query, section]);

  const favoriteMovies = catalog.movies.filter(item => library.favorites.has(item.contentId));
  const favoriteSeries = catalog.series.filter(item => library.favorites.has(item.contentId));
  const favoriteChannels = catalog.channels.filter(item => library.favorites.has(item.contentId));
  const continueMovies = catalog.movies.filter(item => library.positions[item.contentId]);
  const heroItems = useMemo(
    () => selectHeroItems(catalog.movies, catalog.series, sessionId, 6),
    [catalog.movies, catalog.series, sessionId],
  );

  if (auth.booting) {
    return <main className="boot-screen"><img src="/brand/ronecaplaytv-symbol.svg" alt="" /><span>Carregando acesso seguro…</span></main>;
  }

  if (!auth.accessToken || !auth.session) {
    return (
      <LoginScreen
        error={auth.error}
        onLogin={async (code, pin) => {
          await auth.login(code, pin);
          setShowSplash(true);
        }}
      />
    );
  }

  const doLogout = async () => {
    const activeSessionId = auth.session?.id;
    if (activeSessionId) clearLocalLibrary(activeSessionId);
    setPlayer(null);
    setDetail(null);
    setShowSplash(false);
    await auth.logout();
  };

  const navItems: Array<{ id: Section; label: string; icon: string }> = [
    { id: 'home', label: 'Início', icon: '⌂' },
    { id: 'search', label: 'Buscar', icon: '⌕' },
    { id: 'live', label: 'TV', icon: '◉' },
    { id: 'movies', label: 'Filmes', icon: '▶' },
    { id: 'series', label: 'Séries', icon: '▤' },
    { id: 'library', label: 'Minha Lista', icon: '★' },
  ];

  const openDiscovery = (item: DiscoveryItem) => {
    if (item.type === 'movie') setDetail({ kind: 'movie', item });
    else void openSeries(item);
  };

  const progressPercent = (item: WebMovie) => library.positions[item.contentId]
    ? library.positions[item.contentId].position / library.positions[item.contentId].duration * 100
    : undefined;

  const renderPosterGrid = (items: Array<WebMovie | WebSeries>) => (
    <div className="poster-grid">
      {items.map(item => (
        <HoverPosterCard
          key={item.contentId}
          item={item}
          favorite={library.favorites.has(item.contentId)}
          progress={item.type === 'movie' ? progressPercent(item) : undefined}
          onFavorite={() => library.toggleFavorite(item.contentId)}
          onOpen={() => openDiscovery(item)}
          onPlay={item.type === 'movie' ? () => void play(item) : undefined}
        />
      ))}
    </div>
  );

  const movieRecommendations = detail?.kind === 'movie'
    ? recommendMovies(detail.item, catalog.movies)
    : [];
  const seriesRecommendations = detail?.kind === 'series'
    ? recommendSeries(detail.item, catalog.series)
    : [];

  return (
    <div className="app-shell">
      <aside className="side-nav">
        <button className="brand-button" type="button" onClick={() => setSection('home')} aria-label="Roneca Player TV - início">
          <img src="/brand/ronecaplaytv-symbol.svg" alt="" />
          <img src="/brand/ronecaplaytv-wordmark.svg" alt="Roneca Player TV" />
        </button>
        <nav aria-label="Navegação principal">
          {navItems.map(item => (
            <button type="button" key={item.id} className={section === item.id ? 'active' : ''} onClick={() => setSection(item.id)}>
              <span aria-hidden="true">{item.icon}</span><b>{item.label}</b>
            </button>
          ))}
        </nav>
        <div className="nav-account">
          <small>{auth.session.clientName || 'Dispositivo ativo'}</small>
          <button type="button" onClick={() => void doLogout()}>Sair</button>
        </div>
      </aside>

      <header className="mobile-topbar">
        <img src="/brand/ronecaplaytv-wordmark.svg" alt="Roneca Player TV" />
        <button type="button" onClick={() => void doLogout()}>Sair</button>
      </header>

      <main className="main-content">
        {catalog.usingBackup ? <div className="backup-banner">Lista reserva ativa para este catálogo.</div> : null}
        {catalogStatus === 'loading' ? <div className="loading-state"><span className="spinner" />Atualizando catálogo…</div> : null}
        {catalogStatus === 'error' ? (
          <div className="error-state"><h2>Não foi possível carregar o catálogo</h2><p>{catalogError}</p><button type="button" onClick={() => void loadCatalog()}>Tentar novamente</button></div>
        ) : null}

        {catalogStatus === 'ready' && section === 'home' ? (
          <>
            <HeroCarousel
              items={heroItems}
              onOpen={openDiscovery}
              onPlay={movie => void play(movie)}
              isFavorite={item => library.favorites.has(item.contentId)}
              onFavorite={item => library.toggleFavorite(item.contentId)}
            />

            {continueMovies.length ? (
              <Shelf title="Continuar assistindo" action={<button type="button" className="text-button" onClick={() => setSection('movies')}>Ver filmes</button>}>
                {continueMovies.slice(0, 12).map(item => (
                  <HoverPosterCard
                    key={item.contentId}
                    item={item}
                    favorite={library.favorites.has(item.contentId)}
                    progress={progressPercent(item)}
                    onFavorite={() => library.toggleFavorite(item.contentId)}
                    onOpen={() => setDetail({ kind: 'movie', item })}
                    onPlay={() => void play(item)}
                  />
                ))}
              </Shelf>
            ) : null}

            <Shelf title="TV ao vivo" action={<button type="button" className="text-button" onClick={() => setSection('live')}>Ver todos</button>}>
              {catalog.channels.slice(0, 12).map(item => (
                <ChannelCard key={item.contentId} item={item} favorite={library.favorites.has(item.contentId)} onFavorite={() => library.toggleFavorite(item.contentId)} onPlay={() => void play(item)} />
              ))}
            </Shelf>

            <Shelf title="Filmes" action={<button type="button" className="text-button" onClick={() => setSection('movies')}>Ver todos</button>}>
              {catalog.movies.slice(0, 14).map(item => (
                <HoverPosterCard key={item.contentId} item={item} favorite={library.favorites.has(item.contentId)} onFavorite={() => library.toggleFavorite(item.contentId)} onOpen={() => setDetail({ kind: 'movie', item })} onPlay={() => void play(item)} />
              ))}
            </Shelf>

            <Shelf title="Séries" action={<button type="button" className="text-button" onClick={() => setSection('series')}>Ver todas</button>}>
              {catalog.series.slice(0, 14).map(item => (
                <HoverPosterCard key={item.contentId} item={item} favorite={library.favorites.has(item.contentId)} onFavorite={() => library.toggleFavorite(item.contentId)} onOpen={() => void openSeries(item)} />
              ))}
            </Shelf>
          </>
        ) : null}

        {catalogStatus === 'ready' && section === 'search' ? (
          <section className="page-section search-page">
            <div className="page-heading"><div><span className="eyebrow">BUSCA GLOBAL</span><h1>Encontre o que assistir</h1></div></div>
            <input className="search-input" autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Canais, filmes ou séries…" aria-label="Buscar conteúdo" />
            {!query.trim() ? <EmptyState title="Comece a digitar" copy="A busca encontra canais, filmes e séries do catálogo ativo." /> : (
              <>
                {filteredChannels.length ? <Shelf title={`Canais (${filteredChannels.length})`}>{filteredChannels.slice(0, 20).map(item => <ChannelCard key={item.contentId} item={item} favorite={library.favorites.has(item.contentId)} onFavorite={() => library.toggleFavorite(item.contentId)} onPlay={() => void play(item)} />)}</Shelf> : null}
                {filteredMovies.length ? <Shelf title={`Filmes (${filteredMovies.length})`}>{filteredMovies.slice(0, 20).map(item => <HoverPosterCard key={item.contentId} item={item} favorite={library.favorites.has(item.contentId)} onFavorite={() => library.toggleFavorite(item.contentId)} onOpen={() => setDetail({ kind: 'movie', item })} onPlay={() => void play(item)} />)}</Shelf> : null}
                {filteredSeries.length ? <Shelf title={`Séries (${filteredSeries.length})`}>{filteredSeries.slice(0, 20).map(item => <HoverPosterCard key={item.contentId} item={item} favorite={library.favorites.has(item.contentId)} onFavorite={() => library.toggleFavorite(item.contentId)} onOpen={() => void openSeries(item)} />)}</Shelf> : null}
                {!filteredChannels.length && !filteredMovies.length && !filteredSeries.length ? <EmptyState title="Nenhum resultado" copy="Tente outro título ou termo de busca." /> : null}
              </>
            )}
          </section>
        ) : null}

        {catalogStatus === 'ready' && section === 'live' ? (
          <section className="page-section">
            <div className="page-heading"><div><span className="eyebrow">TV AO VIVO</span><h1>Canais</h1></div><span className="count-badge">{filteredChannels.length}</span></div>
            <div className="filter-strip" role="list" aria-label="Categorias de canais">
              {allCategories.map(item => <button type="button" key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}
            </div>
            <div className="channel-grid">
              {filteredChannels.map(item => <ChannelCard key={item.contentId} item={item} favorite={library.favorites.has(item.contentId)} onFavorite={() => library.toggleFavorite(item.contentId)} onPlay={() => void play(item)} />)}
            </div>
            {!filteredChannels.length ? <EmptyState title="Nenhum canal nesta categoria" copy="Escolha outra categoria ou atualize o catálogo." /> : null}
          </section>
        ) : null}

        {catalogStatus === 'ready' && section === 'movies' ? (
          <section className="page-section">
            <div className="page-heading"><div><span className="eyebrow">VOD</span><h1>Filmes</h1></div><span className="count-badge">{filteredMovies.length}</span></div>
            <div className="filter-strip">{allCategories.map(item => <button type="button" key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div>
            {renderPosterGrid(filteredMovies)}
          </section>
        ) : null}

        {catalogStatus === 'ready' && section === 'series' ? (
          <section className="page-section">
            <div className="page-heading"><div><span className="eyebrow">EPISÓDIOS</span><h1>Séries</h1></div><span className="count-badge">{filteredSeries.length}</span></div>
            <div className="filter-strip">{allCategories.map(item => <button type="button" key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div>
            {renderPosterGrid(filteredSeries)}
          </section>
        ) : null}

        {catalogStatus === 'ready' && section === 'library' ? (
          <section className="page-section">
            <div className="page-heading"><div><span className="eyebrow">SUA BIBLIOTECA</span><h1>Minha Lista</h1></div></div>
            {!favoriteMovies.length && !favoriteSeries.length && !favoriteChannels.length ? <EmptyState title="Sua lista está vazia" copy="Use a estrela nos canais, filmes e séries para guardar seus favoritos." /> : null}
            {favoriteChannels.length ? <Shelf title="Canais favoritos">{favoriteChannels.map(item => <ChannelCard key={item.contentId} item={item} favorite onFavorite={() => library.toggleFavorite(item.contentId)} onPlay={() => void play(item)} />)}</Shelf> : null}
            {favoriteMovies.length ? <Shelf title="Filmes favoritos">{favoriteMovies.map(item => <HoverPosterCard key={item.contentId} item={item} favorite onFavorite={() => library.toggleFavorite(item.contentId)} onOpen={() => setDetail({ kind: 'movie', item })} onPlay={() => void play(item)} />)}</Shelf> : null}
            {favoriteSeries.length ? <Shelf title="Séries favoritas">{favoriteSeries.map(item => <HoverPosterCard key={item.contentId} item={item} favorite onFavorite={() => library.toggleFavorite(item.contentId)} onOpen={() => void openSeries(item)} />)}</Shelf> : null}
          </section>
        ) : null}
      </main>

      <nav className="bottom-nav" aria-label="Navegação mobile">
        {navItems.slice(0, 5).map(item => (
          <button type="button" key={item.id} className={section === item.id ? 'active' : ''} onClick={() => setSection(item.id)}><span>{item.icon}</span><small>{item.label}</small></button>
        ))}
        <button type="button" className={section === 'library' ? 'active' : ''} onClick={() => setSection('library')}><span>★</span><small>Lista</small></button>
      </nav>

      {detail?.kind === 'movie' ? (
        <MovieDetail
          item={detail.item}
          recommendations={movieRecommendations}
          favorite={library.favorites.has(detail.item.contentId)}
          progress={library.positions[detail.item.contentId]}
          playbackLoading={playbackLoading}
          onClose={() => setDetail(null)}
          onFavorite={() => library.toggleFavorite(detail.item.contentId)}
          onPlay={() => void play(detail.item)}
          onOpenMovie={movie => setDetail({ kind: 'movie', item: movie })}
          isFavorite={movie => library.favorites.has(movie.contentId)}
          onToggleFavorite={movie => library.toggleFavorite(movie.contentId)}
        />
      ) : null}

      {detail?.kind === 'series' ? (
        <SeriesDetail
          item={detail.item}
          seasons={seriesSeasons}
          status={seriesStatus}
          recommendations={seriesRecommendations}
          favorite={library.favorites.has(detail.item.contentId)}
          playbackLoading={playbackLoading}
          onClose={() => setDetail(null)}
          onFavorite={() => library.toggleFavorite(detail.item.contentId)}
          onPlayEpisode={episode => void play(episode)}
          onOpenSeries={series => void openSeries(series)}
          isFavorite={series => library.favorites.has(series.contentId)}
          onToggleFavorite={series => library.toggleFavorite(series.contentId)}
        />
      ) : null}

      {player ? (
        <WebPlayer
          authorization={player.authorization}
          title={player.title}
          epg={player.epg}
          initialPosition={library.positions[player.contentId]?.position || 0}
          liveChannels={player.authorization.contentType === 'channel' ? filteredChannels : []}
          activeContentId={player.contentId}
          onSwitchChannel={channel => void play(channel)}
          onProgress={(position, duration) => library.savePosition(player.contentId, position, duration)}
          onClose={() => setPlayer(null)}
        />
      ) : null}

      {showSplash ? <LaunchSplash onDone={() => setShowSplash(false)} /> : null}
      {toast ? <div className="toast" role="status">{toast}</div> : null}
      {playbackLoading ? <div className="playback-loading"><span className="spinner" />Abrindo conteúdo…</div> : null}
    </div>
  );
}
