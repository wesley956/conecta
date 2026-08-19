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
type IconName = 'play' | 'pause' | 'back10' | 'forward10' | 'volume' | 'muted' | 'aspect' | 'audio' | 'captions' | 'pip' | 'fullscreen' | 'chevron' | 'close' | 'channels';
type HudStyle = CSSProperties & Record<'--hud-played' | '--hud-buffered' | '--hud-volume', string>;

function Icon({ name }: { name: IconName }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="hud-icon"><use href={`${import.meta.env.BASE_URL}player-icons.svg#${name}`} /></svg>;
}
function setting(frame: HTMLDivElement, label: string) {
  return [...frame.querySelectorAll<HTMLElement>('.player-setting')].find(node => node.textContent?.includes(label)) || null;
}

export function PlayerHud({ live, epg = [], activeContentId, episodeItems = [], liveChannels = [], onSwitchEpisode, onSwitchChannel, onClose }: Props) {
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
  const hideTimerRef = useRef<number | null>(null);
  const interactingRef = useRef(false);
  const activeEpisode = episodeItems.find(item => item.active) || episodeItems[0];
  const quickChannels = useMemo(() => selectQuickChannels(liveChannels, activeContentId, 9), [activeContentId, liveChannels]);
  const liveEpg = useMemo(() => resolveLiveEpg(epg), [epg]);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }, []);
  const scheduleHide = useCallback(() => {
    clearHideTimer();
    if (playing && !interactingRef.current) hideTimerRef.current = window.setTimeout(() => setVisible(false), 3400);
  }, [clearHideTimer, playing]);
  const reveal = useCallback(() => { setVisible(true); scheduleHide(); }, [scheduleHide]);

  useEffect(() => {
    const resolve = () => {
      const next = document.querySelector<HTMLDivElement>('.player-frame.premium-player');
      if (!next) return false;
      setFrame(next);
      setVideo(next.querySelector<HTMLVideoElement>('.player-video'));
      return true;
    };
    if (resolve()) return;
    const observer = new MutationObserver(() => { if (resolve()) observer.disconnect(); });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!frame) return;
    const toggle = frame.querySelector<HTMLButtonElement>('.player-expand-toggle');
    if (toggle?.getAttribute('aria-expanded') === 'false') toggle.click();
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
    frame.addEventListener('pointermove', reveal);
    frame.addEventListener('pointerdown', reveal);
    scheduleHide();
    return () => {
      frame.removeEventListener('pointermove', reveal);
      frame.removeEventListener('pointerdown', reveal);
      clearHideTimer();
    };
  }, [clearHideTimer, frame, reveal, scheduleHide]);

  const togglePlayback = () => {
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined); else video.pause();
  };
  const seekBy = (seconds: number) => {
    if (!video || live || !Number.isFinite(video.duration)) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
  };
  const seekTo = (seconds: number) => {
    if (!video || live || !Number.isFinite(video.duration)) return;
    video.currentTime = Math.max(0, Math.min(video.duration, seconds));
  };
  const changeVolume = (value: number) => {
    if (!video) return;
    video.volume = Math.max(0, Math.min(1, value));
    video.muted = value <= 0;
  };
  const cycleSetting = (label: string) => {
    if (!frame) return;
    const node = setting(frame, label);
    const select = node?.querySelector<HTMLSelectElement>('select');
    if (select && select.options.length > 1) {
      select.selectedIndex = (select.selectedIndex + 1) % select.options.length;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    node?.querySelector<HTMLButtonElement>('button')?.click();
  };
  const togglePip = async () => {
    if (!video || !document.pictureInPictureEnabled || typeof video.requestPictureInPicture !== 'function') return;
    if (document.pictureInPictureElement) await document.exitPictureInPicture().catch(() => undefined); else await video.requestPictureInPicture().catch(() => undefined);
  };
  const toggleFullscreen = async () => {
    if (!frame) return;
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined); else await frame.requestFullscreen().catch(() => undefined);
  };

  if (!frame || !video) return null;
  const played = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const style = { '--hud-played': `${played}%`, '--hud-buffered': `${Math.max(played, buffered)}%`, '--hud-volume': `${volume * 100}%` } as HudStyle;

  return createPortal(
    <div
      className={`reference-hud ${visible ? 'is-visible' : 'is-hidden'} ${expanded ? 'is-expanded' : 'is-collapsed'}`}
      style={style}
      onPointerDown={event => { event.stopPropagation(); reveal(); }}
      onPointerEnter={() => { interactingRef.current = true; clearHideTimer(); setVisible(true); }}
      onPointerLeave={() => { interactingRef.current = false; scheduleHide(); }}
      onFocusCapture={() => { interactingRef.current = true; clearHideTimer(); setVisible(true); }}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { interactingRef.current = false; scheduleHide(); } }}
    >
      <button className="hud-close" type="button" onClick={onClose} aria-label="Fechar player"><Icon name="close" /></button>

      {expanded && episodeItems.length ? <div className="hud-context hud-episodes">
        <div className="hud-context-label">TEMPORADA {activeEpisode?.seasonNumber || ''}</div>
        <div className="hud-strip" aria-label="Episódios da temporada">
          {episodeItems.map(item => <button key={item.episode.contentId} type="button" className={`hud-episode ${item.state} ${item.active ? 'active' : ''}`} aria-current={item.active ? 'true' : undefined} onClick={() => onSwitchEpisode?.(item.episode)}>
            E{item.episode.number}
            {item.state === 'completed' ? <span className="hud-completed">✓</span> : null}
            {item.state === 'in_progress' ? <span className="hud-episode-progress"><span style={{ width: `${Math.round(item.progressRatio * 100)}%` }} /></span> : null}
          </button>)}
        </div>
      </div> : null}

      {expanded && live && quickChannels.length ? <div className="hud-context hud-channels">
        <div className="hud-context-label">CANAIS</div>
        <div className="hud-strip">{quickChannels.map(channel => <button key={channel.contentId} type="button" className={`hud-channel ${channel.contentId === activeContentId ? 'active' : ''}`} onClick={() => onSwitchChannel?.(channel)}>{channel.title}</button>)}</div>
        {liveEpg.now ? <div className="hud-epg"><span>AGORA</span><strong>{liveEpg.now.title}</strong>{liveEpg.next ? <small>Próximo: {liveEpg.next.title}</small> : null}</div> : null}
      </div> : null}

      <div className="hud-timeline-block">
        {live ? <div className="hud-live-line"><span className="hud-live-dot" /> AO VIVO</div> : <>
          <input className="hud-progress" type="range" min="0" max={Math.max(duration, 0)} step="0.1" value={Math.min(currentTime, Math.max(duration, 0))} onChange={event => seekTo(Number(event.target.value))} aria-label="Progresso da reprodução" />
          <div className="hud-times"><span>{playerClock(currentTime)}</span><span>{playerClock(duration)}</span></div>
        </>}
      </div>

      <button className="hud-chevron" type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)} aria-label={expanded ? 'Recolher opções' : 'Mostrar opções'}><Icon name="chevron" /></button>

      <div className="hud-action-row">
        <div className="hud-playback-actions">
          <button className="hud-icon-button hud-play" type="button" onClick={togglePlayback} aria-label={playing ? 'Pausar' : 'Reproduzir'}><Icon name={playing ? 'pause' : 'play'} /></button>
          {!live ? <button className="hud-icon-button" type="button" onClick={() => seekBy(-10)} aria-label="Voltar 10 segundos"><Icon name="back10" /></button> : null}
          {!live ? <button className="hud-icon-button" type="button" onClick={() => seekBy(10)} aria-label="Avançar 10 segundos"><Icon name="forward10" /></button> : null}
          <button className="hud-icon-button" type="button" onClick={() => { video.muted = !video.muted; }} aria-label={muted ? 'Ativar som' : 'Silenciar'}><Icon name={muted ? 'muted' : 'volume'} /></button>
          <input className="hud-volume" type="range" min="0" max="1" step="0.01" value={muted ? 0 : volume} onChange={event => changeVolume(Number(event.target.value))} aria-label="Volume" />
        </div>

        {expanded ? <div className="hud-settings" aria-label="Opções do player">
          <button type="button" className="hud-pill" onClick={() => cycleSetting('Aspecto')}><Icon name="aspect" /><span>Aspecto</span></button>
          <button type="button" className="hud-pill" onClick={() => cycleSetting('Áudio')}><Icon name="audio" /><span>Áudio</span></button>
          <button type="button" className="hud-pill" onClick={() => cycleSetting('Legenda')}><Icon name="captions" /><span>Legenda</span></button>
          {document.pictureInPictureEnabled ? <button type="button" className="hud-pill" onClick={() => void togglePip()}><Icon name="pip" /><span>PiP</span></button> : null}
          <button type="button" className="hud-pill" onClick={() => void toggleFullscreen()}><Icon name="fullscreen" /><span>Tela cheia</span></button>
          {live && liveChannels.length ? <button type="button" className="hud-pill" onClick={() => cycleSetting('Canais')}><Icon name="channels" /><span>Canais</span></button> : null}
        </div> : null}
      </div>
    </div>, frame,
  );
}