import {
  Captions,
  ChevronLeft,
  ChevronRight,
  List,
  Settings,
  Volume2,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { useAppStore } from '@/stores/appStore';
import type { Episode, Movie, Season } from '@/types';

type CinematicPanel = 'settings' | 'episodes' | null;

interface FlattenedEpisode {
  season: Season;
  episode: Episode;
}

const VIDEO_SELECTOR = '.roneca-exoplayer-video';
const CONTROLS_HIDE_DELAY_MS = 7_000;

function getPlayerVideo() {
  return document.querySelector<HTMLVideoElement>(VIDEO_SELECTOR);
}

function makeEpisodeMovie(
  seriesName: string,
  season: Season,
  episode: Episode,
  template: Movie,
): Movie {
  return {
    id: episode.id,
    name: `${seriesName} - T${season.number}E${episode.number}`,
    year: 0,
    duration: episode.duration,
    synopsis: template.synopsis,
    cover: template.cover,
    category: template.category,
    url: episode.url,
    playbackUrls: episode.playbackUrls,
    progress: episode.progress,
    isFavorite: template.isFavorite,
  };
}

function formatSettingValue(value: string) {
  const labels: Record<string, string> = {
    low: 'Baixo',
    medium: 'Médio',
    high: 'Alto',
    hardware: 'Hardware',
    software: 'Software',
    auto: 'Automático',
  };

  return labels[value] ?? value;
}

export function PlayerCinematicPanels() {
  const currentChannel = useAppStore(state => state.currentChannel);
  const currentMovie = useAppStore(state => state.currentMovie);
  const currentSeries = useAppStore(state => state.currentSeries);
  const settings = useAppStore(state => state.settings);
  const setCurrentMovie = useAppStore(state => state.setCurrentMovie);

  const [panel, setPanel] = useState<CinematicPanel>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);

  const hideTimerRef = useRef<number | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);

  const contentId = currentMovie?.id ?? currentChannel?.id ?? '';

  const episodes = useMemo<FlattenedEpisode[]>(() => {
    if (!currentSeries?.seasons?.length) return [];

    return currentSeries.seasons.flatMap(season => (
      season.episodes.map(episode => ({ season, episode }))
    ));
  }, [currentSeries]);

  const currentEpisodeIndex = useMemo(() => {
    if (!currentMovie || episodes.length === 0) return -1;

    return episodes.findIndex(({ episode }) => (
      episode.id === currentMovie.id ||
      Boolean(episode.url && episode.url === currentMovie.url)
    ));
  }, [currentMovie, episodes]);

  const hasEpisodes = Boolean(
    currentSeries &&
    currentMovie &&
    episodes.length > 0,
  );

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const revealControls = useCallback(() => {
    clearHideTimer();
    setControlsVisible(true);

    if (panel === null) {
      hideTimerRef.current = window.setTimeout(() => {
        setControlsVisible(false);
      }, CONTROLS_HIDE_DELAY_MS);
    }
  }, [clearHideTimer, panel]);

  const closePanel = useCallback(() => {
    setPanel(null);
    setControlsVisible(true);

    window.requestAnimationFrame(() => {
      openerRef.current?.focus();
    });
  }, []);

  const closeChannelDrawerIfOpen = useCallback(() => {
    const drawer = document.querySelector('.player-channel-drawer');
    if (!drawer) return;

    const listButton = document.querySelector<HTMLButtonElement>(
      '.roneca-exoplayer-top > div > button',
    );

    listButton?.click();
  }, []);

  const togglePanel = useCallback((
    nextPanel: Exclude<CinematicPanel, null>,
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    event.stopPropagation();
    openerRef.current = event.currentTarget;
    closeChannelDrawerIfOpen();
    clearHideTimer();
    setControlsVisible(true);
    setPanel(current => current === nextPanel ? null : nextPanel);
  }, [clearHideTimer, closeChannelDrawerIfOpen]);

  const updatePlaybackRate = useCallback((rate: number) => {
    const video = getPlayerVideo();
    if (!video) return;

    video.playbackRate = rate;
    setPlaybackRate(rate);
  }, []);

  const playEpisodeAt = useCallback((index: number) => {
    if (!currentSeries || !currentMovie) return;

    const selected = episodes[index];
    if (!selected) return;

    const video = getPlayerVideo();
    video?.pause();

    setCurrentMovie(makeEpisodeMovie(
      currentSeries.name,
      selected.season,
      selected.episode,
      currentMovie,
    ));

    setPanel(null);
    setControlsVisible(true);
  }, [currentMovie, currentSeries, episodes, setCurrentMovie]);

  const playEpisodeByOffset = useCallback((offset: number) => {
    if (currentEpisodeIndex < 0) return;
    playEpisodeAt(currentEpisodeIndex + offset);
  }, [currentEpisodeIndex, playEpisodeAt]);

  useEffect(() => {
    if (!contentId) {
      setPanel(null);
      return;
    }

    setPanel(null);
    revealControls();
  }, [contentId, revealControls]);

  useEffect(() => {
    if (panel !== 'settings') return;

    const video = getPlayerVideo();
    setPlaybackRate(video?.playbackRate || 1);
  }, [panel, contentId]);

  useEffect(() => {
    if (panel === null) return;

    const frame = window.requestAnimationFrame(() => {
      const preferred = panel === 'episodes'
        ? document.querySelector<HTMLElement>(
            '.player-cinematic-episode-row.is-current',
          )
        : null;

      const fallback = document.querySelector<HTMLElement>(
        `[data-cinematic-panel="${panel}"] .player-cinematic-panel-close`,
      );

      (preferred ?? fallback)?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [panel, currentEpisodeIndex]);

  useEffect(() => {
    const handleActivity = () => revealControls();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        panel !== null &&
        (
          event.key === 'Escape' ||
          event.key === 'Backspace' ||
          event.key === 'GoBack'
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
        (
          event as KeyboardEvent & {
            stopImmediatePropagation?: () => void;
          }
        ).stopImmediatePropagation?.();
        closePanel();
        return;
      }

      revealControls();
    };

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (target.closest('.roneca-exoplayer-top > div > button')) {
        setPanel(null);
      }
    };

    window.addEventListener('mousemove', handleActivity, { passive: true });
    window.addEventListener('pointerdown', handleActivity, { passive: true });
    window.addEventListener('touchstart', handleActivity, { passive: true });
    window.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('click', handleDocumentClick, true);

    revealControls();

    return () => {
      clearHideTimer();
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('pointerdown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      window.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('click', handleDocumentClick, true);
    };
  }, [clearHideTimer, closePanel, panel, revealControls]);

  if (!currentMovie && !currentChannel) return null;

  return (
    <div
      className={`player-cinematic-companion ${
        controlsVisible || panel !== null ? 'is-visible' : ''
      } ${panel !== null ? 'has-open-panel' : ''}`}
      aria-live="polite"
    >
      <div
        className="player-cinematic-quick-actions"
        onClick={event => event.stopPropagation()}
      >
        {hasEpisodes ? (
          <button
            type="button"
            className={panel === 'episodes' ? 'is-active' : ''}
            onClick={event => togglePanel('episodes', event)}
            aria-expanded={panel === 'episodes'}
            aria-controls="player-cinematic-episodes"
          >
            <List aria-hidden="true" size={21} strokeWidth={2.1} />
            <span>Episódios</span>
          </button>
        ) : null}

        <button
          type="button"
          className={panel === 'settings' ? 'is-active' : ''}
          onClick={event => togglePanel('settings', event)}
          aria-expanded={panel === 'settings'}
          aria-controls="player-cinematic-settings"
        >
          <Settings aria-hidden="true" size={21} strokeWidth={2.1} />
          <span>Opções</span>
        </button>
      </div>

      {panel !== null ? (
        <button
          type="button"
          className="player-cinematic-panel-backdrop"
          onClick={closePanel}
          aria-label="Fechar painel do player"
          tabIndex={-1}
        />
      ) : null}

      {panel === 'settings' ? (
        <aside
          id="player-cinematic-settings"
          data-cinematic-panel="settings"
          className="player-cinematic-side-panel player-cinematic-settings-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="player-cinematic-settings-title"
        >
          <header className="player-cinematic-panel-header">
            <div>
              <p>Player</p>
              <h2 id="player-cinematic-settings-title">Opções</h2>
            </div>

            <button
              type="button"
              className="player-cinematic-panel-close"
              onClick={closePanel}
              aria-label="Fechar opções"
            >
              <X aria-hidden="true" size={24} />
            </button>
          </header>

          <section className="player-cinematic-panel-section">
            <p className="player-cinematic-section-label">Velocidade</p>
            <div className="player-cinematic-rate-grid">
              {[0.5, 1, 1.25, 1.5, 2].map(rate => (
                <button
                  key={rate}
                  type="button"
                  className={playbackRate === rate ? 'is-selected' : ''}
                  onClick={() => updatePlaybackRate(rate)}
                  aria-pressed={playbackRate === rate}
                >
                  {rate}x
                </button>
              ))}
            </div>
          </section>

          <section className="player-cinematic-panel-section">
            <p className="player-cinematic-section-label">Reprodução</p>

            <div className="player-cinematic-setting-list">
              <div className="player-cinematic-setting-row">
                <span><Volume2 aria-hidden="true" size={20} /> Áudio</span>
                <strong>Padrão da fonte</strong>
              </div>

              <div className="player-cinematic-setting-row">
                <span><Captions aria-hidden="true" size={20} /> Legendas</span>
                <strong>Conforme a fonte</strong>
              </div>

              <div className="player-cinematic-setting-row">
                <span>Qualidade</span>
                <strong>Automática</strong>
              </div>

              <div className="player-cinematic-setting-row">
                <span>Decodificação</span>
                <strong>{formatSettingValue(settings.decoding)}</strong>
              </div>

              <div className="player-cinematic-setting-row">
                <span>Buffer</span>
                <strong>{formatSettingValue(settings.bufferSize)}</strong>
              </div>

              <div className="player-cinematic-setting-row">
                <span>Reconexão</span>
                <strong>{settings.autoReconnect ? 'Automática' : 'Manual'}</strong>
              </div>
            </div>
          </section>
        </aside>
      ) : null}

      {panel === 'episodes' && currentSeries ? (
        <aside
          id="player-cinematic-episodes"
          data-cinematic-panel="episodes"
          className="player-cinematic-side-panel player-cinematic-episodes-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="player-cinematic-episodes-title"
        >
          <header className="player-cinematic-panel-header">
            <div className="min-w-0">
              <p>Série</p>
              <h2 id="player-cinematic-episodes-title">
                {currentSeries.name}
              </h2>
            </div>

            <button
              type="button"
              className="player-cinematic-panel-close"
              onClick={closePanel}
              aria-label="Fechar episódios"
            >
              <X aria-hidden="true" size={24} />
            </button>
          </header>

          <div className="player-cinematic-episode-navigation">
            <button
              type="button"
              onClick={() => playEpisodeByOffset(-1)}
              disabled={currentEpisodeIndex <= 0}
            >
              <ChevronLeft aria-hidden="true" size={22} />
              Anterior
            </button>

            <span>
              {currentEpisodeIndex >= 0
                ? `${currentEpisodeIndex + 1} de ${episodes.length}`
                : `${episodes.length} episódios`}
            </span>

            <button
              type="button"
              onClick={() => playEpisodeByOffset(1)}
              disabled={
                currentEpisodeIndex < 0 ||
                currentEpisodeIndex >= episodes.length - 1
              }
            >
              Próximo
              <ChevronRight aria-hidden="true" size={22} />
            </button>
          </div>

          <div className="player-cinematic-episode-list">
            {episodes.map(({ season, episode }, index) => {
              const isCurrent = index === currentEpisodeIndex;
              const progress = Math.min(100, Math.max(0, episode.progress ?? 0));

              return (
                <button
                  key={`${season.number}-${episode.id}-${index}`}
                  type="button"
                  className={`player-cinematic-episode-row ${
                    isCurrent ? 'is-current' : ''
                  }`}
                  onClick={() => playEpisodeAt(index)}
                  aria-current={isCurrent ? 'true' : undefined}
                >
                  <span className="player-cinematic-episode-number">
                    {episode.number}
                  </span>

                  <span className="player-cinematic-episode-copy">
                    <strong>{episode.name}</strong>
                    <small>
                      Temporada {season.number}
                      {episode.duration ? ` • ${episode.duration}` : ''}
                    </small>

                    {progress > 0 ? (
                      <span className="player-cinematic-episode-progress">
                        <span style={{ width: `${progress}%` }} />
                      </span>
                    ) : null}
                  </span>

                  {isCurrent ? (
                    <span className="player-cinematic-playing-indicator">
                      Reproduzindo
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </aside>
      ) : null}
    </div>
  );
}
