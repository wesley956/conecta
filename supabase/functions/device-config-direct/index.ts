import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const DIRECT_MARKER = '#roneca-direct-m3u';
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
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function text(value: unknown) {
  const result = String(value ?? '').trim();
  return result || null;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ active: false, message: 'Método não permitido.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !serviceRoleKey) return json({ active: false, message: 'Servidor não configurado.' }, 500);

    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 64 * 1024) {
      return json({ active: false, message: 'Payload muito grande.' }, 413);
    }

    const upstreamHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    const deviceCredential = request.headers.get('x-device-credential');
    const authorization = request.headers.get('authorization');
    const apikey = request.headers.get('apikey');
    if (deviceCredential) upstreamHeaders['x-device-credential'] = deviceCredential;
    if (authorization) upstreamHeaders.authorization = authorization;
    if (apikey) upstreamHeaders.apikey = apikey;

    const upstream = await fetch(`${supabaseUrl}/functions/v1/device-config`, {
      method: 'POST',
      headers: upstreamHeaders,
      body: rawBody || '{}',
    });

    const upstreamText = await upstream.text();
    let payload: any;
    try {
      payload = JSON.parse(upstreamText || '{}');
    } catch {
      return json({ active: false, status: 'pending', message: 'Resposta inválida do servidor.' }, 502);
    }

    if (!upstream.ok || payload?.active !== true || payload?.status !== 'active') {
      return json(payload, upstream.status);
    }

    const deviceCode = text(payload.deviceCode);
    if (!deviceCode) return json(payload, upstream.status);

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const { data: device, error } = await supabase
      .from('panel_devices')
      .select(`
        id,
        playlist:panel_playlists(id, playlist_url, playlist_type, active),
        device_playlists:panel_device_playlists(
          playlist_id,
          priority,
          active,
          playlist:panel_playlists(id, playlist_url, playlist_type, active)
        )
      `)
      .eq('device_code', deviceCode)
      .maybeSingle();

    if (error || !device) return json(payload, upstream.status);

    const sourceById = new Map<string, { url: string; type: string }>();
    const legacy = Array.isArray(device.playlist) ? device.playlist[0] : device.playlist;
    if (legacy?.id && legacy?.active !== false && text(legacy.playlist_url)) {
      sourceById.set(String(legacy.id), {
        url: String(legacy.playlist_url),
        type: text(legacy.playlist_type) || 'm3u',
      });
    }

    for (const assignment of device.device_playlists ?? []) {
      if (assignment?.active === false) continue;
      const playlist = Array.isArray(assignment?.playlist) ? assignment.playlist[0] : assignment?.playlist;
      if (!playlist?.id || playlist?.active === false || !text(playlist.playlist_url)) continue;
      sourceById.set(String(playlist.id), {
        url: String(playlist.playlist_url),
        type: text(playlist.playlist_type) || 'm3u',
      });
    }

    const playlists = Array.isArray(payload.playlists)
      ? payload.playlists.map((item: any) => {
          const id = text(item?.id);
          const source = id ? sourceById.get(id) : null;
          const cacheReady = item?.cacheReady === true || Boolean(item?.cacheParts?.channelsUrl || item?.cacheSnapshotUrl);
          if (!source || cacheReady) return item;

          const markedUrl = `${source.url}${DIRECT_MARKER}`;
          return {
            ...item,
            type: source.type,
            cacheParts: {
              manifestUrl: null,
              channelsUrl: markedUrl,
              moviesUrl: markedUrl,
              seriesUrl: markedUrl,
            },
            cacheReady: true,
            directFallback: true,
          };
        })
      : [];

    const selectedId = text(payload.selectedPlaylistId);
    const selected = selectedId ? playlists.find((item: any) => String(item?.id) === selectedId) : null;
    const usingDirectFallback = playlists.some((item: any) => Boolean(item?.directFallback));

    return json({
      ...payload,
      playlists,
      cacheParts: selected?.cacheParts || payload.cacheParts || null,
      directPlaylistFallbackAllowed: usingDirectFallback,
      message: usingDirectFallback
        ? 'Cache indisponível neste provedor. O aplicativo usará a conexão direta do aparelho.'
        : payload.message,
    }, upstream.status);
  } catch (error) {
    return json({
      active: false,
      status: 'pending',
      message: error instanceof Error ? error.message : 'Falha temporária ao carregar a configuração.',
    }, 500);
  }
});
