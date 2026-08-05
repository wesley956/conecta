import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { safeDiagnosticIdentifier, safeDiagnosticText } from '../_shared/diagnosticSafety.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-credential',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PHASES = ['fast', 'compatibility', 'deep'] as const;
const SECTIONS = ['authentication', 'channels', 'movies', 'series', 'epg', 'm3u', 'catalog', 'unknown'] as const;
const TRANSPORTS = ['cache', 'xtream', 'm3u', 'local', 'unknown'] as const;
const PROTOCOLS = ['http', 'https', 'local', 'unknown'] as const;
const RESULTS = ['success', 'partial', 'empty', 'failure', 'skipped'] as const;

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

function text(value: unknown, limit = 500) {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized.slice(0, limit) : null;
}

function integer(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.trunc(parsed);
  return normalized >= minimum && normalized <= maximum ? normalized : null;
}

function allowed<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  const normalized = String(value ?? '').trim() as T;
  return choices.includes(normalized) ? normalized : fallback;
}

function safeToken(value: unknown, limit = 180) {
  const normalized = String(value ?? '').trim().slice(0, limit);
  if (!normalized) return null;
  return /^[a-zA-Z0-9:._/-]+$/.test(normalized) ? normalized : null;
}

function safeHost(value: unknown) {
  const normalized = String(value ?? '').trim().toLowerCase().slice(0, 253);
  if (!normalized || normalized.includes('?') || normalized.includes('@')) return null;
  return /^[a-z0-9.-]+$/.test(normalized) ? normalized : null;
}

function safePath(value: unknown, limit = 180) {
  const normalized = String(value ?? '').trim().slice(0, limit);
  if (!normalized) return null;
  if (normalized.includes('?') || normalized.includes('@') || !normalized.startsWith('/')) return null;
  return /^[a-zA-Z0-9._~!$&'()*+,;=:@%/-]+$/.test(normalized) && !normalized.includes('@')
    ? normalized
    : null;
}

function safeHeader(value: unknown, limit = 100) {
  const normalized = String(value ?? '').trim().slice(0, limit);
  if (!normalized) return null;
  return normalized.replace(/[^a-zA-Z0-9 ._+/-]/g, '').trim() || null;
}

function safeRedirect(value: unknown) {
  const normalized = String(value ?? '').trim().slice(0, 300);
  if (!normalized || normalized.includes('?') || normalized.includes('@')) return null;
  try {
    const parsed = new URL(normalized);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    const port = parsed.port ? `:${parsed.port}` : '';
    return `${parsed.protocol}//${parsed.hostname}${port}${parsed.pathname.slice(0, 160)}`;
  } catch {
    return null;
  }
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
    const clientEventId = safeDiagnosticIdentifier(payload.clientEventId);
    const playlistId = text(payload.playlistId, 80);
    const hostSnapshot = safeHost(payload.host);
    const strategyKey = safeToken(payload.strategyKey, 180);

    if (!deviceCode || !deviceUuid || !credential || !clientEventId || !playlistId) {
      return json({ error: 'Identidade do aparelho, evento ou lista não informada.' }, 400);
    }
    if (!hostSnapshot || !strategyKey) {
      return json({ error: 'Estratégia ou destino técnico inválido.' }, 400);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const { data: device, error: deviceError } = await supabase
      .from('panel_devices')
      .select('id, device_code, device_uuid, device_credential_hash, client_name, playlist_id, device_type, app_version')
      .eq('device_code', deviceCode)
      .maybeSingle();

    if (deviceError || !device?.device_credential_hash) return json({ error: 'Aparelho não encontrado.' }, 404);
    if (device.device_uuid !== deviceUuid) return json({ error: 'Identidade do aparelho inválida.' }, 403);

    const providedHash = await sha256Hex(credential);
    if (!constantTimeEqual(providedHash, String(device.device_credential_hash))) {
      return json({ error: 'Credencial do aparelho inválida.' }, 403);
    }

    const now = new Date().toISOString();
    const [{ data: assignment, error: assignmentError }, { data: validationSession, error: validationError }] = await Promise.all([
      supabase
        .from('panel_device_playlists')
        .select('id, playlist_id, active, playlist:panel_playlists(id, name, active)')
        .eq('device_id', device.id)
        .eq('playlist_id', playlistId)
        .maybeSingle(),
      supabase
        .from('panel_playlist_validation_sessions')
        .select('id, playlist_id, device_id, status, expires_at')
        .eq('device_id', device.id)
        .eq('playlist_id', playlistId)
        .eq('status', 'active')
        .gt('expires_at', now)
        .maybeSingle(),
    ]);
    if (assignmentError || validationError) {
      return json({ error: 'Não foi possível validar a autorização técnica da lista.' }, 500);
    }

    const rawPlaylist = Array.isArray(assignment?.playlist) ? assignment?.playlist[0] : assignment?.playlist;
    const assignmentAllowed = Boolean(assignment && assignment.active !== false && rawPlaylist?.active !== false);
    const legacyAllowed = String(device.playlist_id || '') === playlistId;
    const validationAllowed = Boolean(validationSession?.id);
    if (!assignmentAllowed && !legacyAllowed && !validationAllowed) {
      return json({ error: 'A lista não pertence a este aparelho nem a uma homologação ativa.' }, 403);
    }

    let playlistName = rawPlaylist?.name ? String(rawPlaylist.name) : null;
    if (!playlistName) {
      const { data: playlist } = await supabase
        .from('panel_playlists')
        .select('name, active')
        .eq('id', playlistId)
        .maybeSingle();
      if (!playlist || playlist.active === false) return json({ error: 'A lista não está ativa.' }, 403);
      playlistName = String(playlist.name || 'Lista');
    }

    const platform = safeToken(payload.platform, 50) || text(device.device_type, 50);
    const appVersion = safeToken(payload.appVersion, 50) || text(device.app_version, 50);
    await supabase
      .from('panel_devices')
      .update({
        last_seen_at: now,
        updated_at: now,
        ...(platform ? { device_type: platform } : {}),
        ...(appVersion ? { app_version: appVersion } : {}),
      })
      .eq('id', device.id);

    const correlationId = safeDiagnosticIdentifier(payload.correlationId)
      || (validationAllowed ? `validation:${validationSession.id}` : null);
    const record = {
      client_event_id: clientEventId,
      device_id: device.id,
      playlist_id: playlistId,
      assignment_id: assignmentAllowed ? assignment?.id || null : null,
      device_code_snapshot: device.device_code,
      playlist_name_snapshot: playlistName,
      platform,
      app_version: appVersion,
      phase: allowed(payload.phase, PHASES, 'fast'),
      section: allowed(payload.section, SECTIONS, 'unknown'),
      transport: allowed(payload.transport, TRANSPORTS, 'unknown'),
      strategy_key: strategyKey,
      protocol: allowed(payload.protocol, PROTOCOLS, 'unknown'),
      host_snapshot: hostSnapshot,
      port: integer(payload.port, 1, 65535),
      path_snapshot: safePath(payload.path),
      http_version: safeToken(payload.httpVersion, 30),
      request_profile: safeToken(payload.requestProfile, 80),
      output_format: safeToken(payload.outputFormat, 30),
      result: allowed(payload.result, RESULTS, 'failure'),
      http_status: integer(payload.httpStatus, 100, 599),
      duration_ms: integer(payload.durationMs, 0, 3_600_000) || 0,
      response_bytes: integer(payload.responseBytes, 0),
      content_type: safeHeader(payload.contentType, 100),
      server_header: safeHeader(payload.serverHeader, 100),
      redirect_snapshot: safeRedirect(payload.redirect),
      item_count: integer(payload.itemCount, 0),
      error_code: safeToken(payload.errorCode, 100),
      error_message: safeDiagnosticText(payload.errorMessage, 800),
      correlation_id: correlationId,
      occurred_at: text(payload.occurredAt, 80) || now,
      created_at: now,
    };

    const { data: inserted, error: insertError } = await supabase
      .from('playlist_provider_attempts')
      .upsert(record, { onConflict: 'client_event_id' })
      .select('id')
      .maybeSingle();

    if (insertError) throw new Error(insertError.message);
    return json({
      ok: true,
      id: inserted?.id || null,
      clientEventId,
      validationMode: validationAllowed,
    });
  } catch (error) {
    console.error('playlist-provider-attempt-report:', {
      message: safeDiagnosticText(error instanceof Error ? error.message : error, 300),
    });
    return json({ error: 'Não foi possível registrar a tentativa da matriz.' }, 500);
  }
});
