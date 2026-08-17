import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchLibrary, writeFavorite, writePreferences, writeProgress } from './api';
import type { CanonicalPreferences } from './types';

type PositionRecord = { position: number; duration: number; updatedAt: string };
type LibraryState = {
  favorites: string[];
  positions: Record<string, PositionRecord>;
  preferences: CanonicalPreferences | null;
};

type FavoriteType = 'channel' | 'movie' | 'series';
type ProgressType = 'movie' | 'episode';
type PendingProgress = { contentKey: string; contentType: ProgressType; position: number; duration: number };

const CACHE_KEY = 'roneca.web.library-cache.v2';
const emptyState = (): LibraryState => ({ favorites: [], positions: {}, preferences: null });

function readCache(): LibraryState {
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<LibraryState>;
    return {
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites.filter(value => typeof value === 'string') : [],
      positions: parsed.positions && typeof parsed.positions === 'object' ? parsed.positions : {},
      preferences: parsed.preferences || null,
    };
  } catch {
    return emptyState();
  }
}

function writeCache(value: LibraryState) {
  try { window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(value)); }
  catch { /* cache é opcional; servidor segue canônico */ }
}

export function clearLocalLibrary() {
  try { window.sessionStorage.removeItem(CACHE_KEY); }
  catch { /* noop */ }
}

export function useCanonicalLibrary(accessToken: string | null) {
  const [state, setState] = useState<LibraryState>(readCache);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const lastProgressSent = useRef(new Map<string, number>());
  const pendingProgress = useRef(new Map<string, PendingProgress>());
  const timers = useRef(new Map<string, number>());

  const applySnapshot = useCallback(async () => {
    if (!accessToken) return;
    setSyncing(true);
    try {
      const snapshot = await fetchLibrary(accessToken);
      const positions: Record<string, PositionRecord> = {};
      for (const progress of snapshot.progress) {
        positions[progress.contentKey] = {
          position: progress.positionMs / 1000,
          duration: progress.durationMs / 1000,
          updatedAt: progress.updatedAt,
        };
      }
      const next: LibraryState = {
        favorites: snapshot.favorites.map(item => item.contentKey),
        positions,
        preferences: snapshot.preferences,
      };
      setState(next);
      writeCache(next);
      setSyncError(null);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Não foi possível sincronizar sua biblioteca.');
    } finally {
      setSyncing(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) {
      setState(emptyState());
      return;
    }
    void applySnapshot();
  }, [accessToken, applySnapshot]);

  useEffect(() => writeCache(state), [state]);

  const favorites = useMemo(() => new Set(state.favorites), [state.favorites]);

  const toggleFavorite = useCallback((contentKey: string, contentType: FavoriteType) => {
    if (!accessToken || !contentKey) return;
    const nextActive = !favorites.has(contentKey);
    setState(current => {
      const set = new Set(current.favorites);
      if (nextActive) set.add(contentKey); else set.delete(contentKey);
      return { ...current, favorites: [...set].slice(-500) };
    });
    void writeFavorite(accessToken, contentKey, contentType, nextActive)
      .then(result => {
        setState(current => {
          const set = new Set(current.favorites);
          if (result.favorite.active) set.add(contentKey); else set.delete(contentKey);
          return { ...current, favorites: [...set] };
        });
        setSyncError(null);
      })
      .catch(error => {
        setSyncError(error instanceof Error ? error.message : 'Falha ao sincronizar favorito.');
        void applySnapshot();
      });
  }, [accessToken, applySnapshot, favorites]);

  const flushProgress = useCallback((pending: PendingProgress) => {
    if (!accessToken) return;
    pendingProgress.current.delete(pending.contentKey);
    const timer = timers.current.get(pending.contentKey);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(pending.contentKey);
    lastProgressSent.current.set(pending.contentKey, Date.now());
    void writeProgress(
      accessToken,
      pending.contentKey,
      pending.contentType,
      Math.round(pending.position * 1000),
      Math.round(pending.duration * 1000),
    ).then(result => {
      setState(current => {
        const positions = { ...current.positions };
        if (result.progress.completed) delete positions[pending.contentKey];
        else positions[pending.contentKey] = {
          position: result.progress.positionMs / 1000,
          duration: result.progress.durationMs / 1000,
          updatedAt: result.progress.updatedAt,
        };
        return { ...current, positions };
      });
      setSyncError(null);
    }).catch(error => {
      setSyncError(error instanceof Error ? error.message : 'Falha ao sincronizar progresso.');
    });
  }, [accessToken]);

  const savePosition = useCallback((contentKey: string, contentType: ProgressType, position: number, duration: number) => {
    if (!accessToken || !contentKey || !Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) return;
    const safePosition = Math.max(0, Math.min(duration, position));
    setState(current => {
      const positions = { ...current.positions };
      if (safePosition < 8 || duration - safePosition <= 45) delete positions[contentKey];
      else positions[contentKey] = { position: safePosition, duration, updatedAt: new Date().toISOString() };
      return { ...current, positions };
    });

    if (safePosition < 8) return;
    const pending = { contentKey, contentType, position: safePosition, duration };
    pendingProgress.current.set(contentKey, pending);
    const lastSent = lastProgressSent.current.get(contentKey) || 0;
    const elapsed = Date.now() - lastSent;
    if (elapsed >= 10_000) {
      flushProgress(pending);
      return;
    }
    if (!timers.current.has(contentKey)) {
      const timer = window.setTimeout(() => {
        const latest = pendingProgress.current.get(contentKey);
        if (latest) flushProgress(latest);
      }, Math.max(500, 10_000 - elapsed));
      timers.current.set(contentKey, timer);
    }
  }, [accessToken, flushProgress]);

  const savePreferences = useCallback((preferences: Partial<CanonicalPreferences>) => {
    if (!accessToken) return;
    setState(current => ({
      ...current,
      preferences: {
        aspectMode: preferences.aspectMode ?? current.preferences?.aspectMode ?? null,
        language: preferences.language ?? current.preferences?.language ?? null,
        subtitleLanguage: preferences.subtitleLanguage ?? current.preferences?.subtitleLanguage ?? null,
        version: current.preferences?.version || 1,
        updatedAt: new Date().toISOString(),
      },
    }));
    void writePreferences(accessToken, preferences)
      .then(result => setState(current => ({ ...current, preferences: result.preferences })))
      .catch(error => setSyncError(error instanceof Error ? error.message : 'Falha ao sincronizar preferência.'));
  }, [accessToken]);

  useEffect(() => () => {
    for (const timer of timers.current.values()) window.clearTimeout(timer);
    timers.current.clear();
    for (const pending of pendingProgress.current.values()) flushProgress(pending);
  }, [flushProgress]);

  const positions: Record<string, PositionRecord | undefined> = state.positions;
  return {
    favorites,
    positions,
    preferences: state.preferences,
    syncing,
    syncError,
    reload: applySnapshot,
    toggleFavorite,
    savePosition,
    savePreferences,
  };
}
