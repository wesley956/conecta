import type { Movie, Series } from "../catalog";

const separators = /[^a-z0-9]+/g;
const marks = /[\u0300-\u036f]/g;
const stopWords = new Set([
  "a", "as", "o", "os", "de", "da", "das", "do", "dos", "e", "em", "na", "nas",
  "no", "nos", "para", "por", "um", "uma", "the", "and", "of", "in", "to"
]);

function words(...values: Array<string | null | undefined>) {
  const result = new Set<string>();
  values.filter(Boolean).forEach(value => {
    String(value)
      .normalize("NFD")
      .toLocaleLowerCase("pt-BR")
      .replace(marks, "")
      .split(separators)
      .forEach(token => {
        if (token.length >= 3 && !stopWords.has(token)) result.add(token);
      });
  });
  return result;
}

function intersectionSize(left: Set<string>, right: Set<string>) {
  let size = 0;
  left.forEach(value => { if (right.has(value)) size += 1; });
  return size;
}

function sameCategory(left?: string, right?: string) {
  const a = String(left || "").trim();
  const b = String(right || "").trim();
  return Boolean(a && b && a.localeCompare(b, "pt-BR", { sensitivity: "accent" }) === 0);
}

export function recommendedMovies(current: Movie, catalog: Movie[], limit = 14) {
  const currentName = words(current.name);
  const currentCategory = words(current.category);
  const currentSynopsis = words(current.synopsis);

  return catalog
    .filter(candidate => candidate.id !== current.id)
    .map(candidate => {
      const candidateName = words(candidate.name);
      const candidateCategory = words(candidate.category);
      const candidateSynopsis = words(candidate.synopsis);
      const yearDistance = current.year != null && candidate.year != null
        ? Math.abs(current.year - candidate.year)
        : null;
      const score =
        (sameCategory(candidate.category, current.category) ? 140 : 0) +
        (intersectionSize(currentCategory, candidateCategory) * 28) +
        (intersectionSize(currentName, candidateName) * 36) +
        Math.min(intersectionSize(currentSynopsis, candidateSynopsis) * 3, 36) +
        (candidate.cover ? 10 : 0) +
        (candidate.synopsis ? 6 : 0) +
        (yearDistance == null ? 0 : yearDistance <= 2 ? 10 : yearDistance <= 5 ? 6 : 0);
      return { candidate, score };
    })
    .sort((left, right) => right.score - left.score || left.candidate.name.localeCompare(right.candidate.name, "pt-BR"))
    .slice(0, limit)
    .map(value => value.candidate);
}

export function recommendedSeries(current: Series, catalog: Series[], limit = 14) {
  const currentName = words(current.name);
  const currentCategory = words(current.category);
  const currentSynopsis = words(current.synopsis);

  return catalog
    .filter(candidate => candidate.id !== current.id)
    .map(candidate => {
      const candidateName = words(candidate.name);
      const candidateCategory = words(candidate.category);
      const candidateSynopsis = words(candidate.synopsis);
      const score =
        (sameCategory(candidate.category, current.category) ? 140 : 0) +
        (intersectionSize(currentCategory, candidateCategory) * 28) +
        (intersectionSize(currentName, candidateName) * 36) +
        Math.min(intersectionSize(currentSynopsis, candidateSynopsis) * 3, 36) +
        (candidate.cover ? 10 : 0) +
        (candidate.synopsis ? 6 : 0) +
        ((candidate.seasons || []).length ? 5 : 0);
      return { candidate, score };
    })
    .sort((left, right) => right.score - left.score || left.candidate.name.localeCompare(right.candidate.name, "pt-BR"))
    .slice(0, limit)
    .map(value => value.candidate);
}
