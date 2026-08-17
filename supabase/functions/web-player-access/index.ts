import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  constantTimeEqual,
  deriveWebPin,
  newPinSalt,
  sha256Hex,
  text,
} from '../_shared/webPlayerSecurity.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-device-credential, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'X-Content-Type-Options': 'nosniff',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('WEB_SERVER_NOT_CONFIGURED');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function payload(request: Request) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 16 * 1024) throw new Error('WEB_PAYLOAD_TOO_LARGE');
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function credential(request: Request, body: Record<string, unknown>) {
  const header = text(request.headers.get('x-device-credential'), 512);
  if (header) return header;
  const auth = text(request.headers.get('authorization'), 768);
  const match = auth?.match(/^Device\s+(.+)$/i);
  return match?.[1]?.trim() || text(body.deviceCredential || body.device_credential, 512);
}

async function authenticatedDevice(request: Request, body: Record<string, unknown>) {
  const deviceCode = text(body.deviceCode || body.device_code, 80);
  const deviceUuid = text(body.deviceUuid || body.device_uuid, 180);
  const deviceCredential = credential(request, body);
  if (!deviceCode || !deviceUuid || !deviceCredential) throw new Error('WEB_DEVICE_IDENTITY_REQUIRED');

  const supabase = serviceClient();
  const { data: device, error } = await supabase.from('panel_devices').select(`
    id, device_uuid, device_credential_hash, status, subscription_expires_at,
    web_access_enabled, web_pin_hash, web_session_limit
  `).eq('device_code', deviceCode).maybeSingle();
  if (error || !device) throw new Error('WEB_DEVICE_UNAUTHORIZED');
  const hash = await sha256Hex(deviceCredential);
  if (
    !device.device_credential_hash ||
    !constantTimeEqual(hash, device.device_credential_hash) ||
    device.device_uuid !== deviceUuid
  ) throw new Error('WEB_DEVICE_UNAUTHORIZED');
  return { supabase, device };
}

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ ok: false, code: 'WEB_METHOD_NOT_ALLOWED' }, 405);
  try {
    const body = await payload(request);
    const action = text(body.action, 32) || 'status';
    const { supabase, device } = await authenticatedDevice(request, body);

    if (action === 'status') {
      return json({
        ok: true,
        enabled: Boolean(device.web_access_enabled),
        pinConfigured: Boolean(device.web_pin_hash),
        sessionLimit: Number(device.web_session_limit || 2),
      });
    }

    if (action === 'set-pin') {
      const pin = text(body.pin, 16) || '';
      if (!/^\d{6}$/.test(pin)) {
        return json({ ok: false, code: 'WEB_PIN_INVALID_FORMAT', message: 'Use um PIN de 6 dígitos.' }, 400);
      }
      if (device.status !== 'active') {
        return json({ ok: false, code: 'WEB_DEVICE_NOT_ACTIVE' }, 403);
      }
      if (device.subscription_expires_at && new Date(device.subscription_expires_at).getTime() <= Date.now()) {
        return json({ ok: false, code: 'WEB_DEVICE_EXPIRED' }, 403);
      }

      const salt = newPinSalt();
      const iterations = 210000;
      const pinHash = await deriveWebPin(pin, salt, iterations);
      const now = new Date().toISOString();
      const { error } = await supabase.from('panel_devices').update({
        web_access_enabled: true,
        web_pin_hash: pinHash,
        web_pin_salt: salt,
        web_pin_iterations: iterations,
        web_pin_updated_at: now,
        updated_at: now,
      }).eq('id', device.id)
        .eq('device_credential_hash', device.device_credential_hash);
      if (error) throw new Error('WEB_ACCESS_UPDATE_FAILED');

      await supabase.from('web_player_sessions').update({
        revoked_at: now,
        revoke_reason: 'pin_reset',
      }).eq('device_id', device.id).is('revoked_at', null);
      return json({ ok: true, enabled: true, pinConfigured: true });
    }

    if (action === 'disable') {
      const now = new Date().toISOString();
      const { error } = await supabase.from('panel_devices').update({
        web_access_enabled: false,
        web_pin_hash: null,
        web_pin_salt: null,
        web_pin_updated_at: now,
        updated_at: now,
      }).eq('id', device.id)
        .eq('device_credential_hash', device.device_credential_hash);
      if (error) throw new Error('WEB_ACCESS_UPDATE_FAILED');
      await supabase.from('web_player_sessions').update({
        revoked_at: now,
        revoke_reason: 'web_access_disabled',
      }).eq('device_id', device.id).is('revoked_at', null);
      return json({ ok: true, enabled: false, pinConfigured: false });
    }

    return json({ ok: false, code: 'WEB_ACTION_INVALID' }, 400);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'WEB_ACCESS_ERROR';
    if (code === 'WEB_DEVICE_UNAUTHORIZED' || code === 'WEB_DEVICE_IDENTITY_REQUIRED') {
      return json({ ok: false, code: 'WEB_DEVICE_UNAUTHORIZED' }, 403);
    }
    console.error('web-player-access error', { code });
    return json({ ok: false, code: 'WEB_ACCESS_UNAVAILABLE' }, 503);
  }
});
