import { recommendMovies, recommendSeries } from './experience';
import type { WebMovie, WebSeries } from './types';

export type ContextualOrigin = WebMovie | WebSeries;

export type InterestSignal = {
  origin: ContextualOrigin;
  progressRatio: number;
  completed: boolean;
  updatedAt: string;
};

export type ContextualShelf = {
  key: string;
  title: string;
  origin: ContextualOrigin;
  items: ContextualOrigin[];
};

export const MIN_SIGNIFICANT_PROGRESS = 0.2;
export const MAX_CONTEXTUAL_SHELVES = 2;

export function isSignificantInterest(signal: InterestSignal) {
  if (signal.completed) return true;
  return Number.isFinite(signal.progressRatio) && signal.progressRatio >= MIN_SIGNIFICANT_PROGRESS;
}

function recentFirst(left: InterestSignal, right: InterestSignal) {
  const leftTime = new Date(left.updatedAt).getTime();
  const rightTime = new Date(right.updatedAt).getTime();
  if (leftTime !== rightTime) return rightTime - leftTime;
  return left.origin.contentKey.localeCompare(right.origin.contentKey);
}

export function selectContextualOrigins(
  signals: InterestSignal[],
  limit = MAX_CONTEXTUAL_SHELVES,
) {
  const seen = new Set<string>();
  const selected: InterestSignal[] = [];
  for (const signal of [...signals].filter(isSignificantInterest).sort(recentFirst)) {
    const identity = signal.origin.contentKey || signal.origin.contentId;
    if (seen.has(identity)) continue;
    seen.add(identity);
    selected.push(signal);
    if (selected.length >= Math.max(0, limit)) break;
  }
  return selected;
}

export function buildContextualShelves(
  signals: InterestSignal[],
  movies: WebMovie[],
  series: WebSeries[],
  limit = MAX_CONTEXTUAL_SHELVES,
): ContextualShelf[] {
  const shelves: ContextualShelf[] = [];
  const usedCandidates = new Set<string>();

  for (const signal of selectContextualOrigins(signals, limit)) {
    const origin = signal.origin;
    const raw = origin.type === 'movie'
      ? recommendMovies(origin, movies, 18)
      : recommendSeries(origin, series, 18);

    const candidates = raw.filter(item => {
      const identity = item.contentKey || item.contentId;
      if (identity === origin.contentKey || item.contentId === origin.contentId) return false;
      if (usedCandidates.has(identity)) return false;
      usedCandidates.add(identity);
      return true;
    }).slice(0, 12);

    if (!candidates.length) continue;
    shelves.push({
      key: `because:${origin.contentKey || origin.contentId}`,
      title: `Porque você assistiu “${origin.title}”`,
      origin,
      items: candidates,
    });
    if (shelves.length >= Math.max(0, limit)) break;
  }

  return shelves;
}
