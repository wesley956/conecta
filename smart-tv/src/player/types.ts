export type PlaybackStatus = "idle" | "loading" | "playing" | "paused" | "ended" | "error";

export interface PlayerTrack {
  index: number;
  kind: "audio" | "text";
  label: string;
  language?: string;
}

export interface PlaybackQueueItem {
  id: string;
  name: string;
  urls: string[];
  image?: string;
  meta?: string;
  seasonNumber: number;
  episodeNumber: number;
}

export interface PlaybackItem {
  id: string;
  name: string;
  urls: string[];
  live: boolean;
  kind?: "channel" | "movie" | "episode";
  image?: string;
  meta?: string;
  seriesQueue?: PlaybackQueueItem[];
  seriesQueueIndex?: number;
  startTime?: number;
}

export interface PlaybackSnapshot {
  status: PlaybackStatus;
  currentTime: number;
  duration: number;
  buffering: boolean;
  error: string | null;
  sourceIndex: number;
  sourceCount: number;
  audioTracks: PlayerTrack[];
  textTracks: PlayerTrack[];
  selectedAudioTrack: number | null;
  selectedTextTrack: number | null;
}

export interface PlayerAdapter {
  mount(): void;
  load(urls: string[], live: boolean): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  seek(seconds: number): void;
  selectTrack(kind: "audio" | "text", index: number | null): void;
  stop(): void;
  destroy(): void;
}

export type SnapshotListener = (snapshot: Partial<PlaybackSnapshot>) => void;
