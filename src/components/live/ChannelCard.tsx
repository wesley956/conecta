import { Star, Tv } from 'lucide-react';

type ChannelCardProps = {
  logo?: string;
  name: string;
  group?: string;
  favorite?: boolean;
  onClick: () => void;
};

export function ChannelCard({ logo, name, group, favorite, onClick }: ChannelCardProps) {
  return (
    <button type="button" className="stream-channel-card" onClick={onClick}>
      <span className="stream-channel-logo">
        {logo ? (
          <img src={logo} alt="" loading="lazy" decoding="async" />
        ) : (
          <Tv aria-hidden="true" size={24} strokeWidth={2.1} />
        )}
      </span>

      <span className="stream-channel-copy">
        <span className="stream-channel-name">{name}</span>
        <span className="stream-channel-group">
          {favorite ? (
            <>
              <Star aria-hidden="true" size={11} fill="currentColor" /> Favorito
            </>
          ) : (
            group || 'TV ao vivo'
          )}
        </span>
      </span>
    </button>
  );
}
