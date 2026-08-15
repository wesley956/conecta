import { useCallback, useEffect, useState } from "react";
import { useAppUpdate } from "./appUpdate";
import { useCatalog } from "./catalog";
import type { CatalogFailoverResult, Movie, Series } from "./catalog";
import type { DeviceSession, SeriesSeasonResponse } from "./deviceSession";
import { fetchSeriesSeasons, useDeviceSession } from "./deviceSession";
import { channelContentKey, episodeContentKey, movieContentKey, seriesContentKey } from "./contentIdentity";
import { channelCard, movieCard, normalized, playableUrls, queueFromSeasons } from "./content/cards";
import type { MediaCard } from "./content/cards";
import { MainShell } from "./content/MainShell";
import type { AppDialog, MainSection } from "./content/MainShell";
import { recommendedMovies, recommendedSeries } from "./content/recommendations";
import { focusAutofocus, moveFocus, rememberFocus, restoreFocus } from "./focus";
import { clearReconstructibleCache } from "./localMaintenance";
import { resumableProgress, useMediaLibrary } from "./mediaLibrary";
import type { LibraryItem } from "./mediaLibrary";
import { MovieDetailScreen } from "./movie/MovieDetailScreen";
import { SMART_TV_PERFORMANCE_PROFILE } from "./performanceProfile";
import { closeApplication, isBackKey, platform } from "./platform";
import { PlayerScreen } from "./player/PlayerScreen";
import type { PlaybackItem } from "./player/types";
import { useSmartTvPlayerSettings } from "./playerSettings";
import { SeriesDetailScreen } from "./series/SeriesDetailScreen";

const PAGE_SIZE = SMART_TV_PERFORMANCE_PROFILE.catalogPageSize;
type SuccessfulCatalogFailover = Extract<CatalogFailoverResult, { outcome: "switched" }>;

function FocusableButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button data-tv-focusable="true" {...props} />;
}

function ActivationScreen({ session, onRefresh, onReset }: {
  session: DeviceSession;
  onRefresh: () => void;
  onReset: () => void;
}) {
  const pending = session.status === "pending";
  const title = {
    loading: "Preparando dispositivo",
    pending: "Ativar dispositivo",
    active: "Dispositivo ativo",
    blocked: "Acesso bloqueado",
    expired: "Assinatura expirada",
    error: "Falha de conexão"
  }[session.status];
  const support = session.supportProfile;
  return <main className="activation-shell"><section className="activation-panel">
    <div className="activation-brand"><span className="brand-mark">R</span><span><b>RONECA</b><small>PLAYER TV</small></span></div>
    <p className="eyebrow">{platform === "webos" ? "LG WEBOS" : platform === "tizen" ? "SAMSUNG TIZEN" : "PRÉ-VISUALIZAÇÃO"}</p>
    <h1>{title}</h1>
    <p className="activation-message">{session.message || (pending ? "Envie o código abaixo ao seu vendedor ou administrador." : "Conectando ao painel com segurança.")}</p>
    {session.deviceCode && <div className="activation-code"><small>CÓDIGO DO APARELHO</small><strong>{session.deviceCode}</strong><span>{pending ? "Aguardando liberação automática" : "Identidade do aparelho"}</span></div>}
    <div className="activation-actions">
      <FocusableButton data-autofocus="true" data-focus-key="activation:refresh" className="primary" disabled={session.refreshing || session.status === "loading"} onClick={onRefresh}>{session.refreshing ? "Atualizando..." : "Atualizar acesso"}</FocusableButton>
      {(session.status === "blocked" || session.status === "error") && <FocusableButton data-focus-key="activation:reset" className="secondary danger" onClick={onReset}>Gerar novo código</FocusableButton>}
    </div>
  </section><aside className="activation-support-card">
    <p className="eyebrow">PRECISA DE AJUDA?</p>
    <h2>{support.displayName}</h2>
    <p>{support.supportText || "Envie este código ao seu fornecedor."}</p>
    {support.businessHours && <small>{support.businessHours}</small>}
    {support.whatsapp && <strong>WhatsApp: {support.whatsapp}</strong>}
    {support.email && <strong>{support.email}</strong>}
    {support.primaryContactUri && <div className="support-contact-uri"><span>CONTATO SEGURO</span><code>{support.primaryContactUri.replace(/^mailto:/, "")}</code><small>Aponte a câmera para o QR Code quando disponível ou use este contato.</small></div>}
  </aside></main>;
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
      meta: [movie.year || "", movie.category].filter(Boolean).join(" • ")
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

export function App() {
  const [selected, setSelected] = useState<MainSection>("Início");
  const [playback, setPlayback] = useState<PlaybackItem | null>(null);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<Series | null>(null);
  const [seriesSeasonMemory, setSeriesSeasonMemory] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todos");
  const [channelFavoritesOnly, setChannelFavoritesOnly] = useState(false);
  const [channelAlphabetical, setChannelAlphabetical] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const [dialog, setDialog] = useState<AppDialog>(null);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);

  const { session, refresh, renewConfiguration, reset, unlink } = useDeviceSession();
  const catalog = useCatalog(session, renewConfiguration);
  const appUpdate = useAppUpdate(session.status === "active");
  const library = useMediaLibrary();
  const { settings, update: updateSettings } = useSmartTvPlayerSettings();

  useEffect(() => {
    const identities: Array<Pick<LibraryItem, "id" | "kind" | "contentKey">> = [
      ...catalog.data.channels.map(item => ({ id: item.id, kind: "channel" as const, contentKey: channelContentKey(item) })),
      ...catalog.data.movies.map(item => ({ id: item.id, kind: "movie" as const, contentKey: movieContentKey(item) })),
      ...catalog.data.series.map(item => ({ id: item.id, kind: "series" as const, contentKey: seriesContentKey(item) })),
      ...catalog.data.series.flatMap(series => (series.seasons || []).flatMap(season => season.episodes.map(episode => ({
        id: episode.id,
        kind: "episode" as const,
        contentKey: episodeContentKey(series.name, season, episode)
      }))))
    ];
    library.reconcileIdentities(identities);
  }, [catalog.data, library.reconcileIdentities]);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    setCategory(selected === "Séries" ? "Todas" : "Todos");
    setQuery("");
    setChannelFavoritesOnly(false);
    setChannelAlphabetical(false);
    setVisibleLimit(PAGE_SIZE);
  }, [selected]);

  const closeDialog = useCallback(() => setDialog(null), []);
  const openDialog = useCallback((value: Exclude<AppDialog, null>) => {
    rememberFocus("dialog-return");
    setDialog(value);
  }, []);

  useEffect(() => {
    if (playback || selectedSeries || selectedMovie) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const directions: Record<string, "up" | "down" | "left" | "right"> = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right"
      };
      const direction = directions[event.key];

      if (dialog) {
        if (isBackKey(event)) {
          event.preventDefault();
          closeDialog();
        } else if (direction) {
          event.preventDefault();
          moveFocus(direction, document.querySelector(".app-dialog") || document);
        }
        return;
      }

      if (direction) {
        event.preventDefault();
        moveFocus(direction);
        return;
      }

      if (!isBackKey(event)) return;
      event.preventDefault();

      const defaultCategory = selected === "Séries" ? "Todas" : "Todos";
      if (selected === "Canais" && channelFavoritesOnly) setChannelFavoritesOnly(false);
      else if (selected === "Canais" && channelAlphabetical) setChannelAlphabetical(false);
      else if (category !== defaultCategory) setCategory(defaultCategory);
      else if (query) setQuery("");
      else if (selected !== "Início") setSelected("Início");
      else closeApplication();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [category, channelAlphabetical, channelFavoritesOnly, closeDialog, dialog, playback, query, selected, selectedMovie, selectedSeries]);

  useEffect(() => {
    if (playback || selectedSeries || selectedMovie) return;
    const timer = window.setTimeout(() => {
      if (dialog) {
        focusAutofocus(document.querySelector(".app-dialog") || document);
        return;
      }
      if (restoreFocus("dialog-return")) return;
      if (restoreFocus("playback-return")) return;
      if (restoreFocus("app-return")) return;
      focusAutofocus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [catalog.status, dialog, playback, selected, selectedMovie, selectedSeries, session.status]);

  const resolvePlaybackStart = useCallback((item: PlaybackItem) => {
    const kind = item.kind || (item.live ? "channel" : "movie");
    const saved = library.history.find(value =>
      value.kind === kind && (value.contentKey === item.contentKey || (!value.contentKey && value.id === item.id))
    );
    return !item.live && resumableProgress(saved) ? { ...item, startTime: saved?.currentTime } : item;
  }, [library.history]);

  const beginPlayback = useCallback((item: PlaybackItem) => {
    rememberFocus("playback-return");
    setPlayback(resolvePlaybackStart(item));
  }, [resolvePlaybackStart]);

  const replacePlayback = useCallback((item: PlaybackItem) => {
    setPlayback(resolvePlaybackStart(item));
  }, [resolvePlaybackStart]);

  const openCard = useCallback((item: MediaCard) => {
    if (item.playback) {
      beginPlayback(item.playback);
      return;
    }
    rememberFocus("app-return");
    if (item.movie) setSelectedMovie(item.movie);
    else if (item.series) setSelectedSeries(item.series);
  }, [beginPlayback]);

  const openMovieFromApp = useCallback((movie: Movie) => {
    rememberFocus("app-return");
    setSelectedMovie(movie);
  }, []);

  const openSeriesFromApp = useCallback((series: Series) => {
    rememberFocus("app-return");
    setSelectedSeries(series);
  }, []);

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
      onChangeChannel={channel => replacePlayback(channelCard(channel).playback!)}
      onChangePlayback={replacePlayback}
      onClose={() => setPlayback(null)}
      onProgress={(currentTime, duration) => library.remember(playback, currentTime, duration)}
      onStablePlayback={catalog.confirmPlaybackStable}
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

  if (selectedMovie) {
    const contentKey = movieContentKey(selectedMovie);
    const progress = library.history.find(item =>
      item.kind === "movie" && (item.contentKey === contentKey || (!item.contentKey && item.id === selectedMovie.id))
    );
    return <MovieDetailScreen
      movie={selectedMovie}
      favorite={library.isFavorite("movie", selectedMovie.id, contentKey)}
      progress={progress}
      onBack={() => setSelectedMovie(null)}
      onFavorite={() => library.toggleFavorite({
        id: selectedMovie.id,
        contentKey,
        kind: "movie",
        name: selectedMovie.name,
        image: selectedMovie.cover,
        meta: [selectedMovie.year || "", selectedMovie.category].filter(Boolean).join(" • ")
      })}
      related={recommendedMovies(selectedMovie, catalog.data.movies)}
      onOpenMovie={setSelectedMovie}
      onPlay={beginPlayback}
    />;
  }

  if (selectedSeries) {
    const contentKey = seriesContentKey(selectedSeries);
    return <SeriesDetailScreen
      series={selectedSeries}
      playlistId={catalog.activePlaylistId || session.selectedPlaylistId}
      favorite={library.isFavorite("series", selectedSeries.id, contentKey)}
      history={library.history}
      selectedSeasonNumber={seriesSeasonMemory[contentKey]}
      recommendations={recommendedSeries(selectedSeries, catalog.data.series)}
      onBack={() => setSelectedSeries(null)}
      onFavorite={() => library.toggleFavorite({
        id: selectedSeries.id,
        contentKey,
        kind: "series",
        name: selectedSeries.name,
        image: selectedSeries.cover,
        meta: selectedSeries.category || "Séries"
      })}
      onSelectedSeasonChange={seasonNumber => setSeriesSeasonMemory(current => ({ ...current, [contentKey]: seasonNumber }))}
      onOpenRecommendation={setSelectedSeries}
      onPlay={beginPlayback}
    />;
  }

  if (session.status !== "active") {
    return <ActivationScreen session={session} onRefresh={() => void refresh()} onReset={() => void reset()} />;
  }

  return <MainShell
    selected={selected}
    setSelected={setSelected}
    query={query}
    setQuery={setQuery}
    category={category}
    setCategory={setCategory}
    channelFavoritesOnly={channelFavoritesOnly}
    setChannelFavoritesOnly={setChannelFavoritesOnly}
    channelAlphabetical={channelAlphabetical}
    setChannelAlphabetical={setChannelAlphabetical}
    visibleLimit={visibleLimit}
    setVisibleLimit={setVisibleLimit}
    pageSize={PAGE_SIZE}
    catalog={catalog}
    session={session}
    library={library}
    settings={settings}
    updateSettings={updateSettings}
    appUpdate={appUpdate}
    online={online}
    dialog={dialog}
    openDialog={openDialog}
    closeDialog={closeDialog}
    onClearCache={async () => { await clearReconstructibleCache(); catalog.retry(); }}
    onUnlinkDevice={() => void unlink().catch(() => undefined)}
    onOpenCard={openCard}
    onOpenMovie={openMovieFromApp}
    onOpenSeries={openSeriesFromApp}
  />;
}
