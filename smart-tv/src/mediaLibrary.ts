import { useCallback, useMemo, useState } from "react";
import type { PlaybackItem } from "./player/types";

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
    contentKey: item.contentKey,
    kind: item.kind || (item.live ? "channel" : "movie"),
    name: item.name,
    image: item.image,
    meta: item.meta,
    updatedAt: Date.now()
  };
}

function identity(item: Pick<LibraryItem, "id" | "kind" | "contentKey">) {
  return item.contentKey || `${item.kind}:${item.id}`;
}

export function useMediaLibrary() {
  const [favorites, setFavorites] = useState<LibraryItem[]>(() => read(FAVORITES_KEY));
  const [history, setHistory] = useState<LibraryItem[]>(() => read(HISTORY_KEY));

  const toggleFavorite = useCallback((item: Omit<LibraryItem, "updatedAt">) => {
    setFavorites(current => {
      const itemKey = identity(item);
      const exists = current.some(value =>
        identity(value) === itemKey || (value.kind === item.kind && value.id === item.id)
      );
      const next = exists
        ? current.filter(value =>
            identity(value) !== itemKey && (value.kind !== item.kind || value.id !== item.id)
          )
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
      }, ...current.filter(value => identity(value) !== identity(base))].slice(0, MAX_HISTORY);
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
        const key = identity(migrated);
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

  const favoriteKeys = useMemo(
    () => new Set(favorites.map(identity)),
    [favorites]
  );

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
