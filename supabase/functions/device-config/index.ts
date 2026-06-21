import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

serve(async request => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'GET') {
    return json({ active: false, message: 'Método não permitido.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ active: false, message: 'Servidor não configurado.' }, 500);
  }

  const url = new URL(request.url);
  const code = String(url.searchParams.get('code') ?? '').trim();
  const deviceUuid = String(url.searchParams.get('deviceUuid') ?? '').trim();

  if (!code) {
    return json({ active: false, status: 'pending', message: 'Código do aparelho não informado.' }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

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
        playlist_updated_at
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

  await supabase
    .from('panel_devices')
    .update({
      device_uuid: device.device_uuid || deviceUuid || null,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', device.id);

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
  });
});
