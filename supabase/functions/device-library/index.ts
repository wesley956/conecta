import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { constantTimeEqual, sha256Hex, text } from '../_shared/webPlayerSecurity.ts';
import {
  librarySnapshot,
  resetProgress,
  setFavorite,
  setPreferences,
  setProgress,
  validContentKey,
  validContentType,
} from '../_shared/librarySync.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-device-credential',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Credentials': 'false',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('DEVICE_LIBRARY_NOT_CONFIGURED');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function readBody(request: Request) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 32 * 1024) throw new Error('DEVICE_LIBRARY_PAYLOAD_TOO_LARGE');
  try {
    const value = await request.json();
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch { return {}; }
}

async function authenticate(request: Request, body: Record<string, unknown>) {
  const deviceCode = text(body.deviceCode, 80);
  const deviceUuid = text(body.deviceUuid, 180);
  const credential = text(request.headers.get('x-device-credential'), 512);
  if (!deviceCode || !deviceUuid || !credential) throw new Error('DEVICE_LIBRARY_UNAUTHORIZED');
  const supabase = serviceClient();
  const { data: device, error } = await supabase.from('panel_devices')
    .select('id, device_uuid, device_credential_hash, customer_id, status, subscription_expires_at')
    .eq('device_code', deviceCode)
    .maybeSingle();
  if (error || !device || !device.device_credential_hash || device.device_uuid !== deviceUuid) {
    throw new Error('DEVICE_LIBRARY_UNAUTHORIZED');
  }
  const hash = await sha256Hex(credential);
  if (!constantTimeEqual(hash, device.device_credential_hash)) throw new Error('DEVICE_LIBRARY_UNAUTHORIZED');
  if (device.status !== 'active') throw new Error('DEVICE_LIBRARY_INACTIVE');
  if (device.subscription_expires_at && new Date(device.subscription_expires_at).getTime() <= Date.now()) {
    throw new Error('DEVICE_LIBRARY_INACTIVE');
  }
  const scopeKey = device.customer_id ? `customer:${device.customer_id}` : `device:${device.id}`;
  return { supabase, scopeKey };
}

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ ok: false, code: 'DEVICE_LIBRARY_METHOD_NOT_ALLOWED' }, 405);
  try {
    const body = await readBody(request);
    const { supabase, scopeKey } = await authenticate(request, body);
    const action = text(body.action, 32) || 'get';
    if (action === 'get') return json({ ok: true, ...(await librarySnapshot(supabase, scopeKey)) });
    if (action === 'preferences') {
      return json({ ok: true, preferences: await setPreferences(supabase, scopeKey, {
        aspectMode: body.aspectMode,
        language: body.language,
        subtitleLanguage: body.subtitleLanguage,
      }) });
    }

    const contentKey = validContentKey(body.contentKey);
    const contentType = validContentType(body.contentType);
    if (!contentKey || !contentType) return json({ ok: false, code: 'LIBRARY_CONTENT_INVALID' }, 400);
    if (action === 'favorite') {
      return json({ ok: true, favorite: await setFavorite(supabase, scopeKey, contentKey, contentType, body.active === true) });
    }
    if (action === 'progress') {
      return json({ ok: true, progress: await setProgress(
        supabase,
        scopeKey,
        contentKey,
        contentType,
        Number(body.positionMs),
        Number(body.durationMs),
      ) });
    }
    if (action === 'reset-progress') {
      return json({ ok: true, progress: await resetProgress(supabase, scopeKey, contentKey) });
    }
    return json({ ok: false, code: 'DEVICE_LIBRARY_ACTION_INVALID' }, 400);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'DEVICE_LIBRARY_UNAVAILABLE';
    if (code === 'DEVICE_LIBRARY_UNAUTHORIZED' || code === 'DEVICE_LIBRARY_INACTIVE') return json({ ok: false, code }, 403);
    if (code.startsWith('LIBRARY_')) return json({ ok: false, code }, 400);
    console.error('device-library error', { code });
    return json({ ok: false, code: 'DEVICE_LIBRARY_UNAVAILABLE' }, 503);
  }
});
