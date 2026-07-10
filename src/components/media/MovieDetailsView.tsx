import type { CSSProperties } from 'react';
import { ArrowLeft, Film, Play, Star } from 'lucide-react';
import type { Movie } from '@/types';
import { CatalogPosterCard } from './CatalogPosterCard';

type MovieDetailsViewProps = {
  movie: Movie;
  recommendations: Movie[];
  onBack: () => void;
  onPlay: () => void;
  onToggleFavorite: () => void;
  onOpenRecommendation: (movie: Movie) => void;
};

function getSafeImageUrl(url?: string) {
  if (!url) return undefined;

  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('http://')) {
    return undefined;
  }

  return url;
}

export function MovieDetailsView({
  movie,
  recommendations,
  onBack,
  onPlay,
  onToggleFavorite,
  onOpenRecommendation,
}: MovieDetailsViewProps) {
  const image = getSafeImageUrl(movie.cover);
  const detailStyle = {
    '--movie-detail-image': image ? `url("${image.replace(/"/g, '%22')}")` : 'none',
  } as CSSProperties;

  const meta = [
    movie.year > 0 ? String(movie.year) : null,
    movie.duration && movie.duration !== '—' ? movie.duration : null,
    movie.category || null,
  ].filter((item): item is string => Boolean(item));

  return (
    <div className="movie-detail-page" style={detailStyle} data-stream-detail="movie">
      <div className="movie-detail-backdrop" aria-hidden="true" />
      <div className="movie-detail-shade" aria-hidden="true" />

      <div className="movie-detail-scroll">
        <header className="movie-detail-topbar">
          <button
            type="button"
            className="movie-detail-back"
            onClick={onBack}
            data-tv-back-target="true"
          >
            <ArrowLeft aria-hidden="true" size={18} strokeWidth={2.3} />
            Voltar aos filmes
          </button>

          <span className="movie-detail-type">
            <Film aria-hidden="true" size={14} strokeWidth={2.2} /> Filme
          </span>
        </header>

        <main className="movie-detail-main">
          <div className="movie-detail-poster">
            {image ? (
              <img src={image} alt={movie.name} />
            ) : (
              <div className="movie-detail-poster-placeholder">
                <Film aria-hidden="true" size={54} strokeWidth={1.4} />
              </div>
            )}

            {movie.progress !== undefined && movie.progress > 0 ? (
              <div className="movie-detail-progress">
                <span style={{ width: `${Math.min(100, Math.max(0, movie.progress))}%` }} />
              </div>
            ) : null}
          </div>

          <section className="movie-detail-copy">
            <p className="stream-kicker">Destaque do catálogo</p>
            <h1 className="movie-detail-title">{movie.name}</h1>

            <div className="movie-detail-meta">
              {meta.map(item => <span key={item}>{item}</span>)}
              {movie.isFavorite ? <span className="is-gold">Na Minha Lista</span> : null}
            </div>

            <p className="movie-detail-synopsis">
              {movie.synopsis || 'Sinopse não disponível para este filme. A reprodução continua disponível normalmente.'}
            </p>

            <div className="movie-detail-actions">
              <button type="button" className="stream-primary-button" onClick={onPlay}>
                <Play aria-hidden="true" size={17} fill="currentColor" />
                {(movie.progress ?? 0) > 0 ? 'Continuar assistindo' : 'Assistir agora'}
              </button>

              <button
                type="button"
                className={`stream-secondary-button movie-list-button ${movie.isFavorite ? 'is-favorite' : ''}`}
                onClick={onToggleFavorite}
              >
                <Star
                  aria-hidden="true"
                  size={17}
                  fill={movie.isFavorite ? 'currentColor' : 'none'}
                />
                {movie.isFavorite ? 'Remover da Minha Lista' : 'Adicionar à Minha Lista'}
              </button>
            </div>
          </section>
        </main>

        {recommendations.length > 0 ? (
          <section className="movie-recommendations">
            <div className="movie-recommendations-heading">
              <div>
                <h2>Também pode gostar</h2>
                <p>Outros títulos do seu catálogo</p>
              </div>
            </div>

            <div className="movie-recommendations-rail">
              {recommendations.map(item => (
                <CatalogPosterCard
                  key={item.id}
                  image={getSafeImageUrl(item.cover)}
                  title={item.name}
                  meta={[item.year > 0 ? item.year : null, item.category || null].filter(Boolean).join(' • ')}
                  favorite={item.isFavorite}
                  progress={item.progress}
                  badge="Filme"
                  onClick={() => onOpenRecommendation(item)}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
