import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { setPwaPlaybackActive } from '../pwa';
import { readLocalWebSettings } from '../settingsModel';
import type { WebChannel, WebEpisode } from '../types';
import { PlayerHud } from './PlayerHud';

type Props = ComponentProps<typeof import('./WebPlayerCore').WebPlayer>;
type NextEpisodeState = { episode: WebEpisode; countdown: number | null } | null;

const LazyWebPlayerCore = lazy(async () => {
  const module = await import('./WebPlayerCore');
  return { default: module.WebPlayer };
});

export function WebPlayer(props: Props) {
  const progressRef = useRef(props.onProgress);
  const switchRef = useRef(props.onSwitchChannel);
  const episodeSwitchRef = useRef(props.onSwitchEpisode);
  const closeRef = useRef(props.onClose);
  const playbackIdentityRef = useRef(props.authorization.recoveryToken);
  const initialPositionRef = useRef(props.initialPosition || 0);
  const countdownIntervalRef = useRef<number | null>(null);
  const autoplayTimerRef = useRef<number | null>(null);
  const [nextEpisode, setNextEpisode] = useState<NextEpisodeState>(null);

  // `initialPosition` é um snapshot do instante em que o conteúdo é aberto.
  // A biblioteca atualiza a posição enquanto o vídeo toca; repassar esses updates
  // para a engine faria o Core reinterpretá-los como uma nova inicialização.
  if (playbackIdentityRef.current !== props.authorization.recoveryToken) {
    playbackIdentityRef.current = props.authorization.recoveryToken;
    initialPositionRef.current = props.initialPosition || 0;
  }

  useEffect(() => { progressRef.current = props.onProgress; }, [props.onProgress]);
  useEffect(() => { switchRef.current = props.onSwitchChannel; }, [props.onSwitchChannel]);
  useEffect(() => { episodeSwitchRef.current = props.onSwitchEpisode; }, [props.onSwitchEpisode]);
  useEffect(() => { closeRef.current = props.onClose; }, [props.onClose]);

  const clearAutoNextTimers = useCallback(() => {
    if (countdownIntervalRef.current) window.clearInterval(countdownIntervalRef.current);
    if (autoplayTimerRef.current) window.clearTimeout(autoplayTimerRef.current);
    countdownIntervalRef.current = null;
    autoplayTimerRef.current = null;
  }, []);

  const playEpisode = useCallback((episode: WebEpisode) => {
    clearAutoNextTimers();
    setNextEpisode(null);
    episodeSwitchRef.current?.(episode);
  }, [clearAutoNextTimers]);

  useEffect(() => {
    setPwaPlaybackActive(true);
    return () => setPwaPlaybackActive(false);
  }, []);

  useEffect(() => {
    clearAutoNextTimers();
    setNextEpisode(null);
  }, [clearAutoNextTimers, props.activeContentId]);

  useEffect(() => {
    const onEnded = (event: Event) => {
      const video = event.target;
      if (!(video instanceof HTMLVideoElement) || !video.classList.contains('player-video')) return;
      const episodes = props.episodeItems || [];
      if (!episodes.length || !episodeSwitchRef.current) return;
      const activeIndex = episodes.findIndex(item => item.active || item.episode.contentId === props.activeContentId);
      const next = activeIndex >= 0 ? episodes[activeIndex + 1]?.episode : undefined;
      if (!next) return;

      clearAutoNextTimers();
      if (!readLocalWebSettings().autoplayNextEpisode) {
        setNextEpisode({ episode: next, countdown: null });
        return;
      }

      setNextEpisode({ episode: next, countdown: 10 });
      countdownIntervalRef.current = window.setInterval(() => {
        setNextEpisode(current => {
          if (!current || current.countdown === null) return current;
          return { ...current, countdown: Math.max(0, current.countdown - 1) };
        });
      }, 1_000);
      autoplayTimerRef.current = window.setTimeout(() => playEpisode(next), 10_000);
    };

    document.addEventListener('ended', onEnded, true);
    return () => document.removeEventListener('ended', onEnded, true);
  }, [clearAutoNextTimers, playEpisode, props.activeContentId, props.episodeItems]);

  useEffect(() => () => clearAutoNextTimers(), [clearAutoNextTimers]);

  const onProgress = useCallback((position: number, duration: number) => {
    progressRef.current?.(position, duration);
  }, []);
  const onSwitchChannel = useCallback((channel: WebChannel) => {
    clearAutoNextTimers();
    setNextEpisode(null);
    switchRef.current?.(channel);
  }, [clearAutoNextTimers]);
  const onSwitchEpisode = useCallback((episode: WebEpisode) => {
    playEpisode(episode);
  }, [playEpisode]);
  const onClose = useCallback(() => {
    clearAutoNextTimers();
    setNextEpisode(null);
    closeRef.current();
  }, [clearAutoNextTimers]);

  const cancelAutoNext = () => {
    clearAutoNextTimers();
    setNextEpisode(current => current ? { ...current, countdown: null } : null);
  };

  return (
    <>
      <Suspense fallback={(
        <div className="player-overlay" role="status" aria-live="polite">
          <div className="player-status">Preparando reprodução…</div>
        </div>
      )}>
        <LazyWebPlayerCore
          {...props}
          initialPosition={initialPositionRef.current}
          onProgress={props.onProgress ? onProgress : undefined}
          onSwitchChannel={props.onSwitchChannel ? onSwitchChannel : undefined}
          onSwitchEpisode={props.onSwitchEpisode ? onSwitchEpisode : undefined}
          onClose={onClose}
        />
      </Suspense>

      <PlayerHud
        live={props.authorization.contentType === 'channel'}
        epg={props.epg}
        activeContentId={props.activeContentId}
        episodeItems={props.episodeItems}
        liveChannels={props.liveChannels}
        onSwitchChannel={props.onSwitchChannel ? onSwitchChannel : undefined}
        onSwitchEpisode={props.onSwitchEpisode ? onSwitchEpisode : undefined}
        onClose={onClose}
      />

      {nextEpisode ? (
        <div className="autonext-overlay" role="status" aria-live="polite">
          <div className="autonext-card">
            <span className="eyebrow">EPISÓDIO CONCLUÍDO</span>
            <strong>{nextEpisode.countdown === null ? 'Próximo episódio disponível' : `Próximo episódio em ${nextEpisode.countdown}s`}</strong>
            <small>E{nextEpisode.episode.number} · {nextEpisode.episode.title}</small>
            <div className="autonext-actions">
              <button type="button" className="primary-button" onClick={() => playEpisode(nextEpisode.episode)}>{nextEpisode.countdown === null ? 'Assistir próximo' : 'Reproduzir agora'}</button>
              {nextEpisode.countdown === null
                ? <button type="button" onClick={onClose}>Voltar à série</button>
                : <button type="button" onClick={cancelAutoNext}>Cancelar</button>}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
