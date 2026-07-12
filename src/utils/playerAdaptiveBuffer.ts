export interface PlayerAdaptiveBufferDetail {
  target: 'high';
  reason: 'sustained-live-stall';
}

export const PLAYER_ADAPTIVE_BUFFER_EVENT = 'roneca:player-adaptive-buffer';

export function requestAdaptiveLiveBuffer() {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent<PlayerAdaptiveBufferDetail>(
      PLAYER_ADAPTIVE_BUFFER_EVENT,
      {
        detail: {
          target: 'high',
          reason: 'sustained-live-stall',
        },
      },
    ),
  );
}
