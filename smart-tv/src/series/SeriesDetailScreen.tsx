import { useEffect, useMemo, useState } from "react";
import type { Season, Series } from "../catalog";
import { episodeContentKey, seriesContentKey } from "../contentIdentity";
import { fetchSeriesSeasons } from "../deviceSession";
import { focusAutofocus, moveFocus, restoreFocus } from "../focus";
import type { LibraryItem } from "../mediaLibrary";
import { progressFraction, resumableProgress } from "../mediaLibrary";
import { isBackKey } from "../platform";
import type { PlaybackItem } from "../player/types";

function urls(url: string, alternatives?: string[]) {
  return Array.from(new Set([...(alternatives || []), url].filter(value => /^https?:\/\//i.test(value))));
}

function embeddedSeasons(series: Series): Season[] {
  if (!Array.isArray(series.seasons)) return [];
  return series.seasons.filter(season =>
    Number.isFinite(Number(season?.number)) && Array.isArray(season?.episodes) && season.episodes.length > 0
  );
}

function progressFor(history: LibraryItem[], contentKey: string, id: string) {
  return history.find(item =>
    item.kind === "episode" && (item.contentKey === contentKey || (!item.contentKey && item.id === id))
  );
}

export function SeriesDetailScreen({
  series,
  playlistId,
  favorite,
  history,
  selectedSeasonNumber,
  recommendations,
  onBack,
  onFavorite,
  onSelectedSeasonChange,
  onOpenRecommendation,
  onPlay
}: {
  series: Series;
  playlistId: string | null;
  favorite: boolean;
  history: LibraryItem[];
  selectedSeasonNumber?: number;
  recommendations: Series[];
  onBack: () => void;
  onFavorite: () => void;
  onSelectedSeasonChange: (seasonNumber: number) => void;
  onOpenRecommendation: (series: Series) => void;
  onPlay: (item: PlaybackItem) => void;
}) {
  const embedded = useMemo(() => embeddedSeasons(series), [series]);
  const initialSeason = selectedSeasonNumber && embedded.some(item => item.number === selectedSeasonNumber)
    ? selectedSeasonNumber
    : embedded[0]?.number ?? selectedSeasonNumber ?? 1;
  const [seasons, setSeasons] = useState<Season[]>(embedded);
  const [selectedSeason, setSelectedSeason] = useState(initialSeason);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    embedded.length || !series.xtreamSeriesId ? "ready" : "loading"
  );
  const [message, setMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const episodeQueue = useMemo(() => seasons
    .slice()
    .sort((a, b) => a.number - b.number)
    .flatMap(season => season.episodes
      .slice()
      .sort((a, b) => a.number - b.number)
      .map(episode => ({
        id: episode.id,
        contentKey: episodeContentKey(series.name, season, episode),
        seriesKey: seriesContentKey(series),
        name: `${series.name} • T${season.number}E${episode.number}`,
        urls: urls(episode.url, episode.playbackUrls),
        image: series.cover,
        meta: `${series.name} • T${season.number}E${episode.number}`,
        seasonNumber: season.number,
        episodeNumber: episode.number
      }))), [seasons, series]);

  useEffect(() => {
    const preferred = selectedSeasonNumber && embedded.some(item => item.number === selectedSeasonNumber)
      ? selectedSeasonNumber
      : embedded[0]?.number ?? selectedSeasonNumber ?? 1;
    setSeasons(embedded);
    setSelectedSeason(preferred);
    setStatus(embedded.length || !series.xtreamSeriesId ? "ready" : "loading");
    setMessage(null);
  }, [embedded, selectedSeasonNumber, series.id, series.xtreamSeriesId]);

  useEffect(() => {
    if (embedded.length || !series.xtreamSeriesId) return;
    let cancelled = false;
    setStatus("loading");
    setMessage(null);
    void fetchSeriesSeasons(String(series.xtreamSeriesId), playlistId)
      .then(value => {
        if (cancelled) return;
        const preferred = selectedSeasonNumber && value.some(item => item.number === selectedSeasonNumber)
          ? selectedSeasonNumber
          : value[0]?.number ?? 1;
        setSeasons(value);
        setSelectedSeason(preferred);
        setStatus("ready");
      })
      .catch(error => {
        if (cancelled) return;
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Não foi possível carregar os episódios.");
      });
    return () => { cancelled = true; };
  }, [attempt, embedded, playlistId, selectedSeasonNumber, series.xtreamSeriesId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isBackKey(event)) { event.preventDefault(); onBack(); return; }
      const directions: Record<string, "up" | "down" | "left" | "right"> = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right"
      };
      const direction = directions[event.key];
      if (direction) { event.preventDefault(); moveFocus(direction); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const root = document.querySelector(".series-detail") || document;
      if (!restoreFocus("playback-return", root)) focusAutofocus(root);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [series.id, selectedSeason]);

  const chooseSeason = (seasonNumber: number) => {
    setSelectedSeason(seasonNumber);
    onSelectedSeasonChange(seasonNumber);
  };

  const season = seasons.find(item => item.number === selectedSeason) || seasons[0];
  const episodeCount = seasons.reduce((sum, item) => sum + item.episodes.length, 0);

  return <main className="series-detail">
    <header className="series-header">
      <button data-tv-focusable="true" data-autofocus="true" data-focus-key="series:back" className="series-back" onClick={onBack}>← Voltar</button>
      <div className="series-cover"><span className="poster detail-poster">
        {series.cover ? <img src={series.cover} alt={series.name} onError={event => { event.currentTarget.style.display = "none"; }} /> : <span className="poster-fallback">SÉRIE</span>}
      </span></div>
      <div className="series-copy">
        <p className="eyebrow">{(series.category || "Série").toUpperCase()}</p>
        <h1>{series.name}</h1>
        <p className="series-meta">{seasons.length > 0 ? `${seasons.length} temporada(s) • ${episodeCount} episódio(s)` : series.category || "Série"}</p>
        <p className="series-summary">{series.synopsis || "Sinopse não informada para esta série."}</p>
        <div className="series-info">
          <button data-tv-focusable="true" data-focus-key="series:favorite" className={`favorite-chip ${favorite ? "selected" : ""}`} onClick={onFavorite}>{favorite ? "★ Na Minha Lista" : "☆ Adicionar à Minha Lista"}</button>
        </div>
      </div>
    </header>

    {status === "loading" && <section className="series-state"><span className="spinner" /><h2>Carregando episódios</h2><p>Consultando o provedor de forma segura.</p></section>}
    {status === "error" && <section className="series-state error"><h2>Não foi possível carregar agora</h2><p>{message}</p><button data-tv-focusable="true" data-focus-key="series:retry" className="primary" onClick={() => setAttempt(value => value + 1)}>↻ Atualizar episódios</button></section>}

    {status === "ready" && !season && <section className="series-state empty">
      <h2>Nenhuma temporada disponível</h2>
      <p>{series.xtreamSeriesId ? "O provedor não retornou episódios para esta série." : "Esta entrada M3U não contém temporadas ou episódios navegáveis."}</p>
    </section>}

    {status === "ready" && season && <section className="series-library">
      <div className="season-heading"><h2>Temporadas</h2><small>{seasons.length} disponível(is)</small></div>
      <div className="season-row">{seasons.map(item =>
        <button key={item.number} data-tv-focusable="true" data-focus-key={`series:season:${item.number}`} className={`season-chip ${item.number === season.number ? "selected" : ""}`} onClick={() => chooseSeason(item.number)}>Temporada {item.number}</button>
      )}</div>
      <h2>Episódios • Temporada {season.number}</h2>
      <div className="episode-list">{season.episodes.map(episode => {
        const contentKey = episodeContentKey(series.name, season, episode);
        const saved = progressFor(history, contentKey, episode.id);
        const canResume = resumableProgress(saved);
        const percent = Math.round(progressFraction(saved) * 100);
        const queueIndex = episodeQueue.findIndex(item => item.contentKey === contentKey);
        const playable = urls(episode.url, episode.playbackUrls).length > 0;
        return <button
          key={contentKey}
          data-tv-focusable="true"
          data-focus-key={`series:episode:${contentKey}`}
          className={`episode-row ${canResume ? "has-progress" : ""}`}
          disabled={!playable}
          onClick={() => playable && onPlay({
            id: episode.id,
            contentKey,
            name: `${series.name} • T${season.number}E${episode.number}`,
            urls: urls(episode.url, episode.playbackUrls),
            live: false,
            kind: "episode",
            image: series.cover,
            meta: `${series.name} • T${season.number}E${episode.number}`,
            seriesQueue: episodeQueue,
            seriesQueueIndex: Math.max(0, queueIndex)
          })}
        >
          <span className="episode-number">{episode.number}</span>
          <span className="episode-copy">
            <strong>{episode.name || `Episódio ${episode.number}`}</strong>
            <small>{[episode.duration || "Duração não informada", canResume ? `Continuar • ${percent}%` : ""].filter(Boolean).join(" • ")}</small>
            {canResume && <span className="episode-progress"><i style={{ width: `${percent}%` }} /></span>}
          </span>
          <b>{playable ? (canResume ? "CONTINUAR ▶" : "▶") : "INDISPONÍVEL"}</b>
        </button>;
      })}</div>
    </section>}

    {recommendations.length > 0 && <section className="series-library related-section series-related">
      <div><h2>Você também pode gostar</h2><small>Séries do mesmo estilo</small></div>
      <div className="related-row">{recommendations.map(item =>
        <button key={seriesContentKey(item)} data-tv-focusable="true" data-focus-key={`series:related:${seriesContentKey(item)}`} onClick={() => onOpenRecommendation(item)}>
          <span>{item.cover ? <img src={item.cover} alt={item.name} onError={event => { event.currentTarget.style.display = "none"; }} /> : <b>R</b>}</span>
          <strong>{item.name}</strong><small>{item.category || "Série"}</small>
        </button>
      )}</div>
    </section>}
  </main>;
}
