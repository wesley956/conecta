import type {
  AuthTokens,
  Catalog,
  EpgProgram,
  PlaybackAuthorization,
  SessionInfo,
  WebSeason,
} from './types';

const FUNCTIONS_URL = String(
  import.meta.env.VITE_SUPABASE_FUNCTIONS_URL ||
  'https://awauvkjkucjqulkklmuo.supabase.co/functions/v1',
).replace(/\/$/, '');

const REFRESH_KEY = 'roneca.web.refresh.v1';

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
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
    try {
      body = await response.json() as Record<string, unknown>;
    } catch {
      body = {};
    }
    if (!response.ok || body.ok === false) {
      throw new ApiError(
        String(body.code || `HTTP_${response.status}`),
        String(body.message || 'Não foi possível concluir esta operação.'),
        response.status,
      );
    }
    return body as T;
  } catch (error) {
    if (controller.signal.aborted) throw new ApiError('WEB_TIMEOUT', 'O servidor demorou demais para responder.', 408);
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function readStoredRefreshToken() {
  try {
    return window.sessionStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

export function storeRefreshToken(value: string | null) {
  try {
    if (value) window.sessionStorage.setItem(REFRESH_KEY, value);
    else window.sessionStorage.removeItem(REFRESH_KEY);
  } catch {
    // O acesso continua na aba atual; apenas a restauração após refresh fica indisponível.
  }
}

export async function login(deviceCode: string, pin: string) {
  const result = await post<AuthTokens & { ok: true }>('web-player-auth', {
    action: 'login',
    deviceCode,
    pin,
  });
  storeRefreshToken(result.refreshToken);
  return result;
}

export async function refreshSession(refreshToken = readStoredRefreshToken()) {
  if (!refreshToken) return null;
  try {
    const result = await post<AuthTokens & { ok: true }>('web-player-auth', {
      action: 'refresh',
      refreshToken,
    });
    storeRefreshToken(result.refreshToken);
    return result;
  } catch (error) {
    storeRefreshToken(null);
    throw error;
  }
}

export async function fetchSession(accessToken: string) {
  const result = await post<{ ok: true; session: SessionInfo }>('web-player-auth', {
    action: 'session',
  }, accessToken);
  return result.session;
}

export async function logout(accessToken: string | null) {
  try {
    if (accessToken) await post('web-player-auth', { action: 'logout' }, accessToken);
  } finally {
    storeRefreshToken(null);
  }
}

export async function fetchCatalog(accessToken: string) {
  const result = await post<{ ok: true } & Catalog>('web-player-catalog', {
    action: 'catalog',
  }, accessToken);
  return {
    catalogVersion: result.catalogVersion,
    sourceRole: result.sourceRole,
    usingBackup: result.usingBackup,
    channels: result.channels,
    movies: result.movies,
    series: result.series,
  } satisfies Catalog;
}

export async function fetchSeries(accessToken: string, contentId: string) {
  const result = await post<{
    ok: true;
    contentId: string;
    title: string;
    seasons: WebSeason[];
    detailsReady: boolean;
    message?: string | null;
  }>('web-player-catalog', {
    action: 'series',
    contentId,
  }, accessToken);
  return result;
}

export async function fetchEpg(accessToken: string, contentId: string) {
  const result = await post<{
    ok: true;
    available: boolean;
    programs: EpgProgram[];
  }>('web-player-catalog', {
    action: 'epg',
    contentId,
  }, accessToken);
  return result.programs || [];
}

export async function authorizePlayback(accessToken: string, contentId: string) {
  const result = await post<{ ok: true } & PlaybackAuthorization>('web-player-playback', {
    contentId,
  }, accessToken);
  return {
    mode: result.mode,
    playbackUrl: result.playbackUrl,
    mediaKind: result.mediaKind,
    contentType: result.contentType,
    playlistRole: result.playlistRole,
    alternativesAvailable: result.alternativesAvailable,
    expiresAt: result.expiresAt,
  } satisfies PlaybackAuthorization;
}
