import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { fetchUniversalPlaylistText } from './universalOutboundFetch.ts';
import {
  buildXtreamApiUrl,
  buildXtreamStreamUrl,
  parseXtreamSource,
  type XtreamSource,
} from './xtreamSource.ts';

const CACHE_BUCKET = 'playlist-cache';
const PROVIDER_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
};

type WebSeriesAssignment = {
  playlistId: string;
  playlistUrl: string;
  cacheVersion: string | null;
};

type NormalizedEpisode = {
  id: string;
  number: number;
  name: string;
  duration: string;
  url: string;
  playbackUrls: string[];
};

type NormalizedSeason = {
  number: number;
  episodes: NormalizedEpisode[];
};

function positiveNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function episodeRecord(value: any) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && (
    value.id != null || value.episode_id != null || value.stream_id != null || value.info?.id != null
  ));
}

function collectEpisodes(value: unknown, depth = 0): any[] {
  if (value == null || depth > 8) return [];
  if (Array.isArray(value)) return value.flatMap(item => collectEpisodes(item, depth + 1));
  if (typeof value !== 'object') return [];
  if (episodeRecord(value)) return [value];
  return Object.values(value as Record<string, unknown>).flatMap(item => collectEpisodes(item, depth + 1));
}

function episodeGroups(info: any): Array<[string, any[]]> {
  const raw = info?.episodes ?? info?.series_data?.episodes ?? info?.data?.episodes ?? {};
  if (Array.isArray(raw)) {
    const grouped = new Map<string, any[]>();
    for (const item of raw) {
      const season = String(item?.season ?? item?.season_number ?? item?.info?.season ?? 1);
      const entries = grouped.get(season) ?? [];
      entries.push(item);
      grouped.set(season, entries);
    }
    return [...grouped.entries()];
  }
  if (!raw || typeof raw !== 'object') return [];
  return Object.entries(raw).flatMap(([season, value]) => {
    const entries = collectEpisodes(value);
    return entries.length ? [[season, entries] as [string, any[]]] : [];
  });
}

function episodeStreamUrl(source: XtreamSource, id: string, extension: unknown) {
  const ext = String(extension || 'mp4')
    .replace('.', '')
    .replace(/[^a-z0-9]/gi, '') || 'mp4';
  return buildXtreamStreamUrl(source, 'series', id, ext);
}

export function normalizeXtreamSeriesSeasons(info: unknown, source: XtreamSource, seriesId: string): NormalizedSeason[] {
  const result: NormalizedSeason[] = [];
  for (const [seasonKey, rawEpisodes] of episodeGroups(info)) {
    const first = rawEpisodes[0] || {};
    const seasonNumber = positiveNumber(
      first.season ?? first.season_number ?? first.seasonNumber ?? first.info?.season ?? seasonKey,
      result.length + 1,
    );
    const seen = new Set<string>();
    const episodes = rawEpisodes.flatMap((raw: any, index: number) => {
      const providerEpisodeId = raw?.id ?? raw?.episode_id ?? raw?.stream_id ?? raw?.info?.id;
      if (providerEpisodeId == null) return [];
      const providerId = String(providerEpisodeId);
      if (!providerId || seen.has(providerId)) return [];
      seen.add(providerId);
      const episodeNumber = positiveNumber(
        raw?.episode_num ?? raw?.episode_number ?? raw?.episodeNumber ?? raw?.number ??
          raw?.info?.episode_num ?? raw?.info?.episode_number,
        index + 1,
      );
      const url = episodeStreamUrl(
        source,
        providerId,
        raw?.container_extension ?? raw?.containerExtension ??
          raw?.info?.container_extension ?? raw?.info?.containerExtension,
      );
      return [{
        id: `xtream-sr-${seriesId}-s${seasonNumber}-e${episodeNumber}-${providerId}`,
        number: episodeNumber,
        name: String(raw?.title ?? raw?.name ?? raw?.info?.name ?? `Episódio ${episodeNumber}`).slice(0, 300),
        duration: String(raw?.info?.duration ?? raw?.duration ?? raw?.duration_secs ?? '—').slice(0, 80),
        url,
        playbackUrls: [url],
      } satisfies NormalizedEpisode];
    });
    if (episodes.length) {
      result.push({
        number: seasonNumber,
        episodes: episodes.sort((left, right) => left.number - right.number),
      });
    }
  }
  return result.sort((left, right) => left.number - right.number);
}

function cachePath(playlistId: string, seriesId: string) {
  return `${playlistId}/series-details/${seriesId}.json`;
}

async function loadCached(
  supabase: SupabaseClient,
  assignment: WebSeriesAssignment,
  seriesId: string,
) {
  try {
    const result = await supabase.storage.from(CACHE_BUCKET).download(cachePath(assignment.playlistId, seriesId));
    if (result.error || !result.data) return null;
    const cached = JSON.parse(await result.data.text());
    if (String(cached?.cacheVersion ?? '') !== String(assignment.cacheVersion ?? '')) return null;
    return Array.isArray(cached?.seasons) && cached.seasons.length
      ? cached.seasons as NormalizedSeason[]
      : null;
  } catch {
    return null;
  }
}

async function saveCached(
  supabase: SupabaseClient,
  assignment: WebSeriesAssignment,
  seriesId: string,
  seasons: NormalizedSeason[],
) {
  try {
    await supabase.storage.from(CACHE_BUCKET).upload(
      cachePath(assignment.playlistId, seriesId),
      JSON.stringify({
        schemaVersion: 3,
        seriesId,
        cacheVersion: assignment.cacheVersion,
        seasons,
      }),
      { contentType: 'application/json', cacheControl: '3600', upsert: true },
    );
  } catch {
    // O detalhe obtido do fornecedor continua válido mesmo se o cache não puder ser gravado.
  }
}

export async function loadOrFetchWebSeriesSeasons(
  supabase: SupabaseClient,
  assignment: WebSeriesAssignment,
  seriesId: string,
): Promise<NormalizedSeason[]> {
  const cached = await loadCached(supabase, assignment, seriesId);
  if (cached) return cached;

  const source = parseXtreamSource(assignment.playlistUrl);
  if (!source) throw new Error('WEB_SERIES_SOURCE_UNAVAILABLE');

  const targets = [
    buildXtreamApiUrl(source, 'get_series_info', { series_id: seriesId }),
    buildXtreamApiUrl(source, 'get_series_info', { id: seriesId }),
  ];
  let lastError: unknown = null;
  for (const target of targets) {
    try {
      const raw = await fetchUniversalPlaylistText(target, {
        label: 'Detalhes da série Web',
        timeoutMs: 15_000,
        maxBytes: 40 * 1024 * 1024,
        allowedOrigins: [source.origin],
        headers: PROVIDER_HEADERS,
        followRedirects: true,
      });
      const seasons = normalizeXtreamSeriesSeasons(JSON.parse(raw), source, seriesId);
      if (!seasons.length) throw new Error('WEB_SERIES_EPISODES_EMPTY');
      await saveCached(supabase, assignment, seriesId, seasons);
      return seasons;
    } catch (error) {
      lastError = error;
    }
  }

  console.error('web series detail unavailable', {
    code: lastError instanceof Error && lastError.message.startsWith('WEB_')
      ? lastError.message
      : 'WEB_SERIES_PROVIDER_UNAVAILABLE',
  });
  throw new Error('WEB_SERIES_EPISODES_UNAVAILABLE');
}
