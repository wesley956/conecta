import { SecureStorage } from '@aparajita/capacitor-secure-storage';

export interface DevicePanelCacheParts {
  manifestUrl?: string | null;
  channelsUrl?: string | null;
  moviesUrl?: string | null;
  seriesUrl?: string | null;
}

export interface DevicePanelPlaylistConfig {
  id: string;
  priority: 1 | 2 | number;
  role: 'primary' | 'backup' | string;
  name: string;
  url?: string | null;
  type?: 'm3u' | 'xtream' | string;
  updatedAt?: string | null;
  cacheStatus?: 'missing' | 'building' | 'processing' | 'ready' | 'error' | string | null;
  cacheVersion?: string | null;
  cacheUpdatedAt?: string | null;
  cacheItemCount?: number | null;
  cacheSizeBytes?: number | null;
  cacheError?: string | null;
  cacheSnapshotUrl?: string | null;
  cacheParts?: DevicePanelCacheParts | null;
  cacheReady?: boolean;
  consecutiveFailures?: number;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  cooldownUntil?: string | null;
  lastError?: string | null;
}

export interface DevicePanelConfig {
  active: boolean;
  status?: 'pending' | 'active' | 'blocked' | 'expired' | 'inactive';
  deviceCode: string;
  clientName?: string | null;
  selectedPlaylistId?: string | null;
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
  cacheParts?: DevicePanelCacheParts | null;
  playlists?: DevicePanelPlaylistConfig[];
  expiresAt?: string | null;
  credentialRequired?: boolean;
  directPlaylistFallbackAllowed?: boolean;
  message?: string | null;
}

export interface DevicePanelActivation {
  active: boolean;
  status?: 'pending' | 'active' | 'blocked' | 'expired' | 'inactive';
  deviceCode: string;
  deviceCredential?: string | null;
  credentialIssued?: boolean;
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
const DEVICE_CREDENTIAL_STORAGE_KEY = 'ronecaplaytv-device-credential-v1';

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
    // O código continuará disponível na store durante a sessão atual.
  }
}

export async function getStoredDeviceCredential() {
  try {
    return (await SecureStorage.getItem(DEVICE_CREDENTIAL_STORAGE_KEY))?.trim() || '';
  } catch {
    return '';
  }
}

export async function setStoredDeviceCredential(deviceCredential: string) {
  const credential = deviceCredential.trim();
  if (!credential) return;

  try {
    await SecureStorage.setItem(DEVICE_CREDENTIAL_STORAGE_KEY, credential);
  } catch {
    throw new Error(
      'Não foi possível salvar a credencial segura deste aparelho. Verifique o armazenamento do aplicativo.',
    );
  }
}

export async function clearStoredDeviceCredential() {
  try {
    await SecureStorage.removeItem(DEVICE_CREDENTIAL_STORAGE_KEY);
  } catch {
    // O backend continuará rejeitando credenciais revogadas.
  }
}

async function readJsonResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  let payload: T | null = null;

  try {
    payload = await response.json() as T;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'message' in payload
      ? String((payload as { message?: unknown }).message || fallbackMessage)
      : fallbackMessage;

    throw new Error(`${message} (HTTP ${response.status})`);
  }

  if (!payload) {
    throw new Error('O painel respondeu sem dados válidos.');
  }

  return payload;
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

  const activation = await readJsonResponse<DevicePanelActivation>(
    response,
    'Falha ao gerar ou consultar o código do aparelho.',
  );

  if (activation.deviceCode) {
    setStoredDeviceCode(activation.deviceCode);
  }

  if (activation.deviceCredential) {
    await setStoredDeviceCredential(activation.deviceCredential);
  }

  return {
    ...activation,
    // O segredo já foi persistido. Não o propaga para componentes ou logs.
    deviceCredential: undefined,
  };
}

export async function fetchDevicePanelConfig(
  deviceCode?: string,
  deviceUuid?: string,
): Promise<DevicePanelConfig> {
  const configUrl = getDevicePanelUrl();
  let code = String(deviceCode || getStoredDeviceCode()).trim();
  const uuid = String(deviceUuid || getOrCreateDeviceUuid()).trim();
  let deviceCredential = await getStoredDeviceCredential();

  if (!configUrl) {
    return {
      active: false,
      status: 'pending',
      deviceCode: code,
      message: 'Endpoint do painel não configurado no APK.',
    };
  }

  if (!deviceCredential) {
    try {
      await activateDeviceWithPanel();
      code = String(getStoredDeviceCode()).trim();
      deviceCredential = await getStoredDeviceCredential();
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Não foi possível emitir a credencial segura deste aparelho.';

      return {
        active: false,
        status: 'blocked',
        deviceCode: code,
        credentialRequired: true,
        message,
      };
    }
  }

  if (!code) {
    return {
      active: false,
      status: 'pending',
      deviceCode: '',
      message: 'Código do aparelho vazio no APK. Feche e abra o app ou gere um novo código.',
    };
  }

  if (!deviceCredential) {
    return {
      active: false,
      status: 'blocked',
      deviceCode: code,
      credentialRequired: true,
      message: 'Credencial segura ausente. Atualize a ativação para emitir uma nova credencial.',
    };
  }

  const response = await fetch(configUrl, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Device-Credential': deviceCredential,
    },
    body: JSON.stringify({
      code,
      deviceCode: code,
      deviceUuid: uuid,
    }),
  });

  return await readJsonResponse<DevicePanelConfig>(
    response,
    'Falha ao validar este aparelho no painel.',
  );
}

export async function reportDevicePlaylistHealth(
  playlistId: string,
  status: 'success' | 'failure',
  error?: string,
) {
  const configUrl = getDevicePanelUrl();
  const code = String(getStoredDeviceCode()).trim();
  const deviceUuid = String(getOrCreateDeviceUuid()).trim();
  const deviceCredential = await getStoredDeviceCredential();

  if (!configUrl || !code || !deviceUuid || !deviceCredential || !playlistId) return;

  await fetch(configUrl, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Device-Credential': deviceCredential,
    },
    body: JSON.stringify({
      code,
      deviceCode: code,
      deviceUuid,
      playlistHealth: {
        playlistId,
        status,
        error: error ? error.slice(0, 500) : undefined,
      },
    }),
  }).catch(() => undefined);
}
