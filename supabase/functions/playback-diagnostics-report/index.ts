import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { safeDiagnosticIdentifier, safeDiagnosticText } from '../_shared/diagnosticSafety.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-credential',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function text(value: unknown, limit = 500) {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized.slice(0, limit) : null;
}

function integer(value: unknown, fallback: number | null = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function allowed<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  const normalized = String(value ?? '').trim() as T;
  return choices.includes(normalized) ? normalized : fallback;
}

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Servidor não configurado.' }, 500);

    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > 32 * 1024) return json({ error: 'Payload muito grande.' }, 413);
    const payload = await request.json().catch(() => ({} as Record<string, unknown>)) as Record<string, unknown>;
    const deviceCode = text(payload.deviceCode, 80);
    const deviceUuid = text(payload.deviceUuid, 160);
    const credential = text(request.headers.get('x-device-credential'), 256);
    const eventId = safeDiagnosticIdentifier(payload.clientEventId);
    if (!deviceCode || !deviceUuid || !credential || !eventId) {
      return json({ error: 'Identidade do aparelho ou evento não informado.' }, 400);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const { data: device, error: deviceError } = await supabase
      .from('panel_devices')
      .select('id, device_code, device_uuid, device_credential_hash, client_name, customer_id, seller_id, playlist_id, device_type, app_version')
      .eq('device_code', deviceCode)
      .maybeSingle();
    if (deviceError || !device?.device_credential_hash) return json({ error: 'Aparelho não encontrado.' }, 404);
    if (device.device_uuid !== deviceUuid) return json({ error: 'Identidade do aparelho inválida.' }, 403);
    const providedHash = await sha256Hex(credential);
    if (!constantTimeEqual(providedHash, String(device.device_credential_hash))) {
      return json({ error: 'Credencial do aparelho inválida.' }, 403);
    }

    const playlistId = text(payload.playlistId, 80);
    let playlist: { id: string; name: string } | null = null;
    let backupAvailable = Boolean(payload.backupAvailable);
    if (playlistId) {
      const { data: assignment } = await supabase
        .from('panel_device_playlists')
        .select('playlist_id, priority, active, playlist:panel_playlists(id, name, active)')
        .eq('device_id', device.id)
        .eq('playlist_id', playlistId)
        .eq('active', true)
        .maybeSingle();
      const rawPlaylist = Array.isArray(assignment?.playlist) ? assignment?.playlist[0] : assignment?.playlist;
      if (assignment && rawPlaylist?.active !== false) {
        playlist = { id: String(rawPlaylist?.id || assignment.playlist_id), name: String(rawPlaylist?.name || 'Lista') };
        const { count } = await supabase
          .from('panel_device_playlists')
          .select('id', { count: 'exact', head: true })
          .eq('device_id', device.id)
          .eq('active', true)
          .gt('priority', Number(assignment.priority || 1));
        backupAvailable = Number(count || 0) > 0;
      }
    }
    if (!playlist && device.playlist_id) {
      const { data } = await supabase.from('panel_playlists').select('id, name').eq('id', device.playlist_id).maybeSingle();
      if (data) playlist = { id: String(data.id), name: String(data.name || 'Lista') };
    }

    const [{ data: customer }, { data: seller }] = await Promise.all([
      device.customer_id
        ? supabase.from('panel_customers').select('name').eq('id', device.customer_id).maybeSingle()
        : Promise.resolve({ data: null }),
      device.seller_id
        ? supabase.from('panel_sellers').select('name').eq('id', device.seller_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const recovered = Boolean(payload.recovered);
    const contentType = allowed(payload.contentType, ['channel', 'movie', 'series', 'episode', 'unknown'] as const, 'unknown');
    const severity = allowed(payload.severity, ['low', 'medium', 'high', 'critical'] as const, recovered ? 'medium' : 'high');
    const probableSource = allowed(payload.probableSource, ['content', 'network', 'playlist', 'app', 'device', 'unknown'] as const, 'unknown');
    const occurredAt = text(payload.occurredAt, 80) || new Date().toISOString();
    const correlationId = safeDiagnosticIdentifier(payload.correlationId) || eventId;
    const failoverAttemptId = safeDiagnosticIdentifier(payload.failoverAttemptId);
    let cacheAttemptId: string | null = null;
    if (playlist?.id) {
      const { data: cacheAttempt } = await supabase
        .from('playlist_cache_generation_attempts')
        .select('id')
        .eq('playlist_id', playlist.id)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      cacheAttemptId = cacheAttempt?.id ? String(cacheAttempt.id) : null;
    }

    const record = {
      device_id: device.id,
      seller_id: device.seller_id,
      playlist_id: playlist?.id || null,
      device_code_snapshot: device.device_code,
      client_name_snapshot: text(customer?.name, 200) || text(device.client_name, 200),
      seller_name_snapshot: text(seller?.name, 200),
      playlist_name_snapshot: playlist?.name || null,
      platform: text(payload.platform, 50) || text(device.device_type, 50),
      app_version: text(payload.appVersion, 50) || text(device.app_version, 50),
      content_type: contentType,
      content_title: safeDiagnosticText(payload.contentTitle, 300) || 'Conteúdo não identificado',
      season_number: integer(payload.seasonNumber),
      episode_number: integer(payload.episodeNumber),
      position_ms: integer(payload.positionMs),
      duration_ms: integer(payload.durationMs),
      error_code: text(payload.errorCode, 100) || (recovered ? 'PLAYBACK_RECOVERED' : 'PLAYBACK_FAILURE'),
      error_message: safeDiagnosticText(payload.errorMessage, 800) || (recovered ? 'Reprodução recuperada automaticamente.' : 'Falha terminal de reprodução.'),
      severity: severity,
      probable_source: probableSource,
      recovery_action: safeDiagnosticText(payload.recoveryAction, 500),
      recovered,
      player_exited: Boolean(payload.playerExited),
      backup_available: backupAvailable,
      retry_count: integer(payload.retryCount, 0) || 0,
      status: recovered ? 'resolved' : 'open',
      occurred_at: occurredAt,
      resolved_at: recovered ? new Date().toISOString() : null,
      source: 'smart_tv_client',
      client_event_id: eventId,
      correlation_id: correlationId,
      failover_attempt_id: failoverAttemptId,
      cache_attempt_id: cacheAttemptId,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from('panel_playback_diagnostics')
      .upsert(record, { onConflict: 'client_event_id' });
    if (upsertError) throw new Error(upsertError.message);
    return json({ ok: true, eventId, recovered });
  } catch (error) {
    console.error('playback-diagnostics-report:', error);
    return json({ error: 'Não foi possível registrar o diagnóstico.' }, 500);
  }
});
