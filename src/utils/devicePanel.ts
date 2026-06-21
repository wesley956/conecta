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

export interface DevicePanelActivation {
  active: boolean;
  status?: 'pending' | 'active' | 'blocked' | 'expired' | 'inactive';
  deviceCode: string;
  clientName?: string | null;
  expiresAt?: string | null;
  message?: string | null;
}

const DEVICE_UUID_STORAGE_KEY = 'ronecaplaytv-device-uuid';
const DEVICE_CODE_STORAGE_KEY = 'ronecaplaytv-device-code';

export function isDevicePanelEnabled() {
  const enabled = String(import.meta.env.VITE_ENABLE_DEVICE_PANEL ?? '').toLowerCase() === 'true';
  const url = String(import.meta.env.VITE_DEVICE_CONFIG_URL ?? '').trim();

  return enabled && /^https?:\/\//i.test(url);
}

export function getDevicePanelUrl() {
  return String(import.meta.env.VITE_DEVICE_CONFIG_URL ?? '').trim();
}

export function getDeviceActivationUrl() {
  const configUrl = getDevicePanelUrl();

  if (!configUrl) return '';

  return configUrl.replace(/\/device-config\/?$/i, '/device-activate');
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

export function getStoredDeviceCode() {
  try {
    return localStorage.getItem(DEVICE_CODE_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredDeviceCode(deviceCode: string) {
  try {
    localStorage.setItem(DEVICE_CODE_STORAGE_KEY, deviceCode);
  } catch {
    // ignora falha de storage
  }
}

export async function activateDeviceWithPanel(): Promise<DevicePanelActivation> {
  const baseUrl = getDeviceActivationUrl();

  if (!baseUrl) {
    throw new Error('Endpoint de ativação do painel não configurado.');
  }

  const deviceUuid = getOrCreateDeviceUuid();

  const response = await fetch(baseUrl, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      deviceUuid,
      deviceType: 'androidtv',
      appVersion: '1.0.0',
    }),
  });

  if (!response.ok) {
    throw new Error(`Painel respondeu HTTP ${response.status}.`);
  }

  const config = await response.json() as DevicePanelActivation;

  if (config.deviceCode) {
    setStoredDeviceCode(config.deviceCode);
  }

  return config;
}

export async function fetchDevicePanelConfig(deviceCode?: string): Promise<DevicePanelConfig> {
  const baseUrl = getDevicePanelUrl();

  if (!baseUrl) {
    throw new Error('Endpoint do painel não configurado.');
  }

  const code = String(deviceCode || getStoredDeviceCode()).trim();

  if (!code) {
    throw new Error('Código do aparelho não gerado.');
  }

  const url = new URL(baseUrl);
  url.searchParams.set('code', code);
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
