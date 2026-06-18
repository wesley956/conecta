export interface DevicePanelConfig {
  active: boolean;
  status?: 'pending' | 'active' | 'blocked' | 'expired' | 'inactive';
  deviceCode: string;
  clientName?: string | null;
  playlistName?: string | null;
  playlistUrl?: string | null;
  playlistType?: 'm3u' | 'xtream' | string;
  playlistUpdatedAt?: string | null;
  expiresAt?: string | null;
  message?: string | null;
}

const DEVICE_UUID_STORAGE_KEY = 'ronecaplaytv-device-uuid';

export function isDevicePanelEnabled() {
  const enabled = String(import.meta.env.VITE_ENABLE_DEVICE_PANEL ?? '').toLowerCase() === 'true';
  const url = String(import.meta.env.VITE_DEVICE_CONFIG_URL ?? '').trim();

  return enabled && /^https?:\/\//i.test(url);
}

export function getDevicePanelUrl() {
  return String(import.meta.env.VITE_DEVICE_CONFIG_URL ?? '').trim();
}

export function getOrCreateDeviceUuid() {
  try {
    const existing = localStorage.getItem(DEVICE_UUID_STORAGE_KEY);

    if (existing) return existing;

    const uuid = crypto.randomUUID
      ? crypto.randomUUID()
      : `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    localStorage.setItem(DEVICE_UUID_STORAGE_KEY, uuid);

    return uuid;
  } catch {
    return `device-${Date.now()}`;
  }
}

export async function fetchDevicePanelConfig(deviceCode: string): Promise<DevicePanelConfig> {
  const baseUrl = getDevicePanelUrl();

  if (!baseUrl) {
    throw new Error('Endpoint do painel não configurado.');
  }

  const url = new URL(baseUrl);
  url.searchParams.set('code', deviceCode);
  url.searchParams.set('deviceUuid', getOrCreateDeviceUuid());

  const response = await fetch(url.toString(), {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Painel respondeu HTTP ${response.status}.`);
  }

  return await response.json() as DevicePanelConfig;
}
