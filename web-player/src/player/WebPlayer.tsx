import Hls from 'hls.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { EpgProgram, PlaybackAuthorization } from '../types';

type AspectMode = 'contain' | 'cover' | 'fill';

type Props = {
  authorization: PlaybackAuthorization;
  title: string;
  epg?: EpgProgram[];
  onClose: () => void;
};

const ASPECT_KEY = 'roneca.web.aspect.v1';

function initialAspect(): AspectMode {
  try {
    const stored = window.localStorage.getItem(ASPECT_KEY);
    if (stored === 'contain' || stored === 'cover' || stored === 'fill') return stored;
  } catch {
    // preferência opcional
  }
  return 'contain';
}

function aspectLabel(mode: AspectMode) {
  if (mode === 'cover') return 'Preencher';
  if (mode === 'fill') return 'Estender';
  return 'Original';
}

export function WebPlayer({ authorization, title, epg = [], onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [aspect, setAspect] = useState<AspectMode>(initialAspect);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [audioTracks, setAudioTracks] = useState<Array<{ id: number; name: string }>>([]);
  const [subtitleTracks, setSubtitleTracks] = useState<Array<{ id: number; name: string }>>([]);
  const live = authorization.contentType === 'channel';

  const syncTracks = useCallback((hls: Hls) => {
    setAudioTracks(hls.audioTracks.map((track, index) => ({
      id: index,
      name: track.name || track.lang || `Áudio ${index + 1}`,
    })));
    setSubtitleTracks(hls.subtitleTracks.map((track, index) => ({
      id: index,
      name: track.name || track.lang || `Legenda ${index + 1}`,
    })));
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setError(null);
    setReady(false);
    setAudioTracks([]);
    setSubtitleTracks([]);

    let disposed = false;
    const markReady = () => !disposed && setReady(true);
    const onNativeError = () => {
      if (!disposed) setError('O navegador não conseguiu reproduzir esta origem.');
    };
    video.addEventListener('loadedmetadata', markReady);
    video.addEventListener('error', onNativeError);

    const destroyHls = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };

    const attachNative = () => {
      destroyHls();
      video.src = authorization.playbackUrl;
      video.load();
    };

    if (authorization.mediaKind === 'hls') {
      const nativeHls = video.canPlayType('application/vnd.apple.mpegurl') || video.canPlayType('application/x-mpegURL');
      if (nativeHls) {
        attachNative();
      } else if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: live,
          backBufferLength: live ? 30 : 90,
          maxBufferLength: live ? 30 : 60,
        });
        hlsRef.current = hls;
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (disposed) return;
          syncTracks(hls);
          setReady(true);
        });
        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => syncTracks(hls));
        hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => syncTracks(hls));
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal || disposed) return;
          setError(data.type === Hls.ErrorTypes.MEDIA_ERROR
            ? 'O formato desta mídia não é compatível com este navegador.'
            : 'A reprodução foi interrompida antes de estabilizar.');
        });
        hls.attachMedia(video);
        hls.loadSource(authorization.playbackUrl);
      } else {
        setError('Este navegador não oferece uma engine HLS compatível.');
      }
    } else {
      attachNative();
    }

    return () => {
      disposed = true;
      video.removeEventListener('loadedmetadata', markReady);
      video.removeEventListener('error', onNativeError);
      destroyHls();
      video.pause();
      video.removeAttribute('src');
      video.load();
      setAudioTracks([]);
      setSubtitleTracks([]);
    };
  }, [authorization.mediaKind, authorization.playbackUrl, live, syncTracks]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.style.objectFit = aspect;
    try {
      window.localStorage.setItem(ASPECT_KEY, aspect);
    } catch {
      // preferência opcional
    }
  }, [aspect]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key === ' ' || event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (video.paused) void video.play().catch(() => undefined);
        else video.pause();
      }
      if (!live && event.key === 'ArrowLeft') {
        video.currentTime = Math.max(0, video.currentTime - 10);
      }
      if (!live && event.key === 'ArrowRight' && Number.isFinite(video.duration)) {
        video.currentTime = Math.min(video.duration, video.currentTime + 10);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [live, onClose]);

  const cycleAspect = () => {
    setAspect(current => current === 'contain' ? 'cover' : current === 'cover' ? 'fill' : 'contain');
  };

  const toggleFullscreen = async () => {
    const frame = frameRef.current;
    if (!frame) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await frame.requestFullscreen();
    } catch {
      setError('O navegador não permitiu abrir em tela cheia.');
    }
  };

  const togglePip = async () => {
    const video = videoRef.current;
    if (!video || !document.pictureInPictureEnabled || typeof video.requestPictureInPicture !== 'function') return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch {
      setError('O modo picture-in-picture não está disponível neste momento.');
    }
  };

  const nowProgram = epg.find(item => {
    const now = Date.now();
    return new Date(item.start).getTime() <= now && new Date(item.end).getTime() > now;
  }) || epg[0];

  return (
    <div className="player-overlay" role="dialog" aria-modal="true" aria-label={`Reproduzindo ${title}`}>
      <div className="player-frame" ref={frameRef}>
        <video
          ref={videoRef}
          className={`player-video aspect-${aspect}`}
          controls
          playsInline
          autoPlay
          preload="metadata"
          crossOrigin="anonymous"
        />
        <div className="player-topbar">
          <div>
            <span className="player-kicker">{live ? 'AO VIVO' : 'RONECAPLAYTV'}</span>
            <strong>{title}</strong>
            {live && nowProgram ? <small>{nowProgram.title}</small> : null}
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar player">✕</button>
        </div>

        {!ready && !error ? <div className="player-status">Preparando reprodução…</div> : null}
        {error ? <div className="player-error" role="alert">{error}</div> : null}

        <div className="player-actions" aria-label="Opções do player">
          <button type="button" onClick={cycleAspect}>Aspecto: {aspectLabel(aspect)}</button>
          <button type="button" onClick={() => void toggleFullscreen()}>Tela cheia</button>
          {document.pictureInPictureEnabled ? (
            <button type="button" onClick={() => void togglePip()}>PiP</button>
          ) : null}
          {audioTracks.length > 1 ? (
            <label>
              Áudio
              <select
                defaultValue={hlsRef.current?.audioTrack ?? -1}
                onChange={event => {
                  if (hlsRef.current) hlsRef.current.audioTrack = Number(event.target.value);
                }}
              >
                {audioTracks.map(track => <option key={track.id} value={track.id}>{track.name}</option>)}
              </select>
            </label>
          ) : null}
          {subtitleTracks.length ? (
            <label>
              Legenda
              <select
                defaultValue="-1"
                onChange={event => {
                  if (hlsRef.current) hlsRef.current.subtitleTrack = Number(event.target.value);
                }}
              >
                <option value="-1">Desativada</option>
                {subtitleTracks.map(track => <option key={track.id} value={track.id}>{track.name}</option>)}
              </select>
            </label>
          ) : null}
        </div>
      </div>
    </div>
  );
}
