import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: device, error } = await supabase
    .from('panel_devices')
    .select(`
      id,
      device_code,
      device_uuid,
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

  if (device.device_uuid && device.device_uuid !== deviceUuid) {
    return json({
      active: false,
      status: 'blocked',
      deviceCode: device.device_code,
      message: 'Este código pertence a outro aparelho. Solicite a transferência pelo painel.',
    }, 403);
  }

  const boundDeviceUuid = device.device_uuid || deviceUuid;
  const { error: updateError } = await supabase
    .from('panel_devices')
    .update({
      device_uuid: boundDeviceUuid,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', device.id)
    .or(`device_uuid.is.null,device_uuid.eq.${deviceUuid}`);

  if (updateError) {
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

  return json({
    active: true,
    status: 'active',
    deviceCode: device.device_code,
    clientName: device.client_name,
    expiresAt,
    playlistName: playlist.name,
    playlistUrl: playlist.playlist_url,
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
  });
});
