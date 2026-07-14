import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-credential',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

async function readPayload(request: Request): Promise<Record<string, unknown>> {
  try {
    const payload = await request.json();
    return payload && typeof payload === 'object'
      ? payload as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function textOrNull(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

function readDeviceCredential(request: Request, payload: Record<string, unknown>) {
  const explicitHeader = textOrNull(request.headers.get('x-device-credential'));
  if (explicitHeader) return explicitHeader;

  const authorization = textOrNull(request.headers.get('authorization'));
  const authorizationMatch = authorization?.match(/^Device\s+(.+)$/i);
  if (authorizationMatch?.[1]) return authorizationMatch[1].trim();

  return (
    textOrNull(payload.deviceCredential) ||
    textOrNull(payload.device_credential)
  );
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );

  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return difference === 0;
}

function allowDirectPlaylistFallback() {
  return /^(1|true|yes|sim)$/i.test(
    String(Deno.env.get('ALLOW_DIRECT_PLAYLIST_FALLBACK') || ''),
  );
}

serve(async request => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return json({ active: false, message: 'Método não permitido.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ active: false, message: 'Servidor não configurado.' }, 500);
  }

  const payload = await readPayload(request);
  const code =
    textOrNull(payload.deviceCode) ||
    textOrNull(payload.device_code) ||
    textOrNull(payload.code) ||
    textOrNull(payload.deviceId) ||
    textOrNull(payload.device_id);
  const deviceUuid =
    textOrNull(payload.deviceUuid) ||
    textOrNull(payload.device_uuid);
  const deviceCredential = readDeviceCredential(request, payload);

  if (!code) {
    return json({
      active: false,
      status: 'pending',
      message: 'Código do aparelho não informado.',
    }, 400);
  }

  if (!deviceUuid) {
    return json({
      active: false,
      status: 'blocked',
      deviceCode: code,
      message: 'Identificador seguro do aparelho não informado.',
    }, 400);
  }

  if (!deviceCredential) {
    return json({
      active: false,
      status: 'blocked',
      deviceCode: code,
      credentialRequired: true,
      message: 'Credencial da instalação não informada. Gere um novo código no aplicativo.',
    }, 401);
  }

  if (code.length > 80 || deviceUuid.length > 160 || deviceCredential.length > 256) {
    return json({
      active: false,
      status: 'blocked',
      deviceCode: code,
      message: 'Identificação do aparelho inválida.',
    }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: device, error } = await supabase
    .from('panel_devices')
    .select(`
      id,
      device_code,
      device_uuid,
      device_credential_hash,
      client_name,
      status,
      subscription_expires_at,
      playlist:panel_playlists (
        id,
        name,
        playlist_url,
        playlist_type,
        active,
        playlist_updated_at,
        playlist_cache_status,
        playlist_cache_path,
        playlist_cache_manifest_path,
        playlist_cache_channels_path,
        playlist_cache_movies_path,
        playlist_cache_series_path,
        playlist_cache_version,
        playlist_cache_updated_at,
        playlist_cache_item_count,
        playlist_cache_size_bytes,
        playlist_cache_error
      )
    `)
    .eq('device_code', code)
    .maybeSingle();

  if (error) {
    return json({ active: false, status: 'pending', message: error.message }, 500);
  }

  if (!device) {
    return json({
      active: false,
      status: 'pending',
      deviceCode: code,
      message: 'Aparelho aguardando cadastro no painel.',
    });
  }

  if (!device.device_credential_hash) {
    return json({
      active: false,
      status: 'blocked',
      deviceCode: device.device_code,
      credentialRequired: true,
      message: 'Este aparelho ainda não possui credencial segura. Atualize a ativação no aplicativo.',
    }, 428);
  }

  const providedCredentialHash = await sha256Hex(deviceCredential);

  if (!constantTimeEqual(providedCredentialHash, device.device_credential_hash)) {
    return json({
      active: false,
      status: 'blocked',
      deviceCode: device.device_code,
      message: 'Credencial da instalação inválida ou revogada.',
    }, 403);
  }

  if (!device.device_uuid || device.device_uuid !== deviceUuid) {
    return json({
      active: false,
      status: 'blocked',
      deviceCode: device.device_code,
      message: 'Este código e credencial pertencem a outro aparelho.',
    }, 403);
  }

  const { data: updatedDevice, error: updateError } = await supabase
    .from('panel_devices')
    .update({
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', device.id)
    .eq('device_uuid', deviceUuid)
    .eq('device_credential_hash', device.device_credential_hash)
    .select('id')
    .maybeSingle();

  if (updateError || !updatedDevice) {
    return json({
      active: false,
      status: 'blocked',
      deviceCode: device.device_code,
      message: 'Não foi possível confirmar a identidade deste aparelho.',
    }, 409);
  }

  const expiresAt = device.subscription_expires_at;
  const expired = expiresAt ? new Date(expiresAt).getTime() <= Date.now() : false;
  const playlist = Array.isArray(device.playlist) ? device.playlist[0] : device.playlist;

  if (device.status !== 'active' || expired) {
    return json({
      active: false,
      status: expired ? 'expired' : device.status,
      deviceCode: device.device_code,
      clientName: device.client_name,
      expiresAt,
      message: expired ? 'Assinatura expirada.' : 'Aparelho não ativo.',
    });
  }

  if (!playlist || !playlist.active) {
    return json({
      active: true,
      status: 'active',
      deviceCode: device.device_code,
      clientName: device.client_name,
      expiresAt,
      message: 'Aparelho ativo, mas sem lista ativa vinculada.',
    });
  }

  async function signedCacheUrl(path: string | null | undefined) {
    if (!path) return null;

    const { data, error: signedUrlError } = await supabase.storage
      .from('playlist-cache')
      .createSignedUrl(path, 15 * 60);

    if (signedUrlError) return null;
    return data?.signedUrl ?? null;
  }

  let playlistCacheSnapshotUrl: string | null = null;
  let playlistCacheParts: Record<string, string | null> | null = null;

  if (playlist.playlist_cache_status === 'ready' && playlist.playlist_cache_path) {
    const [
      snapshotUrl,
      manifestUrl,
      channelsUrl,
      moviesUrl,
      seriesUrl,
    ] = await Promise.all([
      signedCacheUrl(playlist.playlist_cache_path),
      signedCacheUrl(playlist.playlist_cache_manifest_path),
      signedCacheUrl(playlist.playlist_cache_channels_path),
      signedCacheUrl(playlist.playlist_cache_movies_path),
      signedCacheUrl(playlist.playlist_cache_series_path),
    ]);

    playlistCacheSnapshotUrl = snapshotUrl;
    playlistCacheParts = {
      manifestUrl,
      channelsUrl,
      moviesUrl,
      seriesUrl,
    };
  }

  const directFallbackAllowed = allowDirectPlaylistFallback();
  const cacheReady = Boolean(playlistCacheSnapshotUrl || playlistCacheParts?.channelsUrl);

  return json({
    active: true,
    status: 'active',
    deviceCode: device.device_code,
    clientName: device.client_name,
    expiresAt,
    playlistName: playlist.name,
    playlistUrl: directFallbackAllowed ? playlist.playlist_url : null,
    playlistType: playlist.playlist_type,
    playlistUpdatedAt: playlist.playlist_updated_at,
    cacheStatus: playlist.playlist_cache_status,
    cacheVersion: playlist.playlist_cache_version,
    cacheUpdatedAt: playlist.playlist_cache_updated_at,
    cacheItemCount: playlist.playlist_cache_item_count,
    cacheSizeBytes: playlist.playlist_cache_size_bytes,
    cacheError: playlist.playlist_cache_error,
    cacheSnapshotUrl: playlistCacheSnapshotUrl,
    cacheParts: playlistCacheParts,
    directPlaylistFallbackAllowed: directFallbackAllowed,
    message: !cacheReady && !directFallbackAllowed
      ? 'A lista está vinculada, mas o cache seguro ainda não está pronto.'
      : null,
  });
});
