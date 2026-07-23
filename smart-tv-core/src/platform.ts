import type { TvKey } from "./navigation.js";

export type TvPlatform = "android" | "webos" | "tizen";

export interface DeviceIdentity {
  readonly uuid: string;
  readonly deviceType: TvPlatform;
  readonly model: string | null;
  readonly appVersion: string;
}

export interface DeviceActivation {
  readonly deviceCode: string;
  readonly credential: string;
  readonly expiresAt: string | null;
}

export interface SecureStorageAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface DeviceAdapter {
  getIdentity(): Promise<DeviceIdentity>;
  getActivation(): Promise<DeviceActivation | null>;
  saveActivation(activation: DeviceActivation): Promise<void>;
  clearActivation(): Promise<void>;
}

export interface PlayerSource {
  readonly url: string;
  readonly mimeType: string | null;
}

export interface PlayerSnapshot {
  readonly positionMs: number;
  readonly durationMs: number;
  readonly bufferedPositionMs: number;
  readonly playing: boolean;
  readonly seekable: boolean;
}

export type PlayerEvent =
  | { readonly type: "ready" }
  | { readonly type: "playing" }
  | { readonly type: "paused" }
  | { readonly type: "ended" }
  | { readonly type: "buffering" }
  | { readonly type: "time"; readonly snapshot: PlayerSnapshot }
  | { readonly type: "error"; readonly code: string; readonly recoverable: boolean };

export interface PlayerAdapter {
  load(sources: readonly PlayerSource[], startPositionMs?: number): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seekTo(positionMs: number): Promise<void>;
  getSnapshot(): PlayerSnapshot;
  subscribe(listener: (event: PlayerEvent) => void): () => void;
  release(): Promise<void>;
}

export interface RemoteControlAdapter {
  subscribe(listener: (key: TvKey) => void): () => void;
}

export interface PlatformAdapter {
  readonly platform: TvPlatform;
  readonly storage: SecureStorageAdapter;
  readonly device: DeviceAdapter;
  readonly player: PlayerAdapter;
  readonly remote: RemoteControlAdapter;
  requestExit(): Promise<void>;
}
