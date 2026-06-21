import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

type JsonBody = Record<string, unknown>;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function getEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Variável ${name} não configurada.`);
  return value;
}

function requireAdmin(req: Request) {
  const expected = Deno.env.get('ADMIN_PANEL_TOKEN') || '';
  const provided = req.headers.get('x-admin-token') || '';

  if (!expected) {
    return json({ error: 'ADMIN_PANEL_TOKEN não configurado no Supabase.' }, 500);
  }

  if (!provided || provided !== expected) {
    return json({ error: 'Token de administrador inválido.' }, 401);
  }

  return null;
}

async function readBody(req: Request): Promise<JsonBody> {
  if (req.method !== 'POST') return {};

  try {
    return await req.json();
  } catch {
    return {};
  }
}

function textOrNull(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeStatus(value: unknown) {
  const status = String(value ?? '').trim();

  if (['pending', 'active', 'blocked', 'expired', 'inactive'].includes(status)) {
    return status;
  }

  return 'pending';
}

function normalizePlaylistType(value: unknown) {
  const type = String(value ?? 'm3u').trim().toLowerCase();

  if (['m3u', 'xtream', 'stalker'].includes(type)) {
    return type;
  }

  return 'm3u';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const supabaseUrl = getEnv('SUPABASE_URL');
    const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const url = new URL(req.url);
    const body = await readBody(req);
    const action = String(body.action || url.searchParams.get('action') || '').trim();

    if (action === 'listDevices') {
      const { data, error } = await supabase
        .from('panel_devices')
        .select(`
          id,
          device_code,
          device_uuid,
          client_name,
          status,
          playlist_id,
          subscription_expires_at,
          last_seen_at,
          created_at,
          updated_at,
          device_type,
          app_version,
          last_ip,
          playlist:panel_playlists (
            id,
            name,
            playlist_url,
            playlist_type,
            active,
            playlist_updated_at
          )
        `)
        .order('created_at', { ascending: false });

      if (error) return json({ error: error.message }, 500);

      return json({
        devices: (data ?? []).map((device: any) => ({
          id: device.id,
          deviceCode: device.device_code,
          deviceUuid: device.device_uuid,
          clientName: device.client_name,
          status: device.status,
          playlistId: device.playlist_id,
          expiresAt: device.subscription_expires_at,
          lastSeenAt: device.last_seen_at,
          createdAt: device.created_at,
          updatedAt: device.updated_at,
          deviceType: device.device_type || 'androidtv',
          appVersion: device.app_version || '',
          ip: device.last_ip || '',
          playlistName: device.playlist?.name || null,
        })),
      });
    }

    if (action === 'listPlaylists') {
      const { data, error } = await supabase
        .from('panel_playlists')
        .select('id, name, playlist_url, playlist_type, active, playlist_updated_at, created_at')
        .order('created_at', { ascending: false });

      if (error) return json({ error: error.message }, 500);

      return json({
        playlists: (data ?? []).map((playlist: any) => ({
          id: playlist.id,
          name: playlist.name,
          playlistUrl: playlist.playlist_url,
          playlistType: playlist.playlist_type,
          active: playlist.active,
          playlistUpdatedAt: playlist.playlist_updated_at,
          createdAt: playlist.created_at,
        })),
      });
    }

    if (action === 'updateDevice') {
      const id = textOrNull(body.id);
      if (!id) return json({ error: 'ID do aparelho é obrigatório.' }, 400);

      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if ('status' in body) updates.status = normalizeStatus(body.status);
      if ('clientName' in body) updates.client_name = textOrNull(body.clientName);
      if ('playlistId' in body) updates.playlist_id = textOrNull(body.playlistId);
      if ('expiresAt' in body) updates.subscription_expires_at = textOrNull(body.expiresAt);

      const { error } = await supabase
        .from('panel_devices')
        .update(updates)
        .eq('id', id);

      if (error) return json({ error: error.message }, 500);

      return json({ ok: true });
    }

    if (action === 'createPlaylist') {
      const name = textOrNull(body.name);
      const playlistUrl = textOrNull(body.playlistUrl);
      const playlistType = normalizePlaylistType(body.playlistType);

      if (!name || !playlistUrl) {
        return json({ error: 'Nome e URL da lista são obrigatórios.' }, 400);
      }

      const { data, error } = await supabase
        .from('panel_playlists')
        .insert({
          name,
          playlist_url: playlistUrl,
          playlist_type: playlistType,
          active: body.active !== false,
          playlist_updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) return json({ error: error.message }, 500);

      return json({ ok: true, id: data?.id });
    }

    if (action === 'updatePlaylist') {
      const id = textOrNull(body.id);
      if (!id) return json({ error: 'ID da lista é obrigatório.' }, 400);

      const updates: Record<string, unknown> = {
        playlist_updated_at: new Date().toISOString(),
      };

      if ('name' in body) updates.name = textOrNull(body.name);
      if ('playlistUrl' in body) updates.playlist_url = textOrNull(body.playlistUrl);
      if ('playlistType' in body) updates.playlist_type = normalizePlaylistType(body.playlistType);
      if ('active' in body) updates.active = body.active !== false;

      const { error } = await supabase
        .from('panel_playlists')
        .update(updates)
        .eq('id', id);

      if (error) return json({ error: error.message }, 500);

      return json({ ok: true });
    }

    if (action === 'deletePlaylist') {
      const id = textOrNull(body.id);
      if (!id) return json({ error: 'ID da lista é obrigatório.' }, 400);

      const { error } = await supabase
        .from('panel_playlists')
        .delete()
        .eq('id', id);

      if (error) return json({ error: error.message }, 500);

      return json({ ok: true });
    }

    return json({ error: 'Ação inválida.' }, 400);
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : 'Erro inesperado no painel.',
    }, 500);
  }
});
