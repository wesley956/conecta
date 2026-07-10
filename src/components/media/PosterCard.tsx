import { Star } from 'lucide-react';

type PosterCardProps = {
  image?: string;
  title: string;
  meta?: string;
  badge?: string;
  favorite?: boolean;
  progress?: number;
  onClick: () => void;
};

export function PosterCard({
  image,
  title,
  meta,
  badge,
  favorite,
  progress,
  onClick,
}: PosterCardProps) {
  const safeProgress = Math.min(100, Math.max(0, progress ?? 0));

  return (
    <button type="button" className="stream-poster-card" onClick={onClick}>
      <div className="stream-poster-frame">
        {image ? <img src={image} alt="" loading="lazy" /> : null}

        {badge ? <span className="stream-poster-badge">{badge}</span> : null}

        {favorite ? (
          <span className="stream-favorite-mark" aria-label="Favorito">
            <Star aria-hidden="true" size={14} fill="currentColor" />
          </span>
        ) : null}

        {safeProgress > 0 ? (
          <span className="stream-progress-track" aria-hidden="true">
            <span className="stream-progress-value" style={{ width: `${safeProgress}%` }} />
          </span>
        ) : null}
      </div>

      <span className="stream-poster-title">{title}</span>
      {meta ? <span className="stream-poster-meta">{meta}</span> : null}
    </button>
  );
}
