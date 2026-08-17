import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  assertWebOrigin,
  readWebJson,
  requireWebSession,
  text,
  userAgentFamily,
  webCorsHeaders,
  webJson,
} from '../_shared/webPlayerSecurity.ts';
import { enforceWebRateLimit } from '../_shared/webRateLimit.ts';
import { sanitizedRecoveryCode } from '../_shared/webPlayerRecovery.ts';

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('WEB_SERVER_NOT_CONFIGURED');
  return createClient(url, key, { auth: { persistSession: false } });
}

function correlationId(value: unknown) {
  const supplied = String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
  if (supplied.length >= 8) return supplied;
  return crypto.randomUUID();
}

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: webCorsHeaders(request) });
  if (request.method !== 'POST') return webJson(request, { ok: false, code: 'WEB_METHOD_NOT_ALLOWED' }, 405);
  try {
    assertWebOrigin(request);
    const body = await readWebJson(request, 12 * 1024);
    const supabase = serviceClient();
    const session = await requireWebSession(request, supabase, { touch: false });
    await enforceWebRateLimit(supabase, 'diagnostic', session.id);

    const stage = text(body.stage, 24) || 'player';
    if (!['authorize','gateway','player','recovery','session','pwa'].includes(stage)) {
      return webJson(request, { ok: false, code: 'WEB_DIAGNOSTIC_STAGE_INVALID' }, 400);
    }
    const contentType = text(body.contentType, 16) || 'unknown';
    if (!['channel','movie','episode','unknown'].includes(contentType)) {
      return webJson(request, { ok: false, code: 'WEB_DIAGNOSTIC_TYPE_INVALID' }, 400);
    }
    const playlistRole = text(body.playlistRole, 16);
    if (playlistRole && !['primary','backup'].includes(playlistRole)) {
      return webJson(request, { ok: false, code: 'WEB_DIAGNOSTIC_ROLE_INVALID' }, 400);
    }

    const id = correlationId(body.correlationId);
    const { error } = await supabase.from('web_player_diagnostics').upsert({
      correlation_id: id,
      session_id: session.id,
      device_id: session.deviceId,
      browser_family: userAgentFamily(request),
      web_version: text(body.webVersion, 40),
      content_type: contentType,
      error_code: sanitizedRecoveryCode(body.errorCode || 'WEB_UNKNOWN'),
      stage,
      recovered: body.recovered === true,
      playlist_role: playlistRole,
    }, { onConflict: 'correlation_id', ignoreDuplicates: true });
    if (error) throw new Error('WEB_DIAGNOSTIC_WRITE_FAILED');
    return webJson(request, { ok: true, correlationId: id });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'WEB_DIAGNOSTIC_UNAVAILABLE';
    if (code === 'WEB_ORIGIN_NOT_ALLOWED') return webJson(request, { ok: false, code }, 403);
    if (code === 'WEB_RATE_LIMITED') return webJson(request, { ok: false, code }, 429);
    if (code.startsWith('WEB_SESSION_') || code.startsWith('WEB_DEVICE_')) return webJson(request, { ok: false, code }, 401);
    console.error('web-player-diagnostics error', { code });
    return webJson(request, { ok: false, code: 'WEB_DIAGNOSTIC_UNAVAILABLE' }, 503);
  }
});
