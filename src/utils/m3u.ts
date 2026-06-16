import type { Channel, Movie, Series } from '@/types';

export interface ParsedM3UResult {
  channels: Channel[];
  movies: Movie[];
  series: Series[];
  skipped: number;
}

type EntryKind = 'live' | 'movie' | 'series';

interface M3UEntry {
  name: string;
  groupTitle: string;
  logo?: string;
  epgId?: string;
  url: string;
}

function readAttr(line: string, attr: string): string {
  const match = line.match(new RegExp(`${attr}="([^"]*)"`, 'i'));
  return match?.[1]?.trim() ?? '';
}

function readName(line: string): string {
  const commaIndex = line.lastIndexOf(',');

  if (commaIndex >= 0 && commaIndex < line.length - 1) {
    return line.slice(commaIndex + 1).trim();
  }

  const tvgName = readAttr(line, 'tvg-name');
  return tvgName || 'Sem nome';
}

function safeGroupName(group: string): string {
  const value = group.trim();

  if (!value) return 'outros';

  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'outros';
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isPlayableUrl(url: string): boolean {
  return /^https?:\/\//i.test(url) || /^rtmp:\/\//i.test(url);
}

function looksLikeSeries(entry: M3UEntry): boolean {
  const text = normalizeText(`${entry.groupTitle} ${entry.name} ${entry.url}`);

  return (
    text.includes('/series/') ||
    text.includes('serie') ||
    text.includes('series') ||
    text.includes('temporada') ||
    text.includes('season') ||
    /\bs\d{1,2}\s*e\d{1,3}\b/i.test(entry.name) ||
    /\b\d{1,2}x\d{1,3}\b/i.test(entry.name)
  );
}

function looksLikeMovie(entry: M3UEntry): boolean {
  const text = normalizeText(`${entry.groupTitle} ${entry.name} ${entry.url}`);

  return (
    text.includes('/movie/') ||
    text.includes('filme') ||
    text.includes('filmes') ||
    text.includes('movie') ||
    text.includes('movies') ||
    text.includes('vod') ||
    text.includes('cinema') ||
    /\.(mp4|mkv|avi|mov|wmv|flv)(\?|#|$)/i.test(entry.url)
  );
}

function classifyEntry(entry: M3UEntry): EntryKind {
  if (looksLikeSeries(entry)) return 'series';
  if (looksLikeMovie(entry)) return 'movie';
  return 'live';
}

function parseYear(name: string): number {
  const match = name.match(/\b(19\d{2}|20\d{2})\b/);
  return match ? Number(match[1]) : 0;
}

function cleanMovieName(name: string): string {
  return name
    .replace(/\b(19\d{2}|20\d{2})\b/g, '')
    .replace(/\s*[-–]\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim() || name;
}

function parseEpisodeInfo(name: string) {
  const sxe = name.match(/\bS(\d{1,2})\s*E(\d{1,3})\b/i);
  const alt = name.match(/\b(\d{1,2})x(\d{1,3})\b/i);

  const season = Number(sxe?.[1] ?? alt?.[1] ?? 1);
  const episode = Number(sxe?.[2] ?? alt?.[2] ?? 1);

  let seriesName = name
    .replace(/\bS\d{1,2}\s*E\d{1,3}\b/i, '')
    .replace(/\b\d{1,2}x\d{1,3}\b/i, '')
    .replace(/\s*[-–|]\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!seriesName) {
    seriesName = name;
  }

  return {
    seriesName,
    season: Number.isFinite(season) && season > 0 ? season : 1,
    episode: Number.isFinite(episode) && episode > 0 ? episode : 1,
  };
}

export function parseM3U(content: string, playlistId = 'local-m3u'): ParsedM3UResult {
  const lines = content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const channels: Channel[] = [];
  const movies: Movie[] = [];
  const seriesMap = new Map<string, Series>();
  let skipped = 0;
  let episodeCounter = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (!line.startsWith('#EXTINF')) continue;

    const url = lines[i + 1]?.trim() ?? '';

    if (!isPlayableUrl(url)) {
      skipped += 1;
      continue;
    }

    const entry: M3UEntry = {
      name: readName(line),
      groupTitle: readAttr(line, 'group-title') || 'Outros',
      logo: readAttr(line, 'tvg-logo') || undefined,
      epgId: readAttr(line, 'tvg-id') || undefined,
      url,
    };

    const kind = classifyEntry(entry);

    if (kind === 'live') {
      channels.push({
        id: `${playlistId}-ch-${channels.length + 1}`,
        name: entry.name,
        group: safeGroupName(entry.groupTitle),
        groupTitle: entry.groupTitle,
        url: entry.url,
        logo: entry.logo,
        epgId: entry.epgId,
        isFavorite: false,
      });

      continue;
    }

    if (kind === 'movie') {
      movies.push({
        id: `${playlistId}-mv-${movies.length + 1}`,
        name: cleanMovieName(entry.name),
        year: parseYear(entry.name),
        duration: '—',
        synopsis: 'Filme importado da lista M3U autorizada.',
        cover: entry.logo,
        category: entry.groupTitle,
        url: entry.url,
        isFavorite: false,
        progress: 0,
      });

      continue;
    }

    const parsedEpisode = parseEpisodeInfo(entry.name);
    const seriesKey = `${safeGroupName(entry.groupTitle)}-${safeGroupName(parsedEpisode.seriesName)}`;

    let currentSeries = seriesMap.get(seriesKey);

    if (!currentSeries) {
      currentSeries = {
        id: `${playlistId}-sr-${seriesMap.size + 1}`,
        name: parsedEpisode.seriesName,
        cover: entry.logo,
        category: entry.groupTitle,
        synopsis: 'Série importada da lista M3U autorizada.',
        seasons: [],
        isFavorite: false,
        progress: 0,
      };

      seriesMap.set(seriesKey, currentSeries);
    }

    let season = currentSeries.seasons.find(item => item.number === parsedEpisode.season);

    if (!season) {
      season = {
        number: parsedEpisode.season,
        episodes: [],
      };

      currentSeries.seasons.push(season);
    }

    episodeCounter += 1;

    season.episodes.push({
      id: `${currentSeries.id}-ep-${episodeCounter}`,
      number: parsedEpisode.episode,
      name: entry.name,
      url: entry.url,
      duration: '—',
      progress: 0,
    });
  }

  const series = [...seriesMap.values()].map(item => ({
    ...item,
    seasons: item.seasons
      .map(season => ({
        ...season,
        episodes: [...season.episodes].sort((a, b) => a.number - b.number),
      }))
      .sort((a, b) => a.number - b.number),
  }));

  return { channels, movies, series, skipped };
}

export function isLikelyM3U(content: string): boolean {
  return content.includes('#EXTM3U') || content.includes('#EXTINF');
}
