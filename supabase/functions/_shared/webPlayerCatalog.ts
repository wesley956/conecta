import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { openWebPayload, sealWebPayload, type WebSessionContext } from './webPlayerSecurity.ts';
import {
  channelContentKey,
  movieContentKey,
  seriesContentKey,
  episodeContentKey,
} from './contentIdentity.ts';

export type WebContentType = 'channel' | 'movie' | 'series' | 'episode';
export type WebContentToken = {
  v: number;
  deviceId: string;
  playlistId: string;
  type: WebContentType;
  sourceId: string;
  contentKey: string;
  seriesSourceId?: string;
  seriesName?: string;
  exp: number;
};

export type PlaylistAssignment = {
  playlistId: string;
  priority: number;
  role: 'primary' | 'backup';
  name: string;
  cacheVersion: string | null;
  channelsPath: string | null;
  moviesPath: string | null;
  seriesPath: string | null;
  playlistUrl: string;
  cooldownUntil: string | null;
};

function plainObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safeText(value: unknown, max = 500) {
  const result = String(value ?? '').trim();
  return result ? result.slice(0, max) : undefined;
}

function safeNumber(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) ? result : undefined;
}

export function safePublicImage(value: unknown) {
  const raw = safeText(value, 2048);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return undefined;
    if (url.username || url.password) return undefined;
    const suspicious = [...url.searchParams.keys()].some(key => /user|pass|token|auth|key|credential/i.test(key));
    if (suspicious) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export async function devicePlaylistAssignments(
  supabase: SupabaseClient,
  session: WebSessionContext,
): Promise<PlaylistAssignment[]> {
  const { data: device, error } = await supabase.from('panel_devices').select(`
    id,
    playlist:panel_playlists(
      id, name, active, playlist_url, playlist_cache_version,
      playlist_cache_channels_path, playlist_cache_movies_path, playlist_cache_series_path
    ),
    device_playlists:panel_device_playlists(
      playlist_id, priority, active, cooldown_until,
      playlist:panel_playlists(
        id, name, active, playlist_url, playlist_cache_version,
        playlist_cache_channels_path, playlist_cache_movies_path, playlist_cache_series_path
      )
    )
  `).eq('id', session.deviceId).maybeSingle();
  if (error || !device) throw new Error('WEB_DEVICE_PLAYLISTS_UNAVAILABLE');

  const legacy = Array.isArray(device.playlist) ? device.playlist[0] : device.playlist;
  let assignments = (device.device_playlists || [])
    .map((entry: any) => ({
      ...entry,
      playlist: Array.isArray(entry.playlist) ? entry.playlist[0] : entry.playlist,
    }))
    .filter((entry: any) => entry.active !== false && entry.playlist?.active !== false)
    .sort((a: any, b: any) => Number(a.priority || 1) - Number(b.priority || 1));

  if (!assignments.length && legacy?.active !== false && legacy?.id) {
    assignments = [{ playlist_id: legacy.id, priority: 1, cooldown_until: null, playlist: legacy }];
  }

  return assignments.flatMap((entry: any) => {
    const playlist = entry.playlist;
    if (!playlist?.id || !playlist?.playlist_url) return [];
    const priority = Math.max(1, Number(entry.priority || 1));
    return [{
      playlistId: playlist.id,
      priority,
      role: priority === 1 ? 'primary' as const : 'backup' as const,
      name: String(playlist.name || (priority === 1 ? 'Principal' : 'Reserva')),
      cacheVersion: playlist.playlist_cache_version || null,
      channelsPath: playlist.playlist_cache_channels_path || null,
      moviesPath: playlist.playlist_cache_movies_path || null,
      seriesPath: playlist.playlist_cache_series_path || null,
      playlistUrl: playlist.playlist_url,
      cooldownUntil: entry.cooldown_until || null,
    }];
  });
}

export async function downloadCachePart(supabase: SupabaseClient, path: string | null, key: string) {
  if (!path) throw new Error('WEB_CATALOG_PART_NOT_READY');
  const result = await supabase.storage.from('playlist-cache').download(path);
  if (result.error || !result.data) throw new Error('WEB_CATALOG_PART_NOT_READY');
  const raw = JSON.parse(await result.data.text());
  const object = plainObject(raw);
  const items = object?.[key];
  if (!Array.isArray(items)) throw new Error('WEB_CATALOG_PART_INVALID');
  return items as Record<string, unknown>[];
}

async function contentId(
  session: WebSessionContext,
  playlistId: string,
  type: WebContentType,
  sourceId: string,
  stableKey: string,
  seriesSourceId?: string,
  seriesName?: string,
) {
  return await sealWebPayload({
    v: 1,
    deviceId: session.deviceId,
    playlistId,
    type,
    sourceId,
    contentKey: stableKey,
    ...(seriesSourceId ? { seriesSourceId } : {}),
    ...(seriesName ? { seriesName } : {}),
    exp: Date.now() + 60 * 60 * 1000,
  });
}

export async function projectChannels(session: WebSessionContext, playlistId: string, items: Record<string, unknown>[]) {
  return await Promise.all(items.flatMap(item => {
    const sourceId = safeText(item.id, 256);
    if (!sourceId) return [];
    const stableKey = channelContentKey(item.name, item.groupTitle);
    return [contentId(session, playlistId, 'channel', sourceId, stableKey).then(id => ({
      contentId: id,
      contentKey: stableKey,
      type: 'channel' as const,
      title: safeText(item.name, 300) || 'Canal',
      logo: safePublicImage(item.logo),
      category: safeText(item.groupTitle, 200),
    }))];
  }));
}

export async function projectMovies(session: WebSessionContext, playlistId: string, items: Record<string, unknown>[]) {
  return await Promise.all(items.flatMap(item => {
    const sourceId = safeText(item.id, 256);
    if (!sourceId) return [];
    const stableKey = movieContentKey(item.name, item.year);
    return [contentId(session, playlistId, 'movie', sourceId, stableKey).then(id => ({
      contentId: id,
      contentKey: stableKey,
      type: 'movie' as const,
      title: safeText(item.name, 300) || 'Filme',
      cover: safePublicImage(item.cover),
      category: safeText(item.category, 200),
      year: safeNumber(item.year),
      duration: safeText(item.duration, 80),
      synopsis: safeText(item.synopsis, 1600),
    }))];
  }));
}

export async function projectEpisodes(
  session: WebSessionContext,
  playlistId: string,
  seriesSourceId: string,
  rawSeasons: unknown,
  seriesName = 'Série',
) {
  if (!Array.isArray(rawSeasons)) return [];
  const seasons = [] as Array<{ number: number; episodes: unknown[] }>;
  for (const [seasonIndex, seasonValue] of rawSeasons.entries()) {
    const season = plainObject(seasonValue);
    if (!season || !Array.isArray(season.episodes)) continue;
    const seasonNumber = safeNumber(season.number) || seasonIndex + 1;
    const episodes = [] as unknown[];
    for (const [episodeIndex, episodeValue] of season.episodes.entries()) {
      const episode = plainObject(episodeValue);
      const sourceId = safeText(episode?.id, 256);
      if (!episode || !sourceId) continue;
      const episodeNumber = safeNumber(episode.number) || episodeIndex + 1;
      const stableKey = episodeContentKey(seriesName, seasonNumber, episodeNumber);
      episodes.push({
        contentId: await contentId(session, playlistId, 'episode', sourceId, stableKey, seriesSourceId, seriesName),
        contentKey: stableKey,
        type: 'episode',
        number: episodeNumber,
        title: safeText(episode.name, 300) || `Episódio ${episodeNumber}`,
        duration: safeText(episode.duration, 80),
      });
    }
    if (episodes.length) seasons.push({ number: seasonNumber, episodes });
  }
  return seasons;
}

export async function projectSeries(session: WebSessionContext, playlistId: string, items: Record<string, unknown>[]) {
  return await Promise.all(items.flatMap(item => {
    const sourceId = safeText(item.id, 256);
    if (!sourceId) return [];
    const stableKey = seriesContentKey(item.name);
    return [contentId(session, playlistId, 'series', sourceId, stableKey, undefined, safeText(item.name, 300)).then(id => ({
      contentId: id,
      contentKey: stableKey,
      type: 'series' as const,
      title: safeText(item.name, 300) || 'Série',
      cover: safePublicImage(item.cover),
      category: safeText(item.category, 200),
      synopsis: safeText(item.synopsis, 1600),
      hasEmbeddedSeasons: Array.isArray(item.seasons) && item.seasons.length > 0,
    }))];
  }));
}

export async function parseContentToken(token: string, session: WebSessionContext): Promise<WebContentToken> {
  const payload = await openWebPayload<WebContentToken & Record<string, unknown>>(token);
  if (
    payload.v !== 1 ||
    payload.deviceId !== session.deviceId ||
    typeof payload.playlistId !== 'string' ||
    !['channel', 'movie', 'series', 'episode'].includes(String(payload.type)) ||
    typeof payload.sourceId !== 'string' ||
    typeof payload.contentKey !== 'string' ||
    payload.contentKey.length > 500 ||
    Number(payload.exp || 0) <= Date.now()
  ) throw new Error('WEB_CONTENT_ID_INVALID');
  return payload as WebContentToken;
}

function partFor(assignment: PlaylistAssignment, type: WebContentType) {
  if (type === 'channel') return { path: assignment.channelsPath, key: 'channels' };
  if (type === 'movie') return { path: assignment.moviesPath, key: 'movies' };
  return { path: assignment.seriesPath, key: 'series' };
}

export async function resolveContentFromCache(
  supabase: SupabaseClient,
  session: WebSessionContext,
  token: WebContentToken,
) {
  const assignments = await devicePlaylistAssignments(supabase, session);
  const assignment = assignments.find(item => item.playlistId === token.playlistId);
  if (!assignment) throw new Error('WEB_CONTENT_NOT_AUTHORIZED');
  const part = partFor(assignment, token.type);
  const items = await downloadCachePart(supabase, part.path, part.key);

  if (token.type === 'episode') {
    const series = items.find(item => String(item.id || '') === String(token.seriesSourceId || ''));
    if (!series) throw new Error('WEB_CONTENT_NOT_FOUND');
    const embeddedSeasons = Array.isArray(series.seasons) ? series.seasons : [];
    for (const seasonValue of embeddedSeasons) {
      const season = plainObject(seasonValue);
      if (!season || !Array.isArray(season.episodes)) continue;
      const episode = season.episodes
        .map(plainObject)
        .find(value => value && String(value.id || '') === token.sourceId);
      if (episode) return { assignment, item: episode, series };
    }
    throw new Error('WEB_EPISODE_NOT_IN_CATALOG');
  }

  const item = items.find(candidate => String(candidate.id || '') === token.sourceId);
  if (!item) throw new Error('WEB_CONTENT_NOT_FOUND');
  return { assignment, item };
}

function rawKey(type: Exclude<WebContentType, 'episode'>, item: Record<string, unknown>) {
  if (type === 'channel') return channelContentKey(item.name, item.groupTitle);
  if (type === 'movie') return movieContentKey(item.name, item.year);
  return seriesContentKey(item.name);
}

async function findEpisodeByKey(
  supabase: SupabaseClient,
  assignment: PlaylistAssignment,
  targetKey: string,
) {
  const seriesItems = await downloadCachePart(supabase, assignment.seriesPath, 'series');
  for (const series of seriesItems) {
    const seriesName = String(series.name || 'Série');
    const embedded = Array.isArray(series.seasons) ? series.seasons : [];
    for (const [seasonIndex, seasonValue] of embedded.entries()) {
      const season = plainObject(seasonValue);
      if (!season || !Array.isArray(season.episodes)) continue;
      const seasonNumber = safeNumber(season.number) || seasonIndex + 1;
      for (const [episodeIndex, episodeValue] of season.episodes.entries()) {
        const episode = plainObject(episodeValue);
        if (!episode) continue;
        const episodeNumber = safeNumber(episode.number) || episodeIndex + 1;
        if (episodeContentKey(seriesName, seasonNumber, episodeNumber) === targetKey) {
          return { assignment, item: episode, series };
        }
      }
    }
  }
  return null;
}

export async function resolveLogicalContent(
  supabase: SupabaseClient,
  session: WebSessionContext,
  type: WebContentType,
  contentKey: string,
  options: { afterPriority?: number } = {},
) {
  const assignments = await devicePlaylistAssignments(supabase, session);
  const candidates = assignments.filter(item => item.priority > Number(options.afterPriority || 0));
  for (const assignment of candidates) {
    try {
      if (type === 'episode') {
        const episode = await findEpisodeByKey(supabase, assignment, contentKey);
        if (episode) return episode;
        continue;
      }
      if (type === 'series') continue;
      const part = partFor(assignment, type);
      const items = await downloadCachePart(supabase, part.path, part.key);
      const item = items.find(candidate => rawKey(type, candidate) === contentKey);
      if (item) return { assignment, item };
    } catch {
      // Falha de um cache/lista não impede tentar a próxima atribuição autorizada.
    }
  }
  throw new Error('WEB_LOGICAL_CONTENT_NOT_FOUND');
}
