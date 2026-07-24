import { useCallback, useEffect, useState } from "react";
import { platform } from "./platform";

const FUNCTIONS_URL = "https://awauvkjkucjqulkklmuo.supabase.co/functions/v1";
const APP_VERSION = "0.3.0";
const STORAGE_PREFIX = "roneca.smart-tv.";

export type DeviceAccessStatus = "loading" | "pending" | "active" | "blocked" | "expired" | "error";

export interface CacheParts {
  manifestUrl?: string | null;
  channelsUrl?: string | null;
  moviesUrl?: string | null;
  seriesUrl?: string | null;
}

export interface DeviceSession {
  status: DeviceAccessStatus;
  deviceCode: string | null;
  clientName: string | null;
  expiresAt: string | null;
  playlistName: string | null;
  selectedPlaylistId: string | null;
  cacheVersion: string | null;
  cacheItemCount: number;
  cacheError: string | null;
  cacheParts: CacheParts | null;
  message: string | null;
  refreshing: boolean;
}

interface DeviceResponse {
  active?: boolean;
  status?: string;
  deviceCode?: string;
  deviceCredential?: string;
  clientName?: string;
  expiresAt?: string;
  playlistName?: string;
  selectedPlaylistId?: string;
  cacheVersion?: string;
  cacheItemCount?: number;
  cacheError?: string;
  cacheParts?: CacheParts;
  message?: string;
}

const initialSession: DeviceSession = {
  status: "loading", deviceCode: null, clientName: null, expiresAt: null,
  playlistName: null, selectedPlaylistId: null, cacheVersion: null,
  cacheItemCount: 0, cacheError: null, cacheParts: null, message: null, refreshing: false
};

function storageKey(name: string) { return `${STORAGE_PREFIX}${name}`; }
function readStored(name: string) {
  try { return window.localStorage.getItem(storageKey(name)); } catch { return null; }
}
function writeStored(name: string, value: string) {
  try { window.localStorage.setItem(storageKey(name), value); }
  catch { throw new Error("A TV não permitiu salvar a identidade segura do aplicativo."); }
}
function removeStored(name: string) {
  try { window.localStorage.removeItem(storageKey(name)); } catch { /* substituído na próxima ativação */ }
}
function randomDeviceId() {
  const bytes = new Uint8Array(20);
  window.crypto.getRandomValues(bytes);
  return `roneca-${platform}-${Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("")}`;
}
function getOrCreateDeviceUuid() {
  const existing = readStored("deviceUuid");
  if (existing) return existing;
  const created = randomDeviceId();
  writeStored("deviceUuid", created);
  return created;
}

async function post(endpoint: "device-activate" | "device-config", payload: Record<string, unknown>, credential?: string) {
  const headers: Record<string, string> = {
    Accept: "application/json", "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store"
  };
  if (credential) headers["x-device-credential"] = credential;
  const response = await fetch(`${FUNCTIONS_URL}/${endpoint}`, {
    method: "POST", headers, body: JSON.stringify(payload), redirect: "error", cache: "no-store"
  });
  const body = (await response.json()) as DeviceResponse;
  return { response, body };
}

function mapResponse(httpStatus: number, body: DeviceResponse): DeviceSession {
  let status = String(body.status || "pending").toLowerCase() as DeviceAccessStatus;
  if (body.active && status === "active") status = "active";
  else if (httpStatus >= 500) status = "error";
  else if (!["pending", "active", "blocked", "expired"].includes(status)) status = httpStatus >= 400 ? "blocked" : "pending";
  return {
    status,
    deviceCode: body.deviceCode || readStored("deviceCode"),
    clientName: body.clientName || null,
    expiresAt: body.expiresAt || null,
    playlistName: body.playlistName || null,
    selectedPlaylistId: body.selectedPlaylistId || null,
    cacheVersion: body.cacheVersion || null,
    cacheItemCount: Number(body.cacheItemCount || 0),
    cacheError: body.cacheError || null,
    cacheParts: body.cacheParts || null,
    message: body.message || null,
    refreshing: false
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
  const deviceCode = readStored("deviceCode");
  const credential = readStored("deviceCredential");
  if (!deviceCode || !credential) return activate();
  const { response, body } = await post("device-config", { deviceCode, deviceUuid: getOrCreateDeviceUuid() }, credential);
  if (body.deviceCode && body.deviceCode !== deviceCode) writeStored("deviceCode", body.deviceCode);
  return mapResponse(response.status, body);
}

async function loadSession() {
  try {
    return readStored("deviceCode") && readStored("deviceCredential") ? await fetchConfiguration() : await activate();
  } catch (error) {
    return { ...initialSession, status: "error" as const, message: error instanceof Error ? error.message : "Falha ao conectar com o painel." };
  }
}

export function useDeviceSession() {
  const [session, setSession] = useState<DeviceSession>(initialSession);
  const refresh = useCallback(async () => {
    setSession(current => ({ ...current, refreshing: true }));
    const next = await loadSession();
    setSession(next);
    return next;
  }, []);
  const renewConfiguration = useCallback(async () => {
    const next = await fetchConfiguration();
    setSession(next);
    return next;
  }, []);
  const reset = useCallback(async () => {
    removeStored("deviceCode"); removeStored("deviceCredential"); removeStored("deviceUuid");
    setSession(initialSession);
    const next = await loadSession();
    setSession(next);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (session.status !== "pending") return;
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, [refresh, session.status]);
  return { session, refresh, renewConfiguration, reset };
}
