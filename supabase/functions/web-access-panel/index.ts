import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { PanelAuthError, panelAuthErrorResponse, requirePanelPrincipal } from '../_shared/panelAuth.ts';
import { deriveWebPin, newPinSalt, text } from '../_shared/webPlayerSecurity.ts';

function allowedOrigins() {
  const configured = String(Deno.env.get('PANEL_WEB_ORIGINS') || '')
    .split(',').map(value => value.trim()).filter(Boolean);
  return new Set([
    ...configured,
    'http://localhost:3000',
    'http://localhost:4173',
    'http://127.0.0.1:3000',
  ]);
}

function cors(request: Request) {
  const origin = request.headers.get('origin') || '';
  const reflected = allowedOrigins().has(origin) ? origin : '';
  return {
    ...(reflected ? { 'Access-Control-Allow-Origin': reflected, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'false',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
}

function assertOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && !allowedOrigins().has(origin)) throw new PanelAuthError('Origem do painel não autorizada.', 403);
}

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(request), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('WEB_PANEL_NOT_CONFIGURED');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function readBody(request: Request) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 24 * 1024) throw new Error('WEB_PANEL_PAYLOAD_TOO_LARGE');
  try {
    const value = await request.json();
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch { return {}; }
}

async function authorizedDevice(supabase: ReturnType<typeof serviceClient>, principal: Awaited<ReturnType<typeof requirePanelPrincipal>>, deviceId: string) {
  const { data: device, error } = await supabase.from('panel_devices').select(`
    id, device_code, client_name, status, subscription_expires_at, seller_id,
    web_access_enabled, web_pin_hash, web_session_limit, web_pin_updated_at
  `).eq('id', deviceId).maybeSingle();
  if (error || !device) throw new PanelAuthError('Aparelho não encontrado.', 404);
  if (principal.role === 'seller' && String(device.seller_id || '') !== principal.sellerId) {
    throw new PanelAuthError('Aparelho não pertence a este vendedor.', 403);
  }
  return device;
}

async function audit(
  supabase: ReturnType<typeof serviceClient>,
  principal: Awaited<ReturnType<typeof requirePanelPrincipal>>,
  deviceId: string,
  action: string,
) {
  const { error } = await supabase.from('web_player_admin_audit').insert({
    actor_user_id: principal.userId,
    actor_role: principal.role,
    seller_id: principal.sellerId,
    device_id: deviceId,
    action,
  });
  if (error) throw new Error('WEB_PANEL_AUDIT_FAILED');
}

async function status(request: Request, supabase: ReturnType<typeof serviceClient>, principal: Awaited<ReturnType<typeof requirePanelPrincipal>>, deviceId: string) {
  const device = await authorizedDevice(supabase, principal, deviceId);
  const { data: sessions, error } = await supabase.from('web_player_sessions')
    .select('id, created_at, last_used_at, idle_expires_at, absolute_expires_at, revoked_at, revoke_reason, user_agent_family')
    .eq('device_id', device.id)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new Error('WEB_PANEL_SESSIONS_FAILED');
  const now = Date.now();
  const activeSessions = (sessions || []).filter(row =>
    !row.revoked_at && new Date(row.idle_expires_at).getTime() > now && new Date(row.absolute_expires_at).getTime() > now
  );
  return json(request, {
    ok: true,
    device: {
      id: device.id,
      deviceCode: device.device_code,
      clientName: device.client_name || null,
      status: device.status,
      expiresAt: device.subscription_expires_at,
      webAccessEnabled: device.status === 'active' && Boolean(device.web_access_enabled),
      pinConfigured: Boolean(device.web_pin_hash),
      pinUpdatedAt: device.web_pin_updated_at || null,
      sessionLimit: Number(device.web_session_limit || 2),
      activeSessions: activeSessions.length,
    },
    sessions: (sessions || []).map(row => ({
      id: row.id,
      idShort: String(row.id).slice(0, 8),
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      idleExpiresAt: row.idle_expires_at,
      absoluteExpiresAt: row.absolute_expires_at,
      revokedAt: row.revoked_at,
      revokeReason: row.revoke_reason || null,
      browserFamily: row.user_agent_family || 'Browser',
      active: !row.revoked_at && new Date(row.idle_expires_at).getTime() > now && new Date(row.absolute_expires_at).getTime() > now,
    })),
  });
}

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors(request) });
  if (request.method !== 'POST') return json(request, { ok: false, code: 'WEB_PANEL_METHOD_NOT_ALLOWED' }, 405);
  const supabase = serviceClient();
  try {
    assertOrigin(request);
    const principal = await requirePanelPrincipal(request, supabase, ['owner','admin','seller']);
    const body = await readBody(request);
    const action = text(body.action, 32) || 'status';
    const deviceId = text(body.deviceId, 64);
    if (!deviceId || !/^[0-9a-f-]{36}$/i.test(deviceId)) return json(request, { ok: false, code: 'WEB_PANEL_DEVICE_REQUIRED' }, 400);
    const device = await authorizedDevice(supabase, principal, deviceId);

    if (action === 'status') return await status(request, supabase, principal, deviceId);

    if (action === 'set-pin' || action === 'reset-pin') {
      if (device.status !== 'active') return json(request, { ok: false, code: 'WEB_DEVICE_NOT_ACTIVE' }, 409);
      if (device.subscription_expires_at && new Date(device.subscription_expires_at).getTime() <= Date.now()) {
        return json(request, { ok: false, code: 'WEB_DEVICE_EXPIRED' }, 409);
      }
      const pin = text(body.pin, 16) || '';
      if (!/^\d{6}$/.test(pin)) return json(request, { ok: false, code: 'WEB_PIN_INVALID_FORMAT', message: 'Use um PIN de 6 dígitos.' }, 400);
      const salt = newPinSalt();
      const iterations = 210000;
      const hash = await deriveWebPin(pin, salt, iterations);
      const now = new Date().toISOString();
      const { error } = await supabase.from('panel_devices').update({
        web_access_enabled: true,
        web_pin_hash: hash,
        web_pin_salt: salt,
        web_pin_iterations: iterations,
        web_pin_updated_at: now,
        updated_at: now,
      }).eq('id', deviceId);
      if (error) throw new Error('WEB_PANEL_PIN_WRITE_FAILED');
      await supabase.from('web_player_sessions').update({ revoked_at: now, revoke_reason: 'pin_reset' })
        .eq('device_id', deviceId).is('revoked_at', null);
      await audit(supabase, principal, deviceId, action === 'reset-pin' ? 'reset_pin' : 'set_pin');
      return json(request, { ok: true, enabled: true, pinConfigured: true });
    }

    if (action === 'disable') {
      const now = new Date().toISOString();
      const { error } = await supabase.from('panel_devices').update({
        web_access_enabled: false,
        web_pin_hash: null,
        web_pin_salt: null,
        web_pin_updated_at: now,
        updated_at: now,
      }).eq('id', deviceId);
      if (error) throw new Error('WEB_PANEL_DISABLE_FAILED');
      await supabase.from('web_player_sessions').update({ revoked_at: now, revoke_reason: 'web_access_disabled' })
        .eq('device_id', deviceId).is('revoked_at', null);
      await audit(supabase, principal, deviceId, 'disable_web');
      return json(request, { ok: true, enabled: false });
    }

    if (action === 'revoke-session') {
      const sessionId = text(body.sessionId, 64);
      if (!sessionId || !/^[0-9a-f-]{36}$/i.test(sessionId)) return json(request, { ok: false, code: 'WEB_PANEL_SESSION_REQUIRED' }, 400);
      const now = new Date().toISOString();
      const { data, error } = await supabase.from('web_player_sessions').update({ revoked_at: now, revoke_reason: 'panel_revoked' })
        .eq('id', sessionId).eq('device_id', deviceId).is('revoked_at', null).select('id').maybeSingle();
      if (error) throw new Error('WEB_PANEL_REVOKE_FAILED');
      if (!data) return json(request, { ok: false, code: 'WEB_PANEL_SESSION_NOT_FOUND' }, 404);
      await audit(supabase, principal, deviceId, 'revoke_session');
      return json(request, { ok: true });
    }

    if (action === 'revoke-all') {
      const now = new Date().toISOString();
      const { error } = await supabase.from('web_player_sessions').update({ revoked_at: now, revoke_reason: 'panel_revoke_all' })
        .eq('device_id', deviceId).is('revoked_at', null);
      if (error) throw new Error('WEB_PANEL_REVOKE_FAILED');
      await audit(supabase, principal, deviceId, 'revoke_all');
      return json(request, { ok: true });
    }

    if (action === 'set-limit') {
      if (principal.role === 'seller') throw new PanelAuthError('Somente administração pode alterar o limite de sessões Web.', 403);
      const limit = Number(body.sessionLimit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 8) return json(request, { ok: false, code: 'WEB_SESSION_LIMIT_INVALID' }, 400);
      const { error } = await supabase.from('panel_devices').update({ web_session_limit: limit, updated_at: new Date().toISOString() }).eq('id', deviceId);
      if (error) throw new Error('WEB_PANEL_LIMIT_FAILED');
      await audit(supabase, principal, deviceId, 'set_session_limit');
      return json(request, { ok: true, sessionLimit: limit });
    }

    return json(request, { ok: false, code: 'WEB_PANEL_ACTION_INVALID' }, 400);
  } catch (error) {
    if (error instanceof PanelAuthError) return panelAuthErrorResponse(error, cors(request));
    const code = error instanceof Error ? error.message : 'WEB_PANEL_UNAVAILABLE';
    console.error('web-access-panel error', { code });
    return json(request, { ok: false, code: 'WEB_PANEL_UNAVAILABLE' }, 503);
  }
});
