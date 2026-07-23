import type { Channel, Movie, Series } from "./catalog.js";

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

export function matchesSearch(value: string, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  return normalizedQuery.length === 0 || normalizeSearchText(value).includes(normalizedQuery);
}

export interface ChannelFilter {
  readonly query: string;
  readonly category: string;
  readonly allCategoryLabel: string;
  readonly favoritesOnly: boolean;
  readonly alphabetical: boolean;
  readonly favoriteIds: ReadonlySet<string>;
}

export function filterChannels(
  channels: readonly Channel[],
  filter: ChannelFilter,
): readonly Channel[] {
  const filtered = channels.filter((channel) => {
    const categoryMatches =
      filter.category === filter.allCategoryLabel || channel.groupTitle === filter.category;
    const favoriteMatches = !filter.favoritesOnly || filter.favoriteIds.has(channel.id);
    return categoryMatches && favoriteMatches && matchesSearch(channel.name, filter.query);
  });

  return filter.alphabetical
    ? [...filtered].sort((left, right) => left.name.localeCompare(right.name, "pt-BR"))
    : filtered;
}

export interface CatalogFilter {
  readonly query: string;
  readonly category: string;
  readonly allCategoryLabel: string;
  readonly favoritesCategoryLabel: string;
  readonly continueCategoryLabel: string;
  readonly favoriteIds: ReadonlySet<string>;
  readonly startedIds: ReadonlySet<string>;
}

function categoryMatches(
  itemId: string,
  itemCategory: string,
  filter: CatalogFilter,
): boolean {
  if (filter.category === filter.allCategoryLabel) return true;
  if (filter.category === filter.favoritesCategoryLabel) return filter.favoriteIds.has(itemId);
  if (filter.category === filter.continueCategoryLabel) return filter.startedIds.has(itemId);
  return itemCategory === filter.category;
}

export function filterMovies(
  movies: readonly Movie[],
  filter: CatalogFilter,
): readonly Movie[] {
  return movies.filter(
    (movie) =>
      categoryMatches(movie.id, movie.category, filter) && matchesSearch(movie.name, filter.query),
  );
}

export function filterSeries(
  series: readonly Series[],
  filter: CatalogFilter,
): readonly Series[] {
  return series.filter(
    (item) =>
      categoryMatches(item.id, item.category, filter) && matchesSearch(item.name, filter.query),
  );
}
