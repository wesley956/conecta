import { useCallback, useEffect, useMemo, useState } from 'react';

type PositionRecord = { position: number; duration: number; updatedAt: string };
type LibraryState = { favorites: string[]; positions: Record<string, PositionRecord> };

const emptyState = (): LibraryState => ({ favorites: [], positions: {} });
const storageKey = (sessionId: string) => `roneca.web.library.v1:${sessionId}`;

function readState(sessionId: string): LibraryState {
  try {
    const raw = window.sessionStorage.getItem(storageKey(sessionId));
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<LibraryState>;
    return {
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites.filter(value => typeof value === 'string') : [],
      positions: parsed.positions && typeof parsed.positions === 'object' ? parsed.positions : {},
    };
  } catch {
    return emptyState();
  }
}

function writeState(sessionId: string, value: LibraryState) {
  try {
    window.sessionStorage.setItem(storageKey(sessionId), JSON.stringify(value));
  } catch {
    // A sincronização server-side será adicionada na WEB-12.
  }
}

export function clearLocalLibrary(sessionId: string) {
  try { window.sessionStorage.removeItem(storageKey(sessionId)); } catch { /* noop */ }
}

export function useSessionLibrary(sessionId: string) {
  const [state, setState] = useState<LibraryState>(() => readState(sessionId));
  useEffect(() => setState(readState(sessionId)), [sessionId]);
  useEffect(() => writeState(sessionId, state), [sessionId, state]);

  const favorites = useMemo(() => new Set(state.favorites), [state.favorites]);

  const toggleFavorite = useCallback((contentId: string) => {
    setState(current => {
      const next = new Set(current.favorites);
      if (next.has(contentId)) next.delete(contentId);
      else next.add(contentId);
      return { ...current, favorites: [...next].slice(-500) };
    });
  }, []);

  const savePosition = useCallback((contentId: string, position: number, duration: number) => {
    if (!contentId || !Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) return;
    const safePosition = Math.max(0, Math.min(duration, position));
    setState(current => {
      const positions = { ...current.positions };
      if (safePosition < 8 || duration - safePosition <= 45) delete positions[contentId];
      else positions[contentId] = { position: safePosition, duration, updatedAt: new Date().toISOString() };
      return { ...current, positions };
    });
  }, []);

  // A UI sempre testa a presença antes de ler. O acesso indexado fica intencionalmente
  // flexível aqui porque noUncheckedIndexedAccess não preserva esse narrowing entre
  // expressões JSX separadas. WEB-12 substituirá este lookup local por um store canônico.
  const positions: any = state.positions;

  return { favorites, positions, toggleFavorite, savePosition };
}
