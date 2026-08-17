const FUNCTIONS_URL = "https://awauvkjkucjqulkklmuo.supabase.co/functions/v1";
const STORAGE_PREFIX = "roneca.smart-tv.";

export interface SyncedFavorite {
  contentKey: string;
  contentType: "channel" | "movie" | "series";
  version: number;
  updatedAt: string;
}
export interface SyncedProgress {
  contentKey: string;
  contentType: "movie" | "episode";
  positionMs: number;
  durationMs: number;
  version: number;
  updatedAt: string;
}
export interface SyncedLibrarySnapshot {
  favorites: SyncedFavorite[];
  progress: SyncedProgress[];
  preferences: {
    aspectMode?: "contain" | "cover" | "fill" | null;
    language?: string | null;
    subtitleLanguage?: string | null;
  } | null;
}

function readStored(name: string) {
  try { return window.localStorage.getItem(`${STORAGE_PREFIX}${name}`); }
  catch { return null; }
}

function identityPayload() {
  const deviceCode = readStored("deviceCode");
  const deviceUuid = readStored("deviceUuid");
  const credential = readStored("deviceCredential");
  if (!deviceCode || !deviceUuid || !credential) return null;
  return { deviceCode, deviceUuid, credential };
}

async function invoke(payload: Record<string, unknown>) {
  const identity = identityPayload();
  if (!identity) throw new Error("A identidade do aparelho ainda não está disponível.");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${FUNCTIONS_URL}/device-library`, {
      method: "POST",
      cache: "no-store",
      redirect: "error",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json; charset=utf-8",
        "x-device-credential": identity.credential
      },
      body: JSON.stringify({ ...payload, deviceCode: identity.deviceCode, deviceUuid: identity.deviceUuid }),
      signal: controller.signal
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.ok === false) throw new Error(String(body?.code || body?.message || "Falha de sincronização."));
    return body;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function fetchSyncedLibrary(): Promise<SyncedLibrarySnapshot> {
  const body = await invoke({ action: "get" });
  return {
    favorites: Array.isArray(body.favorites) ? body.favorites : [],
    progress: Array.isArray(body.progress) ? body.progress : [],
    preferences: body.preferences && typeof body.preferences === "object" ? body.preferences : null
  };
}

export async function syncFavorite(
  contentKey: string,
  contentType: "channel" | "movie" | "series",
  active: boolean
) {
  return invoke({ action: "favorite", contentKey, contentType, active });
}

export async function syncProgress(
  contentKey: string,
  contentType: "movie" | "episode",
  positionSeconds: number,
  durationSeconds: number
) {
  return invoke({
    action: "progress",
    contentKey,
    contentType,
    positionMs: Math.max(0, Math.round(positionSeconds * 1000)),
    durationMs: Math.max(1, Math.round(durationSeconds * 1000))
  });
}

export async function syncPreferences(value: {
  aspectMode?: "contain" | "cover" | "fill" | null;
  language?: string | null;
  subtitleLanguage?: string | null;
}) {
  return invoke({ action: "preferences", ...value });
}
