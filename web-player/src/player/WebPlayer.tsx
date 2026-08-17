import Hls from 'hls.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  fetchLibrary,
  getActiveAccessToken,
  recoverPlayback,
  reportWebDiagnostic,
  writePreferences,
} from '../api';
import type { EpgProgram, PlaybackAuthorization, WebChannel } from '../types';

type AspectMode = 'contain' | 'cover' | 'fill';

type Props = {
  authorization: PlaybackAuthorization;
  title: string;
  epg?: EpgProgram[];
  initialPosition?: number;
  liveChannels?: WebChannel[];
  activeContentId?: string;
  onSwitchChannel?: (channel: WebChannel) => void;
  onProgress?: (position: number, duration: number) => void;
  onClose: () => void;
};

const ASPECT_KEY = 'roneca.web.aspect.v1';
const STABLE_WINDOW_MS = 10_000;
const WATCHDOG_TICK_MS = 5_000;
const WATCHDOG_STALL_TICKS = 4;
const HLS_LOCAL_MEDIA_RECOVERIES = 2;
const HLS_LOCAL_NETWORK_RECOVERIES = 3;
const HLS_LOCAL_STALL_RECOVERIES = 2;

function initialAspect(): AspectMode {
  try {
    const stored = window.localStorage.getItem(ASPECT_KEY);
    if (stored === 'contain' || stored === 'cover' || stored === 'fill') return stored;
  } catch { /* optional preference */ }
  return 'contain';
}
function aspectLabel(mode: AspectMode) { return mode === 'cover' ? 'Preencher' : mode === 'fill' ? 'Estender' : 'Original'; }
function nativeMediaErrorCode(video: HTMLVideoElement) {
  const code = video.error?.code || 0;
  if (code === MediaError.MEDIA_ERR_NETWORK) return 'WEB_MEDIA_NETWORK_ERROR';
  if (code === MediaError.MEDIA_ERR_DECODE) return 'WEB_MEDIA_DECODER_ERROR';
  if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) return 'WEB_MEDIA_CODEC_ERROR';
  return 'WEB_MEDIA_ERROR';
}

export function WebPlayer({
  authorization,
  title,
  epg = [],
  initialPosition = 0,
  liveChannels = [],
  activeContentId,
  onSwitchChannel,
  onProgress,
  onClose,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const lastCheckpointRef = useRef(0);
  const resumePositionRef = useRef(initialPosition);
  const recoveryBusyRef = useRef(false);
  const recoveryTimerRef = useRef<number | null>(null);
  const stableTimerRef = useRef<number | null>(null);
  const watchdogRef = useRef<number | null>(null);
  const renewalTimerRef = useRef<number | null>(null);
  const watchdogLastTimeRef = useRef(0);
  const watchdogStallsRef = useRef(0);
  const watchdogSoftRecoveriesRef = useRef(0);
  const hlsMediaRecoveriesRef = useRef(0);
  const hlsNetworkRecoveriesRef = useRef(0);
  const recoveryCorrelationRef = useRef<string | null>(null);
  const offlinePendingRef = useRef(false);
  const generationRef = useRef(0);

  const [activeAuthorization, setActiveAuthorization] = useState(authorization);
  const [aspect, setAspect] = useState<AspectMode>(initialAspect);
  const [error, setError] = useState<string | null>(null);
  const [recoveryStatus, setRecoveryStatus] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [channelDrawer, setChannelDrawer] = useState(false);
  const [audioTracks, setAudioTracks] = useState<Array<{ id: number; name: string }>>([]);
  const [subtitleTracks, setSubtitleTracks] = useState<Array<{ id: number; name: string }>>([]);
  const live = activeAuthorization.contentType === 'channel';

  useEffect(() => {
    generationRef.current += 1;
    recoveryBusyRef.current = false;
    offlinePendingRef.current = false;
    resumePositionRef.current = initialPosition;
    watchdogSoftRecoveriesRef.current = 0;
    hlsMediaRecoveriesRef.current = 0;
    hlsNetworkRecoveriesRef.current = 0;
    setActiveAuthorization(authorization);
    setError(null);
    setRecoveryStatus(null);
  }, [authorization.recoveryToken, initialPosition]);

  useEffect(() => {
    const token = getActiveAccessToken();
    if (!token) return;
    void fetchLibrary(token).then(snapshot => {
      const preferred = snapshot.preferences?.aspectMode;
      if (preferred === 'contain' || preferred === 'cover' || preferred === 'fill') setAspect(preferred);
    }).catch(() => undefined);
  }, []);

  const checkpoint = useCallback(() => {
    const video = videoRef.current;
    if (!video || live || !onProgress || !Number.isFinite(video.duration) || video.duration <= 0) return;
    onProgress(video.currentTime, video.duration);
  }, [live, onProgress]);

  const syncTracks = useCallback((hls: Hls) => {
    setAudioTracks(hls.audioTracks.map((track, index) => ({ id: index, name: track.name || track.lang || `Áudio ${index + 1}` })));
    setSubtitleTracks(hls.subtitleTracks.map((track, index) => ({ id: index, name: track.name || track.lang || `Legenda ${index + 1}` })));
  }, []);

  const requestRecovery = useCallback(async (errorCode: string) => {
    if (recoveryBusyRef.current) return;
    const token = getActiveAccessToken();
    if (!token) {
      setError('Sua sessão Web terminou. Entre novamente para continuar.');
      window.dispatchEvent(new CustomEvent('roneca:web-session-invalid'));
      return;
    }
    const video = videoRef.current;
    if (!live && video && Number.isFinite(video.currentTime)) resumePositionRef.current = video.currentTime;
    if (!navigator.onLine) {
      offlinePendingRef.current = true;
      setRecoveryStatus('Sem conexão. A reprodução será retomada quando a internet voltar.');
      return;
    }

    recoveryBusyRef.current = true;
    setError(null);
    setRecoveryStatus('Verificando uma alternativa segura…');
    const correlationId = crypto.randomUUID();
    recoveryCorrelationRef.current = correlationId;
    void reportWebDiagnostic(token, {
      correlationId,
      stage: 'recovery',
      errorCode,
      contentType: activeAuthorization.contentType,
      playlistRole: activeAuthorization.playlistRole,
      recovered: false,
    }).catch(() => undefined);

    try {
      const next = await recoverPlayback(token, activeAuthorization.recoveryToken, errorCode);
      const generation = generationRef.current;
      const apply = () => {
        if (generationRef.current !== generation) return;
        setRecoveryStatus(next.recovery?.failover
          ? 'Origem principal indisponível. Usando a lista reserva.'
          : 'Retomando reprodução…');
        setActiveAuthorization(next);
        recoveryBusyRef.current = false;
      };
      const delay = Math.max(0, Number(next.recovery?.backoffMs || 0));
      if (delay > 0) {
        setRecoveryStatus(`Reconectando em ${Math.ceil(delay / 1000)}s…`);
        recoveryTimerRef.current = window.setTimeout(apply, delay);
      } else apply();
    } catch (caught) {
      recoveryBusyRef.current = false;
      const apiError = caught instanceof ApiError ? caught : null;
      if (apiError?.code === 'WEB_OFFLINE') {
        offlinePendingRef.current = true;
        setRecoveryStatus('Sem conexão. Aguardando internet…');
        return;
      }
      if (apiError?.status === 401 || apiError?.code.startsWith('WEB_SESSION_')) {
        setError('Sua sessão foi encerrada ou o aparelho não está mais autorizado.');
        setRecoveryStatus(null);
        window.dispatchEvent(new CustomEvent('roneca:web-session-invalid'));
        return;
      }
      setError(apiError?.code === 'WEB_RECOVERY_EXHAUSTED'
        ? 'Todas as origens autorizadas para este conteúdo foram testadas.'
        : 'Não foi possível recuperar esta reprodução.');
      setRecoveryStatus(null);
    }
  }, [activeAuthorization.contentType, activeAuthorization.playlistRole, activeAuthorization.recoveryToken, live]);

  useEffect(() => {
    const onOnline = () => {
      if (!offlinePendingRef.current) return;
      offlinePendingRef.current = false;
      void requestRecovery('WEB_NETWORK_RECOVERED');
    };
    const onOffline = () => {
      offlinePendingRef.current = true;
      if (recoveryTimerRef.current) window.clearTimeout(recoveryTimerRef.current);
      recoveryBusyRef.current = false;
      setRecoveryStatus('Sem conexão. Aguardando internet…');
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [requestRecovery]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setError(null); setReady(false); setAudioTracks([]); setSubtitleTracks([]); lastCheckpointRef.current = 0;
    watchdogLastTimeRef.current = 0; watchdogStallsRef.current = 0; watchdogSoftRecoveriesRef.current = 0;
    hlsMediaRecoveriesRef.current = 0; hlsNetworkRecoveriesRef.current = 0;
    const generation = ++generationRef.current;
    let disposed = false;

    const clearStable = () => { if (stableTimerRef.current) window.clearTimeout(stableTimerRef.current); stableTimerRef.current = null; };
    const markStable = () => {
      clearStable();
      stableTimerRef.current = window.setTimeout(() => {
        if (disposed || generationRef.current !== generation) return;
        setRecoveryStatus(null);
        hlsMediaRecoveriesRef.current = 0;
        watchdogSoftRecoveriesRef.current = 0;
        const token = getActiveAccessToken();
        const correlationId = recoveryCorrelationRef.current;
        if (token && correlationId) void reportWebDiagnostic(token, {
          correlationId, stage: 'recovery', errorCode: 'WEB_RECOVERY_STABLE',
          contentType: activeAuthorization.contentType, playlistRole: activeAuthorization.playlistRole, recovered: true,
        }).catch(() => undefined);
        recoveryCorrelationRef.current = null;
      }, STABLE_WINDOW_MS);
    };

    const markReady = () => {
      if (disposed) return;
      if (!live && resumePositionRef.current >= 8 && Number.isFinite(video.duration)) {
        video.currentTime = Math.min(resumePositionRef.current, Math.max(0, video.duration - 1));
      }
      setReady(true); markStable();
    };
    const onPlaying = () => {
      if (disposed) return;
      setReady(true);
      setRecoveryStatus(null);
      watchdogStallsRef.current = 0;
      hlsNetworkRecoveriesRef.current = 0;
      markStable();
    };
    const onCanPlay = () => {
      if (disposed) return;
      setReady(true);
      if (!recoveryBusyRef.current) setRecoveryStatus(null);
    };
    const onWaiting = () => {
      if (disposed || recoveryBusyRef.current) return;
      setRecoveryStatus('Carregando buffer…');
    };
    const onNativeError = () => { if (!disposed) void requestRecovery(nativeMediaErrorCode(video)); };
    const onPause = () => checkpoint();
    const onTimeUpdate = () => {
      if (!live && onProgress) {
        const now = Date.now();
        if (now - lastCheckpointRef.current >= 10_000) { lastCheckpointRef.current = now; checkpoint(); }
      }
    };
    video.addEventListener('loadedmetadata', markReady);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('error', onNativeError);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTimeUpdate);

    const destroyHls = () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } };
    const attachNative = () => { destroyHls(); video.src = activeAuthorization.playbackUrl; video.load(); };

    if (activeAuthorization.mediaKind === 'hls') {
      const nativeHls = video.canPlayType('application/vnd.apple.mpegurl') || video.canPlayType('application/x-mpegURL');
      if (nativeHls) attachNative();
      else if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          capLevelToPlayerSize: true,
          backBufferLength: live ? 60 : 120,
          maxBufferLength: live ? 60 : 120,
          maxMaxBufferLength: live ? 120 : 180,
          maxBufferSize: 64 * 1024 * 1024,
          liveSyncDurationCount: live ? 6 : undefined,
          liveMaxLatencyDurationCount: live ? 18 : undefined,
          maxBufferHole: 0.8,
          fragLoadingTimeOut: 30_000,
          manifestLoadingTimeOut: 20_000,
          levelLoadingTimeOut: 20_000,
        });
        hlsRef.current = hls;
        hls.on(Hls.Events.MANIFEST_PARSED, () => { if (!disposed) { syncTracks(hls); setReady(true); markStable(); } });
        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => syncTracks(hls));
        hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => syncTracks(hls));
        hls.on(Hls.Events.FRAG_LOADED, () => { hlsNetworkRecoveriesRef.current = 0; });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal || disposed) return;
          const httpCode = Number((data as any).response?.code || 0);
          if (!httpCode && data.type === Hls.ErrorTypes.MEDIA_ERROR && hlsMediaRecoveriesRef.current < HLS_LOCAL_MEDIA_RECOVERIES) {
            hlsMediaRecoveriesRef.current += 1;
            setRecoveryStatus('Ajustando vídeo…');
            hls.recoverMediaError();
            return;
          }
          if (!httpCode && data.type === Hls.ErrorTypes.NETWORK_ERROR && hlsNetworkRecoveriesRef.current < HLS_LOCAL_NETWORK_RECOVERIES) {
            hlsNetworkRecoveriesRef.current += 1;
            setRecoveryStatus('Reforçando buffer…');
            hls.startLoad(-1);
            return;
          }
          const code = httpCode ? `WEB_HLS_HTTP_${httpCode}`
            : data.type === Hls.ErrorTypes.MEDIA_ERROR ? 'WEB_HLS_DECODER_ERROR'
              : String(data.details || '').toLowerCase().includes('manifest') ? 'WEB_HLS_MANIFEST_ERROR'
                : 'WEB_HLS_NETWORK_ERROR';
          void requestRecovery(code);
        });
        hls.attachMedia(video); hls.loadSource(activeAuthorization.playbackUrl);
      } else void requestRecovery('WEB_HLS_CODEC_UNSUPPORTED');
    } else attachNative();

    watchdogRef.current = window.setInterval(() => {
      if (disposed || recoveryBusyRef.current || video.paused || video.seeking || video.ended || document.hidden) return;
      const current = Number(video.currentTime || 0);
      if (current > watchdogLastTimeRef.current + 0.35) {
        watchdogLastTimeRef.current = current;
        watchdogStallsRef.current = 0;
        watchdogSoftRecoveriesRef.current = 0;
        return;
      }
      // HAVE_CURRENT_DATA é buffering normal. Só tratamos como stall quando há
      // dados futuros disponíveis e, mesmo assim, o relógio do vídeo não anda.
      if (video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA || video.networkState === HTMLMediaElement.NETWORK_LOADING) return;
      watchdogStallsRef.current += 1;
      if (watchdogStallsRef.current >= WATCHDOG_STALL_TICKS) {
        watchdogStallsRef.current = 0;
        const hls = hlsRef.current;
        if (hls && watchdogSoftRecoveriesRef.current < HLS_LOCAL_STALL_RECOVERIES) {
          watchdogSoftRecoveriesRef.current += 1;
          setRecoveryStatus('Reforçando buffer…');
          hls.startLoad(-1);
          void video.play().catch(() => undefined);
          return;
        }
        void requestRecovery('WEB_WATCHDOG_STALL');
      }
    }, WATCHDOG_TICK_MS);

    if (activeAuthorization.mode === 'gateway') {
      const renewIn = Math.max(5_000, new Date(activeAuthorization.expiresAt).getTime() - Date.now() - 60_000);
      renewalTimerRef.current = window.setTimeout(() => void requestRecovery('WEB_PLAYBACK_TOKEN_EXPIRED'), renewIn);
    }

    return () => {
      disposed = true; checkpoint(); clearStable();
      if (watchdogRef.current) window.clearInterval(watchdogRef.current);
      if (renewalTimerRef.current) window.clearTimeout(renewalTimerRef.current);
      watchdogRef.current = null; renewalTimerRef.current = null;
      video.removeEventListener('loadedmetadata', markReady); video.removeEventListener('playing', onPlaying);
      video.removeEventListener('canplay', onCanPlay); video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('error', onNativeError); video.removeEventListener('pause', onPause); video.removeEventListener('timeupdate', onTimeUpdate);
      destroyHls(); video.pause(); video.removeAttribute('src'); video.load(); setAudioTracks([]); setSubtitleTracks([]);
    };
  }, [activeAuthorization, checkpoint, live, onProgress, requestRecovery, syncTracks]);

  useEffect(() => {
    const video = videoRef.current; if (!video) return;
    video.style.objectFit = aspect;
    try { window.localStorage.setItem(ASPECT_KEY, aspect); } catch { /* optional */ }
    const token = getActiveAccessToken();
    if (token) void writePreferences(token, { aspectMode: aspect }).catch(() => undefined);
  }, [aspect]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === 'Escape') { if (channelDrawer) setChannelDrawer(false); else onClose(); return; }
      if (event.key === ' ' || event.key.toLowerCase() === 'k') {
        event.preventDefault(); if (video.paused) void video.play().catch(() => undefined); else video.pause();
      }
      if (!live && event.key === 'ArrowLeft') video.currentTime = Math.max(0, video.currentTime - 10);
      if (!live && event.key === 'ArrowRight' && Number.isFinite(video.duration)) video.currentTime = Math.min(video.duration, video.currentTime + 10);
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [channelDrawer, live, onClose]);

  useEffect(() => () => {
    if (recoveryTimerRef.current) window.clearTimeout(recoveryTimerRef.current);
    if (stableTimerRef.current) window.clearTimeout(stableTimerRef.current);
    if (watchdogRef.current) window.clearInterval(watchdogRef.current);
    if (renewalTimerRef.current) window.clearTimeout(renewalTimerRef.current);
    recoveryBusyRef.current = false;
  }, []);

  const cycleAspect = () => setAspect(current => current === 'contain' ? 'cover' : current === 'cover' ? 'fill' : 'contain');
  const toggleFullscreen = async () => {
    const frame = frameRef.current; if (!frame) return;
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await frame.requestFullscreen(); }
    catch { setError('O navegador não permitiu abrir em tela cheia.'); }
  };
  const togglePip = async () => {
    const video = videoRef.current; if (!video || !document.pictureInPictureEnabled || typeof video.requestPictureInPicture !== 'function') return;
    try { if (document.pictureInPictureElement) await document.exitPictureInPicture(); else await video.requestPictureInPicture(); }
    catch { setError('O modo picture-in-picture não está disponível neste momento.'); }
  };

  const nowProgram = epg.find(item => { const now = Date.now(); return new Date(item.start).getTime() <= now && new Date(item.end).getTime() > now; }) || epg[0];

  return (
    <div className="player-overlay" role="dialog" aria-modal="true" aria-label={`Reproduzindo ${title}`}>
      <div className="player-frame" ref={frameRef}>
        <video ref={videoRef} className={`player-video aspect-${aspect}`} controls playsInline autoPlay preload="auto" crossOrigin="anonymous" />
        <div className="player-topbar">
          <div>
            <span className="player-kicker">{live ? 'AO VIVO' : 'RONECAPLAYTV'}</span>
            <strong>{title}</strong>
            {live && nowProgram ? <small>{nowProgram.title}</small> : null}
            {activeAuthorization.playlistRole === 'backup' ? <small>Lista reserva em uso</small> : null}
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar player">✕</button>
        </div>
        {!ready && !error ? <div className="player-status">{recoveryStatus || 'Preparando reprodução…'}</div> : null}
        {ready && recoveryStatus ? <div className="player-status">{recoveryStatus}</div> : null}
        {error ? <div className="player-error" role="alert">{error}</div> : null}

        {live && channelDrawer ? (
          <aside className="player-channel-drawer" aria-label="Trocar canal">
            <div className="drawer-heading"><strong>Canais</strong><button type="button" onClick={() => setChannelDrawer(false)}>Fechar</button></div>
            <div className="drawer-list">
              {liveChannels.slice(0, 120).map(channel => (
                <button type="button" key={channel.contentId} className={channel.contentId === activeContentId ? 'active' : ''}
                  onClick={() => { setChannelDrawer(false); onSwitchChannel?.(channel); }}>
                  {channel.logo ? <img src={channel.logo} alt="" /> : <span className="channel-placeholder">TV</span>}
                  <span>{channel.title}</span>
                </button>
              ))}
            </div>
          </aside>
        ) : null}

        <div className="player-actions" aria-label="Opções do player">
          {live && liveChannels.length ? <button type="button" onClick={() => setChannelDrawer(value => !value)}>Trocar canal</button> : null}
          <button type="button" onClick={cycleAspect}>Aspecto: {aspectLabel(aspect)}</button>
          <button type="button" onClick={() => void toggleFullscreen()}>Tela cheia</button>
          {document.pictureInPictureEnabled ? <button type="button" onClick={() => void togglePip()}>PiP</button> : null}
          {audioTracks.length > 1 ? (
            <label>Áudio<select defaultValue={hlsRef.current?.audioTrack ?? -1} onChange={event => { if (hlsRef.current) hlsRef.current.audioTrack = Number(event.target.value); }}>
              {audioTracks.map(track => <option key={track.id} value={track.id}>{track.name}</option>)}
            </select></label>
          ) : null}
          {subtitleTracks.length ? (
            <label>Legenda<select defaultValue="-1" onChange={event => { if (hlsRef.current) hlsRef.current.subtitleTrack = Number(event.target.value); }}>
              <option value="-1">Desativada</option>{subtitleTracks.map(track => <option key={track.id} value={track.id}>{track.name}</option>)}
            </select></label>
          ) : null}
        </div>
      </div>
    </div>
  );
}
