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

export const WEB_PLAYER_VERSION = '0.2.3';
const REFRESH_KEY = 'roneca.web.refresh.v1';
const CATALOG_CACHE_PREFIX = 'roneca.web.catalog.v2.';
const CATALOG_CACHE_TTL_MS = 5 * 60_000;
const SERIES_CACHE_TTL_MS = 5 * 60_000;
const EPG_CACHE_TTL_MS = 60_000;
const DETAIL_CACHE_MAX_ENTRIES = 40;
// Depois de um 429 o servidor continua contando (e custando) cada tentativa. Pausamos as
// chamadas deste endpoint por um tempo em vez de repetir o pedido em laço.
const RATE_LIMIT_COOLDOWN_MS = 30_000;
const RATE_LIMIT_COOLDOWN_ENDPOINTS = new Set(['web-player-catalog']);
let activeAccessToken: string | null = null;
let activeCatalogCacheKey: string | null = null;
const identities = new Map<string, { contentId: string; contentKey: string; type: 'channel' | 'movie' | 'series' | 'episode' }>();
const catalogInflight = new Map<string, Promise<Catalog>>();
const catalogMemory = new Map<string, { storedAt: number; catalog: Catalog }>();

type SeriesResult = {
  ok: true; contentId: string; contentKey: string; title: string; seasons: WebSeason[]; detailsReady: boolean; message?: string | null;
};
const seriesMemory = new Map<string, { storedAt: number; result: SeriesResult }>();
const seriesInflight = new Map<string, Promise<SeriesResult>>();
const epgMemory = new Map<string, { storedAt: number; programs: EpgProgram[] }>();
const epgInflight = new Map<string, Promise<EpgProgram[]>>();
const rateLimitedUntil = new Map<string, number>();

function rememberBounded<T>(store: Map<string, T>, key: string, value: T) {
  store.delete(key);
  store.set(key, value);
  while (store.size > DETAIL_CACHE_MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

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

function catalogCacheKey(accessToken: string) {
  const material = readStoredRefreshToken() || accessToken;
  let hash = 2166136261;
  for (let index = 0; index < material.length; index += 1) hash = Math.imul(hash ^ material.charCodeAt(index), 16777619);
  return `${CATALOG_CACHE_PREFIX}${(hash >>> 0).toString(36)}`;
}

function readCatalogCache(key: string) {
  const memory = catalogMemory.get(key);
  if (memory) {
    if (Date.now() - memory.storedAt <= CATALOG_CACHE_TTL_MS) return memory.catalog;
    catalogMemory.delete(key);
  }
  try {
    const entry = JSON.parse(window.sessionStorage.getItem(key) || 'null') as { storedAt?: number; catalog?: Catalog } | null;
    if (!entry?.catalog || Date.now() - Number(entry.storedAt || 0) > CATALOG_CACHE_TTL_MS) return null;
    return entry.catalog;
  } catch { return null; }
}

function writeCatalogCache(key: string, catalog: Catalog) {
  // Catálogos grandes podem não caber no sessionStorage (limite típico de ~5 MB). A cópia em
  // memória evita refazer a chamada inteira a cada tela quando a gravação falha.
  catalogMemory.clear();
  catalogMemory.set(key, { storedAt: Date.now(), catalog });
  try { window.sessionStorage.setItem(key, JSON.stringify({ storedAt: Date.now(), catalog })); } catch { /* storage indisponível */ }
}

export function clearCatalogCache() {
  catalogInflight.clear();
  catalogMemory.clear();
  seriesMemory.clear();
  seriesInflight.clear();
  epgMemory.clear();
  epgInflight.clear();
  try { if (activeCatalogCacheKey) window.sessionStorage.removeItem(activeCatalogCacheKey); } catch { /* storage indisponível */ }
  activeCatalogCacheKey = null;
}

export class ApiError extends Error {
  code: string;
  status: number;
  payload: Record<string, unknown>;
  constructor(code: string, message: string, status: number, payload: Record<string, unknown> = {}) {
    super(message); this.name = 'ApiError'; this.code = code; this.status = status; this.payload = payload;
  }
}

async function post<T>(endpoint: string, payload: Record<string, unknown>, accessToken?: string | null): Promise<T> {
  if ((rateLimitedUntil.get(endpoint) || 0) > Date.now()) {
    throw new ApiError('WEB_RATE_LIMITED', 'Muitas solicitações. Aguarde alguns segundos e tente novamente.', 429);
  }
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
    if (response.status === 429 && RATE_LIMIT_COOLDOWN_ENDPOINTS.has(endpoint)) {
      rateLimitedUntil.set(endpoint, Date.now() + RATE_LIMIT_COOLDOWN_MS);
    }
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
  finally { activeAccessToken = null; clearIdentityRegistry(); clearCatalogCache(); rateLimitedUntil.clear(); storeRefreshToken(null); }
}

async function requestCatalog(accessToken: string, key: string) {
  const result = await post<{ ok: true } & Catalog>('web-player-catalog', { action: 'catalog' }, accessToken);
  const catalog = {
    catalogVersion: result.catalogVersion, sourceRole: result.sourceRole, usingBackup: result.usingBackup,
    channels: result.channels, movies: result.movies, series: result.series,
  } satisfies Catalog;
  for (const item of [...catalog.channels, ...catalog.movies, ...catalog.series]) registerIdentity(item);
  writeCatalogCache(key, catalog);
  return catalog;
}

export async function fetchCatalog(accessToken: string) {
  activeAccessToken = accessToken;
  const key = catalogCacheKey(accessToken);
  activeCatalogCacheKey = key;
  const cached = readCatalogCache(key);
  if (cached) {
    for (const item of [...cached.channels, ...cached.movies, ...cached.series]) registerIdentity(item);
    return cached;
  }
  const running = catalogInflight.get(key);
  if (running) return running;
  const request = requestCatalog(accessToken, key).finally(() => catalogInflight.delete(key));
  catalogInflight.set(key, request);
  return request;
}

async function requestSeries(accessToken: string, contentId: string) {
  const result = await post<SeriesResult>('web-player-catalog', { action: 'series', contentId }, accessToken);
  for (const season of result.seasons || []) for (const episode of season.episodes || []) registerIdentity(episode);
  // Só guarda quando os episódios vieram; uma resposta vazia deve poder ser tentada de novo depois.
  if (result.detailsReady) rememberBounded(seriesMemory, contentId, { storedAt: Date.now(), result });
  return result;
}
export async function fetchSeries(accessToken: string, contentId: string): Promise<SeriesResult> {
  const cached = seriesMemory.get(contentId);
  if (cached && Date.now() - cached.storedAt <= SERIES_CACHE_TTL_MS) {
    for (const season of cached.result.seasons || []) for (const episode of season.episodes || []) registerIdentity(episode);
    return cached.result;
  }
  const running = seriesInflight.get(contentId);
  if (running) return running;
  const request = requestSeries(accessToken, contentId).finally(() => seriesInflight.delete(contentId));
  seriesInflight.set(contentId, request);
  return request;
}

async function requestEpg(accessToken: string, contentId: string) {
  const result = await post<{ ok: true; available: boolean; programs: EpgProgram[] }>('web-player-catalog', { action: 'epg', contentId }, accessToken);
  const programs = result.programs || [];
  rememberBounded(epgMemory, contentId, { storedAt: Date.now(), programs });
  return programs;
}
export async function fetchEpg(accessToken: string, contentId: string) {
  const cached = epgMemory.get(contentId);
  if (cached && Date.now() - cached.storedAt <= EPG_CACHE_TTL_MS) return cached.programs;
  const running = epgInflight.get(contentId);
  if (running) return running;
  const request = requestEpg(accessToken, contentId).finally(() => epgInflight.delete(contentId));
  epgInflight.set(contentId, request);
  return request;
}

function browserMediaRelayUrl(playbackUrl: string) {
  try {
    const source = new URL(playbackUrl);
    if (
      source.hostname !== 'awauvkjkucjqulkklmuo.supabase.co' ||
      !source.pathname.endsWith('/functions/v1/web-player-media')
    ) return playbackUrl;
    const token = source.searchParams.get('token');
    if (!token) return playbackUrl;
    if (window.location.protocol !== 'https:' || window.location.hostname === 'raw.githack.com') return playbackUrl;
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
