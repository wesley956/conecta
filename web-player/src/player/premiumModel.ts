import type { EpgProgram, WebChannel, WebEpisode } from '../types';

export type EpisodeVisualState = 'new' | 'in_progress' | 'completed';

export type PlayerEpisodeItem = {
  episode: WebEpisode;
  seasonNumber: number;
  state: EpisodeVisualState;
  progressRatio: number;
  active: boolean;
};

export type LiveEpgState = {
  now: EpgProgram | null;
  next: EpgProgram | null;
  progressRatio: number | null;
};

export function clampRatio(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function playerClock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const rounded = Math.floor(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function resolveLiveEpg(epg: EpgProgram[], nowMs = Date.now()): LiveEpgState {
  if (!epg.length) return { now: null, next: null, progressRatio: null };
  const ordered = [...epg]
    .filter(item => Number.isFinite(new Date(item.start).getTime()) && Number.isFinite(new Date(item.end).getTime()))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  const currentIndex = ordered.findIndex(item => {
    const start = new Date(item.start).getTime();
    const end = new Date(item.end).getTime();
    return start <= nowMs && end > nowMs;
  });
  const index = currentIndex >= 0 ? currentIndex : 0;
  const current = ordered[index] || null;
  const next = ordered[index + 1] || null;
  if (!current) return { now: null, next, progressRatio: null };
  const start = new Date(current.start).getTime();
  const end = new Date(current.end).getTime();
  const duration = end - start;
  return {
    now: current,
    next,
    progressRatio: duration > 0 ? clampRatio((nowMs - start) / duration) : null,
  };
}

export function selectQuickChannels(
  channels: WebChannel[],
  activeContentId?: string,
  limit = 8,
) {
  if (!channels.length) return [];
  const activeIndex = channels.findIndex(channel => channel.contentId === activeContentId);
  if (activeIndex < 0) return channels.slice(0, limit);
  const half = Math.floor(limit / 2);
  let start = Math.max(0, activeIndex - half);
  let end = Math.min(channels.length, start + limit);
  start = Math.max(0, end - limit);
  return channels.slice(start, end);
}
