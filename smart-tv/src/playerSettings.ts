import { useCallback, useEffect, useState } from "react";

export type SmartTvBufferSeconds = 2 | 5 | 10;
export type SmartTvAspectMode = "Original" | "Preencher" | "Estender";
export type SmartTvCategoryDisplayMode = "Clássica" | "Painel lateral";

export interface SmartTvPlayerSettings {
  automaticReconnect: boolean;
  bufferSeconds: SmartTvBufferSeconds;
  launchSoundEnabled: boolean;
  aspectMode: SmartTvAspectMode;
  categoryDisplayMode: SmartTvCategoryDisplayMode;
}

const STORAGE_KEY = "roneca.smart-tv.player-settings.v1";
const SETTINGS_EVENT = "roneca:smart-tv-player-settings";
const defaults: SmartTvPlayerSettings = {
  automaticReconnect: true,
  bufferSeconds: 5,
  launchSoundEnabled: true,
  aspectMode: "Original",
  categoryDisplayMode: "Clássica"
};

function normalizeAspect(value: unknown): SmartTvAspectMode {
  if (value === "Preencher" || value === "Estender") return value;
  return "Original";
}

function normalize(value: unknown): SmartTvPlayerSettings {
  if (!value || typeof value !== "object") return defaults;
  const raw = value as Partial<SmartTvPlayerSettings>;
  const bufferSeconds = raw.bufferSeconds === 2 || raw.bufferSeconds === 10 ? raw.bufferSeconds : 5;
  return {
    automaticReconnect: raw.automaticReconnect !== false,
    bufferSeconds,
    launchSoundEnabled: raw.launchSoundEnabled !== false,
    aspectMode: normalizeAspect(raw.aspectMode),
    categoryDisplayMode: raw.categoryDisplayMode === "Painel lateral" ? "Painel lateral" : "Clássica"
  };
}

export function readSmartTvPlayerSettings(): SmartTvPlayerSettings {
  try { return normalize(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null")); }
  catch { return defaults; }
}

function write(settings: SmartTvPlayerSettings) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }
  catch { /* a sessão atual continua usando a preferência */ }
}

function broadcast(settings: SmartTvPlayerSettings) {
  try { window.dispatchEvent(new CustomEvent<SmartTvPlayerSettings>(SETTINGS_EVENT, { detail: settings })); }
  catch { /* webOS legado pode não expor CustomEvent completo */ }
}

export function readAspectModePreference(): SmartTvAspectMode {
  return readSmartTvPlayerSettings().aspectMode;
}

export function setAspectModePreference(aspectMode: SmartTvAspectMode) {
  const next = normalize({ ...readSmartTvPlayerSettings(), aspectMode });
  write(next);
  broadcast(next);
  return next.aspectMode;
}

export function useSmartTvPlayerSettings() {
  const [settings, setSettingsState] = useState<SmartTvPlayerSettings>(readSmartTvPlayerSettings);

  useEffect(() => {
    const onSettings = (event: Event) => {
      const detail = (event as CustomEvent<SmartTvPlayerSettings>).detail;
      setSettingsState(normalize(detail || readSmartTvPlayerSettings()));
    };
    window.addEventListener(SETTINGS_EVENT, onSettings);
    return () => window.removeEventListener(SETTINGS_EVENT, onSettings);
  }, []);

  const setSettings = useCallback((next: SmartTvPlayerSettings) => {
    const normalized = normalize(next);
    setSettingsState(normalized);
    write(normalized);
    broadcast(normalized);
  }, []);
  const update = useCallback((patch: Partial<SmartTvPlayerSettings>) => {
    setSettingsState(current => {
      const next = normalize({ ...current, ...patch });
      write(next);
      broadcast(next);
      return next;
    });
  }, []);
  return { settings, setSettings, update, reset: () => setSettings(defaults) };
}
