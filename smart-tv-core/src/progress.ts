import type { ContentKey } from "./catalog.js";

export const COMPLETION_REMAINING_THRESHOLD_MS = 45_000;

export interface PlaybackProgress {
  readonly contentKey: ContentKey;
  readonly positionMs: number;
  readonly durationMs: number;
  readonly updatedAtMs: number;
}

export interface ProgressDecision {
  readonly action: "save" | "remove" | "ignore";
  readonly progress: PlaybackProgress | null;
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function progressFraction(positionMs: number, durationMs: number): number {
  const duration = finiteNonNegative(durationMs);
  if (duration <= 0) return 0;
  return Math.min(finiteNonNegative(positionMs) / duration, 1);
}

export function isCompleted(positionMs: number, durationMs: number): boolean {
  const duration = finiteNonNegative(durationMs);
  if (duration <= 0) return false;
  const remaining = Math.max(duration - finiteNonNegative(positionMs), 0);
  return remaining <= COMPLETION_REMAINING_THRESHOLD_MS;
}

export function decideProgressPersistence(
  contentKey: ContentKey,
  positionMs: number,
  durationMs: number,
  updatedAtMs: number,
): ProgressDecision {
  const position = finiteNonNegative(positionMs);
  const duration = finiteNonNegative(durationMs);

  if (duration <= 0 || position <= 0) {
    return { action: "ignore", progress: null };
  }

  if (isCompleted(position, duration)) {
    return { action: "remove", progress: null };
  }

  return {
    action: "save",
    progress: {
      contentKey,
      positionMs: Math.min(position, duration),
      durationMs: duration,
      updatedAtMs: finiteNonNegative(updatedAtMs),
    },
  };
}

export function mostRecentProgress(
  entries: readonly PlaybackProgress[],
): PlaybackProgress | null {
  return [...entries].sort((left, right) => right.updatedAtMs - left.updatedAtMs)[0] ?? null;
}
