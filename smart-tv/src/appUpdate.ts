import { useCallback, useEffect, useState } from "react";
import { sanitizeDiagnosticText } from "./diagnosticSafety";
import { APP_VERSION } from "./deviceSession";
import { platform } from "./platform";

const RELEASE_URL = "https://awauvkjkucjqulkklmuo.supabase.co/functions/v1/app-release";
const STORAGE_PREFIX = "roneca.smart-tv.";

export interface TvAppUpdate {
  platform: "webos" | "tizen";
  versionName: string;
  versionCode: number;
  notes: string;
  mandatory: boolean;
  publishedAt: string;
}

function readStored(name: string): string | null {
  try { return window.localStorage.getItem(`${STORAGE_PREFIX}${name}`); }
  catch { return null; }
}

function versionParts(value: string): number[] {
  return value.split(".").map(part => Number.parseInt(part, 10) || 0);
}

function isNewer(candidate: string, current: string): boolean {
  const left = versionParts(candidate);
  const right = versionParts(current);
  const size = Math.max(left.length, right.length);
  for (let index = 0; index < size; index += 1) {
    const difference = (left[index] || 0) - (right[index] || 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}

async function checkLatest(): Promise<TvAppUpdate | null> {
  if (platform !== "webos" && platform !== "tizen") return null;
  const deviceCode = readStored("deviceCode");
  const deviceUuid = readStored("deviceUuid");
  const credential = readStored("deviceCredential");
  if (!deviceCode || !deviceUuid || !credential) return null;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(RELEASE_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "x-device-credential": credential
      },
      body: JSON.stringify({ action: "manifest", platform, deviceCode, deviceUuid }),
      cache: "no-store",
      redirect: "error",
      signal: controller.signal
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("Não foi possível consultar a versão Stable.");
    const release = await response.json() as TvAppUpdate;
    return release;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("A consulta da versão Stable excedeu o tempo limite.");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function useAppUpdate(enabled: boolean) {
  const [latest, setLatest] = useState<TvAppUpdate | null>(null);
  const [update, setUpdate] = useState<TvAppUpdate | null>(null);
  const [checking, setChecking] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return null;
    setChecking(true);
    setError(null);
    try {
      const release = await checkLatest();
      setLatest(release);
      const available = release && isNewer(release.versionName, APP_VERSION) ? release : null;
      setUpdate(available);
      return available;
    } catch (failure) {
      setError(sanitizeDiagnosticText(failure instanceof Error ? failure.message : failure, 220) || "Falha ao verificar atualização.");
      return null;
    } finally {
      setLastCheckedAt(new Date().toISOString());
      setChecking(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 6 * 60 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [enabled, refresh]);

  return {
    latest,
    update,
    checking,
    lastCheckedAt,
    error,
    refresh,
    dismiss: () => setUpdate(null)
  };
}
