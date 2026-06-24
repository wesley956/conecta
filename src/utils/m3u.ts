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
  const escapedAttr = attr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`${escapedAttr}\\s*=\\s*"([^"]*)"`, 'i'),
    new RegExp(`${escapedAttr}\\s*=\\s*'([^']*)'`, 'i'),
    new RegExp(`${escapedAttr}\\s*=\\s*([^\\s,]+)`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);
    const value = match?.[1]?.trim();

    if (value) return value;
  }

  return '';
}

function readName(line: string): string {
  const commaIndex = line.lastIndexOf(',');

  if (commaIndex >= 0 && commaIndex < line.length - 1) {
    return line.slice(commaIndex + 1).trim();
  }

  const tvgName = readAttr(line, 'tvg-name');
  return tvgName || 'Sem nome';
}

function readExtInfDuration(line: string): number | null {
  const match = line.match(/^#EXTINF:\s*(-?\d+(?:\.\d+)?)/i);
  const value = Number(match?.[1]);

  return Number.isFinite(value) && value > 0 ? value : null;
}

function formatExtInfDuration(seconds: number | null): string {
  if (!seconds) return '—';

  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');

  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(remainingSeconds)}`
    : `${pad(minutes)}:${pad(remainingSeconds)}`;
}

function findNextPlayableUrl(lines: string[], startIndex: number): { url: string; index: number } | null {
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const candidate = lines[index]?.trim() ?? '';

    if (!candidate) continue;
    if (candidate.startsWith('#EXTINF')) return null;
    if (isPlayableUrl(candidate)) return { url: candidate, index };
  }

  return null;
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

function getUrlPath(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname).toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function getUrlExtension(url: string): string {
  const path = getUrlPath(url).split('?')[0].split('#')[0];
  const match = path.match(/\.([a-z0-9]{2,5})$/i);
  return match?.[1]?.toLowerCase() ?? '';
}

function hasExplicitSeriesPath(entry: M3UEntry): boolean {
  return getUrlPath(entry.url).includes('/series/');
}

function hasExplicitMoviePath(entry: M3UEntry): boolean {
  return getUrlPath(entry.url).includes('/movie/');
}

function hasVodFileExtension(entry: M3UEntry): boolean {
  return /^(mp4|mkv|avi|mov|wmv|flv|webm|m4v)$/i.test(getUrlExtension(entry.url));
}

function hasLiveFileExtension(entry: M3UEntry): boolean {
  return /^(ts|m3u8)$/i.test(getUrlExtension(entry.url));
}

function hasEpisodeSignal(entry: M3UEntry): boolean {
  const name = entry.name;

  return (
    /\bs\d{1,2}\s*e\d{1,3}\b/i.test(name) ||
    /\bt\d{1,2}\s*e\d{1,3}\b/i.test(name) ||
    /\b\d{1,2}x\d{1,3}\b/i.test(name) ||
    /\btemporada\s*\d{1,2}.*epis[oó]dio\s*\d{1,3}\b/i.test(name) ||
    /\btemp\.?\s*\d{1,2}.*ep\.?\s*\d{1,3}\b/i.test(name)
  );
}

function hasSeriesCatalogSignal(entry: M3UEntry): boolean {
  const text = normalizeText(`${entry.groupTitle} ${entry.name}`);

  return (
    text.includes('serie') ||
    text.includes('series') ||
    text.includes('série') ||
    text.includes('séries') ||
    text.includes('temporada') ||
    text.includes('season')
  );
}

function hasMovieCatalogSignal(entry: M3UEntry): boolean {
  const text = normalizeText(`${entry.groupTitle} ${entry.name}`);

  return (
    text.includes('filme') ||
    text.includes('filmes') ||
    text.includes('movie') ||
    text.includes('movies') ||
    text.includes('vod') ||
    text.includes('cinema')
  );
}

function hasLinearLiveSignal(entry: M3UEntry): boolean {
  const text = normalizeText(`${entry.groupTitle} ${entry.name}`);

  return (
    /\b24\s*h(oras)?\b/.test(text) ||
    text.includes('24/7') ||
    /\bcanais?\b/.test(text) ||
    /\bcanal\b/.test(text) ||
    /\btv\b/.test(text) ||
    text.includes('ao vivo') ||
    /\blive\b/.test(text)
  );
}

function looksLikeSeries(entry: M3UEntry): boolean {
  if (hasExplicitSeriesPath(entry)) return true;
  if (hasExplicitMoviePath(entry)) return false;

  // Padrão forte de episódio: S01E02, T01E02, 1x02 etc.
  // Mesmo se o link terminar em .ts, isso costuma ser episódio real em várias listas.
  if (hasEpisodeSignal(entry) && !hasLinearLiveSignal(entry)) {
    return true;
  }

  // Só a palavra "Séries" no grupo não basta mais.
  // Para virar série sem /series/ ou S01E01, precisa parecer VOD.
  if (hasSeriesCatalogSignal(entry) && hasVodFileExtension(entry) && !hasLinearLiveSignal(entry)) {
    return true;
  }

  return false;
}

function looksLikeMovie(entry: M3UEntry): boolean {
  if (hasExplicitMoviePath(entry)) return true;
  if (hasExplicitSeriesPath(entry)) return false;
  if (hasEpisodeSignal(entry)) return false;

  // Links .ts/.m3u8 são mais prováveis de TV ao vivo.
  if (hasLiveFileExtension(entry)) return false;

  // Arquivos VOD reais sem /movie/ ainda podem ser filmes.
  if (hasVodFileExtension(entry) && !hasLinearLiveSignal(entry)) {
    return true;
  }

  // Usa o sinal de catálogo de filmes apenas quando também existe cara de VOD.
  // Isso evita jogar canal ao vivo de "Cinema/Filmes 24h" para Filmes.
  if (hasMovieCatalogSignal(entry) && hasVodFileExtension(entry) && !hasLinearLiveSignal(entry)) {
    return true;
  }

  // Categoria com "Filmes" sozinha não basta, porque muitos painéis colocam
  // canais lineares de filmes/cinema em grupos com esse nome.
  return false;
}

// Canais lineares "24 horas" (ex: "Filmes 24h", "Cinema 24 Horas",
// "Telecine 24h") tocam uma transmissão contínua, não um catálogo VOD real
// — mesmo que o nome/categoria contenha "filme"/"cinema".
function looksLike24HourChannel(entry: M3UEntry): boolean {
  const text = normalizeText(`${entry.groupTitle} ${entry.name}`);
  return /\b24\s*h(oras)?\b/.test(text) || text.includes('24/7');
}

function classifyEntry(entry: M3UEntry): EntryKind {
  if (looksLike24HourChannel(entry)) return 'live';

  if (hasExplicitSeriesPath(entry)) return 'series';
  if (hasExplicitMoviePath(entry)) return 'movie';

  if (looksLikeSeries(entry)) return 'series';
  if (looksLikeMovie(entry)) return 'movie';

  return 'live';
}

function parseYear(name: string): number {
  const match = name.match(/\b(19\d{2}|20\d{2})\b/);
  return match ? Number(match[1]) : 0;
}

function titleCaseCategory(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function cleanMediaCategory(groupTitle: string, kind: 'movie' | 'series'): string {
  const fallback = kind === 'movie' ? 'Filmes' : 'Séries';

  const parts = groupTitle
    .split(/[|:>/\\-]+/g)
    .map(part => part.trim())
    .filter(Boolean);

  const forbidden = kind === 'movie'
    ? ['filme', 'filmes', 'movie', 'movies', 'vod', 'cinema']
    : ['serie', 'series', 'série', 'séries', 'temporada', 'temporadas', 'season'];

  const picked = parts.find(part => {
    const normalized = normalizeText(part);
    return !forbidden.some(word => normalized === normalizeText(word));
  });

  const raw = picked || parts.at(-1) || groupTitle || fallback;
  const cleaned = raw
    .replace(/\b(FHD|HD|SD|4K|UHD|DUB|DUBLADO|LEG|LEGENDADO)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return titleCaseCategory(cleaned || fallback);
}

// Limpeza cosmética do nome de grupo de canais ao vivo (TV). Diferente de
// cleanMediaCategory, aqui NÃO removemos palavras como "filme"/"série" —
// só tiramos sujeira (tags de qualidade, separadores, espaços extras) e
// title-case o resultado, mantendo o agrupamento (que já é feito por
// slug em safeGroupName, então já é tolerante a acento/maiúsculas).
export function cleanLiveGroupTitle(groupTitle: string): string {
  const value = groupTitle.trim();

  if (!value) return 'Outros';

  const cleaned = value
    .replace(/[|]+/g, ' ')
    .replace(/\b(FHD|HD|SD|4K|UHD)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return titleCaseCategory(cleaned || value);
}

// Consolida categorias de Filmes/Séries que são a mesma coisa escrita de
// formas diferentes (acentos, maiúsculas/minúsculas, espaços extras) —
// ex: "Ação", "AÇÃO", "Acao " viravam 3 categorias separadas porque
// cleanMediaCategory só corrige capitalização, não acentos. Aqui agrupamos
// por uma chave normalizada e escolhemos o rótulo mais frequente (ou mais
// completo em caso de empate) como nome de exibição canônico.
function mergeCategoryVariants<T extends { category: string }>(items: T[]): T[] {
  const labelCountsByKey = new Map<string, Map<string, number>>();

  for (const item of items) {
    const key = normalizeText(item.category).replace(/\s+/g, ' ').trim();
    const labelCounts = labelCountsByKey.get(key) ?? new Map<string, number>();
    labelCounts.set(item.category, (labelCounts.get(item.category) ?? 0) + 1);
    labelCountsByKey.set(key, labelCounts);
  }

  const canonicalLabelByKey = new Map<string, string>();

  for (const [key, labelCounts] of labelCountsByKey) {
    const [bestLabel] = [...labelCounts.entries()].sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return b[0].length - a[0].length;
    })[0];

    canonicalLabelByKey.set(key, bestLabel);
  }

  return items.map(item => {
    const key = normalizeText(item.category).replace(/\s+/g, ' ').trim();
    const canonical = canonicalLabelByKey.get(key);

    return canonical && canonical !== item.category
      ? { ...item, category: canonical }
      : item;
  });
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
  const txe = name.match(/\bT(\d{1,2})\s*E(\d{1,3})\b/i);
  const alt = name.match(/\b(\d{1,2})x(\d{1,3})\b/i);
  const temporada = name.match(/\btemporada\s*(\d{1,2}).*epis[oó]dio\s*(\d{1,3})\b/i);
  const tempEp = name.match(/\btemp\.?\s*(\d{1,2}).*ep\.?\s*(\d{1,3})\b/i);

  const season = Number(sxe?.[1] ?? txe?.[1] ?? alt?.[1] ?? temporada?.[1] ?? tempEp?.[1] ?? 1);
  const episode = Number(sxe?.[2] ?? txe?.[2] ?? alt?.[2] ?? temporada?.[2] ?? tempEp?.[2] ?? 1);

  let seriesName = name
    .replace(/\bS\d{1,2}\s*E\d{1,3}\b/i, '')
    .replace(/\bT\d{1,2}\s*E\d{1,3}\b/i, '')
    .replace(/\b\d{1,2}x\d{1,3}\b/i, '')
    .replace(/\btemporada\s*\d{1,2}.*epis[oó]dio\s*\d{1,3}\b/i, '')
    .replace(/\btemp\.?\s*\d{1,2}.*ep\.?\s*\d{1,3}\b/i, '')
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


interface XtreamSourceInfo {
  origin: string;
  username: string;
  password: string;
}

function parseXtreamSourceInfo(sourceUrl: string): XtreamSourceInfo | null {
  if (!sourceUrl) return null;

  try {
    const url = new URL(sourceUrl);
    const username = url.searchParams.get('username') || '';
    const password = url.searchParams.get('password') || '';

    if (!username || !password) return null;

    return {
      origin: url.origin,
      username,
      password,
    };
  } catch {
    return null;
  }
}

function getXtreamFileName(streamUrl: string, source: XtreamSourceInfo): string | null {
  try {
    const url = new URL(streamUrl);
    const parts = url.pathname.split('/').filter(Boolean).map(part => decodeURIComponent(part));

    for (let index = 0; index < parts.length - 2; index += 1) {
      if (parts[index] === source.username && parts[index + 1] === source.password) {
        return parts[index + 2] || null;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function normalizeXtreamPlaybackUrl(streamUrl: string, sourceUrl: string, kind: EntryKind): string {
  const source = parseXtreamSourceInfo(sourceUrl);

  if (!source) return streamUrl;

  const fileName = getXtreamFileName(streamUrl, source);

  if (!fileName) return streamUrl;

  const folder = kind === 'live' ? 'live' : kind === 'movie' ? 'movie' : 'series';
  const safeFileName = fileName;

  return `${source.origin}/${folder}/${encodeURIComponent(source.username)}/${encodeURIComponent(source.password)}/${safeFileName}`;
}

function uniqueUrls(urls: string[]) {
  return [...new Set(urls.filter(Boolean))];
}

function buildPlaybackUrls(streamUrl: string, sourceUrl: string, kind: EntryKind) {
  const normalized = normalizeXtreamPlaybackUrl(streamUrl, sourceUrl, kind);

  return uniqueUrls([
    streamUrl,
    normalized,
  ]);
}

export function parseM3U(content: string, playlistId = 'local-m3u', sourceUrl = ''): ParsedM3UResult {
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

    const playable = findNextPlayableUrl(lines, i);

    if (!playable) {
      skipped += 1;
      continue;
    }

    const url = playable.url;
    const duration = formatExtInfDuration(readExtInfDuration(line));
    i = playable.index;

    const entry: M3UEntry = {
      name: readName(line),
      groupTitle: readAttr(line, 'group-title') || 'Outros',
      logo: readAttr(line, 'tvg-logo') || undefined,
      epgId: readAttr(line, 'tvg-id') || undefined,
      url,
    };

    const kind = classifyEntry(entry);
    const playbackUrls = buildPlaybackUrls(entry.url, sourceUrl, kind);
    entry.url = playbackUrls[0];

    if (kind === 'live') {
      channels.push({
        id: `${playlistId}-ch-${channels.length + 1}`,
        name: entry.name,
        group: safeGroupName(entry.groupTitle),
        groupTitle: entry.groupTitle,
        url: entry.url,
        playbackUrls,
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
        duration,
        synopsis: 'Filme importado da lista M3U autorizada.',
        cover: entry.logo,
        category: cleanMediaCategory(entry.groupTitle, 'movie'),
        url: entry.url,
        playbackUrls,
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
        category: cleanMediaCategory(entry.groupTitle, 'series'),
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
      playbackUrls,
      duration,
      progress: 0,
    });
  }

  const series = mergeCategoryVariants(
    [...seriesMap.values()].map(item => ({
      ...item,
      seasons: item.seasons
        .map(season => ({
          ...season,
          episodes: [...season.episodes].sort((a, b) => a.number - b.number),
        }))
        .sort((a, b) => a.number - b.number),
    }))
  );

  return { channels, movies: mergeCategoryVariants(movies), series, skipped };
}

export function isLikelyM3U(content: string): boolean {
  return content.includes('#EXTM3U') || content.includes('#EXTINF');
}
