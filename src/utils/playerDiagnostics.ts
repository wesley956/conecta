export type PlayerDiagnosticContentType = 'channel' | 'movie' | 'episode';
export type PlayerDiagnosticEngine = 'hls.js' | 'mpegts.js' | 'html-video' | 'unknown';
export type PlayerDiagnosticResult = 'info' | 'success' | 'warning' | 'error';

export interface PlayerDiagnosticEntry {
  id: string;
  at: string;
  sessionId: string;
  contentId: string;
  contentType: PlayerDiagnosticContentType;
  contentName: string;
  event: string;
  result: PlayerDiagnosticResult;
  engine: PlayerDiagnosticEngine;
  source: string;
  sourceRole: 'configured' | 'current' | 'internal' | 'unknown';
  elapsedMs?: number;
  readyState?: number;
  networkState?: number;
  currentTime?: number;
  duration?: number;
  bufferedAhead?: number;
  mediaErrorCode?: number;
  message?: string;
  details?: Record<string, string | number | boolean | null>;
}

export interface PlayerDiagnosticInput extends Omit<PlayerDiagnosticEntry, 'id' | 'at' | 'source' | 'message'> {
  source?: string;
  message?: string;
}

const STORAGE_KEY = 'ronecaplaytv-player-diagnostics-v1';
const MAX_ENTRIES = 120;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_TEXT_LENGTH = 280;

function makeId(prefix: string) {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

function trimText(value: unknown, maxLength = MAX_TEXT_LENGTH) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function sanitizeQuery(url: URL) {
  const keySet = new Set<string>();
  url.searchParams.forEach((_value, key) => keySet.add(key));
  const keys = [...keySet].slice(0, 12);
  url.search = '';
  for (const key of keys) url.searchParams.append(key, '***');
  url.hash = '';
}

function sanitizeXtreamPath(url: URL) {
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 3) return;

  const routeIndex = parts.findIndex(part => {
    const route = part.toLowerCase();
    return route === 'live' || route === 'movie' || route === 'series';
  });
  const offset = routeIndex >= 0 ? routeIndex + 1 : 0;
  if (parts.length - offset < 3) return;

  parts[offset] = '***';
  parts[offset + 1] = '***';
  url.pathname = `/${parts.join('/')}`;
}

export function sanitizePlayerDiagnosticUrl(rawUrl: string | undefined) {
  const value = trimText(rawUrl, 2_000);
  if (!value) return 'não informada';
  if (/^blob:/i.test(value)) return 'blob:[interno]';
  if (/^data:/i.test(value)) return 'data:[interno]';

  try {
    const url = new URL(value);
    url.username = url.username ? '***' : '';
    url.password = url.password ? '***' : '';
    sanitizeXtreamPath(url);
    sanitizeQuery(url);
    return url.toString();
  } catch {
    return value
      .replace(/(https?:\/\/)([^/@\s]+):([^/@\s]+)@/gi, '$1***:***@')
      .replace(/\/(live|movie|series)\/[^/\s]+\/[^/\s]+\//gi, '/$1/***/***/')
      .replace(/(https?:\/\/[^/\s]+)\/[^/\s]+\/[^/\s]+\/([^?\s]+)/gi, '$1/***/***/$2')
      .replace(/([?&](?:user(?:name)?|pass(?:word)?|token|auth|key|signature|sig|session|cookie)=)[^&#\s]*/gi, '$1***')
      .replace(/#.*$/, '')
      .slice(0, 420);
  }
}

export function sanitizePlayerDiagnosticText(rawText: unknown) {
  const value = trimText(rawText);
  if (!value) return '';

  return value
    .replace(/https?:\/\/[^\s"']+/gi, match => sanitizePlayerDiagnosticUrl(match))
    .replace(/\b(user(?:name)?|pass(?:word)?|token|authorization|cookie|signature|session)\s*[:=]\s*[^\s,;]+/gi, '$1=***')
    .slice(0, MAX_TEXT_LENGTH);
}

function readEntries(): PlayerDiagnosticEntry[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]') as unknown;
    if (!Array.isArray(parsed)) return [];

    const cutoff = Date.now() - MAX_AGE_MS;
    return parsed
      .filter((entry): entry is PlayerDiagnosticEntry => {
        if (!entry || typeof entry !== 'object') return false;
        const candidate = entry as Partial<PlayerDiagnosticEntry>;
        return typeof candidate.at === 'string' && Date.parse(candidate.at) >= cutoff;
      })
      .slice(-MAX_ENTRIES);
  } catch {
    return [];
  }
}

function writeEntries(entries: PlayerDiagnosticEntry[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // O diagnóstico nunca deve impedir a reprodução.
  }
}

export function createPlayerDiagnosticSession() {
  return makeId('play');
}

export function recordPlayerDiagnostic(input: PlayerDiagnosticInput) {
  const entry: PlayerDiagnosticEntry = {
    ...input,
    id: makeId('evt'),
    at: new Date().toISOString(),
    contentName: trimText(input.contentName, 160),
    event: trimText(input.event, 80),
    source: sanitizePlayerDiagnosticUrl(input.source),
    message: input.message ? sanitizePlayerDiagnosticText(input.message) : undefined,
    details: input.details
      ? Object.fromEntries(
          Object.entries(input.details).slice(0, 20).map(([key, value]) => [
            trimText(key, 64),
            typeof value === 'string' ? sanitizePlayerDiagnosticText(value) : value,
          ]),
        )
      : undefined,
  };

  const entries = [...readEntries(), entry].slice(-MAX_ENTRIES);
  writeEntries(entries);

  try {
    window.dispatchEvent(new CustomEvent('roneca:player-diagnostic', { detail: entry }));
  } catch {
    // Eventos de diagnóstico são auxiliares.
  }

  return entry;
}

export function getPlayerDiagnostics() {
  return readEntries();
}

export function clearPlayerDiagnostics() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Armazenamento indisponível não afeta o player.
  }
}

export function formatPlayerDiagnosticsReport() {
  return JSON.stringify({
    generatedAt: new Date().toISOString(),
    environment: {
      online: navigator.onLine,
      language: navigator.language,
      platform: trimText(navigator.userAgent, 220),
      native: Boolean((window as typeof window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()),
    },
    entries: getPlayerDiagnostics(),
  }, null, 2);
}

export function installPlayerDiagnosticsBridge() {
  const target = window as typeof window & {
    RonecaPlayerDiagnostics?: {
      getEntries: typeof getPlayerDiagnostics;
      getReport: typeof formatPlayerDiagnosticsReport;
      clear: typeof clearPlayerDiagnostics;
    };
  };

  target.RonecaPlayerDiagnostics = {
    getEntries: getPlayerDiagnostics,
    getReport: formatPlayerDiagnosticsReport,
    clear: clearPlayerDiagnostics,
  };
}
