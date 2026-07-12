import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { subscribeObservedHls, type ObservedHlsInstance } from '@/utils/hlsObserver';
import {
  createPlayerDiagnosticSession,
  installPlayerDiagnosticsBridge,
  recordPlayerDiagnostic,
  sanitizePlayerDiagnosticText,
  type PlayerDiagnosticContentType,
  type PlayerDiagnosticEngine,
  type PlayerDiagnosticResult,
} from '@/utils/playerDiagnostics';

const THROTTLED_EVENTS = new Set(['waiting', 'stalled', 'pause']);
const EVENT_THROTTLE_MS = 900;
const MAX_RESOURCE_EVENTS_PER_SESSION = 18;

function isMpegTsSource(url: string) {
  return /\.(ts|m2ts|mpegts)(\?|#|$)/i.test(url);
}

function inferPlayerEngine(url: string, fallback: PlayerDiagnosticEngine = 'unknown'): PlayerDiagnosticEngine {
  if (/^blob:|^data:/i.test(url)) return fallback;
  if (isMpegTsSource(url)) return 'mpegts.js';
  if (url) return 'html-video';
  return fallback;
}

function isNativeRuntime() {
  const capacitor = (window as typeof window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(capacitor?.isNativePlatform?.());
}

function getBufferedAhead(video: HTMLVideoElement) {
  try {
    for (let index = 0; index < video.buffered.length; index += 1) {
      if (video.currentTime >= video.buffered.start(index) && video.currentTime <= video.buffered.end(index)) {
        return Math.max(0, video.buffered.end(index) - video.currentTime);
      }
    }
  } catch {
    // Alguns aparelhos podem invalidar a faixa entre as leituras.
  }

  return 0;
}

function getMediaErrorMessage(video: HTMLVideoElement) {
  const error = video.error;
  if (!error) return '';

  const descriptions: Record<number, string> = {
    1: 'carregamento cancelado',
    2: 'falha de rede',
    3: 'falha ao decodificar',
    4: 'formato não suportado',
  };

  return descriptions[error.code] || error.message || 'erro de mídia desconhecido';
}

export function PlayerDiagnosticsController() {
  const currentChannel = useAppStore(state => state.currentChannel);
  const currentMovie = useAppStore(state => state.currentMovie);
  const currentSeries = useAppStore(state => state.currentSeries);
  const bufferSize = useAppStore(state => state.settings.bufferSize ?? 'medium');
  const autoReconnect = useAppStore(state => state.settings.autoReconnect ?? true);

  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [hls, setHls] = useState<ObservedHlsInstance | null>(null);
  const sessionRef = useRef(createPlayerDiagnosticSession());
  const startedAtRef = useRef(performance.now());
  const lastEventAtRef = useRef(new Map<string, number>());
  const engineRef = useRef<PlayerDiagnosticEngine>('unknown');

  const content = currentMovie || currentChannel;
  const contentId = content?.id ?? '';
  const source = content?.url?.trim() || '';
  const contentType: PlayerDiagnosticContentType = currentChannel && !currentMovie
    ? 'channel'
    : currentSeries
      ? 'episode'
      : 'movie';
  const contentName = content?.name || 'Sem nome';
  const additionalSources = Array.isArray(content?.playbackUrls) ? content.playbackUrls.length : 0;

  const engine = useMemo<PlayerDiagnosticEngine>(() => {
    if (hls) return 'hls.js';
    return inferPlayerEngine(source);
  }, [hls, source]);

  useEffect(() => {
    installPlayerDiagnosticsBridge();
  }, []);

  useEffect(() => {
    const locateVideo = () => {
      setVideo(document.querySelector<HTMLVideoElement>('.roneca-exoplayer-video'));
    };

    locateVideo();
    const observer = new MutationObserver(locateVideo);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => subscribeObservedHls(setHls), []);

  useEffect(() => {
    if (!contentId) return;

    sessionRef.current = createPlayerDiagnosticSession();
    startedAtRef.current = performance.now();
    lastEventAtRef.current.clear();

    recordPlayerDiagnostic({
      sessionId: sessionRef.current,
      contentId,
      contentType,
      contentName: contentName,
      event: 'session-start',
      result: 'info',
      engine,
      source,
      sourceRole: 'configured',
      elapsedMs: 0,
      details: {
        bufferSize,
        autoReconnect,
        nativeRuntime: isNativeRuntime(),
        additionalSources: additionalSources,
      },
    });
  // A sessão só reinicia quando o conteúdo/fonte muda. Mudanças internas de motor
  // (por exemplo, o observador HLS ficando disponível) não apagam a linha do tempo.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentId, contentType, source]);

  useEffect(() => {
    engineRef.current = engine;

    if (!contentId) return;
    recordPlayerDiagnostic({
      sessionId: sessionRef.current,
      contentId,
      contentType,
      contentName,
      event: 'engine-detected',
      result: 'info',
      engine,
      source,
      sourceRole: 'configured',
      elapsedMs: Math.max(0, Math.round(performance.now() - startedAtRef.current)),
    });
  }, [contentId, contentName, contentType, engine, source]);

  useEffect(() => {
    if (!video || !contentId) return;

    const activeVideo = video;

    const register = (
      eventName: string,
      result: PlayerDiagnosticResult,
      message?: string,
      details?: Record<string, string | number | boolean | null>,
    ) => {
      const now = performance.now();
      const lastAt = lastEventAtRef.current.get(eventName) ?? 0;
      if (THROTTLED_EVENTS.has(eventName) && now - lastAt < EVENT_THROTTLE_MS) return;
      lastEventAtRef.current.set(eventName, now);

      const currentSource = activeVideo.currentSrc || source;
      const sourceRole = /^blob:|^data:/i.test(currentSource)
        ? 'internal'
        : activeVideo.currentSrc
          ? 'current'
          : source
            ? 'configured'
            : 'unknown';

      recordPlayerDiagnostic({
        sessionId: sessionRef.current,
        contentId,
        contentType,
        contentName: contentName,
        event: eventName,
        result,
        engine: engineRef.current === 'hls.js'
          ? 'hls.js'
          : inferPlayerEngine(currentSource, engineRef.current),
        source: currentSource,
        sourceRole,
        elapsedMs: Math.max(0, Math.round(now - startedAtRef.current)),
        readyState: activeVideo.readyState,
        networkState: activeVideo.networkState,
        currentTime: Number.isFinite(activeVideo.currentTime) ? Number(activeVideo.currentTime.toFixed(2)) : 0,
        duration: Number.isFinite(activeVideo.duration) ? Number(activeVideo.duration.toFixed(2)) : 0,
        bufferedAhead: Number(getBufferedAhead(activeVideo).toFixed(2)),
        mediaErrorCode: activeVideo.error?.code,
        message,
        details,
      });
    };

    const handlers: Array<[keyof HTMLMediaElementEventMap, EventListener]> = [
      ['loadstart', () => register('load-start', 'info')],
      ['loadedmetadata', () => register('metadata', 'success')],
      ['canplay', () => register('can-play', 'success')],
      ['playing', () => register('playing', 'success')],
      ['waiting', () => register('waiting', 'warning')],
      ['stalled', () => register('stalled', 'warning')],
      ['pause', () => register('pause', 'info')],
      ['ended', () => register('ended', 'success')],
      ['abort', () => register('abort', 'warning')],
      ['emptied', () => register('emptied', 'info')],
      ['error', () => register('media-error', 'error', getMediaErrorMessage(activeVideo))],
    ];

    for (const [eventName, handler] of handlers) activeVideo.addEventListener(eventName, handler);

    const handleOffline = () => register('offline', 'error', 'O aparelho ficou sem conexão.');
    const handleOnline = () => register('online', 'info', 'A conexão do aparelho voltou.');
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      for (const [eventName, handler] of handlers) activeVideo.removeEventListener(eventName, handler);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [contentId, contentName, contentType, source, video]);

  useEffect(() => {
    if (!contentId || !source || typeof PerformanceObserver === 'undefined') return;

    let configuredUrl: URL | null = null;
    try {
      configuredUrl = new URL(source);
    } catch {
      return;
    }

    const seen = new Set<string>();
    let recordedResources = 0;
    const sessionStartedAt = startedAtRef.current;
    const observer = new PerformanceObserver(list => {
      for (const rawEntry of list.getEntries()) {
        if (recordedResources >= MAX_RESOURCE_EVENTS_PER_SESSION) {
          observer.disconnect();
          return;
        }

        const entry = rawEntry as PerformanceResourceTiming;
        if (!entry.name || seen.has(entry.name)) continue;
        if (entry.startTime + entry.duration < sessionStartedAt - 250) continue;

        let candidateUrl: URL;
        try {
          candidateUrl = new URL(entry.name);
        } catch {
          continue;
        }

        const proxiedSource = candidateUrl.pathname.endsWith('/api/media-proxy')
          ? candidateUrl.searchParams.get('url') || ''
          : '';
        const observedSource = proxiedSource || entry.name;
        const sameServer = candidateUrl.origin === configuredUrl?.origin;
        const isMediaProxy = Boolean(proxiedSource);
        const looksLikeMedia = /\.(m3u8|ts|m2ts|mpegts|mp4|mkv)(\?|#|$)/i.test(observedSource)
          || /\/(live|movie|series)\//i.test(observedSource);
        if ((!sameServer && !isMediaProxy) || !looksLikeMedia) continue;

        seen.add(entry.name);
        recordedResources += 1;
        recordPlayerDiagnostic({
          sessionId: sessionRef.current,
          contentId,
          contentType,
          contentName,
          event: 'media-resource',
          result: 'info',
          engine: engineRef.current === 'hls.js'
            ? 'hls.js'
            : inferPlayerEngine(observedSource, engineRef.current),
          source: observedSource,
          sourceRole: observedSource === source ? 'configured' : 'current',
          elapsedMs: Math.max(0, Math.round(performance.now() - startedAtRef.current)),
          details: {
            candidate: observedSource === source ? 'original' : 'alternative-or-segment',
            proxied: isMediaProxy,
            initiatorType: entry.initiatorType || 'unknown',
            requestDurationMs: Number.isFinite(entry.duration) ? Math.round(entry.duration) : 0,
            transferSize: Number.isFinite(entry.transferSize) ? entry.transferSize : 0,
            encodedBodySize: Number.isFinite(entry.encodedBodySize) ? entry.encodedBodySize : 0,
          },
        });
      }
    });

    try {
      observer.observe({ type: 'resource', buffered: true });
    } catch {
      observer.disconnect();
      return;
    }

    return () => observer.disconnect();
  }, [contentId, contentName, contentType, source]);

  useEffect(() => {
    if (!hls || !contentId) return;

    const handleManifest = () => {
      recordPlayerDiagnostic({
        sessionId: sessionRef.current,
        contentId,
        contentType,
        contentName: contentName,
        event: 'hls-manifest',
        result: 'success',
        engine: 'hls.js',
        source,
        sourceRole: 'configured',
        elapsedMs: Math.max(0, Math.round(performance.now() - startedAtRef.current)),
        details: {
          levels: Array.isArray(hls.levels) ? hls.levels.length : 0,
          audioTracks: Array.isArray(hls.audioTracks) ? hls.audioTracks.length : 0,
          subtitleTracks: Array.isArray(hls.subtitleTracks) ? hls.subtitleTracks.length : 0,
        },
      });
    };

    const handleHlsError = (_event: string, rawData: unknown) => {
      const data = rawData as {
        fatal?: unknown;
        type?: unknown;
        details?: unknown;
        reason?: unknown;
        response?: { code?: unknown; text?: unknown; url?: unknown };
      } | null;
      const fatal = Boolean(data?.fatal);
      const signature = `hls-error:${String(data?.type || '')}:${String(data?.details || '')}`;
      const now = performance.now();
      const lastAt = lastEventAtRef.current.get(signature) ?? 0;
      if (!fatal && now - lastAt < 1_500) return;
      lastEventAtRef.current.set(signature, now);

      const message = [data?.type, data?.details, data?.reason, data?.response?.text]
        .filter(Boolean)
        .map(value => sanitizePlayerDiagnosticText(value))
        .join(' • ');

      recordPlayerDiagnostic({
        sessionId: sessionRef.current,
        contentId,
        contentType,
        contentName: contentName,
        event: 'hls-error',
        result: fatal ? 'error' : 'warning',
        engine: 'hls.js',
        source: typeof data?.response?.url === 'string' ? data.response.url : source,
        sourceRole: typeof data?.response?.url === 'string' ? 'current' : 'configured',
        elapsedMs: Math.max(0, Math.round(performance.now() - startedAtRef.current)),
        message: message || (fatal ? 'Erro fatal do HLS.' : 'Aviso do HLS.'),
        details: {
          fatal,
          responseCode: typeof data?.response?.code === 'number' ? data.response.code : null,
        },
      });
    };

    hls.on('hlsManifestParsed', handleManifest);
    hls.on('hlsError', handleHlsError);

    return () => {
      hls.off('hlsManifestParsed', handleManifest);
      hls.off('hlsError', handleHlsError);
    };
  }, [contentId, contentName, contentType, hls, source]);

  return null;
}
