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

function requiredText(value: unknown, label: string) {
  const text = textOrNull(value);
  if (!text) throw new Error(`${label} é obrigatório.`);
  return text;
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

function normalizeWhatsapp(value: unknown) {
  return String(value ?? '')
    .replace(/[^\d+]/g, '')
    .trim();
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

    if (action === 'listCustomers') {
      const { data: customers, error } = await supabase
        .from('panel_customers')
        .select('id, name, whatsapp, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (error) return json({ error: error.message }, 500);

      const { data: devices, error: devicesError } = await supabase
        .from('panel_devices')
        .select('id, customer_id');

      if (devicesError) return json({ error: devicesError.message }, 500);

      const counts = new Map<string, number>();
      for (const device of devices ?? []) {
        if (!device.customer_id) continue;
        counts.set(device.customer_id, (counts.get(device.customer_id) ?? 0) + 1);
      }

      return json({
        customers: (customers ?? []).map((customer: any) => ({
          id: customer.id,
          name: customer.name,
          whatsapp: customer.whatsapp,
          createdAt: customer.created_at,
          updatedAt: customer.updated_at,
          devicesCount: counts.get(customer.id) ?? 0,
        })),
      });
    }

    if (action === 'createCustomer') {
      const name = requiredText(body.name, 'Nome do cliente');
      const whatsapp = normalizeWhatsapp(body.whatsapp);

      if (!whatsapp) {
        return json({ error: 'WhatsApp é obrigatório.' }, 400);
      }

      const { data, error } = await supabase
        .from('panel_customers')
        .insert({
          name,
          whatsapp,
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) return json({ error: error.message }, 500);

      return json({ ok: true, id: data?.id });
    }

    if (action === 'updateCustomer') {
      const id = requiredText(body.id, 'ID do cliente');

      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if ('name' in body) updates.name = requiredText(body.name, 'Nome do cliente');
      if ('whatsapp' in body) {
        const whatsapp = normalizeWhatsapp(body.whatsapp);
        if (!whatsapp) return json({ error: 'WhatsApp é obrigatório.' }, 400);
        updates.whatsapp = whatsapp;
      }

      const { error } = await supabase
        .from('panel_customers')
        .update(updates)
        .eq('id', id);

      if (error) return json({ error: error.message }, 500);

      return json({ ok: true });
    }

    if (action === 'deleteCustomer') {
      const id = requiredText(body.id, 'ID do cliente');

      await supabase
        .from('panel_devices')
        .update({ customer_id: null, updated_at: new Date().toISOString() })
        .eq('customer_id', id);

      const { error } = await supabase
        .from('panel_customers')
        .delete()
        .eq('id', id);

      if (error) return json({ error: error.message }, 500);

      return json({ ok: true });
    }

    if (action === 'listDevices') {
      const { data, error } = await supabase
        .from('panel_devices')
        .select(`
          id,
          device_code,
          device_uuid,
          client_name,
          customer_id,
          status,
          playlist_id,
          subscription_expires_at,
          last_seen_at,
          created_at,
          updated_at,
          device_type,
          app_version,
          last_ip,
          customer:panel_customers (
            id,
            name,
            whatsapp
          ),
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
          customerId: device.customer_id,
          customerName: device.customer?.name || null,
          customerWhatsapp: device.customer?.whatsapp || null,
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
      const { data: playlists, error } = await supabase
        .from('panel_playlists')
        .select('id, name, playlist_url, playlist_type, active, playlist_updated_at, created_at')
        .order('created_at', { ascending: false });

      if (error) return json({ error: error.message }, 500);

      const { data: devices, error: devicesError } = await supabase
        .from('panel_devices')
        .select('id, playlist_id');

      if (devicesError) return json({ error: devicesError.message }, 500);

      const counts = new Map<string, number>();
      for (const device of devices ?? []) {
        if (!device.playlist_id) continue;
        counts.set(device.playlist_id, (counts.get(device.playlist_id) ?? 0) + 1);
      }

      return json({
        playlists: (playlists ?? []).map((playlist: any) => ({
          id: playlist.id,
          name: playlist.name,
          playlistUrl: playlist.playlist_url,
          playlistType: playlist.playlist_type,
          active: playlist.active,
          playlistUpdatedAt: playlist.playlist_updated_at,
          createdAt: playlist.created_at,
          devicesCount: counts.get(playlist.id) ?? 0,
        })),
      });
    }

    if (action === 'updateDevice') {
      const id = requiredText(body.id, 'ID do aparelho');

      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if ('status' in body) updates.status = normalizeStatus(body.status);
      if ('clientName' in body) updates.client_name = textOrNull(body.clientName);
      if ('customerId' in body) updates.customer_id = textOrNull(body.customerId);
      if ('playlistId' in body) updates.playlist_id = textOrNull(body.playlistId);
      if ('expiresAt' in body) updates.subscription_expires_at = textOrNull(body.expiresAt);

      const { error } = await supabase
        .from('panel_devices')
        .update(updates)
        .eq('id', id);

      if (error) return json({ error: error.message }, 500);

      return json({ ok: true });
    }

    if (action === 'deleteDevice') {
      const id = requiredText(body.id, 'ID do aparelho');

      const { error } = await supabase
        .from('panel_devices')
        .delete()
        .eq('id', id);

      if (error) return json({ error: error.message }, 500);

      return json({ ok: true });
    }

    if (action === 'createPlaylist') {
      const name = requiredText(body.name, 'Nome da lista');
      const playlistUrl = requiredText(body.playlistUrl, 'URL da lista');
      const playlistType = normalizePlaylistType(body.playlistType);

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
      const id = requiredText(body.id, 'ID da lista');

      const updates: Record<string, unknown> = {
        playlist_updated_at: new Date().toISOString(),
      };

      if ('name' in body) updates.name = requiredText(body.name, 'Nome da lista');
      if ('playlistUrl' in body) updates.playlist_url = requiredText(body.playlistUrl, 'URL da lista');
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
      const id = requiredText(body.id, 'ID da lista');

      await supabase
        .from('panel_devices')
        .update({ playlist_id: null, updated_at: new Date().toISOString() })
        .eq('playlist_id', id);

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
