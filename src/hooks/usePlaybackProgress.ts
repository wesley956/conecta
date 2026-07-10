import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { getPlaybackEntry, usePlaybackStore } from '@/stores/playbackStore';
import type { Movie, Series } from '@/types';

interface UsePlaybackProgressOptions {
  videoRef: RefObject<HTMLVideoElement | null>;
  content: Movie | null;
  currentSeries: Series | null;
  isLive: boolean;
}

const SAVE_INTERVAL_MS = 10_000;
const MIN_RESUME_SECONDS = 10;
const END_GUARD_SECONDS = 5;

function findEpisodeMetadata(currentSeries: Series | null, content: Movie | null) {
  if (!currentSeries || !content) return null;

  for (const season of currentSeries.seasons ?? []) {
    const episode = season.episodes?.find(item => item.id === content.id || item.url === content.url);

    if (episode) {
      return {
        seasonNumber: season.number,
        episodeNumber: episode.number,
      };
    }
  }

  return null;
}

export function usePlaybackProgress({
  videoRef,
  content,
  currentSeries,
  isLive,
}: UsePlaybackProgressOptions) {
  const lastSavedAtRef = useRef(0);
  const lastSavedPositionRef = useRef(0);
  const resumeAppliedKeyRef = useRef<string | null>(null);

  const contentType = currentSeries ? 'episode' as const : 'movie' as const;
  const contentId = content?.id ?? '';

  const saveNow = useCallback((completed = false) => {
    if (isLive || !content) return;

    const video = videoRef.current;
    if (!video) return;

    const durationSeconds = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const positionSeconds = Number.isFinite(video.currentTime) && video.currentTime >= 0 ? video.currentTime : 0;

    if (durationSeconds <= 0) return;

    const episodeMetadata = findEpisodeMetadata(currentSeries, content);

    usePlaybackStore.getState().saveProgress({
      contentType,
      contentId: content.id,
      name: content.name,
      thumbnail: content.cover,
      positionSeconds,
      durationSeconds,
      completed,
      seriesId: currentSeries?.id,
      seriesName: currentSeries?.name,
      seasonNumber: episodeMetadata?.seasonNumber,
      episodeNumber: episodeMetadata?.episodeNumber,
    });

    lastSavedAtRef.current = performance.now();
    lastSavedPositionRef.current = positionSeconds;
  }, [content, contentType, currentSeries, isLive, videoRef]);

  const saveIfNeeded = useCallback(() => {
    if (isLive || !content) return;

    const video = videoRef.current;
    if (!video || video.paused || video.ended) return;

    const now = performance.now();
    const position = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    const enoughTimePassed = now - lastSavedAtRef.current >= SAVE_INTERVAL_MS;
    const enoughProgressMade = Math.abs(position - lastSavedPositionRef.current) >= 10;

    if (enoughTimePassed && enoughProgressMade) {
      saveNow(false);
    }
  }, [content, isLive, saveNow, videoRef]);

  const applyResumePosition = useCallback(() => {
    if (isLive || !content) return;

    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;

    const resumeKey = `${contentType}:${content.id}:${video.currentSrc || content.url || ''}`;
    if (resumeAppliedKeyRef.current === resumeKey) return;

    resumeAppliedKeyRef.current = resumeKey;

    const entry = getPlaybackEntry(usePlaybackStore.getState().entries, contentType, content.id);
    if (!entry || entry.completed || entry.positionSeconds < MIN_RESUME_SECONDS) return;

    const latestSafePosition = Math.max(0, video.duration - END_GUARD_SECONDS);
    const resumePosition = Math.min(entry.positionSeconds, latestSafePosition);

    if (resumePosition >= MIN_RESUME_SECONDS) {
      video.currentTime = resumePosition;
      lastSavedPositionRef.current = resumePosition;
    }
  }, [content, contentType, isLive, videoRef]);

  useEffect(() => {
    lastSavedAtRef.current = 0;
    lastSavedPositionRef.current = 0;
    resumeAppliedKeyRef.current = null;
  }, [contentId, contentType]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || isLive || !content) return;

    const handleLoadedMetadata = () => applyResumePosition();
    const handleTimeUpdate = () => saveIfNeeded();
    const handlePause = () => saveNow(false);
    const handleEnded = () => saveNow(true);
    const handlePageHide = () => saveNow(video.ended);
    const handleVisibilityChange = () => {
      if (document.hidden) saveNow(video.ended);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('durationchange', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    applyResumePosition();

    return () => {
      saveNow(video.ended);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('durationchange', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [applyResumePosition, content, isLive, saveIfNeeded, saveNow, videoRef]);

  return { saveNow };
}
