import type {
  AuthTokens,
  CanonicalPreferences,
  Catalog,
  EpgProgram,
  LibrarySnapshot,
  PlaybackAuthorization,
  SessionInfo,
  WebSeason,
} from './types';

const FUNCTIONS_URL = String(
  import.meta.env.VITE_SUPABASE_FUNCTIONS_URL ||
  'https://awauvkjkucjqulkklmuo.supabase.co/functions/v1',
).replace(/\/$/, '');

export const WEB_PLAYER_VERSION = '0.2.1';
const REFRESH_KEY = 'roneca.web.refresh.v1';
let activeAccessToken: string | null = null;
const identities = new Map<string, { contentId: string; contentKey: string; type: 'channel' | 'movie' | 'series' | 'episode' }>();

function registerIdentity(item: { contentId: string; contentKey: string; type: 'channel' | 'movie' | 'series' | 'episode' }) {
  if (!item.contentId || !item.contentKey) return;
  identities.set(item.contentId, item);
  identities.set(item.contentKey, item);
}
export function getActiveAccessToken() { return activeAccessToken; }
export function getRegisteredIdentities() {
  const unique = new Map<string, { contentId: string; contentKey: string; type: 'channel' | 'movie' | 'series' | 'episode' }>();
  for (const value of identities.values()) unique.set(value.contentId, value);
  return [...unique.values()];
}
export function clearIdentityRegistry() { identities.clear(); }

export class ApiError extends Error {
  code: string;
  status: number;
  payload: Record<string, unknown>;
  constructor(code: string, message: string, status: number, payload: Record<string, unknown> = {}) {
    super(message); this.name = 'ApiError'; this.code = code; this.status = status; this.payload = payload;
  }
}

async function post<T>(endpoint: string, payload: Record<string, unknown>, accessToken?: string | null): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${FUNCTIONS_URL}/${endpoint}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });
    let body: Record<string, unknown> = {};
    try { body = await response.json() as Record<string, unknown>; } catch { body = {}; }
    if (!response.ok || body.ok === false) {
      throw new ApiError(String(body.code || `HTTP_${response.status}`), String(body.message || 'Não foi possível concluir esta operação.'), response.status, body);
    }
    return body as T;
  } catch (error) {
    if (controller.signal.aborted) throw new ApiError('WEB_TIMEOUT', 'O servidor demorou demais para responder.', 408);
    throw error;
  } finally { window.clearTimeout(timeout); }
}

export function readStoredRefreshToken() { try { return window.sessionStorage.getItem(REFRESH_KEY); } catch { return null; } }
export function storeRefreshToken(value: string | null) {
  try { if (value) window.sessionStorage.setItem(REFRESH_KEY, value); else window.sessionStorage.removeItem(REFRESH_KEY); } catch { /* aba sem storage */ }
}

export async function login(deviceCode: string, pin: string) {
  const result = await post<AuthTokens & { ok: true }>('web-player-auth', { action: 'login', deviceCode, pin });
  activeAccessToken = result.accessToken; storeRefreshToken(result.refreshToken); return result;
}
export async function refreshSession(refreshToken = readStoredRefreshToken()) {
  if (!refreshToken) return null;
  try {
    const result = await post<AuthTokens & { ok: true }>('web-player-auth', { action: 'refresh', refreshToken });
    activeAccessToken = result.accessToken; storeRefreshToken(result.refreshToken); return result;
  } catch (error) { activeAccessToken = null; storeRefreshToken(null); throw error; }
}
export async function fetchSession(accessToken: string) {
  activeAccessToken = accessToken;
  const result = await post<{ ok: true; session: SessionInfo }>('web-player-auth', { action: 'session' }, accessToken);
  return result.session;
}
export async function logout(accessToken: string | null) {
  try { if (accessToken) await post('web-player-auth', { action: 'logout' }, accessToken); }
  finally { activeAccessToken = null; clearIdentityRegistry(); storeRefreshToken(null); }
}

export async function fetchCatalog(accessToken: string) {
  activeAccessToken = accessToken;
  const result = await post<{ ok: true } & Catalog>('web-player-catalog', { action: 'catalog' }, accessToken);
  for (const item of [...(result.channels || []), ...(result.movies || []), ...(result.series || [])]) registerIdentity(item);
  return {
    catalogVersion: result.catalogVersion, sourceRole: result.sourceRole, usingBackup: result.usingBackup,
    channels: result.channels, movies: result.movies, series: result.series,
  } satisfies Catalog;
}
export async function fetchSeries(accessToken: string, contentId: string) {
  const result = await post<{
    ok: true; contentId: string; contentKey: string; title: string; seasons: WebSeason[]; detailsReady: boolean; message?: string | null;
  }>('web-player-catalog', { action: 'series', contentId }, accessToken);
  for (const season of result.seasons || []) for (const episode of season.episodes || []) registerIdentity(episode);
  return result;
}
export async function fetchEpg(accessToken: string, contentId: string) {
  const result = await post<{ ok: true; available: boolean; programs: EpgProgram[] }>('web-player-catalog', { action: 'epg', contentId }, accessToken);
  return result.programs || [];
}

function browserMediaRelayUrl(playbackUrl: string) {
  try {
    if (!window.location.hostname.endsWith('.vercel.app')) return playbackUrl;
    const source = new URL(playbackUrl);
    if (
      source.hostname !== 'awauvkjkucjqulkklmuo.supabase.co' ||
      !source.pathname.endsWith('/functions/v1/web-player-media')
    ) return playbackUrl;
    const token = source.searchParams.get('token');
    if (!token) return playbackUrl;
    return `${window.location.origin}/api/web-media-relay?token=${encodeURIComponent(token)}`;
  } catch {
    return playbackUrl;
  }
}

function playbackProjection(result: PlaybackAuthorization) {
  return {
    mode: result.mode,
    playbackUrl: browserMediaRelayUrl(result.playbackUrl),
    mediaKind: result.mediaKind,
    contentType: result.contentType,
    contentKey: result.contentKey,
    playlistRole: result.playlistRole,
    alternativesAvailable: result.alternativesAvailable,
    recoveryToken: result.recoveryToken,
    expiresAt: result.expiresAt,
    recovery: result.recovery,
  } satisfies PlaybackAuthorization;
}
export async function authorizePlayback(accessToken: string, contentId: string) {
  const result = await post<{ ok: true } & PlaybackAuthorization>('web-player-playback', { action: 'authorize', contentId }, accessToken);
  return playbackProjection(result);
}
export async function recoverPlayback(accessToken: string, recoveryToken: string, errorCode: string) {
  const result = await post<{ ok: true } & PlaybackAuthorization>('web-player-playback', { action: 'recover', recoveryToken, errorCode }, accessToken);
  return playbackProjection(result);
}

export async function fetchLibrary(accessToken: string) {
  const result = await post<{ ok: true } & LibrarySnapshot>('web-player-library', { action: 'get' }, accessToken);
  return { favorites: result.favorites || [], progress: result.progress || [], preferences: result.preferences || null } satisfies LibrarySnapshot;
}
export async function writeFavorite(accessToken: string, contentKey: string, contentType: 'channel'|'movie'|'series', active: boolean) {
  return await post<{ ok: true; favorite: { contentKey: string; active: boolean; version: number; updatedAt: string } }>('web-player-library', { action: 'favorite', contentKey, contentType, active }, accessToken);
}
export async function writeProgress(accessToken: string, contentKey: string, contentType: 'movie'|'episode', positionMs: number, durationMs: number) {
  return await post<{ ok: true; progress: { contentKey: string; positionMs: number; durationMs: number; completed: boolean; version: number; updatedAt: string } }>('web-player-library', { action: 'progress', contentKey, contentType, positionMs, durationMs }, accessToken);
}
export async function resetProgress(accessToken: string, contentKey: string, contentType: 'movie'|'episode') {
  return await post('web-player-library', { action: 'reset-progress', contentKey, contentType }, accessToken);
}
export async function writePreferences(accessToken: string, preferences: Partial<CanonicalPreferences>) {
  return await post<{ ok: true; preferences: CanonicalPreferences }>('web-player-library', {
    action: 'preferences', aspectMode: preferences.aspectMode, language: preferences.language, subtitleLanguage: preferences.subtitleLanguage,
  }, accessToken);
}
export async function reportWebDiagnostic(accessToken: string, event: {
  correlationId?: string; stage: 'authorize'|'gateway'|'player'|'recovery'|'session'|'pwa'; errorCode: string;
  contentType?: 'channel'|'movie'|'episode'|'unknown'; playlistRole?: 'primary'|'backup'; recovered?: boolean;
}) {
  return await post<{ ok: true; correlationId: string }>('web-player-diagnostics', { ...event, webVersion: WEB_PLAYER_VERSION }, accessToken);
}
