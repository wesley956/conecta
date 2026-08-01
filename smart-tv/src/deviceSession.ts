import { useCallback, useEffect, useState } from "react";
import { platform } from "./platform";

const FUNCTIONS_URL = "https://awauvkjkucjqulkklmuo.supabase.co/functions/v1";
export const APP_VERSION = "1.0.0";
const STORAGE_PREFIX = "roneca.smart-tv.";
export type DeviceAccessStatus = "loading" | "pending" | "active" | "blocked" | "expired" | "error";
export interface CacheParts { manifestUrl?: string | null; channelsUrl?: string | null; moviesUrl?: string | null; seriesUrl?: string | null; }
export interface DevicePlaylist {
  id: string; name: string; priority: number; role: "primary" | "backup"; cacheParts: CacheParts | null;
}
export interface DeviceSession {
  status: DeviceAccessStatus; deviceCode: string | null; clientName: string | null; expiresAt: string | null;
  playlistName: string | null; selectedPlaylistId: string | null; cacheVersion: string | null;
  cacheItemCount: number; cacheError: string | null; cacheParts: CacheParts | null; playlists: DevicePlaylist[];
  message: string | null; refreshing: boolean;
}
interface DeviceResponse {
  active?: boolean; status?: string; deviceCode?: string; deviceCredential?: string; clientName?: string;
  expiresAt?: string; playlistName?: string; selectedPlaylistId?: string; cacheVersion?: string;
  cacheItemCount?: number; cacheError?: string; cacheParts?: CacheParts; playlists?: unknown; message?: string;
}
export interface PlaybackDiagnosticReport {
  clientEventId: string;
  correlationId?: string;
  failoverAttemptId?: string;
  playlistId?: string | null;
  contentType: "channel" | "movie" | "series" | "episode" | "unknown";
  contentTitle?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  positionMs?: number;
  durationMs?: number;
  errorCode?: string;
  errorMessage: string;
  severity?: "low" | "medium" | "high" | "critical";
  probableSource?: "content" | "network" | "playlist" | "app" | "device" | "unknown";
  recoveryAction?: string;
  recovered: boolean;
  playerExited?: boolean;
  backupAvailable?: boolean;
  retryCount?: number;
  occurredAt?: string;
}
const initialSession: DeviceSession = {
  status: "loading", deviceCode: null, clientName: null, expiresAt: null, playlistName: null,
  selectedPlaylistId: null, cacheVersion: null, cacheItemCount: 0, cacheError: null,
  cacheParts: null, playlists: [], message: null, refreshing: false
};
function storageKey(name: string) { return `${STORAGE_PREFIX}${name}`; }
function readStored(name: string) { try { return window.localStorage.getItem(storageKey(name)); } catch { return null; } }
function writeStored(name: string, value: string) {
  try { window.localStorage.setItem(storageKey(name), value); }
  catch { throw new Error("A TV não permitiu salvar a identidade segura do aplicativo."); }
}
function removeStored(name: string) { try { window.localStorage.removeItem(storageKey(name)); } catch { /* próxima ativação substitui */ } }
function randomDeviceId() {
  const bytes = new Uint8Array(20); window.crypto.getRandomValues(bytes);
  return `roneca-${platform}-${Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("")}`;
}
function getOrCreateDeviceUuid() {
  const existing = readStored("deviceUuid"); if (existing) return existing;
  const created = randomDeviceId(); writeStored("deviceUuid", created); return created;
}
async function post(endpoint: "device-activate" | "device-config" | "series-detail" | "channel-epg" | "playback-diagnostics-report", payload: Record<string, unknown>, credential?: string) {
  const headers: Record<string, string> = { Accept: "application/json", "Content-Type": "application/json; charset=utf-8" };
  if (credential) headers["x-device-credential"] = credential;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${FUNCTIONS_URL}/${endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      redirect: "error",
      cache: "no-store",
      signal: controller.signal
    });
    let body: DeviceResponse = {};
    try { body = await response.json() as DeviceResponse; }
    catch { body = { message: "O servidor retornou uma resposta inválida." }; }
    return { response, body };
  } catch (error) {
    if (controller.signal.aborted) throw new Error("O servidor demorou demais para responder.");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
function validPlaylists(value: unknown): DevicePlaylist[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const id = String(item.id || "").trim();
    const cacheParts = item.cacheParts && typeof item.cacheParts === "object"
      ? item.cacheParts as CacheParts
      : null;
    if (!id || !cacheParts) return [];
    const priority = Math.max(1, Number(item.priority || index + 1));
    return [{
      id,
      name: String(item.name || ("Lista " + (index + 1))),
      priority,
      role: String(item.role || (priority === 1 ? "primary" : "backup")) === "backup" ? "backup" as const : "primary" as const,
      cacheParts
    }];
  }).sort((left, right) => left.priority - right.priority);
}
function mapResponse(httpStatus: number, body: DeviceResponse): DeviceSession {
  let status = String(body.status || "pending").toLowerCase() as DeviceAccessStatus;
  if (body.active && status === "active") status = "active";
  else if (httpStatus >= 500) status = "error";
  else if (!["pending", "active", "blocked", "expired"].includes(status)) status = httpStatus >= 400 ? "blocked" : "pending";
  return {
    status, deviceCode: body.deviceCode || readStored("deviceCode"), clientName: body.clientName || null,
    expiresAt: body.expiresAt || null, playlistName: body.playlistName || null,
    selectedPlaylistId: body.selectedPlaylistId || null, cacheVersion: body.cacheVersion || null,
    cacheItemCount: Number(body.cacheItemCount || 0), cacheError: body.cacheError || null,
    cacheParts: body.cacheParts || null, playlists: validPlaylists(body.playlists),
    message: body.message || null, refreshing: false
  };
}
async function activate(): Promise<DeviceSession> {
  const deviceUuid = getOrCreateDeviceUuid();
  const { response, body } = await post("device-activate", {
    deviceUuid, deviceType: platform === "browser" ? "smart-tv-preview" : platform, appVersion: APP_VERSION
  });
  if (body.deviceCode) writeStored("deviceCode", body.deviceCode);
  if (body.deviceCredential) writeStored("deviceCredential", body.deviceCredential);
  if (body.active && readStored("deviceCode") && readStored("deviceCredential")) return fetchConfiguration();
  return mapResponse(response.status, body);
}
export async function fetchConfiguration(): Promise<DeviceSession> {
  const deviceCode = readStored("deviceCode"); const credential = readStored("deviceCredential");
  if (!deviceCode || !credential) return activate();
  const { response, body } = await post("device-config", { deviceCode, deviceUuid: getOrCreateDeviceUuid() }, credential);
  if (body.deviceCode && body.deviceCode !== deviceCode) writeStored("deviceCode", body.deviceCode);
  return mapResponse(response.status, body);
}
interface PlaylistHealthContext {
  correlationId?: string;
  failoverAttemptId?: string;
}

async function reportPlaylistHealth(
  playlistId: string,
  status: "success" | "failure",
  error?: string,
  context: PlaylistHealthContext = {}
): Promise<void> {
  const deviceCode = readStored("deviceCode");
  const credential = readStored("deviceCredential");
  if (!deviceCode || !credential || !playlistId) return;
  await post("device-config", {
    deviceCode,
    deviceUuid: getOrCreateDeviceUuid(),
    playlistHealth: {
      playlistId,
      status,
      ...(error ? { error: error.slice(0, 500) } : {}),
      ...(context.correlationId ? { correlationId: context.correlationId } : {}),
      ...(context.failoverAttemptId ? { failoverAttemptId: context.failoverAttemptId } : {})
    }
  }, credential);
}
export async function reportPlaylistFailure(
  playlistId: string,
  error: string,
  context: PlaylistHealthContext = {}
): Promise<void> {
  await reportPlaylistHealth(playlistId, "failure", error, context);
}
export async function reportPlaylistSuccess(playlistId: string): Promise<void> {
  await reportPlaylistHealth(playlistId, "success");
}
export async function reportPlaybackDiagnostic(report: PlaybackDiagnosticReport): Promise<void> {
  const deviceCode = readStored("deviceCode");
  const credential = readStored("deviceCredential");
  if (!deviceCode || !credential || !report.clientEventId) return;
  const { response } = await post("playback-diagnostics-report", {
    ...report,
    deviceCode,
    deviceUuid: getOrCreateDeviceUuid(),
    platform: platform === "browser" ? "smart-tv-preview" : platform,
    appVersion: APP_VERSION
  }, credential);
  if (!response.ok) throw new Error("Não foi possível registrar o diagnóstico.");
}

export interface SeriesEpisodeResponse {
  id: string; number: number; name: string; duration?: string; url: string; playbackUrls?: string[];
}
export interface SeriesSeasonResponse { number: number; episodes: SeriesEpisodeResponse[]; }
export interface ChannelEpgProgram {
  title: string;
  description?: string;
  start: string;
  end: string;
}
function validSeasons(value: unknown): SeriesSeasonResponse[] {
  if (!Array.isArray(value)) throw new Error("O servidor retornou temporadas inválidas.");
  return value.flatMap((season, seasonIndex) => {
    if (!season || typeof season !== "object") return [];
    const raw = season as Record<string, unknown>;
    const number = Number(raw.number);
    if (!Number.isFinite(number) || !Array.isArray(raw.episodes)) return [];
    const episodes = raw.episodes.flatMap((episode, episodeIndex) => {
      if (!episode || typeof episode !== "object") return [];
      const item = episode as Record<string, unknown>;
      const id = String(item.id || "");
      const url = String(item.url || "");
      if (!id || !/^https?:\/\//i.test(url)) return [];
      const episodeNumber = Number(item.number);
      return [{
        id,
        number: Number.isFinite(episodeNumber) ? episodeNumber : episodeIndex + 1,
        name: String(item.name || `Episódio ${episodeIndex + 1}`),
        duration: item.duration == null ? undefined : String(item.duration),
        url,
        playbackUrls: Array.isArray(item.playbackUrls)
          ? item.playbackUrls.filter(value => typeof value === "string" && /^https?:\/\//i.test(value))
          : [url]
      }];
    });
    return episodes.length ? [{ number: number || seasonIndex + 1, episodes }] : [];
  }).sort((left, right) => left.number - right.number);
}
export async function fetchSeriesSeasons(seriesId: string, playlistId?: string | null): Promise<SeriesSeasonResponse[]> {
  const deviceCode = readStored("deviceCode");
  const deviceCredential = readStored("deviceCredential");
  if (!deviceCode || !deviceCredential) throw new Error("A identidade do aparelho não está disponível.");
  if (!/^\d{1,20}$/.test(seriesId)) throw new Error("Esta série não possui um identificador válido.");
  const { response, body } = await post("series-detail", {
    deviceCode,
    deviceUuid: getOrCreateDeviceUuid(),
    seriesId,
    ...(playlistId ? { playlistId } : {})
  }, deviceCredential);
  const payload = body as DeviceResponse & { seasons?: unknown };
  if (!response.ok) throw new Error(payload.message || "Não foi possível carregar os episódios desta série.");
  const seasons = validSeasons(payload.seasons);
  if (!seasons.length) throw new Error("Nenhum episódio foi encontrado para esta série.");
  return seasons;
}
export async function fetchChannelEpg(channelId: string, playlistId?: string | null): Promise<ChannelEpgProgram[]> {
  const deviceCode = readStored("deviceCode");
  const deviceCredential = readStored("deviceCredential");
  if (!deviceCode || !deviceCredential) return [];
  const streamId = channelId.match(/-ch-(\d+)$/)?.[1];
  if (!streamId) return [];
  const { response, body } = await post("channel-epg", {
    deviceCode,
    deviceUuid: getOrCreateDeviceUuid(),
    streamId,
    ...(playlistId ? { playlistId } : {})
  }, deviceCredential);
  const payload = body as DeviceResponse & { programs?: unknown };
  if (!response.ok || !Array.isArray(payload.programs)) return [];
  return payload.programs.flatMap(value => {
    if (!value || typeof value !== "object") return [];
    const program = value as Record<string, unknown>;
    const title = String(program.title || "").trim();
    const start = String(program.start || "").trim();
    const end = String(program.end || "").trim();
    if (!title || !start || !end) return [];
    return [{
      title,
      description: String(program.description || "").trim() || undefined,
      start,
      end
    }];
  });
}
async function loadSession() {
  try { return readStored("deviceCode") && readStored("deviceCredential") ? await fetchConfiguration() : await activate(); }
  catch (error) { return { ...initialSession, status: "error" as const, message: error instanceof Error ? error.message : "Falha ao conectar com o painel." }; }
}
export function useDeviceSession() {
  const [session, setSession] = useState<DeviceSession>(initialSession);
  const refresh = useCallback(async () => { setSession(current => ({ ...current, refreshing: true })); const next = await loadSession(); setSession(next); return next; }, []);
  const renewConfiguration = useCallback(async () => { const next = await fetchConfiguration(); setSession(next); return next; }, []);
  const reset = useCallback(async () => {
    removeStored("deviceCode"); removeStored("deviceCredential"); removeStored("deviceUuid");
    setSession(initialSession); const next = await loadSession(); setSession(next);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (session.status !== "pending") return;
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, [refresh, session.status]);
  return { session, refresh, renewConfiguration, reset };
}
