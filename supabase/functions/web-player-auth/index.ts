import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  assertWebOrigin,
  clientIpHash,
  constantTimeEqual,
  deriveWebPin,
  deviceCodeHash,
  randomToken,
  readWebJson,
  requireWebSession,
  revokeWebSession,
  sha256Hex,
  text,
  userAgentFamily,
  webCorsHeaders,
  webJson,
} from '../_shared/webPlayerSecurity.ts';
import { enforceWebRateLimit } from '../_shared/webRateLimit.ts';

const LOGIN_WINDOW_MINUTES = 15;
const MAX_CODE_FAILURES = 8;
const MAX_IP_FAILURES = 30;
const IDLE_MINUTES = 30;
const ABSOLUTE_DAYS = 7;

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('WEB_SERVER_NOT_CONFIGURED');
  return createClient(url, key, { auth: { persistSession: false } });
}

function genericLoginError(request: Request, status = 401) {
  return webJson(request, {
    ok: false,
    code: status === 429 ? 'WEB_LOGIN_THROTTLED' : 'WEB_LOGIN_INVALID',
    message: status === 429
      ? 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
      : 'Não foi possível entrar com esses dados.',
  }, status);
}

async function recordAttempt(supabase: ReturnType<typeof serviceClient>, codeHash: string, ipHash: string, success: boolean) {
  await supabase.from('web_player_login_attempts').insert({ code_hash: codeHash, ip_hash: ipHash, success });
}

async function throttled(supabase: ReturnType<typeof serviceClient>, codeHash: string, ipHash: string) {
  const since = new Date(Date.now() - LOGIN_WINDOW_MINUTES * 60_000).toISOString();
  const [{ count: codeCount }, { count: ipCount }] = await Promise.all([
    supabase.from('web_player_login_attempts').select('id', { count: 'exact', head: true })
      .eq('code_hash', codeHash).eq('success', false).gte('attempted_at', since),
    supabase.from('web_player_login_attempts').select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash).eq('success', false).gte('attempted_at', since),
  ]);
  return Number(codeCount || 0) >= MAX_CODE_FAILURES || Number(ipCount || 0) >= MAX_IP_FAILURES;
}

async function login(request: Request, body: Record<string, unknown>) {
  const supabase = serviceClient();
  const code = text(body.deviceCode || body.code, 80)?.toUpperCase() || '';
  const pin = text(body.pin, 16) || '';
  const ipHash = await clientIpHash(request);
  const codeHash = await deviceCodeHash(code || 'invalid');
  if (!/^[A-Z0-9-]{4,80}$/.test(code) || !/^\d{6}$/.test(pin)) {
    await recordAttempt(supabase, codeHash, ipHash, false).catch(() => undefined);
    return genericLoginError(request);
  }
  if (await throttled(supabase, codeHash, ipHash)) return genericLoginError(request, 429);

  const { data: device } = await supabase.from('panel_devices').select(`
    id, status, subscription_expires_at, web_access_enabled,
    web_pin_hash, web_pin_salt, web_pin_iterations, web_session_limit
  `).eq('device_code', code).maybeSingle();
  const expired = device?.subscription_expires_at ? new Date(device.subscription_expires_at).getTime() <= Date.now() : false;
  const eligible = Boolean(device && device.status === 'active' && !expired && device.web_access_enabled && device.web_pin_hash && device.web_pin_salt);
  let validPin = false;
  if (eligible && device) {
    try {
      const derived = await deriveWebPin(pin, device.web_pin_salt, Number(device.web_pin_iterations || 210000));
      validPin = constantTimeEqual(derived, device.web_pin_hash);
    } catch { validPin = false; }
  } else {
    await deriveWebPin(pin, 'MDEyMzQ1Njc4OWFiY2RlZg', 210000).catch(() => undefined);
  }
  if (!eligible || !validPin || !device) {
    await recordAttempt(supabase, codeHash, ipHash, false).catch(() => undefined);
    return genericLoginError(request);
  }

  const accessToken = randomToken(32);
  const refreshToken = randomToken(48);
  const now = Date.now();
  const idleExpiresAt = new Date(now + IDLE_MINUTES * 60_000).toISOString();
  const absoluteExpiresAt = new Date(now + ABSOLUTE_DAYS * 24 * 60 * 60_000).toISOString();
  const [accessHash, refreshHash] = await Promise.all([sha256Hex(accessToken), sha256Hex(refreshToken)]);
  const { data: sessionId, error: sessionError } = await supabase.rpc('web_player_create_session', {
    p_device_id: device.id,
    p_access_token_hash: accessHash,
    p_refresh_token_hash: refreshHash,
    p_idle_expires_at: idleExpiresAt,
    p_absolute_expires_at: absoluteExpiresAt,
    p_user_agent_family: userAgentFamily(request),
    p_client_ip_hash: ipHash,
  });
  if (sessionError || !sessionId) {
    const message = String(sessionError?.message || '');
    if (message.includes('WEB_SESSION_LIMIT_REACHED')) return webJson(request, {
      ok: false, code: 'WEB_SESSION_LIMIT_REACHED', message: 'O limite de navegadores ativos para este acesso foi atingido.',
    }, 409);
    console.error('web-player-auth session create failed', { code: sessionError?.code || null });
    return webJson(request, { ok: false, code: 'WEB_LOGIN_UNAVAILABLE', message: 'Acesso Web temporariamente indisponível.' }, 503);
  }
  await recordAttempt(supabase, codeHash, ipHash, true).catch(() => undefined);
  return webJson(request, { ok: true, accessToken, refreshToken, session: { id: sessionId, idleExpiresAt, absoluteExpiresAt } });
}

async function refresh(request: Request, body: Record<string, unknown>) {
  const refreshToken = text(body.refreshToken, 1024);
  if (!refreshToken) return webJson(request, { ok: false, code: 'WEB_REFRESH_REQUIRED' }, 401);
  const supabase = serviceClient();
  const refreshHash = await sha256Hex(refreshToken);
  const { data: session } = await supabase.from('web_player_sessions').select(`
    id, device_id, idle_expires_at, absolute_expires_at, revoked_at, generation,
    device:panel_devices(id, status, subscription_expires_at, web_access_enabled)
  `).eq('refresh_token_hash', refreshHash).maybeSingle();
  if (!session || session.revoked_at) return webJson(request, { ok: false, code: 'WEB_REFRESH_INVALID' }, 401);
  await enforceWebRateLimit(supabase, 'refresh', `session:${session.id}`);

  const device = Array.isArray(session.device) ? session.device[0] : session.device;
  const now = Date.now();
  const absoluteAt = new Date(session.absolute_expires_at).getTime();
  const idleAt = new Date(session.idle_expires_at).getTime();
  const subscriptionAt = device?.subscription_expires_at ? new Date(device.subscription_expires_at).getTime() : Number.POSITIVE_INFINITY;
  if (!device || device.status !== 'active' || !device.web_access_enabled || idleAt <= now || absoluteAt <= now || subscriptionAt <= now) {
    await revokeWebSession(supabase, session.id, 'refresh_denied');
    return webJson(request, { ok: false, code: 'WEB_REFRESH_INVALID' }, 401);
  }

  const nextAccessToken = randomToken(32);
  const nextRefreshToken = randomToken(48);
  const [nextAccessHash, nextRefreshHash] = await Promise.all([sha256Hex(nextAccessToken), sha256Hex(nextRefreshToken)]);
  const nextIdleAt = new Date(Math.min(absoluteAt, now + IDLE_MINUTES * 60_000)).toISOString();
  const { data: rotated, error } = await supabase.from('web_player_sessions').update({
    access_token_hash: nextAccessHash,
    refresh_token_hash: nextRefreshHash,
    generation: Number(session.generation || 1) + 1,
    last_used_at: new Date(now).toISOString(),
    idle_expires_at: nextIdleAt,
  }).eq('id', session.id).eq('refresh_token_hash', refreshHash).is('revoked_at', null).select('id').maybeSingle();
  if (error || !rotated) return webJson(request, { ok: false, code: 'WEB_REFRESH_REPLAYED' }, 401);
  return webJson(request, {
    ok: true,
    accessToken: nextAccessToken,
    refreshToken: nextRefreshToken,
    session: { id: session.id, idleExpiresAt: nextIdleAt, absoluteExpiresAt: session.absolute_expires_at },
  });
}

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: webCorsHeaders(request) });
  if (request.method !== 'POST') return webJson(request, { ok: false, code: 'WEB_METHOD_NOT_ALLOWED' }, 405);
  try {
    assertWebOrigin(request);
    const body = await readWebJson(request);
    const action = text(body.action, 32) || 'login';
    if (action === 'login') return await login(request, body);
    if (action === 'refresh') return await refresh(request, body);
    if (action === 'session') {
      const session = await requireWebSession(request, serviceClient());
      return webJson(request, { ok: true, session });
    }
    if (action === 'logout') {
      const supabase = serviceClient();
      const session = await requireWebSession(request, supabase, { touch: false });
      await revokeWebSession(supabase, session.id, 'user_logout');
      return webJson(request, { ok: true });
    }
    return webJson(request, { ok: false, code: 'WEB_ACTION_INVALID' }, 400);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'WEB_AUTH_ERROR';
    if (code === 'WEB_ORIGIN_NOT_ALLOWED') return webJson(request, { ok: false, code }, 403);
    if (code === 'WEB_RATE_LIMITED') return webJson(request, { ok: false, code, message: 'Muitas renovações de sessão. Aguarde um instante.' }, 429);
    if (code.startsWith('WEB_SESSION_') || code.startsWith('WEB_DEVICE_')) {
      return webJson(request, { ok: false, code, message: 'Sua sessão não está mais disponível.' }, 401);
    }
    console.error('web-player-auth unexpected error', { code });
    return webJson(request, { ok: false, code: 'WEB_AUTH_UNAVAILABLE', message: 'Acesso Web temporariamente indisponível.' }, 503);
  }
});
