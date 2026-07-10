import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Check, Play, RotateCcw, Settings, X } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import type { Episode, Movie, Season } from '@/types';
import {
  subscribeObservedHls,
  type HlsLevelDescriptor,
  type HlsTrackDescriptor,
  type ObservedHlsInstance,
} from '@/utils/hlsObserver';

const ADVANCED_PREFERENCES_KEY = 'ronecaplaytv-player-advanced-v1';
const NEXT_EPISODE_COUNTDOWN_SECONDS = 10;

const HLS_REFRESH_EVENTS = [
  'hlsManifestParsed',
  'hlsLevelsUpdated',
  'hlsLevelSwitched',
  'hlsAudioTracksUpdated',
  'hlsAudioTrackSwitched',
  'hlsSubtitleTracksUpdated',
  'hlsSubtitleTrackSwitch',
] as const;

type SubtitlePreference = 'off' | string;

interface AdvancedPreferences {
  autoPlayNext: boolean;
  qualityHeight: number | null;
  audioKey: string | null;
  subtitleKey: SubtitlePreference;
}

interface QualityOption {
  levelIndex: number;
  height: number;
  bitrate: number;
  label: string;
}

interface EpisodeEntry {
  season: Season;
  episode: Episode;
}

function readAdvancedPreferences(): AdvancedPreferences {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ADVANCED_PREFERENCES_KEY) || '{}') as Partial<AdvancedPreferences>;

    return {
      autoPlayNext: parsed.autoPlayNext !== false,
      qualityHeight: Number.isFinite(parsed.qualityHeight) ? Number(parsed.qualityHeight) : null,
      audioKey: typeof parsed.audioKey === 'string' ? parsed.audioKey : null,
      subtitleKey: typeof parsed.subtitleKey === 'string' ? parsed.subtitleKey : 'off',
    };
  } catch {
    return {
      autoPlayNext: true,
      qualityHeight: null,
      audioKey: null,
      subtitleKey: 'off',
    };
  }
}

function writeAdvancedPreferences(preferences: AdvancedPreferences) {
  try {
    window.localStorage.setItem(ADVANCED_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // As opções avançadas não devem impedir a reprodução.
  }
}

function getTrackKey(track: HlsTrackDescriptor, index: number) {
  const language = track.lang || track.language || '';
  return `${language}|${track.name || ''}|${track.id ?? index}`;
}

function getTrackLabel(track: HlsTrackDescriptor, index: number) {
  const language = track.lang || track.language;
  const name = track.name && track.name !== language ? track.name : null;
  return [name, language?.toUpperCase()].filter(Boolean).join(' • ') || `Faixa ${index + 1}`;
}

function getNativeSubtitleKey(track: TextTrack, index: number) {
  return `native|${track.language || ''}|${track.label || ''}|${index}`;
}

function getNativeSubtitleLabel(track: TextTrack, index: number) {
  return [track.label || null, track.language?.toUpperCase() || null].filter(Boolean).join(' • ') || `Legenda ${index + 1}`;
}

function buildQualityOptions(levels: HlsLevelDescriptor[]) {
  const byHeight = new Map<number, QualityOption>();

  levels.forEach((level, levelIndex) => {
    const height = Number(level.height) || 0;
    if (height <= 0) return;

    const bitrate = Number(level.bitrate) || 0;
    const current = byHeight.get(height);

    if (!current || bitrate > current.bitrate) {
      byHeight.set(height, {
        levelIndex,
        height,
        bitrate,
        label: `${height}p`,
      });
    }
  });

  return [...byHeight.values()].sort((a, b) => b.height - a.height);
}

function makeEpisodeMovie(seriesName: string, entry: EpisodeEntry, template: Movie): Movie {
  return {
    id: entry.episode.id,
    name: `${seriesName} - T${entry.season.number}E${entry.episode.number}`,
    year: 0,
    duration: entry.episode.duration,
    synopsis: template.synopsis,
    cover: template.cover,
    category: template.category,
    url: entry.episode.url,
    playbackUrls: entry.episode.playbackUrls,
    progress: entry.episode.progress,
    isFavorite: template.isFavorite,
  };
}

export function PlayerAdvancedControls() {
  const currentMovie = useAppStore(state => state.currentMovie);
  const currentSeries = useAppStore(state => state.currentSeries);
  const setCurrentMovie = useAppStore(state => state.setCurrentMovie);

  const panelRef = useRef<HTMLDivElement>(null);
  const appliedPreferencesRef = useRef<{ instance: ObservedHlsInstance | null; signature: string }>({
    instance: null,
    signature: '',
  });

  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [hls, setHls] = useState<ObservedHlsInstance | null>(null);
  const [levels, setLevels] = useState<HlsLevelDescriptor[]>([]);
  const [audioTracks, setAudioTracks] = useState<HlsTrackDescriptor[]>([]);
  const [subtitleTracks, setSubtitleTracks] = useState<HlsTrackDescriptor[]>([]);
  const [nativeSubtitles, setNativeSubtitles] = useState<TextTrack[]>([]);
  const [currentLevelIndex, setCurrentLevelIndex] = useState(-1);
  const [panelOpen, setPanelOpen] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [autoNextSuppressed, setAutoNextSuppressed] = useState(false);
  const [preferences, setPreferences] = useState(readAdvancedPreferences);

  const updatePreferences = useCallback((partial: Partial<AdvancedPreferences>) => {
    setPreferences(current => {
      const next = { ...current, ...partial };
      writeAdvancedPreferences(next);
      return next;
    });
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

  const refreshHlsOptions = useCallback(() => {
    if (!hls) {
      setLevels([]);
      setAudioTracks([]);
      setSubtitleTracks([]);
      setCurrentLevelIndex(-1);
      return;
    }

    setLevels(Array.isArray(hls.levels) ? [...hls.levels] : []);
    setAudioTracks(Array.isArray(hls.audioTracks) ? [...hls.audioTracks] : []);
    setSubtitleTracks(Array.isArray(hls.subtitleTracks) ? [...hls.subtitleTracks] : []);
    setCurrentLevelIndex(Number.isFinite(hls.currentLevel) ? hls.currentLevel : -1);
  }, [hls]);

  useEffect(() => {
    if (!hls) {
      refreshHlsOptions();
      return;
    }

    const refresh = () => refreshHlsOptions();
    for (const event of HLS_REFRESH_EVENTS) hls.on(event, refresh);
    refresh();

    return () => {
      for (const event of HLS_REFRESH_EVENTS) hls.off(event, refresh);
    };
  }, [hls, refreshHlsOptions]);

  useEffect(() => {
    if (!video) {
      setNativeSubtitles([]);
      return;
    }

    const refresh = () => setNativeSubtitles(Array.from(video.textTracks));
    refresh();

    video.addEventListener('loadedmetadata', refresh);
    video.addEventListener('durationchange', refresh);
    video.textTracks.addEventListener('addtrack', refresh);
    video.textTracks.addEventListener('removetrack', refresh);

    return () => {
      video.removeEventListener('loadedmetadata', refresh);
      video.removeEventListener('durationchange', refresh);
      video.textTracks.removeEventListener('addtrack', refresh);
      video.textTracks.removeEventListener('removetrack', refresh);
    };
  }, [video]);

  const qualityOptions = useMemo(() => buildQualityOptions(levels), [levels]);
  const currentAutoQuality = currentLevelIndex >= 0 ? levels[currentLevelIndex]?.height : undefined;

  useEffect(() => {
    if (!hls) return;

    const signature = [
      preferences.qualityHeight ?? 'auto',
      preferences.audioKey ?? 'default',
      preferences.subtitleKey,
      levels.length,
      audioTracks.length,
      subtitleTracks.length,
    ].join('|');

    if (
      appliedPreferencesRef.current.instance === hls &&
      appliedPreferencesRef.current.signature === signature
    ) {
      return;
    }

    const quality = preferences.qualityHeight === null
      ? null
      : qualityOptions.find(option => option.height === preferences.qualityHeight);
    hls.currentLevel = quality?.levelIndex ?? -1;

    if (preferences.audioKey) {
      const audioIndex = audioTracks.findIndex((track, index) => getTrackKey(track, index) === preferences.audioKey);
      if (audioIndex >= 0) hls.audioTrack = audioIndex;
    }

    if (preferences.subtitleKey === 'off') {
      hls.subtitleTrack = -1;
    } else {
      const subtitleIndex = subtitleTracks.findIndex((track, index) => getTrackKey(track, index) === preferences.subtitleKey);
      if (subtitleIndex >= 0) hls.subtitleTrack = subtitleIndex;
    }

    appliedPreferencesRef.current = { instance: hls, signature };
  }, [audioTracks, hls, levels.length, preferences, qualityOptions, subtitleTracks]);

  useEffect(() => {
    if (!video || subtitleTracks.length > 0) return;

    nativeSubtitles.forEach((track, index) => {
      const key = getNativeSubtitleKey(track, index);
      track.mode = preferences.subtitleKey !== 'off' && preferences.subtitleKey === key ? 'showing' : 'disabled';
    });
  }, [nativeSubtitles, preferences.subtitleKey, subtitleTracks.length, video]);

  const episodeEntries = useMemo<EpisodeEntry[]>(() => {
    if (!currentSeries?.seasons?.length) return [];
    return currentSeries.seasons.flatMap(season => season.episodes.map(episode => ({ season, episode })));
  }, [currentSeries]);

  const currentEpisodeIndex = useMemo(() => {
    if (!currentMovie || episodeEntries.length === 0) return -1;
    return episodeEntries.findIndex(entry => (
      entry.episode.id === currentMovie.id || entry.episode.url === currentMovie.url
    ));
  }, [currentMovie, episodeEntries]);

  const nextEpisode = currentEpisodeIndex >= 0 ? episodeEntries[currentEpisodeIndex + 1] ?? null : null;

  const saveCurrentEpisodeAsCompleted = useCallback(() => {
    if (!video || !currentMovie || !currentSeries || currentEpisodeIndex < 0) return;
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;

    const currentEntry = episodeEntries[currentEpisodeIndex];
    usePlaybackStore.getState().saveProgress({
      contentType: 'episode',
      contentId: currentMovie.id,
      name: currentMovie.name,
      thumbnail: currentMovie.cover,
      positionSeconds: video.duration,
      durationSeconds: video.duration,
      completed: true,
      seriesId: currentSeries.id,
      seriesName: currentSeries.name,
      seasonNumber: currentEntry?.season.number,
      episodeNumber: currentEntry?.episode.number,
    });
  }, [currentEpisodeIndex, currentMovie, currentSeries, episodeEntries, video]);

  const playNextEpisode = useCallback(() => {
    if (!nextEpisode || !currentSeries || !currentMovie) return;

    saveCurrentEpisodeAsCompleted();
    setCountdown(null);
    setAutoNextSuppressed(false);
    setCurrentMovie(makeEpisodeMovie(currentSeries.name, nextEpisode, currentMovie));
  }, [currentMovie, currentSeries, nextEpisode, saveCurrentEpisodeAsCompleted, setCurrentMovie]);

  useEffect(() => {
    setCountdown(null);
    setAutoNextSuppressed(false);
  }, [currentMovie?.id]);

  useEffect(() => {
    if (!video || !nextEpisode || !preferences.autoPlayNext || autoNextSuppressed) {
      setCountdown(null);
      return;
    }

    const updateCountdown = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        setCountdown(null);
        return;
      }

      const remaining = video.duration - video.currentTime;
      if (remaining > 0 && remaining <= NEXT_EPISODE_COUNTDOWN_SECONDS) {
        setCountdown(Math.max(1, Math.ceil(remaining)));
      } else {
        setCountdown(null);
      }
    };

    const handleEnded = () => playNextEpisode();

    video.addEventListener('timeupdate', updateCountdown);
    video.addEventListener('durationchange', updateCountdown);
    video.addEventListener('ended', handleEnded);
    updateCountdown();

    return () => {
      video.removeEventListener('timeupdate', updateCountdown);
      video.removeEventListener('durationchange', updateCountdown);
      video.removeEventListener('ended', handleEnded);
    };
  }, [autoNextSuppressed, nextEpisode, playNextEpisode, preferences.autoPlayNext, video]);

  const restartCurrentContent = useCallback(() => {
    if (!video || !currentMovie) return;

    const contentType = currentSeries ? 'episode' : 'movie';
    usePlaybackStore.getState().clearProgress(contentType, currentMovie.id);
    video.currentTime = 0;
    video.play().catch(() => undefined);
    setPanelOpen(false);
  }, [currentMovie, currentSeries, video]);

  const selectQuality = (height: number | null) => {
    updatePreferences({ qualityHeight: height });
    if (!hls) return;

    const option = height === null ? null : qualityOptions.find(item => item.height === height);
    hls.currentLevel = option?.levelIndex ?? -1;
  };

  const selectAudio = (key: string) => {
    updatePreferences({ audioKey: key });
    if (!hls) return;

    const index = audioTracks.findIndex((track, trackIndex) => getTrackKey(track, trackIndex) === key);
    if (index >= 0) hls.audioTrack = index;
  };

  const selectSubtitle = (key: SubtitlePreference) => {
    updatePreferences({ subtitleKey: key });

    if (hls) {
      if (key === 'off') {
        hls.subtitleTrack = -1;
      } else {
        const index = subtitleTracks.findIndex((track, trackIndex) => getTrackKey(track, trackIndex) === key);
        if (index >= 0) hls.subtitleTrack = index;
      }
    }

    nativeSubtitles.forEach((track, index) => {
      track.mode = key !== 'off' && getNativeSubtitleKey(track, index) === key ? 'showing' : 'disabled';
    });
  };

  const focusPanelOption = useCallback((direction: 1 | -1) => {
    const panel = panelRef.current;
    if (!panel) return;

    const options = Array.from(panel.querySelectorAll<HTMLButtonElement>('[data-player-option="true"]:not(:disabled)'));
    if (options.length === 0) return;

    const currentIndex = options.findIndex(option => option === document.activeElement);
    const nextIndex = currentIndex < 0
      ? 0
      : (currentIndex + direction + options.length) % options.length;
    options[nextIndex]?.focus();
  }, []);

  useLayoutEffect(() => {
    const handleRemoteKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const stop = () => {
        event.preventDefault();
        event.stopPropagation();
        (event as KeyboardEvent & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.();
      };

      const menuKey = event.key === 'Menu' || event.key === 'ContextMenu' || event.key === 'Settings';

      if (!panelOpen) {
        if (event.key === 'ArrowUp' || menuKey) {
          stop();
          setPanelOpen(true);
        }
        return;
      }

      if (event.key === 'Escape' || event.key === 'Backspace' || event.key === 'GoBack') {
        stop();
        setPanelOpen(false);
        return;
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        stop();
        focusPanelOption(1);
        return;
      }

      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        stop();
        focusPanelOption(-1);
        return;
      }

      if (event.key === 'Enter' || event.key === 'NumpadEnter' || event.key === ' ') {
        stop();
        const active = document.activeElement;
        if (active instanceof HTMLButtonElement && panelRef.current?.contains(active)) {
          active.click();
        } else {
          focusPanelOption(1);
        }
      }
    };

    window.addEventListener('keydown', handleRemoteKey, true);
    return () => window.removeEventListener('keydown', handleRemoteKey, true);
  }, [focusPanelOption, panelOpen]);

  useEffect(() => {
    if (!panelOpen) return;
    const frame = window.requestAnimationFrame(() => focusPanelOption(1));
    return () => window.cancelAnimationFrame(frame);
  }, [focusPanelOption, panelOpen]);

  const subtitleOptions = subtitleTracks.length > 0
    ? subtitleTracks.map((track, index) => ({
        key: getTrackKey(track, index),
        label: getTrackLabel(track, index),
      }))
    : nativeSubtitles.map((track, index) => ({
        key: getNativeSubtitleKey(track, index),
        label: getNativeSubtitleLabel(track, index),
      }));

  return (
    <>
      <button
        type="button"
        className="player-advanced-trigger"
        onClick={() => setPanelOpen(true)}
        aria-label="Abrir opções avançadas do player"
      >
        <Settings aria-hidden="true" size={18} strokeWidth={2.1} />
        <span>Opções</span>
      </button>

      {panelOpen ? (
        <div className="player-advanced-overlay" onClick={() => setPanelOpen(false)}>
          <div
            ref={panelRef}
            className="player-advanced-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Opções avançadas do player"
            onClick={event => event.stopPropagation()}
          >
            <header className="player-advanced-header">
              <div>
                <p>Player V2</p>
                <h2>Opções de reprodução</h2>
              </div>
              <button
                type="button"
                data-player-option="true"
                onClick={() => setPanelOpen(false)}
                aria-label="Fechar opções"
              >
                <X aria-hidden="true" size={20} />
              </button>
            </header>

            <div className="player-advanced-scroll">
              <section className="player-advanced-section">
                <div className="player-advanced-section-title">
                  <h3>Qualidade</h3>
                  <span>{preferences.qualityHeight === null ? `Automático${currentAutoQuality ? ` • ${currentAutoQuality}p` : ''}` : `${preferences.qualityHeight}p`}</span>
                </div>

                <div className="player-option-grid">
                  <button
                    type="button"
                    data-player-option="true"
                    className={preferences.qualityHeight === null ? 'is-active' : ''}
                    onClick={() => selectQuality(null)}
                  >
                    <span>Automático</span>
                    {preferences.qualityHeight === null ? <Check aria-hidden="true" size={16} /> : null}
                  </button>

                  {qualityOptions.map(option => (
                    <button
                      key={option.height}
                      type="button"
                      data-player-option="true"
                      className={preferences.qualityHeight === option.height ? 'is-active' : ''}
                      onClick={() => selectQuality(option.height)}
                    >
                      <span>{option.label}</span>
                      {preferences.qualityHeight === option.height ? <Check aria-hidden="true" size={16} /> : null}
                    </button>
                  ))}
                </div>

                {qualityOptions.length === 0 ? (
                  <p className="player-option-empty">A fonte atual não oferece qualidades HLS selecionáveis.</p>
                ) : null}
              </section>

              <section className="player-advanced-section">
                <div className="player-advanced-section-title">
                  <h3>Áudio</h3>
                  <span>{audioTracks.length} faixa(s)</span>
                </div>

                {audioTracks.length > 0 ? (
                  <div className="player-option-list">
                    {audioTracks.map((track, index) => {
                      const key = getTrackKey(track, index);
                      const active = hls?.audioTrack === index || preferences.audioKey === key;

                      return (
                        <button
                          key={key}
                          type="button"
                          data-player-option="true"
                          className={active ? 'is-active' : ''}
                          onClick={() => selectAudio(key)}
                        >
                          <span>{getTrackLabel(track, index)}</span>
                          {active ? <Check aria-hidden="true" size={16} /> : null}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="player-option-empty">Nenhuma faixa alternativa de áudio foi informada pela fonte.</p>
                )}
              </section>

              <section className="player-advanced-section">
                <div className="player-advanced-section-title">
                  <h3>Legendas</h3>
                  <span>{subtitleOptions.length} disponível(is)</span>
                </div>

                <div className="player-option-list">
                  <button
                    type="button"
                    data-player-option="true"
                    className={preferences.subtitleKey === 'off' ? 'is-active' : ''}
                    onClick={() => selectSubtitle('off')}
                  >
                    <span>Desativadas</span>
                    {preferences.subtitleKey === 'off' ? <Check aria-hidden="true" size={16} /> : null}
                  </button>

                  {subtitleOptions.map(option => (
                    <button
                      key={option.key}
                      type="button"
                      data-player-option="true"
                      className={preferences.subtitleKey === option.key ? 'is-active' : ''}
                      onClick={() => selectSubtitle(option.key)}
                    >
                      <span>{option.label}</span>
                      {preferences.subtitleKey === option.key ? <Check aria-hidden="true" size={16} /> : null}
                    </button>
                  ))}
                </div>
              </section>

              {currentSeries ? (
                <section className="player-advanced-section">
                  <div className="player-advanced-section-title">
                    <h3>Próximo episódio</h3>
                    <span>{nextEpisode ? `T${nextEpisode.season.number}E${nextEpisode.episode.number}` : 'Último episódio'}</span>
                  </div>

                  <button
                    type="button"
                    data-player-option="true"
                    className={`player-setting-toggle ${preferences.autoPlayNext ? 'is-active' : ''}`}
                    onClick={() => updatePreferences({ autoPlayNext: !preferences.autoPlayNext })}
                  >
                    <span>
                      <strong>Reproduzir automaticamente</strong>
                      <small>Inicia o próximo episódio ao terminar</small>
                    </span>
                    <span className="player-toggle-indicator" aria-hidden="true" />
                  </button>
                </section>
              ) : null}

              {currentMovie && video && video.currentTime >= 10 ? (
                <section className="player-advanced-section">
                  <button
                    type="button"
                    data-player-option="true"
                    className="player-restart-button"
                    onClick={restartCurrentContent}
                  >
                    <RotateCcw aria-hidden="true" size={18} />
                    Começar do início
                  </button>
                </section>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {countdown !== null && nextEpisode ? (
        <aside className="player-next-episode-card" aria-live="polite">
          <p>Próximo episódio em {countdown}s</p>
          <h3>T{nextEpisode.season.number}E{nextEpisode.episode.number} • {nextEpisode.episode.name}</h3>
          <div>
            <button type="button" onClick={playNextEpisode}>
              <Play aria-hidden="true" size={15} fill="currentColor" />
              Assistir agora
            </button>
            <button
              type="button"
              onClick={() => {
                setAutoNextSuppressed(true);
                setCountdown(null);
              }}
            >
              Cancelar
            </button>
          </div>
        </aside>
      ) : null}
    </>
  );
}
