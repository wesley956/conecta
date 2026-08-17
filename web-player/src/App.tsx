import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ApiError,
  authorizePlayback,
  fetchCatalog,
  fetchEpg,
  fetchSeries,
} from './api';
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
    <main className="login-page">
      <section className="login-brand" aria-label="Roneca Player TV">
        <img src="/brand/ronecaplaytv-symbol.svg" className="login-symbol" alt="" />
        <img src="/brand/ronecaplaytv-wordmark.svg" className="login-wordmark" alt="Roneca Player TV" />
        <p>Seu conteúdo, agora também no navegador.</p>
      </section>
      <section className="login-card">
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

function MediaImage({ src, alt, kind }: { src?: string; alt: string; kind: 'poster' | 'channel' }) {
  const [failed, setFailed] = useState(false);
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

function PosterCard({
  item,
  favorite,
  progress,
  onFavorite,
  onOpen,
}: {
  item: WebMovie | WebSeries;
  favorite: boolean;
  progress?: number;
  onFavorite: () => void;
  onOpen: () => void;
}) {
  return (
    <article className="poster-card" tabIndex={0} role="button" onClick={onOpen} onKeyDown={event => {
      if (event.key === 'Enter' || event.key === ' ') onOpen();
    }}>
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

function Shelf({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="shelf">
      <div className="section-heading"><h2>{title}</h2>{action}</div>
      <div className="horizontal-list">{children}</div>
    </section>
  );
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return <div className="empty-state"><img src="/brand/ronecaplaytv-symbol.svg" alt="" /><h3>{title}</h3><p>{copy}</p></div>;
}

export default function App() {
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
      setPlayer({
        contentId: item.contentId,
        title: item.title,
        authorization,
        epg,
      });
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
  const hero = continueMovies[0] || catalog.movies[0] || catalog.series[0] || null;

  if (auth.booting) {
    return <main className="boot-screen"><img src="/brand/ronecaplaytv-symbol.svg" alt="" /><span>Carregando acesso seguro…</span></main>;
  }

  if (!auth.accessToken || !auth.session) {
    return <LoginScreen error={auth.error} onLogin={auth.login} />;
  }

  const doLogout = async () => {
    const activeSessionId = auth.session?.id;
    if (activeSessionId) clearLocalLibrary(activeSessionId);
    setPlayer(null);
    setDetail(null);
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

  const renderPosterGrid = (items: Array<WebMovie | WebSeries>) => (
    <div className="poster-grid">
      {items.map(item => (
        <PosterCard
          key={item.contentId}
          item={item}
          favorite={library.favorites.has(item.contentId)}
          progress={library.positions[item.contentId]
            ? library.positions[item.contentId].position / library.positions[item.contentId].duration * 100
            : undefined}
          onFavorite={() => library.toggleFavorite(item.contentId)}
          onOpen={() => item.type === 'movie' ? setDetail({ kind: 'movie', item }) : void openSeries(item)}
        />
      ))}
    </div>
  );

  return (
    <div className="app-shell">
      <aside className="side-nav">
        <button className="brand-button" type="button" onClick={() => setSection('home')} aria-label="Roneca Player TV - início">
          <img src="/brand/ronecaplaytv-symbol.svg" alt="" />
          <img src="/brand/ronecaplaytv-wordmark.svg" alt="Roneca Player TV" />
        </button>
        <nav aria-label="Navegação principal">
          {navItems.map(item => (
            <button
              type="button"
              key={item.id}
              className={section === item.id ? 'active' : ''}
              onClick={() => setSection(item.id)}
            >
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
            <section className="hero" style={hero && 'cover' in hero && hero.cover ? { backgroundImage: `linear-gradient(90deg, rgba(13,14,17,.98) 0%, rgba(13,14,17,.72) 45%, rgba(13,14,17,.3) 100%), url(${hero.cover})` } : undefined}>
              <div className="hero-copy">
                <span className="eyebrow">RONECAPLAYTV WEB</span>
                <h1>{hero?.title || 'Seu conteúdo em qualquer tela'}</h1>
                <p>{hero && 'synopsis' in hero && hero.synopsis ? hero.synopsis : 'TV ao vivo, filmes e séries em uma experiência feita para o navegador.'}</p>
                <div className="hero-actions">
                  {hero?.type === 'movie' ? <button className="primary-button" type="button" onClick={() => setDetail({ kind: 'movie', item: hero })}>Ver detalhes</button> : null}
                  {hero?.type === 'series' ? <button className="primary-button" type="button" onClick={() => void openSeries(hero)}>Ver série</button> : null}
                  <button type="button" onClick={() => setSection('live')}>Abrir TV ao vivo</button>
                </div>
              </div>
            </section>

            {continueMovies.length ? (
              <Shelf title="Continuar assistindo" action={<button type="button" className="text-button" onClick={() => setSection('movies')}>Ver filmes</button>}>
                {continueMovies.slice(0, 12).map(item => (
                  <PosterCard
                    key={item.contentId}
                    item={item}
                    favorite={library.favorites.has(item.contentId)}
                    progress={library.positions[item.contentId].position / library.positions[item.contentId].duration * 100}
                    onFavorite={() => library.toggleFavorite(item.contentId)}
                    onOpen={() => setDetail({ kind: 'movie', item })}
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
                <PosterCard key={item.contentId} item={item} favorite={library.favorites.has(item.contentId)} onFavorite={() => library.toggleFavorite(item.contentId)} onOpen={() => setDetail({ kind: 'movie', item })} />
              ))}
            </Shelf>

            <Shelf title="Séries" action={<button type="button" className="text-button" onClick={() => setSection('series')}>Ver todas</button>}>
              {catalog.series.slice(0, 14).map(item => (
                <PosterCard key={item.contentId} item={item} favorite={library.favorites.has(item.contentId)} onFavorite={() => library.toggleFavorite(item.contentId)} onOpen={() => void openSeries(item)} />
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
                {filteredMovies.length ? <Shelf title={`Filmes (${filteredMovies.length})`}>{filteredMovies.slice(0, 20).map(item => <PosterCard key={item.contentId} item={item} favorite={library.favorites.has(item.contentId)} onFavorite={() => library.toggleFavorite(item.contentId)} onOpen={() => setDetail({ kind: 'movie', item })} />)}</Shelf> : null}
                {filteredSeries.length ? <Shelf title={`Séries (${filteredSeries.length})`}>{filteredSeries.slice(0, 20).map(item => <PosterCard key={item.contentId} item={item} favorite={library.favorites.has(item.contentId)} onFavorite={() => library.toggleFavorite(item.contentId)} onOpen={() => void openSeries(item)} />)}</Shelf> : null}
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
            {favoriteMovies.length ? <Shelf title="Filmes favoritos">{favoriteMovies.map(item => <PosterCard key={item.contentId} item={item} favorite onFavorite={() => library.toggleFavorite(item.contentId)} onOpen={() => setDetail({ kind: 'movie', item })} />)}</Shelf> : null}
            {favoriteSeries.length ? <Shelf title="Séries favoritas">{favoriteSeries.map(item => <PosterCard key={item.contentId} item={item} favorite onFavorite={() => library.toggleFavorite(item.contentId)} onOpen={() => void openSeries(item)} />)}</Shelf> : null}
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
        <div className="detail-overlay" role="dialog" aria-modal="true" aria-label={`Detalhes de ${detail.item.title}`}>
          <div className="detail-panel">
            <button className="detail-close" type="button" onClick={() => setDetail(null)} aria-label="Fechar detalhes">✕</button>
            <div className="detail-poster"><MediaImage src={detail.item.cover} alt={`Capa de ${detail.item.title}`} kind="poster" /></div>
            <div className="detail-copy">
              <span className="eyebrow">FILME</span><h2>{detail.item.title}</h2>
              <div className="metadata"><span>{detail.item.year || '—'}</span><span>{detail.item.duration || 'Duração não informada'}</span><span>{detail.item.category || 'Filme'}</span></div>
              <p>{detail.item.synopsis || 'Sinopse não informada.'}</p>
              {library.positions[detail.item.contentId] ? <p className="resume-note">Continuar de {Math.floor(library.positions[detail.item.contentId].position / 60)} min</p> : null}
              <div className="detail-actions">
                <button className="primary-button" type="button" disabled={playbackLoading === detail.item.contentId} onClick={() => void play(detail.item)}>{library.positions[detail.item.contentId] ? '▶ Continuar' : '▶ Assistir'}</button>
                <button type="button" onClick={() => library.toggleFavorite(detail.item.contentId)}>{library.favorites.has(detail.item.contentId) ? '★ Na Minha Lista' : '☆ Minha Lista'}</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {detail?.kind === 'series' ? (
        <div className="detail-overlay" role="dialog" aria-modal="true" aria-label={`Detalhes de ${detail.item.title}`}>
          <div className="detail-panel series-detail-panel">
            <button className="detail-close" type="button" onClick={() => setDetail(null)} aria-label="Fechar detalhes">✕</button>
            <div className="detail-poster"><MediaImage src={detail.item.cover} alt={`Capa de ${detail.item.title}`} kind="poster" /></div>
            <div className="detail-copy series-copy">
              <span className="eyebrow">SÉRIE</span><h2>{detail.item.title}</h2><p>{detail.item.synopsis || 'Sinopse não informada.'}</p>
              <button type="button" onClick={() => library.toggleFavorite(detail.item.contentId)}>{library.favorites.has(detail.item.contentId) ? '★ Na Minha Lista' : '☆ Minha Lista'}</button>
              {seriesStatus === 'loading' ? <div className="loading-inline">Carregando episódios…</div> : null}
              {seriesStatus === 'error' ? <div className="form-error">Não foi possível carregar os episódios.</div> : null}
              {seriesStatus === 'ready' && !seriesSeasons.length ? <p className="muted">Os episódios ainda não estão disponíveis no catálogo Web seguro.</p> : null}
              <div className="season-list">
                {seriesSeasons.map(season => (
                  <section key={season.number} className="season-block"><h3>Temporada {season.number}</h3><div className="episode-list">{season.episodes.map(episode => (
                    <button type="button" key={episode.contentId} onClick={() => void play(episode)} disabled={playbackLoading === episode.contentId}>
                      <span className="episode-number">E{episode.number}</span><span><strong>{episode.title}</strong><small>{episode.duration || 'Duração não informada'}</small></span><span className="play-glyph">▶</span>
                    </button>
                  ))}</div></section>
                ))}
              </div>
            </div>
          </div>
        </div>
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

      {toast ? <div className="toast" role="status">{toast}</div> : null}
      {playbackLoading ? <div className="playback-loading"><span className="spinner" />Abrindo conteúdo…</div> : null}
    </div>
  );
}
