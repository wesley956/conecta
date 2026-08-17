import { useCallback, useMemo, useState } from "react";
import type { PlaybackItem } from "./player/types";
import { syncFavorite, syncProgress } from "./librarySync";

export type LibraryKind = "channel" | "movie" | "series" | "episode";

export interface LibraryItem {
  id: string;
  contentKey?: string;
  kind: LibraryKind;
  name: string;
  image?: string;
  meta?: string;
  updatedAt: number;
  currentTime?: number;
  duration?: number;
}

const FAVORITES_KEY = "roneca.smart-tv.favorites.v1";
const HISTORY_KEY = "roneca.smart-tv.history.v1";
const MAX_HISTORY = 60;
export const MIN_PROGRESS_SECONDS = 8;
export const COMPLETION_THRESHOLD_SECONDS = 45;

function read(key: string): LibraryItem[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "[]") as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is LibraryItem => Boolean(
      item && typeof item === "object" &&
      typeof (item as LibraryItem).id === "string" &&
      typeof (item as LibraryItem).name === "string"
    ));
  } catch { return []; }
}
function write(key: string, items: LibraryItem[]) {
  try { window.localStorage.setItem(key, JSON.stringify(items)); }
  catch { /* cache local degradável; fonte canônica é server-side quando autenticado */ }
}
function fromPlayback(item: PlaybackItem): LibraryItem {
  return {
    id: item.id,
    contentKey: item.contentKey,
    kind: item.kind || (item.live ? "channel" : "movie"),
    name: item.name,
    image: item.image,
    meta: item.meta,
    updatedAt: Date.now()
  };
}
export function libraryIdentity(item: Pick<LibraryItem, "id" | "kind" | "contentKey">) {
  return item.contentKey || `${item.kind}:${item.id}`;
}
export function progressFraction(item?: Pick<LibraryItem, "currentTime" | "duration"> | null) {
  const currentTime = Number(item?.currentTime || 0);
  const duration = Number(item?.duration || 0);
  return duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0;
}
export function resumableProgress(item?: Pick<LibraryItem, "currentTime" | "duration"> | null) {
  const currentTime = Number(item?.currentTime || 0);
  const duration = Number(item?.duration || 0);
  return duration > 0 && currentTime >= MIN_PROGRESS_SECONDS && duration - currentTime > COMPLETION_THRESHOLD_SECONDS;
}

export function useMediaLibrary() {
  const [favorites, setFavorites] = useState<LibraryItem[]>(() => read(FAVORITES_KEY));
  const [history, setHistory] = useState<LibraryItem[]>(() => read(HISTORY_KEY));

  const toggleFavorite = useCallback((item: Omit<LibraryItem, "updatedAt">) => {
    setFavorites(current => {
      const itemKey = libraryIdentity(item);
      const exists = current.some(value =>
        libraryIdentity(value) === itemKey || (value.kind === item.kind && value.id === item.id)
      );
      const next = exists
        ? current.filter(value =>
            libraryIdentity(value) !== itemKey && (value.kind !== item.kind || value.id !== item.id)
          )
        : [{ ...item, updatedAt: Date.now() }, ...current].slice(0, 100);
      write(FAVORITES_KEY, next);
      if (item.contentKey && ["channel", "movie", "series"].includes(item.kind)) {
        queueMicrotask(() => void syncFavorite(
          item.contentKey!,
          item.kind as "channel" | "movie" | "series",
          !exists
        ).catch(() => undefined));
      }
      return next;
    });
  }, []);

  const remember = useCallback((item: PlaybackItem, currentTime = 0, duration = 0) => {
    if (item.live) return;
    setHistory(current => {
      const base = fromPlayback(item);
      const baseKey = libraryIdentity(base);
      const withoutCurrent = current.filter(value => libraryIdentity(value) !== baseKey);
      const safeDuration = Math.max(0, duration);
      const safePosition = safeDuration > 0
        ? Math.min(Math.max(0, currentTime), safeDuration)
        : Math.max(0, currentTime);

      if (safeDuration <= 0 || safePosition < MIN_PROGRESS_SECONDS) return current;
      if (item.contentKey && ["movie", "episode"].includes(base.kind)) {
        queueMicrotask(() => void syncProgress(
          item.contentKey!,
          base.kind as "movie" | "episode",
          safePosition,
          safeDuration
        ).catch(() => undefined));
      }

      if (safeDuration - safePosition <= COMPLETION_THRESHOLD_SECONDS) {
        if (withoutCurrent.length === current.length) return current;
        write(HISTORY_KEY, withoutCurrent);
        return withoutCurrent;
      }

      const next = [{
        ...base,
        currentTime: safePosition,
        duration: safeDuration
      }, ...withoutCurrent].slice(0, MAX_HISTORY);
      write(HISTORY_KEY, next);
      return next;
    });
  }, []);

  const reconcileIdentities = useCallback((catalogItems: Array<Pick<LibraryItem, "id" | "kind" | "contentKey">>) => {
    const aliases = new Map(catalogItems.map(item => [`${item.kind}:${item.id}`, item.contentKey]));
    const reconcile = (items: LibraryItem[]) => {
      let changed = false;
      const seen = new Set<string>();
      const next = items.flatMap(item => {
        const contentKey = item.contentKey || aliases.get(`${item.kind}:${item.id}`);
        const migrated = contentKey && contentKey !== item.contentKey ? { ...item, contentKey } : item;
        const key = libraryIdentity(migrated);
        if (seen.has(key)) { changed = true; return []; }
        seen.add(key);
        if (migrated !== item) changed = true;
        return [migrated];
      });
      return changed ? next : items;
    };
    setFavorites(current => {
      const next = reconcile(current);
      if (next === current) return current;
      write(FAVORITES_KEY, next);
      return next;
    });
    setHistory(current => {
      const next = reconcile(current);
      if (next === current) return current;
      write(HISTORY_KEY, next);
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    write(HISTORY_KEY, []);
  }, []);

  const clearAll = useCallback(() => {
    setFavorites([]);
    setHistory([]);
    write(FAVORITES_KEY, []);
    write(HISTORY_KEY, []);
  }, []);

  const favoriteKeys = useMemo(() => new Set(favorites.map(libraryIdentity)), [favorites]);
  return {
    favorites,
    history,
    isFavorite: (kind: LibraryKind, id: string, contentKey?: string) =>
      favoriteKeys.has(contentKey || `${kind}:${id}`) || favoriteKeys.has(`${kind}:${id}`),
    toggleFavorite,
    remember,
    reconcileIdentities,
    clearHistory,
    clearAll
  };
}
