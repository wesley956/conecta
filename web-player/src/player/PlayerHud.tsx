import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { playerClock, resolveLiveEpg, selectQuickChannels } from './premiumModel';
import type { EpgProgram, WebChannel, WebEpisode } from '../types';
import type { PlayerEpisodeItem } from './premiumModel';

type Props = {
  live: boolean;
  epg?: EpgProgram[];
  activeContentId?: string;
  episodeItems?: PlayerEpisodeItem[];
  liveChannels?: WebChannel[];
  onSwitchEpisode?: (episode: WebEpisode) => void;
  onSwitchChannel?: (channel: WebChannel) => void;
  onClose: () => void;
};

type TrackOption = { value: string; label: string };
type IconName = 'play' | 'pause' | 'back10' | 'forward10' | 'volume' | 'muted' | 'aspect' | 'audio' | 'captions' | 'pip' | 'fullscreen' | 'chevron' | 'close' | 'channels';

type HudStyle = CSSProperties & Record<'--hud-played' | '--hud-buffered' | '--hud-volume', string>;

function Icon({ name }: { name: IconName }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="hud-icon">
      {name === 'play' ? <path d="M8 5.5 18 12 8 18.5Z" {...common} /> : null}
      {name === 'pause' ? <><path d="M9 6v12M15 6v12" {...common} /></> : null}
      {name === 'back10' ? <><path d="M8 7H4V3M4.5 7.2A8 8 0 1 1 5.3 17" {...common} /><text x="12" y="15" textAnchor="middle" fontSize="7.2" fill="currentColor" stroke="none">10</text></> : null}
      {name === 'forward10' ? <><path d="M16 7h4V3M19.5 7.2A8 8 0 1 0 18.7 17" {...common} /><text x="12" y="15" textAnchor="middle" fontSize="7.2" fill="currentColor" stroke="none">10</text></> : null}
      {name === 'volume' ? <><path d="M5 10v4h3l4 3V7L8 10H5Z" {...common} /><path d="M15 9.2a4 4 0 0 1 0 5.6M17.5 7a7 7 0 0 1 0 10" {...common} /></> : null}
      {name === 'muted' ? <><path d="M5 10v4h3l4 3V7L8 10H5Z" {...common} /><path d="m16 10 4 4m0-4-4 4" {...common} /></> : null}
      {name === 'aspect' ? <><rect x="4" y="6" width="16" height="12" rx="2" {...common} /><path d="M7 9h3M7 9v3M17 15h-3m3 0v-3" {...common} /></> : null}
      {name === 'audio' ? <><path d="M5 12h2m2-4v8m3-11v14m3-11v8m3-5v2" {...common} /></> : null}
      {name === 'captions' ? <><rect x="3.5" y="6" width="17" height="12" rx="2" {...common} /><path d="M10.5 10a2 2 0 1 0 0 4M17 10a2 2 0 1 0 0 4" {...common} /></> : null}
      {name === 'pip' ? <><rect x="3.5" y="5" width="17" height="14" rx="2" {...common} /><rect x="11.5" y="11" width="6" height="5" rx="1" {...common} /></> : null}
      {name === 'fullscreen' ? <><path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4" {...common} /></> : null}
      {name === 'chevron' ? <path d="m8 10 4 4 4-4" {...common} /> : null}
      {name === 'close' ? <path d="m7 7 10 10M17 7 7 17" {...common} /> : null}
      {name === 'channels' ? <><rect x="4" y="5" width="16" height="14" rx="2" {...common} /><path d="M8 9h8M8 12h8M8 15h5" {...common} /></> : null}
    </svg>
  );
}

function findLegacySetting(frame: HTMLDivElement, label: string) {
  return [...frame.querySelectorAll<HTMLElement>('.player-setting')].find(node => node.textContent?.includes(label)) || null;
}

export function PlayerHud({
  live,
  epg = [],
  activeContentId,
  episodeItems = [],
  liveChannels = [],
  onSwitchEpisode,
  onSwitchChannel,
  onClose,
}: Props) {
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [visible, setVisible] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [aspectLabel, setAspectLabel] = useState('Original');
  const [audioOptions, setAudioOptions] = useState<TrackOption[]>([]);
  const [subtitleOptions, setSubtitleOptions] = useState<TrackOption[]>([{ value: '-1', label: 'Desativada' }]);
  const [audioValue, setAudioValue] = useState('-1');
  const [subtitleValue, setSubtitleValue] = useState('-1');
  const hideTimerRef = useRef<number | null>(null);

  const activeEpisode = episodeItems.find(item => item.active) || episodeItems[0];
  const seasonNumber = activeEpisode?.seasonNumber;
  const quickChannels = useMemo(() => selectQuickChannels(liveChannels, activeContentId, 9), [activeContentId, liveChannels]);
  const liveEpg = useMemo(() => resolveLiveEpg(epg), [epg]);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    if (!playing) return;
    hideTimerRef.current = window.setTimeout(() => setVisible(false), 3400);
  }, [clearHideTimer, playing]);

  const reveal = useCallback(() => {
    setVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    const resolveFrame = () => {
      const next = document.querySelector<HTMLDivElement>('.player-frame.premium-player');
      if (next) {
        setFrame(next);
        setVideo(next.querySelector<HTMLVideoElement>('.player-video'));
        return true;
      }
      return false;
    };
    if (resolveFrame()) return;
    const observer = new MutationObserver(() => { if (resolveFrame()) observer.disconnect(); });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!frame) return;
    const ensureLegacyAdapter = () => {
      const toggle = frame.querySelector<HTMLButtonElement>('.player-expand-toggle');
      if (toggle?.getAttribute('aria-expanded') === 'false') toggle.click();
    };
    ensureLegacyAdapter();
    const sync = () => {
      ensureLegacyAdapter();
      const aspect = findLegacySetting(frame, 'Aspecto')?.querySelector<HTMLButtonElement>('button');
      if (aspect?.textContent?.trim()) setAspectLabel(aspect.textContent.trim());
      const audio = findLegacySetting(frame, 'Áudio')?.querySelector<HTMLSelectElement>('select');
      if (audio) {
        setAudioOptions([...audio.options].map(option => ({ value: option.value, label: option.textContent || option.value })));
        setAudioValue(audio.value);
      } else setAudioOptions([]);
      const subtitle = findLegacySetting(frame, 'Legenda')?.querySelector<HTMLSelectElement>('select');
      if (subtitle) {
        setSubtitleOptions([...subtitle.options].map(option => ({ value: option.value, label: option.textContent || option.value })));
        setSubtitleValue(subtitle.value);
      } else setSubtitleOptions([{ value: '-1', label: 'Desativada' }]);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(frame, { childList: true, subtree: true, attributes: true });
    return () => observer.disconnect();
  }, [frame]);

  useEffect(() => {
    if (!video) return;
    const sync = () => {
      const nextDuration = Number.isFinite(video.duration) ? video.duration : 0;
      const nextTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      const bufferedEnd = video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0;
      setDuration(nextDuration);
      setCurrentTime(nextTime);
      setBuffered(nextDuration > 0 ? Math.min(100, (bufferedEnd / nextDuration) * 100) : 0);
      setPlaying(!video.paused && !video.ended);
      setMuted(video.muted || video.volume <= 0);
      setVolume(video.volume);
    };
    sync();
    const events = ['timeupdate', 'durationchange', 'progress', 'playing', 'pause', 'ended', 'volumechange', 'loadedmetadata'] as const;
    events.forEach(event => video.addEventListener(event, sync));
    return () => events.forEach(event => video.removeEventListener(event, sync));
  }, [video]);

  useEffect(() => {
    if (!frame) return;
    const onPointerMove = () => reveal();
    const onPointerDown = () => reveal();
    frame.addEventListener('pointermove', onPointerMove);
    frame.addEventListener('pointerdown', onPointerDown);
    scheduleHide();
    return () => {
      frame.removeEventListener('pointermove', onPointerMove);
      frame.removeEventListener('pointerdown', onPointerDown);
      clearHideTimer();
    };
  }, [clearHideTimer, frame, reveal, scheduleHide]);

  const togglePlayback = () => {
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  };
  const seekBy = (seconds: number) => {
    if (!video || live || !Number.isFinite(video.duration)) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
    setCurrentTime(video.currentTime);
  };
  const seekTo = (seconds: number) => {
    if (!video || live || !Number.isFinite(video.duration)) return;
    video.currentTime = Math.max(0, Math.min(video.duration, seconds));
    setCurrentTime(video.currentTime);
  };
  const toggleMute = () => {
    if (!video) return;
    video.muted = !video.muted;
  };
  const changeVolume = (value: number) => {
    if (!video) return;
    video.volume = Math.max(0, Math.min(1, value));
    video.muted = value <= 0;
    setVolume(video.volume);
  };
  const cycleAspect = () => {
    if (!frame) return;
    const button = findLegacySetting(frame, 'Aspecto')?.querySelector<HTMLButtonElement>('button');
    button?.click();
    window.setTimeout(() => {
      if (button?.textContent?.trim()) setAspectLabel(button.textContent.trim());
    }, 0);
  };
  const setLegacySelect = (label: string, value: string) => {
    if (!frame) return;
    const select = findLegacySetting(frame, label)?.querySelector<HTMLSelectElement>('select');
    if (!select) return;
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const togglePip = async () => {
    if (!video || !document.pictureInPictureEnabled || typeof video.requestPictureInPicture !== 'function') return;
    if (document.pictureInPictureElement) await document.exitPictureInPicture().catch(() => undefined);
    else await video.requestPictureInPicture().catch(() => undefined);
  };
  const toggleFullscreen = async () => {
    if (!frame) return;
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
    else await frame.requestFullscreen().catch(() => undefined);
  };
  const openChannels = () => {
    if (!frame) return;
    findLegacySetting(frame, 'Canais')?.querySelector<HTMLButtonElement>('button')?.click();
  };

  if (!frame || !video) return null;

  const played = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const style = {
    '--hud-played': `${played}%`,
    '--hud-buffered': `${Math.max(played, buffered)}%`,
    '--hud-volume': `${volume * 100}%`,
  } as HudStyle;

  return createPortal(
    <div className={`reference-hud ${visible ? 'is-visible' : 'is-hidden'} ${expanded ? 'is-expanded' : 'is-collapsed'}`} style={style} onPointerDown={event => event.stopPropagation()}>
      <button className="hud-close" type="button" onClick={onClose} aria-label="Fechar player"><Icon name="close" /></button>

      {expanded && episodeItems.length ? (
        <div className="hud-context hud-episodes">
          <div className="hud-context-label">TEMPORADA {seasonNumber || ''}</div>
          <div className="hud-strip" aria-label={`Episódios da temporada ${seasonNumber || ''}`}>
            {episodeItems.map(item => (
              <button
                key={item.episode.contentId}
                type="button"
                className={`hud-episode ${item.state} ${item.active ? 'active' : ''}`}
                aria-current={item.active ? 'true' : undefined}
                onClick={() => onSwitchEpisode?.(item.episode)}
              >
                E{item.episode.number}
                {item.state === 'completed' ? <span className="hud-completed" aria-label="Concluído">✓</span> : null}
                {item.state === 'in_progress' ? <span className="hud-episode-progress"><span style={{ width: `${Math.round(item.progressRatio * 100)}%` }} /></span> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {expanded && live && quickChannels.length ? (
        <div className="hud-context hud-channels">
          <div className="hud-context-label">CANAIS</div>
          <div className="hud-strip" aria-label="Troca rápida de canais">
            {quickChannels.map(channel => (
              <button key={channel.contentId} type="button" className={`hud-channel ${channel.contentId === activeContentId ? 'active' : ''}`} onClick={() => onSwitchChannel?.(channel)}>{channel.title}</button>
            ))}
          </div>
          {liveEpg.now ? <div className="hud-epg"><span>AGORA</span><strong>{liveEpg.now.title}</strong>{liveEpg.next ? <small>Próximo: {liveEpg.next.title}</small> : null}</div> : null}
        </div>
      ) : null}

      <div className="hud-timeline-block">
        {live ? (
          <div className="hud-live-line"><span className="hud-live-dot" /> AO VIVO</div>
        ) : (
          <>
            <input className="hud-progress" type="range" min="0" max={Math.max(duration, 0)} step="0.1" value={Math.min(currentTime, Math.max(duration, 0))} onChange={event => seekTo(Number(event.target.value))} aria-label="Progresso da reprodução" />
            <div className="hud-times"><span>{playerClock(currentTime)}</span><span>{playerClock(duration)}</span></div>
          </>
        )}
      </div>

      <button className="hud-chevron" type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)} aria-label={expanded ? 'Recolher opções do player' : 'Mostrar opções do player'}><Icon name="chevron" /></button>

      <div className="hud-action-row">
        <div className="hud-playback-actions">
          <button className="hud-icon-button hud-play" type="button" onClick={togglePlayback} aria-label={playing ? 'Pausar' : 'Reproduzir'}><Icon name={playing ? 'pause' : 'play'} /></button>
          {!live ? <button className="hud-icon-button" type="button" onClick={() => seekBy(-10)} aria-label="Voltar 10 segundos"><Icon name="back10" /></button> : null}
          {!live ? <button className="hud-icon-button" type="button" onClick={() => seekBy(10)} aria-label="Avançar 10 segundos"><Icon name="forward10" /></button> : null}
          <button className="hud-icon-button" type="button" onClick={toggleMute} aria-label={muted ? 'Ativar som' : 'Silenciar'}><Icon name={muted ? 'muted' : 'volume'} /></button>
          <input className="hud-volume" type="range" min="0" max="1" step="0.01" value={muted ? 0 : volume} onChange={event => changeVolume(Number(event.target.value))} aria-label="Volume" />
        </div>

        {expanded ? (
          <div className="hud-settings" aria-label="Opções do player">
            <button type="button" className="hud-pill" onClick={cycleAspect} title={`Aspecto: ${aspectLabel}`}><Icon name="aspect" /><span>Aspecto</span></button>
            <label className={`hud-pill hud-select-pill ${audioOptions.length <= 1 ? 'is-disabled' : ''}`}><Icon name="audio" /><span>Áudio</span><select value={audioValue} disabled={audioOptions.length <= 1} onChange={event => { setAudioValue(event.target.value); setLegacySelect('Áudio', event.target.value); }} aria-label="Faixa de áudio">{audioOptions.length ? audioOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>) : <option value="-1">Original</option>}</select></label>
            <label className="hud-pill hud-select-pill"><Icon name="captions" /><span>Legenda</span><select value={subtitleValue} onChange={event => { setSubtitleValue(event.target.value); setLegacySelect('Legenda', event.target.value); }} aria-label="Legenda">{subtitleOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            {document.pictureInPictureEnabled ? <button type="button" className="hud-pill" onClick={() => void togglePip()}><Icon name="pip" /><span>PiP</span></button> : null}
            <button type="button" className="hud-pill" onClick={() => void toggleFullscreen()}><Icon name="fullscreen" /><span>Tela cheia</span></button>
            {live && liveChannels.length ? <button type="button" className="hud-pill" onClick={openChannels}><Icon name="channels" /><span>Canais</span></button> : null}
          </div>
        ) : null}
      </div>
    </div>,
    frame,
  );
}
