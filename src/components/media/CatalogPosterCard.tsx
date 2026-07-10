import type { PointerEventHandler } from 'react';
import { Film, Star } from 'lucide-react';

type CatalogPosterCardProps = {
  image?: string;
  title: string;
  meta?: string;
  badge?: string;
  favorite?: boolean;
  progress?: number;
  selected?: boolean;
  onClick: () => void;
  onFocus?: () => void;
  onPointerDown?: PointerEventHandler<HTMLButtonElement>;
  onPointerUp?: PointerEventHandler<HTMLButtonElement>;
  onPointerLeave?: PointerEventHandler<HTMLButtonElement>;
  onPointerCancel?: PointerEventHandler<HTMLButtonElement>;
};

export function CatalogPosterCard({
  image,
  title,
  meta,
  badge,
  favorite,
  progress,
  selected,
  onClick,
  onFocus,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
}: CatalogPosterCardProps) {
  const safeProgress = Math.min(100, Math.max(0, progress ?? 0));

  return (
    <button
      type="button"
      className={`catalog-poster-card ${selected ? 'is-selected' : ''}`}
      onClick={onClick}
      onFocus={onFocus}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerCancel}
      title={title}
    >
      <span className="catalog-poster-frame">
        {image ? (
          <img src={image} alt="" loading="lazy" />
        ) : (
          <span className="catalog-poster-placeholder" aria-hidden="true">
            <Film size={34} strokeWidth={1.6} />
          </span>
        )}

        {badge ? <span className="catalog-poster-badge">{badge}</span> : null}

        {favorite ? (
          <span className="catalog-poster-favorite" aria-label="Favorito">
            <Star aria-hidden="true" size={14} fill="currentColor" />
          </span>
        ) : null}

        {safeProgress > 0 ? (
          <span className="catalog-poster-progress" aria-hidden="true">
            <span style={{ width: `${safeProgress}%` }} />
          </span>
        ) : null}
      </span>

      <span className="catalog-poster-title">{title}</span>
      {meta ? <span className="catalog-poster-meta">{meta}</span> : null}
    </button>
  );
}
