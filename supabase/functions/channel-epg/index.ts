import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { safeFetchPlaylistText } from '../_shared/outboundFetch.ts';
import { buildXtreamApiUrl, parseXtreamSource } from '../_shared/xtreamSource.ts';

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
      'Cache-Control': status >= 400 ? 'no-store' : 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function text(value: unknown) {
  return String(value ?? '').trim() || null;
}

async function payload(req: Request): Promise<Record<string, unknown>> {
  try {
    const value = await req.json();
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function credential(req: Request, body: Record<string, unknown>) {
  const header = text(req.headers.get('x-device-credential'));
  if (header) return header;
  const auth = text(req.headers.get('authorization'));
  return auth?.match(/^Device\s+(.+)$/i)?.[1]?.trim()
    || text(body.deviceCredential)
    || text(body.device_credential);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function providerJson(url: string, allowedOrigin: string) {
  const target = new URL(url);
  if (target.origin !== allowedOrigin) {
    throw new Error('UPSTREAM_BLOCKED');
  }
  const raw = await safeFetchPlaylistText(target.toString(), {
    label: 'Programação do canal',
    timeoutMs: 20_000,
    maxBytes: 2 * 1024 * 1024,
    allowedOrigins: [allowedOrigin],
    headers: {
      Accept: 'application/json, text/plain, */*',
      'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
    },
  });
  return JSON.parse(raw);
}

function decoded(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    const bytes = Uint8Array.from(atob(raw), character => character.charCodeAt(0));
    const result = new TextDecoder().decode(bytes).trim();
    return result || raw;
  } catch {
    return raw;
  }
}

function instant(value: unknown, fallback: unknown) {
  const timestamp = Number(value);
  if (Number.isFinite(timestamp) && timestamp > 0) {
    return new Date(timestamp * (timestamp < 10_000_000_000 ? 1000 : 1));
  }
  const parsed = new Date(String(fallback ?? '').replace(' ', 'T'));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function programs(value: unknown) {
  const listings = Array.isArray((value as { epg_listings?: unknown })?.epg_listings)
    ? (value as { epg_listings: unknown[] }).epg_listings
    : Array.isArray(value) ? value : [];
  const now = Date.now();
  return listings.flatMap((raw: any) => {
    const start = instant(raw?.start_timestamp, raw?.start);
    const end = instant(raw?.stop_timestamp ?? raw?.end_timestamp, raw?.end ?? raw?.stop);
    const title = decoded(raw?.title);
    if (!start || !end || !title || end.getTime() <= now - 60_000) return [];
    return [{
      title,
      description: decoded(raw?.description) || undefined,
      start: start.toISOString(),
      end: end.toISOString(),
    }];
  }).sort((left, right) => left.start.localeCompare(right.start)).slice(0, 4);
}

serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ message: 'Método não permitido.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRole) return json({ message: 'Servidor não configurado.' }, 500);

  const body = await payload(req);
  const deviceCode = text(body.deviceCode) || text(body.device_code);
  const deviceUuid = text(body.deviceUuid) || text(body.device_uuid);
  const deviceCredential = credential(req, body);
  const streamId = text(body.streamId) || text(body.stream_id);
  const requestedPlaylistId = text(body.playlistId) || text(body.playlist_id);
  if (!deviceCode || !deviceUuid || !deviceCredential || !streamId || !/^\d{1,20}$/.test(streamId)) {
    return json({ message: 'Identificação do aparelho ou canal incompleta.' }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
  const { data: device, error } = await supabase.from('panel_devices').select(`
    id, device_uuid, device_credential_hash, status, subscription_expires_at,
    playlist:panel_playlists (id, playlist_url, active),
    device_playlists:panel_device_playlists (
      playlist_id, priority, active,
      playlist:panel_playlists (id, playlist_url, active)
    )
  `).eq('device_code', deviceCode).maybeSingle();
  if (error) return json({ message: 'Não foi possível validar o aparelho.' }, 500);
  if (!device) return json({ message: 'Aparelho não encontrado.' }, 404);

  const credentialHash = await sha256(deviceCredential);
  const expired = device.subscription_expires_at
    ? new Date(device.subscription_expires_at).getTime() <= Date.now()
    : false;
  if (
    !device.device_credential_hash ||
    !timingSafeEqual(credentialHash, device.device_credential_hash) ||
    device.device_uuid !== deviceUuid
  ) return json({ message: 'Credencial do aparelho inválida.' }, 403);
  if (device.status !== 'active' || expired) {
    return json({ message: expired ? 'Assinatura expirada.' : 'Aparelho não ativo.' }, 403);
  }

  const legacyPlaylist = Array.isArray(device.playlist) ? device.playlist[0] : device.playlist;
  let assignments = (device.device_playlists ?? []).map((assignment: any) => ({
    ...assignment,
    playlist: Array.isArray(assignment.playlist) ? assignment.playlist[0] : assignment.playlist,
  })).filter((assignment: any) =>
    assignment.active !== false &&
    assignment.playlist?.active !== false &&
    assignment.playlist?.playlist_url
  ).sort((left: any, right: any) => Number(left.priority) - Number(right.priority));
  if (!assignments.length && legacyPlaylist?.active && legacyPlaylist.playlist_url) {
    assignments = [{ playlist_id: legacyPlaylist.id, priority: 1, playlist: legacyPlaylist }];
  }
  if (requestedPlaylistId) {
    assignments.sort((left: any, right: any) =>
      (left.playlist_id === requestedPlaylistId ? 0 : 1) -
      (right.playlist_id === requestedPlaylistId ? 0 : 1) ||
      Number(left.priority) - Number(right.priority)
    );
  }

  for (const assignment of assignments) {
    const source = parseXtreamSource(assignment.playlist.playlist_url);
    if (!source) continue;
    try {
      const target = buildXtreamApiUrl(source, 'get_short_epg', {
        stream_id: streamId,
        limit: '4',
      });
      const listing = programs(await providerJson(target, source.origin));
      return json({
        available: listing.length > 0,
        programs: listing,
        sourcePlaylistId: assignment.playlist.id,
        usedFallback: assignment.playlist.id !== assignments[0]?.playlist_id,
      });
    } catch (providerError) {
      console.error('channel-epg provider failed', {
        deviceId: device.id,
        playlistId: assignment.playlist.id,
        name: providerError instanceof Error ? providerError.message : 'unknown',
      });
    }
  }

  return json({ available: false, programs: [], message: 'A fonte não informou programação para este canal.' });
});
