import { useEffect, useMemo, useState } from "react";
import type { Season, Series } from "../catalog";
import { fetchSeriesSeasons } from "../deviceSession";
import { moveFocus } from "../focus";
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

export function SeriesDetailScreen({ series, playlistId, favorite, recommendations, onBack, onFavorite, onOpenRecommendation, onPlay }: {
  series: Series;
  playlistId: string | null;
  favorite: boolean;
  recommendations: Series[];
  onBack: () => void;
  onFavorite: () => void;
  onOpenRecommendation: (series: Series) => void;
  onPlay: (item: PlaybackItem) => void;
}) {
  const embedded = useMemo(() => embeddedSeasons(series), [series]);
  const [seasons, setSeasons] = useState<Season[]>(embedded);
  const [selectedSeason, setSelectedSeason] = useState(embedded[0]?.number ?? 1);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(embedded.length ? "ready" : "loading");
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
        name: `${series.name} • T${season.number}E${episode.number}`,
        urls: urls(episode.url, episode.playbackUrls),
        image: series.cover,
        meta: `${series.name} • T${season.number}E${episode.number}`,
        seasonNumber: season.number,
        episodeNumber: episode.number
      }))), [seasons, series.cover, series.name]);

  useEffect(() => {
    setSeasons(embedded);
    setSelectedSeason(embedded[0]?.number ?? 1);
    setStatus(embedded.length ? "ready" : "loading");
    setMessage(null);
  }, [embedded, series.id]);

  useEffect(() => {
    if (embedded.length) return;
    let cancelled = false;
    setStatus("loading");
    setMessage(null);
    void fetchSeriesSeasons(String(series.xtreamSeriesId || ""), playlistId)
      .then(value => {
        if (cancelled) return;
        setSeasons(value);
        setSelectedSeason(value[0]?.number ?? 1);
        setStatus("ready");
      })
      .catch(error => {
        if (cancelled) return;
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Não foi possível carregar os episódios.");
      });
    return () => { cancelled = true; };
  }, [attempt, embedded, playlistId, series.xtreamSeriesId]);

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
    window.setTimeout(() => document.querySelector<HTMLElement>(".series-detail [data-autofocus='true']")?.focus(), 0);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack, selectedSeason, status]);

  const season = seasons.find(item => item.number === selectedSeason) || seasons[0];
  return <main className="series-detail">
    <header className="series-header">
      <button data-tv-focusable="true" data-autofocus="true" className="series-back" onClick={onBack}>‹ Voltar</button>
      <div className="series-cover"><span className="poster">
        {series.cover ? <img src={series.cover} alt="" onError={event => { event.currentTarget.style.display = "none"; }} /> : <span className="poster-fallback">R</span>}
      </span></div>
      <div className="series-copy">
        <p className="eyebrow">{(series.category || "Série").toUpperCase()}</p>
        <h1>{series.name}</h1>
        <p className="series-summary">{series.synopsis || "Sinopse não informada para esta série."}</p>
        <div className="series-info">
          {seasons.length > 0 && <small>{seasons.length} temporada(s) • {seasons.reduce((sum, item) => sum + item.episodes.length, 0)} episódio(s)</small>}
          <button data-tv-focusable="true" className={`favorite-chip ${favorite ? "selected" : ""}`} onClick={onFavorite}>{favorite ? "♥ Na minha lista" : "♡ Adicionar à lista"}</button>
        </div>
      </div>
    </header>

    {status === "loading" && <section className="series-state"><span className="spinner" /><h2>Carregando episódios</h2><p>Consultando o catálogo protegido.</p></section>}
    {status === "error" && <section className="series-state error"><h2>Não foi possível carregar</h2><p>{message}</p><button data-tv-focusable="true" className="primary" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button></section>}
    {status === "ready" && season && <section className="series-library">
      <div className="season-row">{seasons.map(item =>
        <button key={item.number} data-tv-focusable="true" className={`season-chip ${item.number === season.number ? "selected" : ""}`} onClick={() => setSelectedSeason(item.number)}>Temporada {item.number}</button>
      )}</div>
      <h2>Episódios • Temporada {season.number}</h2>
      <div className="episode-list">{season.episodes.map(episode => {
        const queueIndex = episodeQueue.findIndex(item => item.id === episode.id);
        return <button key={episode.id} data-tv-focusable="true" className="episode-row" onClick={() => onPlay({
          id: episode.id,
          name: `${series.name} • T${season.number}E${episode.number}`,
          urls: urls(episode.url, episode.playbackUrls),
          live: false,
          kind: "episode",
          image: series.cover,
          meta: `${series.name} • T${season.number}E${episode.number}`,
          seriesQueue: episodeQueue,
          seriesQueueIndex: Math.max(0, queueIndex)
        })}>
          <span className="episode-number">{episode.number}</span>
          <span><strong>{episode.name}</strong><small>{episode.duration || "Duração não informada"}</small></span>
          <b>▶</b>
        </button>;
      })}</div>
    </section>}
    {recommendations.length > 0 && <section className="series-library related-section">
      <div><h2>Você também pode gostar</h2><small>Séries da mesma categoria</small></div>
      <div className="related-row">{recommendations.map(item =>
        <button key={item.id} data-tv-focusable="true" onClick={() => onOpenRecommendation(item)}>
          <span>{item.cover ? <img src={item.cover} alt="" /> : <b>R</b>}</span>
          <strong>{item.name}</strong><small>{item.category || "Série"}</small>
        </button>
      )}</div>
    </section>}
  </main>;
}
