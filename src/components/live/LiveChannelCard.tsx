import { memo } from 'react';
import { Play, Star, Tv } from 'lucide-react';

interface LiveChannelCardProps {
  logo?: string;
  name: string;
  group: string;
  favorite?: boolean;
  selected?: boolean;
  onFocus: () => void;
  onPlay: () => void;
  onPointerDown: () => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
}

export const LiveChannelCard = memo(function LiveChannelCard({
  logo,
  name,
  group,
  favorite,
  selected,
  onFocus,
  onPlay,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
}: LiveChannelCardProps) {
  return (
    <button
      type="button"
      className={`live-channel-card ${selected ? 'is-selected' : ''}`}
      onFocus={onFocus}
      onPointerEnter={onFocus}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerCancel}
      onClick={onPlay}
      aria-pressed={selected}
      aria-label={`Assistir ${name}`}
      title={`Assistir ${name}. Segure para favoritar.`}
    >
      <span className="live-channel-card-logo">
        {logo ? (
          <img src={logo} alt="" loading="lazy" />
        ) : (
          <Tv aria-hidden="true" size={24} strokeWidth={2.1} />
        )}
      </span>

      <span className="live-channel-card-copy">
        <span className="live-channel-card-name">{name}</span>
        <span className="live-channel-card-group">{group || 'TV ao vivo'}</span>
      </span>

      {favorite ? (
        <span className="live-channel-card-favorite" title="Canal favorito">
          <Star aria-hidden="true" size={15} fill="currentColor" />
        </span>
      ) : null}

      <span className="live-channel-card-play" aria-hidden="true">
        <Play size={15} fill="currentColor" />
      </span>
    </button>
  );
});
