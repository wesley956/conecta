export interface DevicePanelConfig {
  active: boolean;
  status?: 'pending' | 'active' | 'blocked' | 'expired' | 'inactive';
  deviceCode: string;
  clientName?: string | null;
  playlistName?: string | null;
  playlistUrl?: string | null;
  playlistType?: 'm3u' | 'xtream' | string;
  playlistUpdatedAt?: string | null;
  cacheStatus?: 'missing' | 'building' | 'ready' | 'error' | string | null;
  cacheVersion?: string | null;
  cacheUpdatedAt?: string | null;
  cacheItemCount?: number | null;
  cacheSizeBytes?: number | null;
  cacheError?: string | null;
  cacheSnapshotUrl?: string | null;
  expiresAt?: string | null;
  message?: string | null;
}

export interface DevicePanelActivation {
  active: boolean;
  status?: 'pending' | 'active' | 'blocked' | 'expired' | 'inactive';
  deviceCode: string;
  clientName?: string | null;
  customerName?: string | null;
  customerWhatsapp?: string | null;
  sellerLinked?: boolean;
  sellerName?: string | null;
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

export async function fetchDevicePanelConfig(deviceCode?: string, deviceUuid?: string): Promise<DevicePanelConfig> {
  const configUrl = getDevicePanelUrl();
  const code = String(deviceCode || getStoredDeviceCode()).trim();
  const uuid = String(deviceUuid || getOrCreateDeviceUuid()).trim();

  if (!configUrl) {
    return {
      active: false,
      status: 'pending',
      deviceCode: code,
      message: 'Endpoint do painel não configurado no APK.',
    };
  }

  if (!code) {
    return {
      active: false,
      status: 'pending',
      deviceCode: '',
      message: 'Código do aparelho vazio no APK. Feche e abra o app ou gere um novo código.',
    };
  }

  const url = new URL(configUrl);
  url.searchParams.set('code', code);
  url.searchParams.set('deviceCode', code);

  if (uuid) {
    url.searchParams.set('deviceUuid', uuid);
    url.searchParams.set('device_uuid', uuid);
  }

  const response = await fetch(url.toString(), {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      code,
      deviceCode: code,
      device_code: code,
      deviceUuid: uuid || undefined,
      device_uuid: uuid || undefined,
    }),
  });

  let payload: DevicePanelConfig | null = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const detail = payload?.message ? ` ${payload.message}` : '';
    throw new Error(`Painel respondeu HTTP ${response.status}.${detail}`);
  }

  return payload ?? {
    active: false,
    status: 'pending',
    deviceCode: code,
    message: 'Painel respondeu vazio.',
  };
}

