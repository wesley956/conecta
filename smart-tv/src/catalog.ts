import { useCallback, useEffect, useState } from "react";
import type { DeviceSession } from "./deviceSession";

export interface Channel {
  id: string; name: string; logo?: string; groupTitle?: string; url: string; playbackUrls?: string[];
}
export interface Movie {
  id: string; name: string; cover?: string; category?: string; year?: number; duration?: string;
  synopsis?: string; url: string; playbackUrls?: string[];
}
export interface Episode {
  id: string; number: number; name: string; duration?: string; url: string; playbackUrls?: string[];
}
export interface Season { number: number; episodes: Episode[]; }
export interface Series {
  id: string; name: string; cover?: string; category?: string; synopsis?: string;
  xtreamSeriesId?: string | number; seasons?: Season[];
}
export interface Catalog { channels: Channel[]; movies: Movie[]; series: Series[]; }
type CatalogState = { status: "idle" | "loading" | "ready" | "error"; data: Catalog; message: string | null; };
const emptyCatalog: Catalog = { channels: [], movies: [], series: [] };
const initialState: CatalogState = { status: "idle", data: emptyCatalog, message: null };

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("O cache retornou um formato inválido.");
  return value as Record<string, unknown>;
}
function items<T>(payload: unknown, key: string): T[] {
  const value = object(payload)[key];
  if (!Array.isArray(value)) throw new Error(`A parte ${key} do catálogo está inválida.`);
  return value as T[];
}
async function download(url: string, signal: AbortSignal) {
  const response = await fetch(url, { method: "GET", headers: { Accept: "application/json" }, cache: "no-store", redirect: "follow", signal });
  if (!response.ok) throw new Error(`Não foi possível baixar o catálogo (${response.status}).`);
  return response.json() as Promise<unknown>;
}
async function loadCatalog(session: DeviceSession, signal: AbortSignal): Promise<Catalog> {
  const urls = session.cacheParts;
  if (!urls?.channelsUrl || !urls.moviesUrl || !urls.seriesUrl) throw new Error(session.cacheError || "O catálogo seguro ainda não está pronto.");
  const [channels, movies, series] = await Promise.all([
    download(urls.channelsUrl, signal), download(urls.moviesUrl, signal), download(urls.seriesUrl, signal)
  ]);
  return { channels: items<Channel>(channels, "channels"), movies: items<Movie>(movies, "movies"), series: items<Series>(series, "series") };
}

export function useCatalog(session: DeviceSession, renewConfiguration: () => Promise<DeviceSession>) {
  const [state, setState] = useState<CatalogState>(initialState);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    if (session.status !== "active") { setState(initialState); return; }
    const controller = new AbortController();
    setState(current => ({ ...current, status: "loading", message: null }));
    void (async () => {
      try {
        const freshSession = await renewConfiguration();
        if (freshSession.status !== "active") throw new Error(freshSession.message || "Acesso não autorizado.");
        const data = await loadCatalog(freshSession, controller.signal);
        if (!controller.signal.aborted) setState({ status: "ready", data, message: null });
      } catch (error) {
        if (!controller.signal.aborted) setState({
          status: "error", data: emptyCatalog,
          message: error instanceof Error ? error.message : "Falha ao carregar o catálogo."
        });
      }
    })();
    return () => controller.abort();
  }, [attempt, renewConfiguration, session.cacheVersion, session.status]);
  return { ...state, retry };
}
