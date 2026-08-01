import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppUpdate } from "./appUpdate";
import { useCatalog } from "./catalog";
import type { CatalogFailoverResult, Channel, Movie, Series } from "./catalog";
import type { DeviceSession, SeriesSeasonResponse } from "./deviceSession";
import { APP_VERSION, fetchSeriesSeasons, useDeviceSession } from "./deviceSession";
import { channelContentKey, episodeContentKey, movieContentKey, seriesContentKey } from "./contentIdentity";
import { moveFocus } from "./focus";
import { playLaunchSoundOnce } from "./launchSound";
import { useMediaLibrary } from "./mediaLibrary";
import type { LibraryItem, LibraryKind } from "./mediaLibrary";
import { MovieDetailScreen } from "./movie/MovieDetailScreen";
import { closeApplication, isBackKey, platform } from "./platform";
import { PlayerScreen } from "./player/PlayerScreen";
import type { PlaybackItem, PlaybackQueueItem } from "./player/types";
import { useSmartTvPlayerSettings } from "./playerSettings";
import { SeriesDetailScreen } from "./series/SeriesDetailScreen";

const destinations = [
  { icon: "⌂", label: "Início" },
  { icon: "◉", label: "Canais" },
  { icon: "▶", label: "Filmes" },
  { icon: "▥", label: "Séries" },
  { icon: "♡", label: "Minha lista" },
  { icon: "⚙", label: "Configurações" }
];
const PAGE_SIZE = 60;
type AppDialog = "privacy" | "support" | "unlink" | "clear-data" | null;
type SuccessfulCatalogFailover = Extract<CatalogFailoverResult, { outcome: "switched" }>;

type MediaCard = {
  id: string;
  contentKey: string;
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
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [image]);
  return image && !failed
    ? <img src={image} alt="" loading="lazy" onError={() => setFailed(true)} />
    : <span className="poster-fallback">R</span>;
}

function playableUrls(url: string, alternatives?: string[]) {
  return Array.from(new Set([...(alternatives || []), url].filter(value => typeof value === "string" && value.trim().length > 0)));
}

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
}

function channelCard(item: Channel): MediaCard {
  const contentKey = channelContentKey(item);
  return {
    id: item.id, contentKey, kind: "channel", name: item.name, image: item.logo, meta: item.groupTitle || "TV ao vivo",
    playback: {
      id: item.id, contentKey, name: item.name, urls: playableUrls(item.url, item.playbackUrls), live: true,
      kind: "channel", image: item.logo, meta: item.groupTitle || "TV ao vivo"
    }
  };
}

function movieCard(item: Movie): MediaCard {
  return {
    id: item.id, contentKey: movieContentKey(item), kind: "movie", name: item.name, image: item.cover,
    meta: [item.category, item.year || ""].filter(Boolean).join(" • "), movie: item
  };
}

function seriesCard(item: Series): MediaCard {
  return { id: item.id, contentKey: seriesContentKey(item), kind: "series", name: item.name, image: item.cover, meta: item.category || "Séries", series: item };
}

function queueFromSeasons(seriesName: string, image: string | undefined, seasons: SeriesSeasonResponse[]): PlaybackQueueItem[] {
  return seasons.flatMap(season => season.episodes.map(episode => ({
    id: episode.id,
    contentKey: episodeContentKey(seriesName, season, episode),
    seriesKey: seriesContentKey({ name: seriesName }),
    name: `${seriesName} • T${season.number}E${episode.number}`,
    urls: playableUrls(episode.url, episode.playbackUrls),
    image,
    meta: `${seriesName} • T${season.number}E${episode.number}`,
    seasonNumber: season.number,
    episodeNumber: episode.number
  })));
}

async function recoveredPlayback(item: PlaybackItem, result: SuccessfulCatalogFailover): Promise<PlaybackItem | null> {
  if (item.kind === "channel") {
    const channel = result.data.channels.find(value => channelContentKey(value) === item.contentKey)
      || result.data.channels.find(value => value.id === item.id)
      || result.data.channels.find(value => normalized(value.name) === normalized(item.name));
    return channel ? channelCard(channel).playback || null : null;
  }
  if (item.kind === "movie") {
    const movie = result.data.movies.find(value => movieContentKey(value) === item.contentKey)
      || result.data.movies.find(value => value.id === item.id)
      || result.data.movies.find(value => normalized(value.name) === normalized(item.name));
    if (!movie) return null;
    return {
      id: movie.id,
      contentKey: movieContentKey(movie),
      name: movie.name,
      urls: playableUrls(movie.url, movie.playbackUrls),
      live: false,
      kind: "movie",
      image: movie.cover,
      meta: [movie.category, movie.year || ""].filter(Boolean).join(" • ")
    };
  }
  if (item.kind !== "episode") return null;
  const current = item.seriesQueue?.[item.seriesQueueIndex ?? -1];
  if (!current) return null;
  const seriesName = (item.meta || item.name).split(" • ")[0].trim();
  const series = result.data.series.find(value => seriesContentKey(value) === current.seriesKey)
    || result.data.series.find(value => normalized(value.name) === normalized(seriesName));
  if (!series) return null;
  let seasons: SeriesSeasonResponse[] = (series.seasons || []).map(season => ({
    number: season.number,
    episodes: season.episodes.map(episode => ({ ...episode, playbackUrls: episode.playbackUrls || [episode.url] }))
  }));
  if (!seasons.length && series.xtreamSeriesId != null) {
    seasons = await fetchSeriesSeasons(String(series.xtreamSeriesId), result.playlistId);
  }
  const queue = queueFromSeasons(series.name, series.cover, seasons);
  const index = queue.findIndex(entry => entry.seasonNumber === current.seasonNumber && entry.episodeNumber === current.episodeNumber);
  if (index < 0) return null;
  const episode = queue[index];
  return {
    id: episode.id,
    contentKey: episode.contentKey,
    name: episode.name,
    urls: episode.urls,
    live: false,
    kind: "episode",
    image: episode.image,
    meta: episode.meta,
    seriesQueue: queue,
    seriesQueueIndex: index
  };
}

function MediaGrid({ cards, total, onOpen, onMore, isFavorite, onFavorite }: {
  cards: MediaCard[];
  total: number;
  onOpen: (item: MediaCard) => void;
  onMore: () => void;
  isFavorite: (item: MediaCard) => boolean;
  onFavorite: (item: MediaCard) => void;
}) {
  return <section className="catalog-grid">{cards.map((item, index) =>
    <div className="media-card-shell" key={`${item.kind}:${item.id}`}>
      <FocusableButton data-autofocus={index === 0 ? "true" : undefined} className="media-card" onClick={() => onOpen(item)}>
        <span className="poster"><Poster image={item.image} /></span>
        <span className="media-badge">{item.kind === "channel" ? "AO VIVO" : item.kind === "movie" ? "FILME" : "SÉRIE"}</span>
        <strong>{item.name}</strong><small>{item.meta}</small>
        {item.progress != null && item.progress > 0 && <span className="watch-progress"><i style={{ width: `${item.progress}%` }} /></span>}
      </FocusableButton>
      {item.kind === "channel" && <FocusableButton aria-label={isFavorite(item) ? `Remover ${item.name} dos favoritos` : `Favoritar ${item.name}`} className={`favorite-card-action ${isFavorite(item) ? "selected" : ""}`} onClick={() => onFavorite(item)}>{isFavorite(item) ? "♥" : "♡"}</FocusableButton>}
    </div>)}
    {cards.length < total && <FocusableButton className="load-more-card" onClick={onMore}><b>＋</b><strong>Carregar mais</strong><small>{total - cards.length} itens restantes</small></FocusableButton>}
  </section>;
}

export function App() {
  const [selected, setSelected] = useState("Início");
  const [playback, setPlayback] = useState<PlaybackItem | null>(null);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<Series | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todos");
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const [dialog, setDialog] = useState<AppDialog>(null);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const { session, refresh, renewConfiguration, reset } = useDeviceSession();
  const catalog = useCatalog(session, renewConfiguration);
  const appUpdate = useAppUpdate(session.status === "active");
  const library = useMediaLibrary();
  const { settings, update: updateSettings } = useSmartTvPlayerSettings();

  useEffect(() => {
    const identities: Array<Pick<LibraryItem, "id" | "kind" | "contentKey">> = [
      ...catalog.data.channels.map(item => ({ id: item.id, kind: "channel" as const, contentKey: channelContentKey(item) })),
      ...catalog.data.movies.map(item => ({ id: item.id, kind: "movie" as const, contentKey: movieContentKey(item) })),
      ...catalog.data.series.map(item => ({ id: item.id, kind: "series" as const, contentKey: seriesContentKey(item) })),
      ...catalog.data.series.flatMap(series => (series.seasons || []).flatMap(season =>
        season.episodes.map(episode => ({
          id: episode.id,
          kind: "episode" as const,
          contentKey: episodeContentKey(series.name, season, episode)
        }))
      ))
    ];
    library.reconcileIdentities(identities);
  }, [catalog.data, library.reconcileIdentities]);

  useEffect(() => { void playLaunchSoundOnce(settings.launchSoundEnabled); }, [settings.launchSoundEnabled]);
  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => { window.removeEventListener("online", handleOnline); window.removeEventListener("offline", handleOffline); };
  }, []);
  useEffect(() => { setCategory("Todos"); setQuery(""); setVisibleLimit(PAGE_SIZE); }, [selected]);
  useEffect(() => {
    if (playback || selectedSeries || selectedMovie) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const directions: Record<string, "up" | "down" | "left" | "right"> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
      const direction = directions[event.key];
      if (dialog) {
        if (isBackKey(event)) { event.preventDefault(); setDialog(null); }
        else if (direction) { event.preventDefault(); moveFocus(direction, document.querySelector(".app-dialog") || document); }
        return;
      }
      if (direction) { event.preventDefault(); moveFocus(direction); }
      else if (isBackKey(event)) {
        event.preventDefault();
        if (category !== "Todos") setCategory("Todos");
        else if (selected === "Buscar" && query) setQuery("");
        else if (selected !== "Início") setSelected("Início");
        else closeApplication();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.setTimeout(() => {
      const selector = dialog ? ".app-dialog [data-autofocus='true']" : "[data-autofocus='true']";
      document.querySelector<HTMLElement>(selector)?.focus();
    }, 0);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [category, dialog, playback, query, selected, selectedMovie, selectedSeries, session.status, catalog.status]);

  const counts = useMemo(() => ({ channels: catalog.data.channels.length, movies: catalog.data.movies.length, series: catalog.data.series.length }), [catalog.data]);
  const allCards = useMemo(() => [...catalog.data.channels.map(channelCard), ...catalog.data.movies.map(movieCard), ...catalog.data.series.map(seriesCard)], [catalog.data]);
  const resolveLibraryItem = useCallback((saved: LibraryItem): MediaCard | null => {
    if (saved.kind === "channel") { const item = catalog.data.channels.find(value => saved.contentKey ? channelContentKey(value) === saved.contentKey : value.id === saved.id); return item ? channelCard(item) : null; }
    if (saved.kind === "movie") { const item = catalog.data.movies.find(value => saved.contentKey ? movieContentKey(value) === saved.contentKey : value.id === saved.id); return item ? movieCard(item) : null; }
    if (saved.kind === "series") { const item = catalog.data.series.find(value => saved.contentKey ? seriesContentKey(value) === saved.contentKey : value.id === saved.id); return item ? seriesCard(item) : null; }
    for (const series of catalog.data.series) {
      const queue = queueFromSeasons(series.name, series.cover, series.seasons || []);
      const queueIndex = queue.findIndex(value => saved.contentKey
        ? value.contentKey === saved.contentKey
        : value.id === saved.id);
      const episode = queue[queueIndex];
      if (episode) return {
        id: episode.id, contentKey: episode.contentKey, kind: "episode", name: episode.name,
        image: episode.image, meta: episode.meta || saved.meta || series.name,
        playback: {
          id: episode.id, contentKey: episode.contentKey, name: episode.name, urls: episode.urls,
          live: false, kind: "episode", image: episode.image, meta: episode.meta,
          seriesQueue: queue, seriesQueueIndex: queueIndex
        }
      };
    }
    return null;
  }, [catalog.data]);
  const libraryCards = useCallback((items: LibraryItem[]) => items.flatMap(saved => {
    const card = resolveLibraryItem(saved); if (!card) return [];
    const progress = saved.duration && saved.currentTime ? Math.min(100, saved.currentTime / saved.duration * 100) : 0;
    return [{ ...card, progress }];
  }), [resolveLibraryItem]);
  const categories = useMemo(() => {
    const source = selected === "Canais" ? catalog.data.channels.map(item => item.groupTitle)
      : selected === "Filmes" ? catalog.data.movies.map(item => item.category)
        : selected === "Séries" ? catalog.data.series.map(item => item.category) : [];
    const fixed = selected === "Canais" ? ["Todos", "Favoritos", "A-Z"]
      : selected === "Filmes" ? ["Todos", "Minha Lista", "Continuar"]
        : selected === "Séries" ? ["Todos", "Minha Lista"] : ["Todos"];
    return [...fixed, ...Array.from(new Set(source.filter((value): value is string => Boolean(value?.trim())))).sort((a, b) => a.localeCompare(b, "pt-BR"))];
  }, [catalog.data, selected]);
  const filteredCards = useMemo(() => {
    let source: MediaCard[] = [];
    if (selected === "Canais") source = catalog.data.channels.map(channelCard);
    else if (selected === "Filmes") source = catalog.data.movies.map(movieCard);
    else if (selected === "Séries") source = catalog.data.series.map(seriesCard);
    else if (selected === "Minha lista") source = libraryCards(library.favorites);
    else if (selected === "Buscar") source = allCards;
    const term = normalized(query.trim());
    const historyIds = new Set(library.history.map(item => item.contentKey || `${item.kind}:${item.id}`));
    const filtered = source.filter(item => {
      const saved = library.isFavorite(item.kind, item.id, item.contentKey);
      const matchesCategory = category === "Todos" || category === "A-Z" || (category === "Favoritos" && saved)
        || (category === "Minha Lista" && saved) || (category === "Continuar" && (historyIds.has(item.contentKey) || historyIds.has(`${item.kind}:${item.id}`)))
        || item.meta.split(" • ")[0] === category;
      const matchesQuery = !term || normalized(`${item.name} ${item.meta}`).includes(term);
      return matchesCategory && matchesQuery;
    });
    return category === "A-Z" ? [...filtered].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")) : filtered;
  }, [allCards, catalog.data, category, library.favorites, library.history, libraryCards, query, selected]);
  const beginPlayback = useCallback((item: PlaybackItem) => {
    const kind = item.kind || (item.live ? "channel" : "movie");
    const saved = library.history.find(value =>
      value.kind === kind && (value.contentKey === item.contentKey || (!value.contentKey && value.id === item.id))
    );
    const canResume = !item.live && Boolean(saved?.currentTime && saved.currentTime >= 30) && Boolean(saved?.duration && saved.duration - (saved.currentTime || 0) > 60);
    setPlayback(canResume ? { ...item, startTime: saved?.currentTime } : item);
  }, [library.history]);
  const openCard = useCallback((item: MediaCard) => {
    if (item.playback) beginPlayback(item.playback);
    else if (item.movie) setSelectedMovie(item.movie);
    else if (item.series) setSelectedSeries(item.series);
  }, [beginPlayback]);

  if (playback) {
    const activePlaylistId = catalog.activePlaylistId || session.selectedPlaylistId;
    const backupAvailable = session.playlists.some(value => value.id !== activePlaylistId && value.role === "backup");
    return <PlayerScreen
      key={`${playback.id}:${playback.recoveryAttempt || 0}`}
      item={playback}
      playlistId={activePlaylistId}
      channels={playback.live ? catalog.data.channels.filter(channel => !playback.meta || channel.groupTitle === playback.meta) : []}
      bufferSeconds={settings.bufferSeconds}
      automaticReconnect={settings.automaticReconnect}
      backupAvailable={backupAvailable}
      onChangeChannel={channel => beginPlayback(channelCard(channel).playback!)}
      onChangePlayback={beginPlayback}
      onClose={() => setPlayback(null)}
      onProgress={(currentTime, duration) => library.remember(playback, currentTime, duration)}
      onTerminalPlaybackFailure={async (reason, currentTime, duration, diagnosticEventId) => {
        const result = await catalog.failover({
          attemptId: diagnosticEventId,
          reason,
          contentKey: playback.contentKey
        });
        if (result.outcome !== "switched") return false;
        const replacement = await recoveredPlayback(playback, result).catch(() => null);
        if (!replacement) return false;
        if (!playback.live && currentTime > 0) library.remember(playback, currentTime, duration);
        setPlayback({
          ...replacement,
          startTime: playback.live ? 0 : currentTime,
          recoveryAttempt: (playback.recoveryAttempt || 0) + 1,
          diagnosticEventId
        });
        return true;
      }}
    />;
  }
  if (selectedMovie) return <MovieDetailScreen movie={selectedMovie} favorite={library.isFavorite("movie", selectedMovie.id, movieContentKey(selectedMovie))} onBack={() => setSelectedMovie(null)} onFavorite={() => library.toggleFavorite({ id: selectedMovie.id, contentKey: movieContentKey(selectedMovie), kind: "movie", name: selectedMovie.name, image: selectedMovie.cover, meta: [selectedMovie.category, selectedMovie.year || ""].filter(Boolean).join(" • ") })} related={catalog.data.movies.filter(item => item.id !== selectedMovie.id && item.category === selectedMovie.category).slice(0, 5)} onOpenMovie={setSelectedMovie} onPlay={beginPlayback} />;
  if (selectedSeries) return <SeriesDetailScreen series={selectedSeries} playlistId={catalog.activePlaylistId || session.selectedPlaylistId} favorite={library.isFavorite("series", selectedSeries.id, seriesContentKey(selectedSeries))} recommendations={catalog.data.series.filter(item => item.id !== selectedSeries.id && item.category === selectedSeries.category).slice(0, 5)} onBack={() => setSelectedSeries(null)} onFavorite={() => library.toggleFavorite({ id: selectedSeries.id, contentKey: seriesContentKey(selectedSeries), kind: "series", name: selectedSeries.name, image: selectedSeries.cover, meta: selectedSeries.category || "Séries" })} onOpenRecommendation={setSelectedSeries} onPlay={beginPlayback} />;
  if (session.status !== "active") return <ActivationScreen session={session} onRefresh={() => void refresh()} onReset={() => void reset()} />;

  const visibleCards = filteredCards.slice(0, visibleLimit);
  const recentCards = libraryCards(library.history).slice(0, 6);
  const favoriteCards = libraryCards(library.favorites).slice(0, 6);
  const featuredMovie = catalog.data.movies.find(item => item.cover) || catalog.data.movies[0];
  const featuredSeries = catalog.data.series.find(item => item.cover) || catalog.data.series[0];

  return <main className="shell">
    <aside className="rail"><div className="brand"><span className="brand-mark">RP</span><span className="brand-name">RONECA</span></div><nav>{destinations.map(item => <FocusableButton key={item.label} className={`nav-item ${selected === item.label ? "selected" : ""}`} onClick={() => setSelected(item.label)}><span>{item.icon}</span><strong>{item.label}</strong></FocusableButton>)}</nav><small className="platform">{platform.toUpperCase()}</small></aside>
    <section className={`content ${["Canais", "Filmes", "Séries"].includes(selected) ? "catalog-view" : ""}`}>
      {!online && <aside className="connection-banner" role="status"><b>Sem internet</b><span>O catálogo aberto continua disponível. A sincronização volta automaticamente quando a conexão retornar.</span></aside>}
      {appUpdate.update && <aside className="update-banner" role="status"><span><b>Nova versão {appUpdate.update.versionName}</b><small>{window.location.protocol === "https:" ? "A versão estável será carregada automaticamente na próxima abertura." : platform === "webos" ? "Atualize pela LG Content Store ou pelo pacote IPK do painel." : "Atualize pela Samsung Apps ou pelo pacote WGT do painel."}</small></span><FocusableButton onClick={appUpdate.dismiss}>Agora não</FocusableButton></aside>}
      <header><div><p className="eyebrow">RONECAPLAYTV</p><h1>{selected}</h1></div><div className="status"><i /> {session.clientName || "Aparelho ativo"} <span>•</span> <b>{catalog.usingBackupPlaylist ? "Reserva ativa" : "Ativo"}</b></div></header>
      {catalog.status === "loading" && <section className="state-panel"><span className="spinner" /><h2>Carregando seu catálogo</h2><p>Buscando canais, filmes e séries com segurança.</p></section>}
      {catalog.status === "error" && <section className="state-panel error"><h2>Não foi possível carregar</h2><p>{catalog.message}</p><FocusableButton data-autofocus="true" className="primary" onClick={catalog.retry}>Tentar novamente</FocusableButton></section>}
      {catalog.status === "ready" && catalog.message && <section className="state-panel"><h2>{catalog.usingBackupPlaylist ? "Lista reserva ativa" : "Aviso do catálogo"}</h2><p>{catalog.message}</p></section>}
      {catalog.status === "ready" && selected === "Início" && <section className="home-scroll"><div className="home-feature-layout"><section className="hero">{featuredMovie?.cover && <img className="hero-backdrop" src={featuredMovie.cover} alt="" />}<div className="hero-shade" /><div className="accent"><i /><i /></div><div className="hero-copy"><p className="eyebrow">{(featuredMovie?.category || "RONECAPLAYTV").toUpperCase()}</p><h2>{featuredMovie?.name || "Sua programação em um só lugar"}</h2><p className="description">{featuredMovie?.synopsis || (session.playlistName ? `${session.playlistName} pronta para explorar.` : "A mesma experiência do aplicativo Android.")}</p><div className="hero-actions"><FocusableButton data-autofocus="true" className="primary" onClick={() => featuredMovie ? setSelectedMovie(featuredMovie) : setSelected("Filmes")}>{featuredMovie ? "Ver detalhes" : "Explorar filmes"}</FocusableButton><FocusableButton className="secondary" onClick={() => setSelected("Canais")}>TV ao vivo</FocusableButton></div></div></section><aside className="featured-rail"><FocusableButton onClick={() => featuredMovie ? setSelectedMovie(featuredMovie) : setSelected("Filmes")}><span className={`featured-media ${featuredMovie?.cover ? "" : "is-placeholder"}`}>{featuredMovie?.cover ? <img src={featuredMovie.cover} alt="" /> : <Poster />}</span><small>FILME EM DESTAQUE</small><strong>{featuredMovie?.name || "Explorar filmes"}</strong></FocusableButton><FocusableButton onClick={() => featuredSeries ? setSelectedSeries(featuredSeries) : setSelected("Séries")}><span className={`featured-media ${featuredSeries?.cover ? "" : "is-placeholder"}`}>{featuredSeries?.cover ? <img src={featuredSeries.cover} alt="" /> : <Poster />}</span><small>SÉRIE EM DESTAQUE</small><strong>{featuredSeries?.name || "Explorar séries"}</strong></FocusableButton></aside></div>
        <section className="explore-section"><div className="section-heading"><div><h3>Explorar</h3><p>Conteúdo real da sua lista</p></div></div><div className="cards">{[["Canais", "TV ao vivo", `${counts.channels.toLocaleString("pt-BR")} canais`, "gold"], ["Filmes", "Filmes", `${counts.movies.toLocaleString("pt-BR")} títulos`, "red"], ["Séries", "Séries", `${counts.series.toLocaleString("pt-BR")} séries`, "gold"], ["Minha lista", "Minha lista", `${library.favorites.length.toLocaleString("pt-BR")} favoritos`, "red"]].map(([target, label, count, tone]) => <FocusableButton key={target} className={`card ${tone}`} onClick={() => setSelected(target)}><span className="card-icon">{target === "Canais" ? "◉" : target === "Filmes" ? "▶" : target === "Séries" ? "▥" : "♡"}</span><span className="card-copy"><strong>{label}</strong><small>{count}</small></span><b>›</b></FocusableButton>)}</div></section>
        {recentCards.length > 0 && <section className="home-library"><div className="section-heading"><h3>Continuar assistindo</h3><p>Seu histórico nesta TV</p></div><div className="home-media-row">{recentCards.map(item => <FocusableButton key={`recent:${item.kind}:${item.id}`} className="home-media-card" onClick={() => openCard(item)}><span className="poster"><Poster image={item.image} /></span><strong>{item.name}</strong>{item.progress != null && <span className="watch-progress"><i style={{ width: `${item.progress}%` }} /></span>}</FocusableButton>)}</div></section>}
        {favoriteCards.length > 0 && <section className="home-library"><div className="section-heading"><h3>Minha lista</h3><p>Seus favoritos</p></div><div className="home-media-row">{favoriteCards.map(item => <FocusableButton key={`favorite:${item.kind}:${item.id}`} className="home-media-card" onClick={() => openCard(item)}><span className="poster"><Poster image={item.image} /></span><strong>{item.name}</strong></FocusableButton>)}</div></section>}
      </section>}
      {catalog.status === "ready" && selected === "Buscar" && <section className="search-tools"><label><span>⌕</span><input data-tv-focusable="true" data-autofocus="true" value={query} onChange={event => { setQuery(event.target.value); setVisibleLimit(PAGE_SIZE); }} placeholder="Buscar canais, filmes e séries" /></label>{query && <FocusableButton className="clear-search" onClick={() => setQuery("")}>Limpar</FocusableButton>}<small>{query ? `${filteredCards.length.toLocaleString("pt-BR")} resultado(s)` : "Digite usando o teclado da TV ou do navegador"}</small></section>}
      {catalog.status === "ready" && ["Canais", "Filmes", "Séries"].includes(selected) && <section className="catalog-toolbar"><div><h2>{selected === "Canais" ? "TV ao vivo" : selected}</h2><small>{filteredCards.length.toLocaleString("pt-BR")} {selected === "Canais" ? "canais" : selected === "Filmes" ? "títulos" : "séries"}</small></div><label><span>⌕</span><input data-tv-focusable="true" value={query} onChange={event => { setQuery(event.target.value); setVisibleLimit(PAGE_SIZE); }} placeholder={`Buscar em ${selected.toLocaleLowerCase("pt-BR")}`} /></label></section>}
      {catalog.status === "ready" && ["Canais", "Filmes", "Séries"].includes(selected) && categories.length > 1 && <section className="category-row">{categories.map(item => <FocusableButton key={item} className={`category-chip ${category === item ? "selected" : ""}`} onClick={() => { setCategory(item); setVisibleLimit(PAGE_SIZE); }}>{item}</FocusableButton>)}</section>}
      {catalog.status === "ready" && ["Buscar", "Canais", "Filmes", "Séries", "Minha lista"].includes(selected) && filteredCards.length > 0 && <MediaGrid cards={visibleCards} total={filteredCards.length} onOpen={openCard} onMore={() => setVisibleLimit(value => value + PAGE_SIZE)} isFavorite={item => library.isFavorite(item.kind, item.id, item.contentKey)} onFavorite={item => library.toggleFavorite({ id: item.id, contentKey: item.contentKey, kind: item.kind, name: item.name, image: item.image, meta: item.meta })} />}
      {catalog.status === "ready" && selected === "Configurações" && <section className="settings-list">
        <div className="settings-heading"><p className="eyebrow">AJUSTES DO APP</p><h2>Configurações</h2><small>Preferências, diagnóstico e informações desta TV</small></div>
        <section className="settings-card"><span><strong>Atualizar conteúdo</strong><small>Sincronizar novamente a lista ativa sem apagar o último catálogo válido.</small></span><FocusableButton data-autofocus="true" onClick={catalog.retry}>ATUALIZAR</FocusableButton></section>
        <p className="settings-section-title">PLAYER</p>
        <section className="settings-card info"><span><strong>Decodificação</strong><small>{platform === "tizen" ? "Samsung AVPlay nativo com seleção automática de formato." : "Player HTML5 otimizado para o webOS da televisão."}</small></span><b>{platform === "tizen" ? "AVPLAY" : "HTML5"}</b></section>
        <section className="settings-card"><span><strong>Buffer inicial</strong><small>Um buffer maior ajuda conexões instáveis, mas demora um pouco mais para iniciar.</small></span><div className="settings-options">{([2, 5, 10] as const).map(value => <FocusableButton key={value} className={settings.bufferSeconds === value ? "selected" : ""} onClick={() => updateSettings({ bufferSeconds: value })}>{value}s</FocusableButton>)}</div></section>
        <section className="settings-card"><span><strong>Reconexão automática</strong><small>Tentar novamente, alternar origens e usar a lista reserva sem fechar o player.</small></span><FocusableButton className={settings.automaticReconnect ? "selected" : ""} onClick={() => updateSettings({ automaticReconnect: !settings.automaticReconnect })}>{settings.automaticReconnect ? "ATIVA" : "DESATIVADA"}</FocusableButton></section>
        <section className="settings-card"><span><strong>Som de abertura</strong><small>Reproduzir a assinatura sonora ao iniciar o aplicativo.</small></span><FocusableButton className={settings.launchSoundEnabled ? "selected" : ""} onClick={() => updateSettings({ launchSoundEnabled: !settings.launchSoundEnabled })}>{settings.launchSoundEnabled ? "ATIVO" : "DESATIVADO"}</FocusableButton></section>
        <p className="settings-section-title">DIAGNÓSTICO</p>
        <section className="settings-card info"><span><strong>{catalog.usingBackupPlaylist ? "Lista reserva em uso" : "Lista principal em uso"}</strong><small>{catalog.activePlaylistName || session.playlistName || "Lista ativa"} • {counts.channels} canais • {counts.movies} filmes • {counts.series} séries</small></span><b>{online ? "CONECTADO" : "SEM INTERNET"}</b></section>
        <section className="settings-card info"><span><strong>Última sincronização</strong><small>{catalog.lastSuccessfulSync ? new Date(catalog.lastSuccessfulSync).toLocaleString("pt-BR") : "Ainda não concluída"}{catalog.lastFailure ? ` • Última falha: ${catalog.lastFailure}` : ""}</small></span><b>{catalog.usingBackupPlaylist ? "RESERVA" : "PRINCIPAL"}</b></section>
        {session.expiresAt && Math.ceil((new Date(session.expiresAt).getTime() - Date.now()) / 86_400_000) <= 7 && <section className="settings-card warning-card"><span><strong>Assinatura próxima do vencimento</strong><small>Vencimento em {new Date(session.expiresAt).toLocaleDateString("pt-BR")}. Fale com seu vendedor para renovar.</small></span><b>ATENÇÃO</b></section>}
        <p className="settings-section-title">APLICATIVO</p>
        <section className="settings-card"><span><strong>Atualizações do aplicativo</strong><small>Versão atual {APP_VERSION}</small></span><FocusableButton onClick={() => void appUpdate.refresh()}>{appUpdate.checking ? "AGUARDE" : "VERIFICAR"}</FocusableButton></section>
        <section className="settings-card info"><span><strong>{session.clientName || "RonecaPlayTV"}</strong><small>{platform === "webos" ? "LG webOS" : platform === "tizen" ? "Samsung Tizen" : "Navegador"} • Código {session.deviceCode}</small></span><b>SMART TV</b></section>
        <section className="settings-card"><span><strong>Suporte</strong><small>Consultar os dados que ajudam a identificar esta TV.</small></span><FocusableButton onClick={() => setDialog("support")}>ABRIR</FocusableButton></section>
        <section className="settings-card"><span><strong>Privacidade</strong><small>Entender quais dados ficam nesta TV e quais são usados na ativação.</small></span><FocusableButton onClick={() => setDialog("privacy")}>LER</FocusableButton></section>
        <section className="settings-card danger-card"><span><strong>Limpar dados desta TV</strong><small>Remover favoritos, histórico e progresso salvos localmente.</small></span><FocusableButton className="danger" onClick={() => setDialog("clear-data")}>LIMPAR</FocusableButton></section>
        <section className="settings-card danger-card"><span><strong>Desvincular aparelho</strong><small>Encerrar esta ativação e gerar um novo código para a TV.</small></span><FocusableButton className="danger" onClick={() => setDialog("unlink")}>DESVINCULAR</FocusableButton></section>
      </section>}
      {catalog.status === "ready" && ["Buscar", "Canais", "Filmes", "Séries", "Minha lista"].includes(selected) && filteredCards.length === 0 && <section className="state-panel"><h2>{selected === "Minha lista" ? "Sua lista está vazia" : selected === "Buscar" && !query ? "O que você quer assistir?" : "Nenhum conteúdo encontrado"}</h2><p>{selected === "Minha lista" ? "Adicione filmes e séries pelos detalhes do conteúdo." : selected === "Buscar" && !query ? "Selecione o campo acima para começar a busca." : "Tente outro nome ou categoria."}</p></section>}
    </section>
    {dialog && <section className="app-dialog-backdrop" role="presentation"><article className="app-dialog" role="dialog" aria-modal="true">
      <p className="eyebrow">{dialog === "privacy" ? "PRIVACIDADE" : dialog === "support" ? "SUPORTE" : "CONFIRMAÇÃO"}</p>
      <h2>{dialog === "privacy" ? "Privacidade nesta TV" : dialog === "support" ? "Dados para suporte" : dialog === "unlink" ? "Desvincular este aparelho?" : "Limpar dados locais?"}</h2>
      {dialog === "privacy" && <div className="dialog-copy"><p>O aplicativo usa uma identidade exclusiva do aparelho para consultar a ativação, a validade do acesso e as listas autorizadas no painel.</p><p>Favoritos, histórico, progresso e preferências ficam armazenados localmente nesta TV.</p><p>Diagnósticos enviam somente aparelho, conteúdo, posição, versão e tipo de erro. URLs e credenciais nunca são exibidas.</p></div>}
      {dialog === "support" && <dl><dt>Código do aparelho</dt><dd>{session.deviceCode || "Não disponível"}</dd><dt>Plataforma</dt><dd>{platform === "webos" ? "LG webOS" : platform === "tizen" ? "Samsung Tizen" : "Navegador"}</dd><dt>Versão</dt><dd>{APP_VERSION}</dd><dt>Lista ativa</dt><dd>{catalog.activePlaylistName || session.playlistName || "Não disponível"} ({catalog.usingBackupPlaylist ? "reserva" : "principal"})</dd><dt>Conexão</dt><dd>{online ? "Conectada" : "Sem internet"}</dd></dl>}
      {dialog === "unlink" && <p>Esta TV voltará para a tela de ativação e receberá um novo código. Favoritos, histórico e progresso também serão removidos.</p>}
      {dialog === "clear-data" && <p>Favoritos, histórico e progresso serão removidos somente desta TV. A ativação e a lista continuarão funcionando.</p>}
      <div className="dialog-actions">{(dialog === "privacy" || dialog === "support") && <FocusableButton data-autofocus="true" className="primary" onClick={() => setDialog(null)}>FECHAR</FocusableButton>}{dialog === "clear-data" && <><FocusableButton data-autofocus="true" className="danger" onClick={() => { library.clearAll(); setDialog(null); }}>CONFIRMAR LIMPEZA</FocusableButton><FocusableButton className="secondary" onClick={() => setDialog(null)}>CANCELAR</FocusableButton></>}{dialog === "unlink" && <><FocusableButton data-autofocus="true" className="danger" onClick={() => { library.clearAll(); setDialog(null); void reset(); }}>DESVINCULAR</FocusableButton><FocusableButton className="secondary" onClick={() => setDialog(null)}>CANCELAR</FocusableButton></>}</div>
    </article></section>}
  </main>;
}
