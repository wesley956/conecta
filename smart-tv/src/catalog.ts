import { useCallback, useEffect, useRef, useState } from "react";
import { reportPlaylistFailure, reportPlaylistSuccess } from "./deviceSession";
import type { CacheParts, DevicePlaylist, DeviceSession } from "./deviceSession";
import { restoreCatalogSnapshot, saveCatalogSnapshot } from "./catalogSnapshot";

export interface Channel {
  id: string;
  name: string;
  logo?: string;
  groupTitle?: string;
  url: string;
  playbackUrls?: string[];
}

export interface Movie {
  id: string;
  name: string;
  cover?: string;
  category?: string;
  year?: number;
  duration?: string;
  synopsis?: string;
  url: string;
  playbackUrls?: string[];
}

export interface Episode {
  id: string;
  number: number;
  name: string;
  duration?: string;
  url: string;
  playbackUrls?: string[];
}

export interface Season {
  number: number;
  episodes: Episode[];
}

export interface Series {
  id: string;
  name: string;
  cover?: string;
  category?: string;
  synopsis?: string;
  xtreamSeriesId?: string | number;
  seasons?: Season[];
}

export interface Catalog {
  channels: Channel[];
  movies: Movie[];
  series: Series[];
}

export interface CatalogFailoverRequest {
  attemptId: string;
  reason: string;
  contentKey: string;
}

export type CatalogFailoverResult = {
  outcome: "switched";
  attemptId: string;
  reason: string;
  contentKey: string;
  fromPlaylistId: string;
  data: Catalog;
  playlistId: string;
  playlistName: string;
} | {
  outcome: "busy" | "no_active_playlist" | "no_backup" | "catalog_failed";
  attemptId: string;
  reason: string;
  contentKey: string;
  fromPlaylistId: string | null;
  data: null;
  playlistId: null;
  playlistName: null;
};

type CatalogState = {
  status: "idle" | "loading" | "ready" | "error";
  data: Catalog;
  message: string | null;
  activePlaylistId: string | null;
  activePlaylistName: string | null;
  usingBackupPlaylist: boolean;
  lastSuccessfulSync: string | null;
  lastFailure: string | null;
  lastFailoverAttemptId: string | null;
  lastFailoverOutcome: CatalogFailoverResult["outcome"] | "switching" | null;
};

const emptyCatalog: Catalog = { channels: [], movies: [], series: [] };
const initialState: CatalogState = {
  status: "idle",
  data: emptyCatalog,
  message: null,
  activePlaylistId: null,
  activePlaylistName: null,
  usingBackupPlaylist: false,
  lastSuccessfulSync: null,
  lastFailure: null,
  lastFailoverAttemptId: null,
  lastFailoverOutcome: null
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("O cache retornou um formato inválido.");
  }
  return value as Record<string, unknown>;
}

function items<T>(payload: unknown, key: string): T[] {
  const value = object(payload)[key];
  if (!Array.isArray(value)) throw new Error(`A parte ${key} do catálogo está inválida.`);
  return value as T[];
}

async function download(url: string, signal: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeout = window.setTimeout(abort, 15_000);
  signal.addEventListener("abort", abort);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Não foi possível baixar o catálogo (${response.status}).`);
    return await response.json() as unknown;
  } catch (error) {
    if (!signal.aborted && controller.signal.aborted) {
      throw new Error("O servidor demorou demais para entregar o catálogo.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}

function candidates(session: DeviceSession): DevicePlaylist[] {
  const configured = session.playlists
    .filter(item => item.cacheParts)
    .sort((left, right) =>
      (left.id === session.selectedPlaylistId ? 0 : 1) -
        (right.id === session.selectedPlaylistId ? 0 : 1) ||
      left.priority - right.priority
    );
  if (configured.length) return configured;
  if (!session.cacheParts) return [];
  return [{
    id: session.selectedPlaylistId || "selected",
    name: session.playlistName || "Lista selecionada",
    priority: 1,
    role: "primary",
    cacheParts: session.cacheParts,
    cacheStatus: null,
    cacheUpdatedAt: null,
    consecutiveFailures: 0,
    lastSuccessAt: null,
    lastFailureAt: null,
    cooldownUntil: null,
    lastError: null
  }];
}

async function loadCatalog(parts: CacheParts | null, signal: AbortSignal): Promise<Catalog> {
  if (!parts?.channelsUrl || !parts.moviesUrl || !parts.seriesUrl) {
    throw new Error("O catálogo seguro ainda não está pronto.");
  }
  const [channelsPayload, moviesPayload, seriesPayload] = await Promise.all([
    download(parts.channelsUrl, signal),
    download(parts.moviesUrl, signal),
    download(parts.seriesUrl, signal)
  ]);
  const data = {
    channels: items<Channel>(channelsPayload, "channels"),
    movies: items<Movie>(moviesPayload, "movies"),
    series: items<Series>(seriesPayload, "series")
  };
  if (!data.channels.length && !data.movies.length && !data.series.length) {
    throw new Error("A lista retornou um catálogo vazio.");
  }
  return data;
}

export function useCatalog(session: DeviceSession, renewConfiguration: () => Promise<DeviceSession>) {
  const [state, setState] = useState<CatalogState>(initialState);
  const [attempt, setAttempt] = useState(0);
  const switching = useRef(false);
  const activePlaylistId = useRef<string | null>(null);

  const retry = useCallback(() => setAttempt(value => value + 1), []);
  const confirmPlaybackStable = useCallback((playlistId: string) => {
    if (!playlistId || playlistId !== activePlaylistId.current) return;
    void reportPlaylistSuccess(playlistId).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (session.status !== "active") {
      setState(initialState);
      activePlaylistId.current = null;
      return;
    }
    if (switching.current) return;

    const controller = new AbortController();
    setState(current => ({ ...current, status: "loading", message: null }));

    void (async () => {
      try {
        const configuredAtStart = candidates(session);
        const restored = await restoreCatalogSnapshot(
          session.deviceCode,
          configuredAtStart.map(item => item.id)
        ).catch(() => null);
        if (restored && !controller.signal.aborted) {
          const restoredPlaylist = configuredAtStart.find(item => item.id === restored.playlistId);
          activePlaylistId.current = restored.playlistId;
          setState({
            status: "ready",
            data: restored.catalog,
            message: "Catálogo local restaurado. Verificando atualizações em segundo plano...",
            activePlaylistId: restored.playlistId,
            activePlaylistName: restoredPlaylist?.name || session.playlistName,
            usingBackupPlaylist: restoredPlaylist?.role === "backup",
            lastSuccessfulSync: new Date(restored.savedAt).toISOString(),
            lastFailure: null,
            lastFailoverAttemptId: null,
            lastFailoverOutcome: null
          });
        }

        const freshSession = await renewConfiguration();
        if (freshSession.status !== "active") {
          throw new Error(freshSession.message || "Acesso não autorizado.");
        }

        const available = candidates(freshSession);
        if (!available.length) {
          throw new Error(freshSession.cacheError || "O catálogo seguro ainda não está pronto.");
        }

        let lastError: unknown = null;
        const syncAttemptId = `catalog-sync:${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
        for (const [index, candidate] of available.entries()) {
          try {
            const data = await loadCatalog(candidate.cacheParts, controller.signal);
            if (controller.signal.aborted) return;
            activePlaylistId.current = candidate.id;
            const usingBackup = index > 0 || candidate.role === "backup";
            setState({
              status: "ready",
              data,
              message: usingBackup ? "Lista principal indisponível. Catálogo substituído pela lista reserva." : null,
              activePlaylistId: candidate.id,
              activePlaylistName: candidate.name,
              usingBackupPlaylist: usingBackup,
              lastSuccessfulSync: new Date().toISOString(),
              lastFailure: usingBackup ? "O servidor selecionou a lista reserva para esta sincronização." : null,
              lastFailoverAttemptId: null,
              lastFailoverOutcome: null
            });
            void saveCatalogSnapshot(
              freshSession.deviceCode,
              candidate.id,
              freshSession.cacheVersion,
              data
            ).catch(() => undefined);
            void reportPlaylistSuccess(candidate.id).catch(() => undefined);
            return;
          } catch (error) {
            lastError = error;
            if (controller.signal.aborted) return;
            const reason = error instanceof Error ? error.message : "Falha ao carregar a lista.";
            await reportPlaylistFailure(candidate.id, reason, {
              correlationId: syncAttemptId,
              failoverAttemptId: syncAttemptId
            }).catch(() => undefined);
          }
        }
        throw lastError || new Error("Nenhuma lista pôde ser carregada.");
      } catch (error) {
        if (!controller.signal.aborted) {
          const reason = error instanceof Error ? error.message : "Falha ao carregar o catálogo.";
          setState(current => {
            const hasValidCatalog = Boolean(
              current.data.channels.length || current.data.movies.length || current.data.series.length
            );
            return hasValidCatalog
              ? {
                  ...current,
                  status: "ready",
                  message: "Não foi possível atualizar agora. O último catálogo válido continua disponível.",
                  lastFailure: reason
                }
              : { ...initialState, status: "error", message: reason, lastFailure: reason };
          });
        }
      }
    })();

    return () => controller.abort();
  }, [attempt, renewConfiguration, session.cacheVersion, session.status]);

  const failover = useCallback(async (request: CatalogFailoverRequest): Promise<CatalogFailoverResult> => {
    const { attemptId, reason, contentKey } = request;
    if (switching.current) return {
      outcome: "busy", attemptId, reason, contentKey, fromPlaylistId: activePlaylistId.current,
      data: null, playlistId: null, playlistName: null
    };
    const failedId = activePlaylistId.current;
    if (!failedId) return {
      outcome: "no_active_playlist", attemptId, reason, contentKey, fromPlaylistId: null,
      data: null, playlistId: null, playlistName: null
    };

    switching.current = true;
    setState(current => ({
      ...current,
      message: "Lista ativa indisponível. Preparando a lista reserva...",
      lastFailoverAttemptId: attemptId,
      lastFailoverOutcome: "switching"
    }));

    try {
      await reportPlaylistFailure(failedId, reason, {
        correlationId: attemptId,
        failoverAttemptId: attemptId
      });
      const freshSession = await renewConfiguration();
      const available = candidates(freshSession);
      const currentIndex = available.findIndex(item => item.id === failedId);
      const backups = available.filter((item, index) =>
        item.id !== failedId && (currentIndex < 0 || index > currentIndex || item.role === "backup")
      );
      if (!backups.length) throw new Error("A lista ativa falhou e nenhuma lista reserva está disponível.");

      let lastError: unknown = null;
      for (const candidate of backups) {
        const controller = new AbortController();
        try {
          const data = await loadCatalog(candidate.cacheParts, controller.signal);
          activePlaylistId.current = candidate.id;
          setState({
            status: "ready",
            data,
            message: "Lista principal indisponível. Catálogo substituído pela lista reserva. Validando reprodução...",
            activePlaylistId: candidate.id,
            activePlaylistName: candidate.name,
            usingBackupPlaylist: true,
            lastSuccessfulSync: new Date().toISOString(),
            lastFailure: reason,
            lastFailoverAttemptId: attemptId,
            lastFailoverOutcome: "switched"
          });
          void saveCatalogSnapshot(
            freshSession.deviceCode,
            candidate.id,
            freshSession.cacheVersion,
            data
          ).catch(() => undefined);
          return {
            outcome: "switched" as const,
            attemptId,
            reason,
            contentKey,
            fromPlaylistId: failedId,
            data,
            playlistId: candidate.id,
            playlistName: candidate.name
          };
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error("A lista principal e a lista reserva estão indisponíveis.");
    } catch (error) {
      const failure = error instanceof Error ? error.message : "Falha ao ativar a lista reserva.";
      const outcome = /nenhuma lista reserva/i.test(failure) ? "no_backup" as const : "catalog_failed" as const;
      setState(current => ({
        ...current,
        status: current.data.channels.length || current.data.movies.length || current.data.series.length ? "ready" : "error",
        message: failure,
        lastFailure: failure,
        lastFailoverAttemptId: attemptId,
        lastFailoverOutcome: outcome
      }));
      return {
        outcome, attemptId, reason, contentKey, fromPlaylistId: failedId,
        data: null, playlistId: null, playlistName: null
      };
    } finally {
      switching.current = false;
    }
  }, [renewConfiguration]);

  return { ...state, retry, failover, confirmPlaybackStable };
}
