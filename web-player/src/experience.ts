import type { WebMovie, WebSeries } from './types';

export type DiscoveryItem = WebMovie | WebSeries;

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableSort<T extends { contentId: string }>(items: T[], seed: string) {
  return [...items].sort((left, right) => {
    const leftScore = stableHash(`${seed}:${left.contentId}`);
    const rightScore = stableHash(`${seed}:${right.contentId}`);
    if (leftScore === rightScore) return left.contentId.localeCompare(right.contentId);
    return leftScore - rightScore;
  });
}

export function selectHeroItems(
  movies: WebMovie[],
  series: WebSeries[],
  seed: string,
  limit = 6,
): DiscoveryItem[] {
  if (limit <= 0) return [];
  const moviePool = stableSort(movies, `${seed}:movie`);
  const seriesPool = stableSort(series, `${seed}:series`);
  const result: DiscoveryItem[] = [];
  let movieIndex = 0;
  let seriesIndex = 0;
  let preferMovie = stableHash(seed) % 2 === 0;

  while (result.length < limit && (movieIndex < moviePool.length || seriesIndex < seriesPool.length)) {
    const preferred = preferMovie ? moviePool[movieIndex] : seriesPool[seriesIndex];
    const fallback = preferMovie ? seriesPool[seriesIndex] : moviePool[movieIndex];
    const next = preferred || fallback;
    if (!next) break;
    result.push(next);
    if (next.type === 'movie') movieIndex += 1;
    else seriesIndex += 1;
    preferMovie = !preferMovie;
  }

  return result;
}

function recommendations<T extends { contentId: string; contentKey: string; category?: string }>(
  current: T,
  items: T[],
  seed: string,
  limit: number,
) {
  const seen = new Set<string>([current.contentId, current.contentKey]);
  const candidates = items.filter(item => {
    if (seen.has(item.contentId) || seen.has(item.contentKey)) return false;
    seen.add(item.contentId);
    seen.add(item.contentKey);
    return true;
  });
  const sameCategory = current.category
    ? candidates.filter(item => item.category === current.category)
    : [];
  const other = current.category
    ? candidates.filter(item => item.category !== current.category)
    : candidates;
  return [
    ...stableSort(sameCategory, `${seed}:category`),
    ...stableSort(other, `${seed}:fallback`),
  ].slice(0, Math.max(0, limit));
}

export function recommendMovies(current: WebMovie, movies: WebMovie[], limit = 12) {
  return recommendations(current, movies, `movie:${current.contentKey}`, limit);
}

export function recommendSeries(current: WebSeries, series: WebSeries[], limit = 12) {
  return recommendations(current, series, `series:${current.contentKey}`, limit);
}
