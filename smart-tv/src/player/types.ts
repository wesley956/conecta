export type PlaybackStatus = "idle" | "loading" | "playing" | "paused" | "ended" | "error";

export interface PlaybackItem {
  id: string;
  name: string;
  urls: string[];
  live: boolean;
  kind?: "channel" | "movie" | "episode";
  image?: string;
  meta?: string;
}

export interface PlaybackSnapshot {
  status: PlaybackStatus;
  currentTime: number;
  duration: number;
  buffering: boolean;
  error: string | null;
  sourceIndex: number;
  sourceCount: number;
}

export interface PlayerAdapter {
  mount(): void;
  load(urls: string[], live: boolean): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  seek(seconds: number): void;
  stop(): void;
  destroy(): void;
}

export type SnapshotListener = (snapshot: Partial<PlaybackSnapshot>) => void;
