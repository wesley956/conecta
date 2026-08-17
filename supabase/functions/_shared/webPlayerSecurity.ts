import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ACCESS_IDLE_MINUTES = 30;

export type WebSessionContext = {
  id: string;
  deviceId: string;
  deviceCode: string;
  clientName: string | null;
  sellerId: string | null;
  expiresAt: string | null;
  absoluteExpiresAt: string;
};

function allowedOrigins() {
  const configured = String(Deno.env.get('WEB_PLAYER_ORIGINS') || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  return new Set([
    ...configured,
    'http://localhost:4173',
    'http://localhost:5173',
    'http://127.0.0.1:4173',
    'http://127.0.0.1:5173',
  ]);
}

export function webCorsHeaders(request: Request) {
  const origin = request.headers.get('origin') || '';
  const allowed = allowedOrigins();
  const reflected = allowed.has(origin) ? origin : '';
  return {
    ...(reflected ? { 'Access-Control-Allow-Origin': reflected, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'false',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
}

export function assertWebOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return;
  if (!allowedOrigins().has(origin)) throw new Error('WEB_ORIGIN_NOT_ALLOWED');
}

export function webJson(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...webCorsHeaders(request),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, private',
    },
  });
}

export async function readWebJson(request: Request, maxBytes = 32 * 1024) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > maxBytes) throw new Error('WEB_PAYLOAD_TOO_LARGE');
  try {
    const value = await request.json();
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export function text(value: unknown, max = 256) {
  const result = String(value ?? '').trim();
  return result ? result.slice(0, max) : null;
}

export function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(value: string) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}

export function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export function randomToken(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

export async function deriveWebPin(pin: string, saltBase64Url: string, iterations: number) {
  if (!/^\d{6}$/.test(pin)) throw new Error('WEB_PIN_INVALID_FORMAT');
  const key = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt: base64UrlDecode(saltBase64Url),
    iterations: Math.max(100_000, Math.min(1_000_000, Math.trunc(iterations))),
  }, key, 256);
  return bytesToHex(new Uint8Array(bits));
}

export function newPinSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

function secretMaterial() {
  const explicit = Deno.env.get('WEB_PLAYER_TOKEN_SECRET');
  const fallback = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!explicit && !fallback) throw new Error('WEB_TOKEN_SECRET_NOT_CONFIGURED');
  return explicit || fallback!;
}

let encryptionKeyPromise: Promise<CryptoKey> | null = null;
async function encryptionKey() {
  if (!encryptionKeyPromise) {
    encryptionKeyPromise = (async () => {
      const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`roneca:web:v1:${secretMaterial()}`));
      return await crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    })();
  }
  return await encryptionKeyPromise;
}

export async function sealWebPayload(payload: Record<string, unknown>) {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const plaintext = encoder.encode(JSON.stringify(payload));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode('roneca-web-v1') },
    await encryptionKey(),
    plaintext,
  ));
  const combined = new Uint8Array(iv.length + encrypted.length);
  combined.set(iv, 0);
  combined.set(encrypted, iv.length);
  return base64UrlEncode(combined);
}

export async function openWebPayload<T extends Record<string, unknown>>(token: string): Promise<T> {
  if (!token || token.length > 4096) throw new Error('WEB_TOKEN_INVALID');
  try {
    const combined = base64UrlDecode(token);
    if (combined.length < 29) throw new Error('WEB_TOKEN_INVALID');
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: encoder.encode('roneca-web-v1') },
      await encryptionKey(),
      encrypted,
    );
    const parsed = JSON.parse(decoder.decode(plaintext));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('WEB_TOKEN_INVALID');
    return parsed as T;
  } catch (error) {
    if (error instanceof Error && error.message === 'WEB_TOKEN_INVALID') throw error;
    throw new Error('WEB_TOKEN_INVALID');
  }
}

export async function clientIpHash(request: Request) {
  const raw = (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0] ||
    'unknown'
  ).trim().slice(0, 128);
  return await sha256Hex(`${secretMaterial()}:ip:${raw}`);
}

export async function deviceCodeHash(code: string) {
  return await sha256Hex(`${secretMaterial()}:device-code:${code.toUpperCase()}`);
}

export function userAgentFamily(request: Request) {
  const ua = String(request.headers.get('user-agent') || '').toLowerCase();
  if (ua.includes('edg/')) return 'Edge';
  if (ua.includes('firefox/')) return 'Firefox';
  if (ua.includes('chrome/') || ua.includes('crios/')) return 'Chrome';
  if (ua.includes('safari/') && !ua.includes('chrome/')) return 'Safari';
  return 'Browser';
}

function bearerToken(request: Request) {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] || null;
}

export async function requireWebSession(
  request: Request,
  supabase: SupabaseClient,
  options: { touch?: boolean } = {},
): Promise<WebSessionContext> {
  const token = bearerToken(request);
  if (!token || token.length > 1024) throw new Error('WEB_SESSION_REQUIRED');
  const tokenHash = await sha256Hex(token);
  const { data: session, error } = await supabase
    .from('web_player_sessions')
    .select(`
      id, device_id, last_used_at, idle_expires_at, absolute_expires_at, revoked_at,
      device:panel_devices(id, device_code, client_name, seller_id, status, subscription_expires_at, web_access_enabled)
    `)
    .eq('access_token_hash', tokenHash)
    .maybeSingle();
  if (error || !session) throw new Error('WEB_SESSION_INVALID');
  if (session.revoked_at) throw new Error('WEB_SESSION_REVOKED');

  const device = Array.isArray(session.device) ? session.device[0] : session.device;
  if (!device || device.status !== 'active' || !device.web_access_enabled) {
    throw new Error('WEB_DEVICE_NOT_ACTIVE');
  }

  const now = Date.now();
  const idleAt = new Date(session.idle_expires_at).getTime();
  const absoluteAt = new Date(session.absolute_expires_at).getTime();
  const subscriptionAt = device.subscription_expires_at
    ? new Date(device.subscription_expires_at).getTime()
    : Number.POSITIVE_INFINITY;
  if (idleAt <= now || absoluteAt <= now || subscriptionAt <= now) {
    await supabase.from('web_player_sessions').update({
      revoked_at: new Date().toISOString(),
      revoke_reason: subscriptionAt <= now ? 'device_expired' : 'session_expired',
    }).eq('id', session.id).is('revoked_at', null);
    throw new Error(subscriptionAt <= now ? 'WEB_DEVICE_EXPIRED' : 'WEB_SESSION_EXPIRED');
  }

  if (options.touch !== false) {
    const newIdle = new Date(Math.min(
      absoluteAt,
      now + ACCESS_IDLE_MINUTES * 60 * 1000,
    )).toISOString();
    await supabase.from('web_player_sessions').update({
      last_used_at: new Date(now).toISOString(),
      idle_expires_at: newIdle,
    }).eq('id', session.id).is('revoked_at', null);
  }

  return {
    id: session.id,
    deviceId: device.id,
    deviceCode: device.device_code,
    clientName: device.client_name || null,
    sellerId: device.seller_id || null,
    expiresAt: device.subscription_expires_at || null,
    absoluteExpiresAt: session.absolute_expires_at,
  };
}

export async function revokeWebSession(supabase: SupabaseClient, sessionId: string, reason: string) {
  await supabase.from('web_player_sessions').update({
    revoked_at: new Date().toISOString(),
    revoke_reason: reason.slice(0, 120),
  }).eq('id', sessionId).is('revoked_at', null);
}
