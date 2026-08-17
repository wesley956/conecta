function token(value: unknown) {
  const normalized = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'sem-nome';
}

export function channelContentKey(name: unknown, groupTitle: unknown) {
  return `channel:${token(name)}:${token(groupTitle)}`;
}

export function movieContentKey(name: unknown, year: unknown) {
  const parsedYear = Number(year);
  const safeYear = Number.isFinite(parsedYear) ? Math.trunc(parsedYear) : 0;
  return `movie:${token(name)}:${safeYear}`;
}

export function seriesContentKey(name: unknown) {
  return `series:${token(name)}`;
}

export function episodeContentKey(seriesName: unknown, seasonNumber: unknown, episodeNumber: unknown) {
  const season = Math.max(0, Math.trunc(Number(seasonNumber) || 0));
  const episode = Math.max(0, Math.trunc(Number(episodeNumber) || 0));
  return `episode:${token(seriesName)}:s${season}:e${episode}`;
}

export function contentKeyMatches(value: unknown, expected: string) {
  return String(value || '') === expected;
}
