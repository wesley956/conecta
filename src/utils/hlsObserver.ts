export interface HlsLevelDescriptor {
  height?: number;
  width?: number;
  bitrate?: number;
  name?: string;
}

export interface HlsTrackDescriptor {
  id?: number;
  name?: string;
  lang?: string;
  language?: string;
  default?: boolean;
}

export interface ObservedHlsInstance {
  levels: HlsLevelDescriptor[];
  currentLevel: number;
  audioTracks: HlsTrackDescriptor[];
  audioTrack: number;
  subtitleTracks: HlsTrackDescriptor[];
  subtitleTrack: number;
  startLoad?: (startPosition?: number) => void;
  stopLoad?: () => void;
  recoverMediaError?: () => void;
  on: (event: string, handler: (event: string, data: unknown) => void) => void;
  off: (event: string, handler: (event: string, data: unknown) => void) => void;
  destroy: () => void;
}

type HlsPrototype = {
  attachMedia: (media: HTMLMediaElement) => unknown;
  destroy: () => void;
  [key: symbol]: unknown;
};

type HlsConstructor = {
  prototype: HlsPrototype;
};

type HlsListener = (instance: ObservedHlsInstance | null) => void;

const PATCHED = Symbol.for('ronecaplaytv.hls-observer-patched');
const listeners = new Set<HlsListener>();
let currentInstance: ObservedHlsInstance | null = null;
let installPromise: Promise<void> | null = null;

function publish(instance: ObservedHlsInstance | null) {
  currentInstance = instance;
  for (const listener of listeners) listener(instance);
}

export function getObservedHlsInstance() {
  return currentInstance;
}

export function subscribeObservedHls(listener: HlsListener) {
  listeners.add(listener);
  listener(currentInstance);

  return () => {
    listeners.delete(listener);
  };
}

export function installHlsObserver() {
  if (installPromise) return installPromise;

  installPromise = import('hls.js')
    .then(module => {
      const exported = (module as { default?: unknown }).default ?? module;
      const Hls = exported as HlsConstructor;
      const prototype = Hls.prototype;

      if (!prototype || prototype[PATCHED]) return;

      const originalAttachMedia = prototype.attachMedia;
      const originalDestroy = prototype.destroy;

      prototype.attachMedia = function attachObservedMedia(this: ObservedHlsInstance, media: HTMLMediaElement) {
        publish(this);
        return originalAttachMedia.call(this, media);
      };

      prototype.destroy = function destroyObservedHls(this: ObservedHlsInstance) {
        if (currentInstance === this) publish(null);
        return originalDestroy.call(this);
      };

      prototype[PATCHED] = true;
    })
    .catch(() => {
      // O player continua funcionando mesmo quando o observador não puder ser instalado.
    });

  return installPromise;
}
