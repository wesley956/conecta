import { useCallback, useState } from "react";

export type SmartTvBufferSeconds = 2 | 5 | 10;
export type SmartTvAspectMode = "Original" | "Preencher" | "Estender";

export interface SmartTvPlayerSettings {
  automaticReconnect: boolean;
  bufferSeconds: SmartTvBufferSeconds;
  launchSoundEnabled: boolean;
  aspectMode: SmartTvAspectMode;
}

const STORAGE_KEY = "roneca.smart-tv.player-settings.v1";
const defaults: SmartTvPlayerSettings = {
  automaticReconnect: true,
  bufferSeconds: 5,
  launchSoundEnabled: true,
  aspectMode: "Original"
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
    aspectMode: normalizeAspect(raw.aspectMode)
  };
}

function read(): SmartTvPlayerSettings {
  try { return normalize(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null")); }
  catch { return defaults; }
}

function write(settings: SmartTvPlayerSettings) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }
  catch { /* a sessão atual continua usando a preferência */ }
}

export function useSmartTvPlayerSettings() {
  const [settings, setSettingsState] = useState<SmartTvPlayerSettings>(read);
  const setSettings = useCallback((next: SmartTvPlayerSettings) => {
    const normalized = normalize(next);
    setSettingsState(normalized);
    write(normalized);
  }, []);
  const update = useCallback((patch: Partial<SmartTvPlayerSettings>) => {
    setSettingsState(current => {
      const next = normalize({ ...current, ...patch });
      write(next);
      return next;
    });
  }, []);
  return { settings, setSettings, update, reset: () => setSettings(defaults) };
}
