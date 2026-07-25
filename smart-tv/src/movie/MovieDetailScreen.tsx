import { useEffect } from "react";
import type { Movie } from "../catalog";
import { moveFocus } from "../focus";
import { isBackKey } from "../platform";
import type { PlaybackItem } from "../player/types";

function urls(url: string, alternatives?: string[]) {
  return Array.from(new Set([...(alternatives || []), url].filter(value => /^https?:\/\//i.test(value))));
}

export function MovieDetailScreen({ movie, favorite, related, onBack, onFavorite, onOpenMovie, onPlay }: {
  movie: Movie;
  favorite: boolean;
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
    window.setTimeout(() => document.querySelector<HTMLElement>(".movie-detail [data-autofocus='true']")?.focus(), 0);
    return () => window.removeEventListener("keydown", onKey);
  }, [movie.id, onBack]);

  const playback: PlaybackItem = {
    id: movie.id,
    name: movie.name,
    urls: urls(movie.url, movie.playbackUrls),
    live: false,
    kind: "movie",
    image: movie.cover,
    meta: [movie.category, movie.year || ""].filter(Boolean).join(" • ")
  };

  return <main className="movie-detail">
    <div className="movie-backdrop">{movie.cover && <img src={movie.cover} alt="" />}</div>
    <section className="movie-panel">
      <button data-tv-focusable="true" data-autofocus="true" className="series-back" onClick={onBack}>‹ Voltar</button>
      <div className="movie-cover"><span className="poster">
        {movie.cover ? <img src={movie.cover} alt="" /> : <span className="poster-fallback">R</span>}
      </span></div>
      <div className="movie-copy">
        <p className="eyebrow">{(movie.category || "FILME").toUpperCase()}</p>
        <h1>{movie.name}</h1>
        <p className="movie-meta">{[movie.year, movie.duration].filter(Boolean).join(" • ") || "Informações não disponíveis"}</p>
        <p className="movie-summary">{movie.synopsis || "Sinopse não informada para este filme."}</p>
        <div className="movie-actions">
          <button data-tv-focusable="true" className="primary detail-action" onClick={() => onPlay(playback)}>▶ Assistir agora</button>
          <button data-tv-focusable="true" className={`secondary detail-action ${favorite ? "favorite" : ""}`} onClick={onFavorite}>{favorite ? "♥ Na minha lista" : "♡ Adicionar à lista"}</button>
        </div>
        {related.length > 0 && <section className="related-section">
          <div><strong>Você também pode gostar</strong><small>Filmes da mesma categoria</small></div>
          <div className="related-row">{related.map(item => <button key={item.id} data-tv-focusable="true" onClick={() => onOpenMovie(item)}>
            <span>{item.cover ? <img src={item.cover} alt="" /> : <span className="poster-fallback">R</span>}</span>
            <strong>{item.name}</strong><small>{item.year || item.category || "Filme"}</small>
          </button>)}</div>
        </section>}
      </div>
    </section>
  </main>;
}
