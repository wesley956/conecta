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

function LiveChannelCardComponent({
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
          <img src={logo} alt="" loading="lazy" decoding="async" />
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
}

export const LiveChannelCard = memo(
  LiveChannelCardComponent,
  (previous, next) => (
    previous.logo === next.logo &&
    previous.name === next.name &&
    previous.group === next.group &&
    previous.favorite === next.favorite &&
    previous.selected === next.selected
  ),
);
