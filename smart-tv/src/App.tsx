import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppUpdate } from "./appUpdate";
import { useCatalog } from "./catalog";
import type { Channel, Movie, Series } from "./catalog";
import type { DeviceSession } from "./deviceSession";
import { APP_VERSION, useDeviceSession } from "./deviceSession";
import { moveFocus } from "./focus";
import { useMediaLibrary } from "./mediaLibrary";
import type { LibraryItem, LibraryKind } from "./mediaLibrary";
import { MovieDetailScreen } from "./movie/MovieDetailScreen";
import { closeApplication, isBackKey, platform } from "./platform";
import { PlayerScreen } from "./player/PlayerScreen";
import type { PlaybackItem } from "./player/types";
import { SeriesDetailScreen } from "./series/SeriesDetailScreen";

const destinations = [
  { icon: "⌂", label: "Início" }, { icon: "⌕", label: "Buscar" },
  { icon: "◉", label: "TV ao vivo" }, { icon: "▶", label: "Filmes" },
  { icon: "▣", label: "Séries" }, { icon: "♥", label: "Minha lista" },
  { icon: "⚙", label: "Ajustes" }
];
const PAGE_SIZE = 60;

type MediaCard = {
  id: string;
  kind: LibraryKind;
  name: string;
  image?: string;
  meta: string;
  playback?: PlaybackItem;
  movie?: Movie;
  series?: Series;
  progress?: number;
};

function FocusableButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button data-tv-focusable="true" {...props} />;
}

function ActivationScreen({ session, onRefresh, onReset }: {
  session: DeviceSession; onRefresh: () => void; onReset: () => void;
}) {
  const pending = session.status === "pending";
  const title = {
    loading: "Preparando dispositivo", pending: "Ativar dispositivo", active: "Dispositivo ativo",
    blocked: "Acesso bloqueado", expired: "Assinatura expirada", error: "Falha de conexão"
  }[session.status];
  return <main className="activation-shell"><section className="activation-panel">
    <div className="activation-brand"><span className="brand-mark">R</span><span><b>RONECA</b><small>PLAYER TV</small></span></div>
    <p className="eyebrow">{platform === "webos" ? "LG WEBOS" : platform === "tizen" ? "SAMSUNG TIZEN" : "PRÉ-VISUALIZAÇÃO"}</p>
    <h1>{title}</h1>
    <p className="activation-message">{session.message || (pending ? "Envie o código abaixo ao seu vendedor ou administrador." : "Conectando ao painel com segurança.")}</p>
    {session.deviceCode && <div className="activation-code"><small>CÓDIGO DO APARELHO</small><strong>{session.deviceCode}</strong><span>{pending ? "Aguardando liberação automática" : "Identidade do aparelho"}</span></div>}
    <div className="activation-actions">
      <FocusableButton data-autofocus="true" className="primary" disabled={session.refreshing || session.status === "loading"} onClick={onRefresh}>{session.refreshing ? "Atualizando..." : "Atualizar acesso"}</FocusableButton>
      {(session.status === "blocked" || session.status === "error") && <FocusableButton className="secondary danger" onClick={onReset}>Gerar novo código</FocusableButton>}
    </div>
  </section><div className="activation-art"><i /><span>R</span></div></main>;
}

function Poster({ image }: { image?: string }) {
  return image ? <img src={image} alt="" loading="lazy" onError={event => { event.currentTarget.style.display = "none"; }} /> : <span className="poster-fallback">R</span>;
}

function playableUrls(url: string, alternatives?: string[]) {
  return Array.from(new Set([...(alternatives || []), url].filter(value => typeof value === "string" && value.trim().length > 0)));
}

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

function channelCard(item: Channel): MediaCard {
  return {
    id: item.id, kind: "channel", name: item.name, image: item.logo, meta: item.groupTitle || "TV ao vivo",
    playback: {
      id: item.id, name: item.name, urls: playableUrls(item.url, item.playbackUrls), live: true,
      kind: "channel", image: item.logo, meta: item.groupTitle || "TV ao vivo"
    }
  };
}

function movieCard(item: Movie): MediaCard {
  return {
    id: item.id, kind: "movie", name: item.name, image: item.cover,
    meta: [item.category, item.year || ""].filter(Boolean).join(" • "), movie: item
  };
}

function seriesCard(item: Series): MediaCard {
  return { id: item.id, kind: "series", name: item.name, image: item.cover, meta: item.category || "Séries", series: item };
}

function MediaGrid({ cards, total, onOpen, onMore }: {
  cards: MediaCard[];
  total: number;
  onOpen: (item: MediaCard) => void;
  onMore: () => void;
}) {
  return <section className="catalog-grid">{cards.map((item, index) =>
    <FocusableButton key={`${item.kind}:${item.id}`} data-autofocus={index === 0 ? "true" : undefined} className="media-card" onClick={() => onOpen(item)}>
      <span className="poster"><Poster image={item.image} /></span>
      <strong>{item.name}</strong><small>{item.meta}</small>
      {item.progress != null && item.progress > 0 && <span className="watch-progress"><i style={{ width: `${item.progress}%` }} /></span>}
    </FocusableButton>)}
    {cards.length < total && <FocusableButton className="load-more-card" onClick={onMore}><b>＋</b><strong>Carregar mais</strong><small>{total - cards.length} itens restantes</small></FocusableButton>}
  </section>;
}

export function App() {
  const [selected, setSelected] = useState("Início");
  const [playback, setPlayback] = useState<PlaybackItem | null>(null);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<Series | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todas");
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const { session, refresh, renewConfiguration, reset } = useDeviceSession();
  const catalog = useCatalog(session, renewConfiguration);
  const appUpdate = useAppUpdate(session.status === "active");
  const library = useMediaLibrary();

  useEffect(() => {
    setCategory("Todas");
    setVisibleLimit(PAGE_SIZE);
  }, [selected]);

  useEffect(() => {
    if (playback || selectedSeries || selectedMovie) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const directions: Record<string, "up" | "down" | "left" | "right"> = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right"
      };
      const direction = directions[event.key];
      if (direction) { event.preventDefault(); moveFocus(direction); }
      else if (isBackKey(event)) {
        event.preventDefault();
        if (category !== "Todas") setCategory("Todas");
        else if (selected === "Buscar" && query) setQuery("");
        else if (selected !== "Início") setSelected("Início");
        else closeApplication();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.setTimeout(() => document.querySelector<HTMLElement>("[data-autofocus='true']")?.focus(), 0);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [category, playback, query, selected, selectedMovie, selectedSeries, session.status, catalog.status]);

  const counts = useMemo(() => ({
    channels: catalog.data.channels.length, movies: catalog.data.movies.length, series: catalog.data.series.length
  }), [catalog.data]);

  const allCards = useMemo(() => [
    ...catalog.data.channels.map(channelCard),
    ...catalog.data.movies.map(movieCard),
    ...catalog.data.series.map(seriesCard)
  ], [catalog.data]);

  const resolveLibraryItem = useCallback((saved: LibraryItem): MediaCard | null => {
    if (saved.kind === "channel") {
      const item = catalog.data.channels.find(value => value.id === saved.id);
      return item ? channelCard(item) : null;
    }
    if (saved.kind === "movie") {
      const item = catalog.data.movies.find(value => value.id === saved.id);
      return item ? movieCard(item) : null;
    }
    if (saved.kind === "series") {
      const item = catalog.data.series.find(value => value.id === saved.id);
      return item ? seriesCard(item) : null;
    }
    for (const series of catalog.data.series) {
      for (const season of series.seasons || []) {
        const episode = season.episodes.find(value => value.id === saved.id);
        if (episode) return {
          id: episode.id,
          kind: "episode",
          name: saved.name,
          image: series.cover,
          meta: saved.meta || series.name,
          playback: {
            id: episode.id, name: saved.name, urls: playableUrls(episode.url, episode.playbackUrls),
            live: false, kind: "episode", image: series.cover, meta: saved.meta
          }
        };
      }
    }
    return null;
  }, [catalog.data]);

  const libraryCards = useCallback((items: LibraryItem[]) => items.flatMap(saved => {
    const card = resolveLibraryItem(saved);
    if (!card) return [];
    const progress = saved.duration && saved.currentTime ? Math.min(100, saved.currentTime / saved.duration * 100) : 0;
    return [{ ...card, progress }];
  }), [resolveLibraryItem]);

  const categories = useMemo(() => {
    const source = selected === "TV ao vivo" ? catalog.data.channels.map(item => item.groupTitle)
      : selected === "Filmes" ? catalog.data.movies.map(item => item.category)
        : selected === "Séries" ? catalog.data.series.map(item => item.category) : [];
    return ["Todas", ...Array.from(new Set(source.filter((value): value is string => Boolean(value?.trim())))).sort((a, b) => a.localeCompare(b, "pt-BR"))];
  }, [catalog.data, selected]);

  const filteredCards = useMemo(() => {
    let source: MediaCard[] = [];
    if (selected === "TV ao vivo") source = catalog.data.channels.map(channelCard);
    else if (selected === "Filmes") source = catalog.data.movies.map(movieCard);
    else if (selected === "Séries") source = catalog.data.series.map(seriesCard);
    else if (selected === "Minha lista") source = libraryCards(library.favorites);
    else if (selected === "Buscar") source = allCards;
    const term = normalized(query.trim());
    return source.filter(item => {
      const matchesCategory = category === "Todas" || item.meta.split(" • ")[0] === category;
      const matchesQuery = selected !== "Buscar" || !term || normalized(`${item.name} ${item.meta}`).includes(term);
      return matchesCategory && matchesQuery;
    });
  }, [allCards, catalog.data, category, library.favorites, libraryCards, query, selected]);

  const beginPlayback = useCallback((item: PlaybackItem) => {
    library.remember(item);
    setPlayback(item);
  }, [library]);

  const openCard = useCallback((item: MediaCard) => {
    if (item.playback) beginPlayback(item.playback);
    else if (item.movie) setSelectedMovie(item.movie);
    else if (item.series) setSelectedSeries(item.series);
  }, [beginPlayback]);

  if (playback) return <PlayerScreen
    item={playback}
    onClose={() => setPlayback(null)}
    onProgress={(currentTime, duration) => library.remember(playback, currentTime, duration)}
  />;
  if (selectedMovie) return <MovieDetailScreen
    movie={selectedMovie}
    favorite={library.isFavorite("movie", selectedMovie.id)}
    onBack={() => setSelectedMovie(null)}
    onFavorite={() => library.toggleFavorite({
      id: selectedMovie.id, kind: "movie", name: selectedMovie.name,
      image: selectedMovie.cover, meta: [selectedMovie.category, selectedMovie.year || ""].filter(Boolean).join(" • ")
    })}
    onPlay={beginPlayback}
  />;
  if (selectedSeries) return <SeriesDetailScreen
    series={selectedSeries}
    playlistId={session.selectedPlaylistId}
    favorite={library.isFavorite("series", selectedSeries.id)}
    onBack={() => setSelectedSeries(null)}
    onFavorite={() => library.toggleFavorite({
      id: selectedSeries.id, kind: "series", name: selectedSeries.name,
      image: selectedSeries.cover, meta: selectedSeries.category || "Séries"
    })}
    onPlay={beginPlayback}
  />;
  if (session.status !== "active") return <ActivationScreen session={session} onRefresh={() => void refresh()} onReset={() => void reset()} />;

  const visibleCards = filteredCards.slice(0, visibleLimit);
  const recentCards = libraryCards(library.history).slice(0, 6);
  const favoriteCards = libraryCards(library.favorites).slice(0, 6);

  return <main className="shell">
    <aside className="rail">
      <div className="brand"><span className="brand-mark">R</span><span className="brand-name">RONECA</span></div>
      <nav>{destinations.map(item => <FocusableButton key={item.label} className={`nav-item ${selected === item.label ? "selected" : ""}`} onClick={() => setSelected(item.label)}><span>{item.icon}</span><strong>{item.label}</strong></FocusableButton>)}</nav>
      <small className="platform">{platform.toUpperCase()}</small>
    </aside>
    <section className="content">
      {appUpdate.update && <aside className="update-banner" role="status">
        <span><b>Nova versão {appUpdate.update.versionName}</b><small>{platform === "webos" ? "Atualize pela LG Content Store ou pelo pacote IPK do painel." : "Atualize pela Samsung Apps ou pelo pacote WGT do painel."}</small></span>
        <FocusableButton onClick={appUpdate.dismiss}>Agora não</FocusableButton>
      </aside>}
      <header><div><p className="eyebrow">RONECAPLAYTV</p><h1>{selected}</h1></div><div className="status"><i /> {session.clientName || "Aparelho ativo"} <span>•</span> <b>Ativo</b></div></header>
      {catalog.status === "loading" && <section className="state-panel"><span className="spinner" /><h2>Carregando seu catálogo</h2><p>Buscando canais, filmes e séries com segurança.</p></section>}
      {catalog.status === "error" && <section className="state-panel error"><h2>Não foi possível carregar</h2><p>{catalog.message}</p><FocusableButton data-autofocus="true" className="primary" onClick={catalog.retry}>Tentar novamente</FocusableButton></section>}
      {catalog.status === "ready" && selected === "Início" && <section className="home-scroll">
        <section className="hero"><div className="accent"><i /><i /></div><div className="hero-copy">
          <p className="eyebrow">RONECAPLAYTV</p><h2>Sua programação em um só lugar</h2>
          <p className="description">{session.playlistName ? `${session.playlistName} pronta para explorar.` : "A mesma experiência do aplicativo Android."}</p>
          <div className="hero-actions"><FocusableButton data-autofocus="true" className="primary" onClick={() => setSelected("Buscar")}>Buscar conteúdo</FocusableButton><FocusableButton className="secondary" onClick={() => setSelected("TV ao vivo")}>TV ao vivo</FocusableButton></div>
        </div><div className="hero-art"><div className="orb" /><span>R</span></div></section>
        <section className="explore-section"><div className="section-heading"><div><h3>Explorar</h3><p>Conteúdo real da sua lista</p></div></div><div className="cards">
          {[["TV ao vivo", `${counts.channels.toLocaleString("pt-BR")} canais`, "gold"], ["Filmes", `${counts.movies.toLocaleString("pt-BR")} títulos`, "red"], ["Séries", `${counts.series.toLocaleString("pt-BR")} séries`, "gold"]].map(([label, count, tone]) =>
            <FocusableButton key={label} className={`card ${tone}`} onClick={() => setSelected(label)}><span className="card-icon">◆</span><span><strong>{label}</strong><small>{count}</small></span><b>›</b></FocusableButton>)}
        </div></section>
        {recentCards.length > 0 && <section className="home-library"><div className="section-heading"><h3>Continuar assistindo</h3><p>Seu histórico nesta TV</p></div><div className="home-media-row">{recentCards.map(item =>
          <FocusableButton key={`recent:${item.kind}:${item.id}`} className="home-media-card" onClick={() => openCard(item)}><span className="poster"><Poster image={item.image} /></span><strong>{item.name}</strong>{item.progress != null && <span className="watch-progress"><i style={{ width: `${item.progress}%` }} /></span>}</FocusableButton>)}</div></section>}
        {favoriteCards.length > 0 && <section className="home-library"><div className="section-heading"><h3>Minha lista</h3><p>Seus favoritos</p></div><div className="home-media-row">{favoriteCards.map(item =>
          <FocusableButton key={`favorite:${item.kind}:${item.id}`} className="home-media-card" onClick={() => openCard(item)}><span className="poster"><Poster image={item.image} /></span><strong>{item.name}</strong></FocusableButton>)}</div></section>}
      </section>}
      {catalog.status === "ready" && selected === "Buscar" && <section className="search-tools">
        <label><span>⌕</span><input data-tv-focusable="true" data-autofocus="true" value={query} onChange={event => { setQuery(event.target.value); setVisibleLimit(PAGE_SIZE); }} placeholder="Buscar canais, filmes e séries" /></label>
        {query && <FocusableButton className="clear-search" onClick={() => setQuery("")}>Limpar</FocusableButton>}
        <small>{query ? `${filteredCards.length.toLocaleString("pt-BR")} resultado(s)` : "Digite usando o teclado da TV ou do navegador"}</small>
      </section>}
      {catalog.status === "ready" && ["TV ao vivo", "Filmes", "Séries"].includes(selected) && categories.length > 1 && <section className="category-row">
        {categories.map(item => <FocusableButton key={item} className={`category-chip ${category === item ? "selected" : ""}`} onClick={() => { setCategory(item); setVisibleLimit(PAGE_SIZE); }}>{item}</FocusableButton>)}
      </section>}
      {catalog.status === "ready" && ["Buscar", "TV ao vivo", "Filmes", "Séries", "Minha lista"].includes(selected) && filteredCards.length > 0 &&
        <MediaGrid cards={visibleCards} total={filteredCards.length} onOpen={openCard} onMore={() => setVisibleLimit(value => value + PAGE_SIZE)} />}
      {catalog.status === "ready" && selected === "Ajustes" && <section className="settings-panel">
        <div><p className="eyebrow">APARELHO</p><h2>{session.clientName || "Smart TV"}</h2><dl>
          <dt>Plataforma</dt><dd>{platform === "webos" ? "LG webOS" : platform === "tizen" ? "Samsung Tizen" : "Navegador"}</dd>
          <dt>Versão</dt><dd>{APP_VERSION}</dd><dt>Código</dt><dd>{session.deviceCode}</dd>
          <dt>Lista</dt><dd>{session.playlistName || "Lista ativa"}</dd>
        </dl></div>
        <div className="settings-actions"><FocusableButton data-autofocus="true" className="secondary" onClick={() => void appUpdate.refresh()}>{appUpdate.checking ? "Verificando..." : "Verificar atualização"}</FocusableButton><FocusableButton className="secondary danger" onClick={library.clearHistory}>Limpar histórico desta TV</FocusableButton></div>
      </section>}
      {catalog.status === "ready" && ["Buscar", "TV ao vivo", "Filmes", "Séries", "Minha lista"].includes(selected) && filteredCards.length === 0 && <section className="state-panel">
        <h2>{selected === "Minha lista" ? "Sua lista está vazia" : selected === "Buscar" && !query ? "O que você quer assistir?" : "Nenhum conteúdo encontrado"}</h2>
        <p>{selected === "Minha lista" ? "Adicione filmes e séries pelos detalhes do conteúdo." : selected === "Buscar" && !query ? "Selecione o campo acima para começar a busca." : "Tente outro nome ou categoria."}</p>
      </section>}
    </section>
  </main>;
}
