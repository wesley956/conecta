import { useCallback, useEffect, useRef, useState } from "react";
import { reportPlaylistFailure } from "./deviceSession";
import type { CacheParts, DevicePlaylist, DeviceSession } from "./deviceSession";

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

type CatalogState = {
  status: "idle" | "loading" | "ready" | "error";
  data: Catalog;
  message: string | null;
  activePlaylistId: string | null;
  activePlaylistName: string | null;
  usingBackupPlaylist: boolean;
};

const emptyCatalog: Catalog = { channels: [], movies: [], series: [] };
const initialState: CatalogState = {
  status: "idle",
  data: emptyCatalog,
  message: null,
  activePlaylistId: null,
  activePlaylistName: null,
  usingBackupPlaylist: false
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
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    redirect: "follow",
    signal
  });
  if (!response.ok) throw new Error(`Não foi possível baixar o catálogo (${response.status}).`);
  return response.json() as Promise<unknown>;
}

function candidates(session: DeviceSession): DevicePlaylist[] {
  const configured = session.playlists
    .filter(item => item.cacheParts)
    .sort((left, right) => left.priority - right.priority);
  if (configured.length) return configured;
  if (!session.cacheParts) return [];
  return [{
    id: session.selectedPlaylistId || "selected",
    name: session.playlistName || "Lista selecionada",
    priority: 1,
    role: "primary",
    cacheParts: session.cacheParts
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
        const freshSession = await renewConfiguration();
        if (freshSession.status !== "active") {
          throw new Error(freshSession.message || "Acesso não autorizado.");
        }

        const available = candidates(freshSession);
        if (!available.length) {
          throw new Error(freshSession.cacheError || "O catálogo seguro ainda não está pronto.");
        }

        let lastError: unknown = null;
        for (const [index, candidate] of available.entries()) {
          try {
            const data = await loadCatalog(candidate.cacheParts, controller.signal);
            if (controller.signal.aborted) return;
            activePlaylistId.current = candidate.id;
            setState({
              status: "ready",
              data,
              message: index > 0 ? "Lista principal indisponível. Catálogo substituído pela lista reserva." : null,
              activePlaylistId: candidate.id,
              activePlaylistName: candidate.name,
              usingBackupPlaylist: index > 0 || candidate.role === "backup"
            });
            return;
          } catch (error) {
            lastError = error;
          }
        }
        throw lastError || new Error("Nenhuma lista pôde ser carregada.");
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({
            ...initialState,
            status: "error",
            message: error instanceof Error ? error.message : "Falha ao carregar o catálogo."
          });
        }
      }
    })();

    return () => controller.abort();
  }, [attempt, renewConfiguration, session.cacheVersion, session.status]);

  const failover = useCallback(async (reason: string) => {
    if (switching.current) return false;
    const failedId = activePlaylistId.current;
    if (!failedId) return false;

    switching.current = true;
    setState(current => ({
      ...current,
      status: "loading",
      message: "Lista ativa indisponível. Ativando a lista reserva..."
    }));

    try {
      await reportPlaylistFailure(failedId, reason);
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
            message: "Lista principal indisponível. Catálogo substituído pela lista reserva.",
            activePlaylistId: candidate.id,
            activePlaylistName: candidate.name,
            usingBackupPlaylist: true
          });
          return true;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error("A lista principal e a lista reserva estão indisponíveis.");
    } catch (error) {
      setState(current => ({
        ...current,
        status: "error",
        message: error instanceof Error ? error.message : "Falha ao ativar a lista reserva."
      }));
      return false;
    } finally {
      switching.current = false;
    }
  }, [renewConfiguration]);

  return { ...state, retry, failover };
}
