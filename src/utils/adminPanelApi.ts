import { getDevicePanelUrl } from '@/utils/devicePanel';

const ADMIN_TOKEN_STORAGE_KEY = 'ronecaplaytv-admin-panel-token';

export type PanelDeviceStatus = 'pending' | 'active' | 'blocked' | 'expired' | 'inactive';

export type PanelDevice = {
  id: string;
  deviceCode: string;
  deviceUuid?: string | null;
  clientName?: string | null;
  status: PanelDeviceStatus;
  playlistId?: string | null;
  playlistName?: string | null;
  expiresAt?: string | null;
  lastSeenAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  deviceType: string;
  appVersion?: string | null;
  ip?: string | null;
};

export type PanelPlaylist = {
  id: string;
  name: string;
  playlistUrl: string;
  playlistType: 'm3u' | 'xtream' | 'stalker' | string;
  active: boolean;
  playlistUpdatedAt?: string | null;
  createdAt?: string | null;
};

export type UpdatePanelDevicePayload = {
  id: string;
  status?: PanelDeviceStatus;
  clientName?: string;
  playlistId?: string;
  expiresAt?: string;
};

function getAdminPanelUrl() {
  const configUrl = getDevicePanelUrl();

  if (!configUrl) {
    throw new Error('VITE_DEVICE_CONFIG_URL não configurada.');
  }

  return configUrl.replace(/\/device-config\/?$/i, '/admin-panel');
}

export function getAdminToken() {
  try {
    return localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setAdminToken(token: string) {
  try {
    localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token.trim());
  } catch {
    // ignora falha de storage
  }
}

export function clearAdminToken() {
  try {
    localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
  } catch {
    // ignora falha de storage
  }
}

async function adminRequest<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const token = getAdminToken();

  if (!token) {
    throw new Error('Informe o token de administrador.');
  }

  const response = await fetch(getAdminPanelUrl(), {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-admin-token': token,
    },
    body: JSON.stringify({ action, ...payload }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(String(data.error || `Painel respondeu HTTP ${response.status}.`));
  }

  return data as T;
}

export async function listPanelDevices() {
  const data = await adminRequest<{ devices: PanelDevice[] }>('listDevices');
  return data.devices;
}

export async function listPanelPlaylists() {
  const data = await adminRequest<{ playlists: PanelPlaylist[] }>('listPlaylists');
  return data.playlists;
}

export async function updatePanelDevice(payload: UpdatePanelDevicePayload) {
  await adminRequest<{ ok: boolean }>('updateDevice', payload);
}

export async function createPanelPlaylist(payload: {
  name: string;
  playlistUrl: string;
  playlistType: 'm3u' | 'xtream' | 'stalker';
  active: boolean;
}) {
  await adminRequest<{ ok: boolean; id?: string }>('createPlaylist', payload);
}

export async function updatePanelPlaylist(payload: {
  id: string;
  name?: string;
  playlistUrl?: string;
  playlistType?: 'm3u' | 'xtream' | 'stalker';
  active?: boolean;
}) {
  await adminRequest<{ ok: boolean }>('updatePlaylist', payload);
}

export async function deletePanelPlaylist(id: string) {
  await adminRequest<{ ok: boolean }>('deletePlaylist', { id });
}
