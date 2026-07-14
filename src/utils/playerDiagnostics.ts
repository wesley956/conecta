const PLAYER_DIAGNOSTICS_KEY = 'roneca:player:diagnostics:v1';
const MAX_DIAGNOSTIC_ENTRIES = 80;

export type PlayerDiagnosticEvent =
  | 'loadstart'
  | 'loadedmetadata'
  | 'canplay'
  | 'playing'
  | 'waiting'
  | 'stalled'
  | 'error'
  | 'ended'
  | 'offline'
  | 'online';

export interface PlayerDiagnosticEntry {
  at: string;
  event: PlayerDiagnosticEvent;
  contentId: string;
  contentKind: 'live' | 'vod';
  transport: 'hls' | 'mpegts' | 'native';
  host: string;
  readyState: number;
  networkState: number;
  currentTime: number;
  errorCode: number | null;
  online: boolean;
  startupMs?: number;
}

function round(value: number, digits = 1) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function inspectSource(
  video: HTMLVideoElement,
  originalSource?: string,
) {
  const source = String(
    originalSource || video.currentSrc || video.src || '',
  ).trim();
  const normalized = source.toLowerCase();

  const transport: PlayerDiagnosticEntry['transport'] = /\.m3u8(\?|#|$)/i.test(normalized)
    ? 'hls'
    : /\.(ts|m2ts|mpegts)(\?|#|$)/i.test(normalized)
      ? 'mpegts'
      : 'native';

  try {
    const url = new URL(source);
    return {
      transport,
      // Somente host e porta. Caminho, query, usuário e senha nunca são salvos.
      host: url.protocol === 'blob:'
        ? 'media-source-local'
        : url.host,
    };
  } catch {
    return {
      transport,
      host: source ? 'fonte-local-ou-proxy' : 'sem-fonte',
    };
  }
}

function readEntries(): PlayerDiagnosticEntry[] {
  try {
    const raw = window.sessionStorage.getItem(PLAYER_DIAGNOSTICS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordPlayerDiagnostic(
  event: PlayerDiagnosticEvent,
  video: HTMLVideoElement,
  context: {
    contentId: string;
    isLive: boolean;
    startupMs?: number;
    sourceUrl?: string;
  },
) {
  try {
    const source = inspectSource(video, context.sourceUrl);
    const entry: PlayerDiagnosticEntry = {
      at: new Date().toISOString(),
      event,
      contentId: context.contentId,
      contentKind: context.isLive ? 'live' : 'vod',
      transport: source.transport,
      host: source.host,
      readyState: video.readyState,
      networkState: video.networkState,
      currentTime: round(video.currentTime),
      errorCode: video.error?.code ?? null,
      online: navigator.onLine,
      ...(Number.isFinite(context.startupMs)
        ? { startupMs: Math.max(0, Math.round(context.startupMs!)) }
        : {}),
    };

    const entries = readEntries();
    entries.push(entry);
    window.sessionStorage.setItem(
      PLAYER_DIAGNOSTICS_KEY,
      JSON.stringify(entries.slice(-MAX_DIAGNOSTIC_ENTRIES)),
    );
  } catch {
    // Diagnóstico nunca deve interferir na reprodução.
  }
}

export function readPlayerDiagnostics() {
  return readEntries();
}

export function clearPlayerDiagnostics() {
  try {
    window.sessionStorage.removeItem(PLAYER_DIAGNOSTICS_KEY);
  } catch {
    // Sem impacto na reprodução.
  }
}
