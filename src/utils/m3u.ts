import type { Channel } from '@/types';

export interface ParsedM3UResult {
  channels: Channel[];
  skipped: number;
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
  return tvgName || 'Canal sem nome';
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

function isPlayableUrl(url: string): boolean {
  return /^https?:\/\//i.test(url) || /^rtmp:\/\//i.test(url);
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isLikelyVodEntry(name: string, groupTitle: string, url: string): boolean {
  const text = normalizeText(`${groupTitle} ${name}`);

  if (
    text.includes('filme') ||
    text.includes('filmes') ||
    text.includes('movie') ||
    text.includes('movies') ||
    text.includes('vod') ||
    text.includes('cinema') ||
    text.includes('serie') ||
    text.includes('series') ||
    text.includes('temporada') ||
    text.includes('novela')
  ) {
    return true;
  }

  return /\.(mp4|mkv|avi|mov|wmv|flv)(\?|$)/i.test(url);
}

export function parseM3U(content: string, playlistId = 'local-m3u'): ParsedM3UResult {
  const lines = content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const channels: Channel[] = [];
  let skipped = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (!line.startsWith('#EXTINF')) continue;

    const url = lines[i + 1]?.trim() ?? '';

    if (!isPlayableUrl(url)) {
      skipped += 1;
      continue;
    }

    const name = readName(line);
    const groupTitle = readAttr(line, 'group-title') || 'Outros';

    // Nesta fase, a seção TV Ao Vivo deve carregar só canais.
    // Filmes e séries serão tratados em telas próprias depois.
    if (isLikelyVodEntry(name, groupTitle, url)) {
      skipped += 1;
      continue;
    }

    const logo = readAttr(line, 'tvg-logo');
    const epgId = readAttr(line, 'tvg-id');

    channels.push({
      id: `${playlistId}-ch-${channels.length + 1}`,
      name,
      group: safeGroupName(groupTitle),
      groupTitle,
      url,
      logo: logo || undefined,
      epgId: epgId || undefined,
      isFavorite: false,
    });
  }

  return { channels, skipped };
}

export function isLikelyM3U(content: string): boolean {
  return content.includes('#EXTM3U') || content.includes('#EXTINF');
}
