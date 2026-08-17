export type SessionInfo = {
  id: string;
  idleExpiresAt?: string;
  absoluteExpiresAt: string;
  clientName?: string | null;
  expiresAt?: string | null;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  session: SessionInfo;
};

export type WebChannel = {
  contentId: string;
  type: 'channel';
  title: string;
  logo?: string;
  category?: string;
};

export type WebMovie = {
  contentId: string;
  type: 'movie';
  title: string;
  cover?: string;
  category?: string;
  year?: number;
  duration?: string;
  synopsis?: string;
};

export type WebEpisode = {
  contentId: string;
  type: 'episode';
  number: number;
  title: string;
  duration?: string;
};

export type WebSeason = {
  number: number;
  episodes: WebEpisode[];
};

export type WebSeries = {
  contentId: string;
  type: 'series';
  title: string;
  cover?: string;
  category?: string;
  synopsis?: string;
  hasEmbeddedSeasons?: boolean;
};

export type Catalog = {
  catalogVersion?: string | null;
  sourceRole: 'primary' | 'backup';
  usingBackup: boolean;
  channels: WebChannel[];
  movies: WebMovie[];
  series: WebSeries[];
};

export type PlayableContent = WebChannel | WebMovie | WebEpisode;

export type PlaybackAuthorization = {
  mode: 'direct-safe' | 'gateway';
  playbackUrl: string;
  mediaKind: 'hls' | 'file' | 'unknown';
  contentType: 'channel' | 'movie' | 'episode';
  playlistRole: 'primary' | 'backup';
  alternativesAvailable: number;
  expiresAt: string;
};

export type EpgProgram = {
  title: string;
  description?: string;
  start: string;
  end: string;
};
