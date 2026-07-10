import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Movie, Series } from '@/types';

export type PlaybackContentType = 'movie' | 'episode';

export interface PlaybackProgressEntry {
  key: string;
  contentType: PlaybackContentType;
  contentId: string;
  name: string;
  thumbnail?: string;
  positionSeconds: number;
  durationSeconds: number;
  progress: number;
  completed: boolean;
  watchedAt: string;
  seriesId?: string;
  seriesName?: string;
  seasonNumber?: number;
  episodeNumber?: number;
}

interface SavePlaybackProgressInput {
  contentType: PlaybackContentType;
  contentId: string;
  name: string;
  thumbnail?: string;
  positionSeconds: number;
  durationSeconds: number;
  completed?: boolean;
  seriesId?: string;
  seriesName?: string;
  seasonNumber?: number;
  episodeNumber?: number;
}

interface PlaybackStore {
  entries: Record<string, PlaybackProgressEntry>;
  saveProgress: (input: SavePlaybackProgressInput) => void;
  clearProgress: (contentType: PlaybackContentType, contentId: string) => void;
  clearAllProgress: () => void;
}

const MAX_HISTORY_ENTRIES = 250;
const COMPLETE_PERCENT = 95;
const COMPLETE_REMAINING_SECONDS = 90;

export function getPlaybackProgressKey(contentType: PlaybackContentType, contentId: string) {
  return `${contentType}:${contentId}`;
}

function clampNumber(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

function shouldMarkCompleted(positionSeconds: number, durationSeconds: number) {
  if (durationSeconds <= 0) return false;

  const progress = (positionSeconds / durationSeconds) * 100;
  const remaining = durationSeconds - positionSeconds;

  return progress >= COMPLETE_PERCENT || (durationSeconds >= 300 && remaining <= COMPLETE_REMAINING_SECONDS);
}

function limitEntries(entries: Record<string, PlaybackProgressEntry>) {
  const ordered = Object.values(entries)
    .sort((a, b) => Date.parse(b.watchedAt) - Date.parse(a.watchedAt))
    .slice(0, MAX_HISTORY_ENTRIES);

  return Object.fromEntries(ordered.map(entry => [entry.key, entry]));
}

export const usePlaybackStore = create<PlaybackStore>()(
  persist(
    set => ({
      entries: {},

      saveProgress: input => set(state => {
        const contentId = String(input.contentId || '').trim();
        const durationSeconds = Math.max(0, Number(input.durationSeconds) || 0);
        const positionSeconds = clampNumber(Number(input.positionSeconds) || 0, 0, durationSeconds || Number.MAX_SAFE_INTEGER);

        if (!contentId || durationSeconds <= 0) return state;

        const completed = input.completed === true || shouldMarkCompleted(positionSeconds, durationSeconds);
        const rawProgress = clampNumber((positionSeconds / durationSeconds) * 100, 0, 100);
        const progress = completed ? 100 : rawProgress;
        const key = getPlaybackProgressKey(input.contentType, contentId);

        const entry: PlaybackProgressEntry = {
          key,
          contentType: input.contentType,
          contentId,
          name: input.name,
          thumbnail: input.thumbnail,
          positionSeconds: completed ? durationSeconds : positionSeconds,
          durationSeconds,
          progress,
          completed,
          watchedAt: new Date().toISOString(),
          seriesId: input.seriesId,
          seriesName: input.seriesName,
          seasonNumber: input.seasonNumber,
          episodeNumber: input.episodeNumber,
        };

        return {
          entries: limitEntries({
            ...state.entries,
            [key]: entry,
          }),
        };
      }),

      clearProgress: (contentType, contentId) => set(state => {
        const key = getPlaybackProgressKey(contentType, contentId);
        if (!state.entries[key]) return state;

        const next = { ...state.entries };
        delete next[key];
        return { entries: next };
      }),

      clearAllProgress: () => set({ entries: {} }),
    }),
    {
      name: 'ronecaplaytv-playback-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({ entries: state.entries }),
    },
  ),
);

export function getPlaybackEntry(
  entries: Record<string, PlaybackProgressEntry>,
  contentType: PlaybackContentType,
  contentId: string,
) {
  return entries[getPlaybackProgressKey(contentType, contentId)];
}

export function isContinuableProgress(progress?: number) {
  return Number(progress) > 0 && Number(progress) < COMPLETE_PERCENT;
}

export function withMoviePlaybackProgress(
  movie: Movie,
  entries: Record<string, PlaybackProgressEntry>,
): Movie {
  const entry = getPlaybackEntry(entries, 'movie', movie.id);
  return entry ? { ...movie, progress: entry.progress } : movie;
}

export function withSeriesPlaybackProgress(
  item: Series,
  entries: Record<string, PlaybackProgressEntry>,
): Series {
  const episodeEntries = Object.values(entries)
    .filter(entry => entry.contentType === 'episode' && entry.seriesId === item.id)
    .sort((a, b) => Date.parse(b.watchedAt) - Date.parse(a.watchedAt));

  const latest = episodeEntries[0];
  if (!latest && item.seasons.length === 0) return item;

  const episodeProgress = new Map(episodeEntries.map(entry => [entry.contentId, entry.progress]));

  return {
    ...item,
    progress: latest?.progress ?? item.progress,
    seasons: item.seasons.map(season => ({
      ...season,
      episodes: season.episodes.map(episode => {
        const progress = episodeProgress.get(episode.id);
        return progress === undefined ? episode : { ...episode, progress };
      }),
    })),
  };
}
