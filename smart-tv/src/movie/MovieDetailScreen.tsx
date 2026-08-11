import { useEffect } from "react";
import type { Movie } from "../catalog";
import { movieContentKey } from "../contentIdentity";
import { focusAutofocus, moveFocus, restoreFocus } from "../focus";
import type { LibraryItem } from "../mediaLibrary";
import { progressFraction, resumableProgress } from "../mediaLibrary";
import { isBackKey } from "../platform";
import type { PlaybackItem } from "../player/types";

function urls(url: string, alternatives?: string[]) {
  return Array.from(new Set([...(alternatives || []), url].filter(value => /^https?:\/\//i.test(value))));
}

function formatTime(seconds = 0) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const rest = safe % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function MovieDetailScreen({ movie, favorite, progress, related, onBack, onFavorite, onOpenMovie, onPlay }: {
  movie: Movie;
  favorite: boolean;
  progress?: LibraryItem;
  related: Movie[];
  onBack: () => void;
  onFavorite: () => void;
  onOpenMovie: (movie: Movie) => void;
  onPlay: (item: PlaybackItem) => void;
}) {
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
      const root = document.querySelector(".movie-detail") || document;
      if (!restoreFocus("playback-return", root)) focusAutofocus(root);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [movie.id]);

  const playback: PlaybackItem = {
    id: movie.id,
    contentKey: movieContentKey(movie),
    name: movie.name,
    urls: urls(movie.url, movie.playbackUrls),
    live: false,
    kind: "movie",
    image: movie.cover,
    meta: [movie.category, movie.year || ""].filter(Boolean).join(" • ")
  };
  const canPlay = playback.urls.length > 0;
  const canResume = resumableProgress(progress);
  const fraction = progressFraction(progress);
  const percent = Math.round(fraction * 100);

  return <main className="movie-detail">
    <div className="movie-backdrop">{movie.cover && <img src={movie.cover} alt="" />}</div>
    <section className="movie-panel">
      <button data-tv-focusable="true" data-autofocus="true" data-focus-key="movie:back" className="series-back" onClick={onBack}>← Voltar</button>
      <div className="movie-cover"><span className="poster detail-poster">
        {movie.cover ? <img src={movie.cover} alt={movie.name} onError={event => { event.currentTarget.style.display = "none"; }} /> : <span className="poster-fallback">FILME</span>}
      </span></div>
      <div className="movie-copy">
        <p className="eyebrow">{(movie.category || "FILME").toUpperCase()}</p>
        <h1>{movie.name}</h1>
        <p className="movie-meta">{[movie.year, movie.duration, movie.category].filter(Boolean).join(" • ") || "Informações não disponíveis"}</p>
        <p className="movie-summary">{movie.synopsis || "Sinopse não informada para este título."}</p>

        {canResume && <div className="detail-resume" aria-label={`Progresso salvo ${percent}%`}>
          <div><span>Continuar assistindo</span><small>{formatTime(progress?.currentTime)} de {formatTime(progress?.duration)} • {percent}%</small></div>
          <div className="detail-progress"><i style={{ width: `${percent}%` }} /></div>
        </div>}

        <div className="movie-actions">
          <button
            data-tv-focusable="true"
            data-focus-key="movie:play"
            className="primary detail-action"
            disabled={!canPlay}
            onClick={() => canPlay && onPlay(playback)}
          >{canResume ? "▶ Continuar" : "▶ Assistir agora"}</button>
          <button data-tv-focusable="true" data-focus-key="movie:favorite" className={`secondary detail-action ${favorite ? "favorite" : ""}`} onClick={onFavorite}>{favorite ? "★ Na Minha Lista" : "☆ Minha Lista"}</button>
        </div>
        {!canPlay && <p className="detail-unavailable">Este título está sem uma origem de reprodução válida no catálogo atual.</p>}

        {related.length > 0 && <section className="related-section">
          <div><strong>Você também pode gostar</strong><small>Títulos do mesmo estilo</small></div>
          <div className="related-row">{related.map(item => <button key={movieContentKey(item)} data-tv-focusable="true" data-focus-key={`movie:related:${movieContentKey(item)}`} onClick={() => onOpenMovie(item)}>
            <span>{item.cover ? <img src={item.cover} alt={item.name} onError={event => { event.currentTarget.style.display = "none"; }} /> : <span className="poster-fallback">R</span>}</span>
            <strong>{item.name}</strong><small>{[item.year, item.category].filter(Boolean).join(" • ") || "Filme"}</small>
          </button>)}</div>
        </section>}
      </div>
    </section>
  </main>;
}
