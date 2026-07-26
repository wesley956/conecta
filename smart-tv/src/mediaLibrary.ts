import { useCallback, useMemo, useState } from "react";
import type { PlaybackItem } from "./player/types";

export type LibraryKind = "channel" | "movie" | "series" | "episode";

export interface LibraryItem {
  id: string;
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

function read(key: string): LibraryItem[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "[]") as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is LibraryItem => Boolean(
      item && typeof item === "object" &&
      typeof (item as LibraryItem).id === "string" &&
      typeof (item as LibraryItem).name === "string"
    ));
  } catch {
    return [];
  }
}

function write(key: string, items: LibraryItem[]) {
  try { window.localStorage.setItem(key, JSON.stringify(items)); }
  catch { /* a biblioteca continua disponível durante a sessão */ }
}

function fromPlayback(item: PlaybackItem): LibraryItem {
  return {
    id: item.id,
    kind: item.kind || (item.live ? "channel" : "movie"),
    name: item.name,
    image: item.image,
    meta: item.meta,
    updatedAt: Date.now()
  };
}

export function useMediaLibrary() {
  const [favorites, setFavorites] = useState<LibraryItem[]>(() => read(FAVORITES_KEY));
  const [history, setHistory] = useState<LibraryItem[]>(() => read(HISTORY_KEY));

  const toggleFavorite = useCallback((item: Omit<LibraryItem, "updatedAt">) => {
    setFavorites(current => {
      const exists = current.some(value => value.id === item.id && value.kind === item.kind);
      const next = exists
        ? current.filter(value => value.id !== item.id || value.kind !== item.kind)
        : [{ ...item, updatedAt: Date.now() }, ...current].slice(0, 100);
      write(FAVORITES_KEY, next);
      return next;
    });
  }, []);

  const remember = useCallback((item: PlaybackItem, currentTime = 0, duration = 0) => {
    if (item.live) return;
    setHistory(current => {
      const base = fromPlayback(item);
      const next = [{
        ...base,
        currentTime: Math.max(0, currentTime),
        duration: Math.max(0, duration)
      }, ...current.filter(value => value.id !== base.id || value.kind !== base.kind)].slice(0, MAX_HISTORY);
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

  const favoriteKeys = useMemo(
    () => new Set(favorites.map(item => `${item.kind}:${item.id}`)),
    [favorites]
  );

  return {
    favorites,
    history,
    isFavorite: (kind: LibraryKind, id: string) => favoriteKeys.has(`${kind}:${id}`),
    toggleFavorite,
    remember,
    clearHistory,
    clearAll
  };
}
