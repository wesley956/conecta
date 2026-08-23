import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { createRemoteJWKSet, jwtVerify } from 'https://esm.sh/jose@5.9.6';
import {
  openWebPayload,
  sealWebPayload,
} from '../_shared/webPlayerSecurity.ts';
import {
  assertAllowedPlaylistUrl,
  isPrivateIpAddress,
} from '../_shared/outboundFetch.ts';

const TEAM_SLUG = 'cruzjade080-4490s-projects';
const PROJECT_NAME = 'conecta';
const AUDIENCE = `https://vercel.com/${TEAM_SLUG}`;
const TEAM_ISSUER = `https://oidc.vercel.com/${TEAM_SLUG}`;
const GLOBAL_ISSUER = 'https://oidc.vercel.com';
const TEAM_JWKS = createRemoteJWKSet(new URL(`${TEAM_ISSUER}/.well-known/jwks`));
const GLOBAL_JWKS = createRemoteJWKSet(new URL(`${GLOBAL_ISSUER}/.well-known/jwks`));
const CHILD_TOKEN_TTL_MS = 2 * 60 * 1000;
const MAX_CHILDREN = 120;
const encoder = new TextEncoder();

type MediaPayload = {
  v: number;
  kind: string;
  sessionId: string;
  deviceId: string;
  contentType?: string;
  contentKey?: string;
  playlistId: string;
  playlistRole?: string;
  url: string;
  exp: number;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('WEB_SERVER_NOT_CONFIGURED');
  return createClient(url, key, { auth: { persistSession: false } });
}

function secretMaterial() {
  const explicit = Deno.env.get('WEB_PLAYER_TOKEN_SECRET');
  const fallback = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!explicit && !fallback) throw new Error('WEB_TOKEN_SECRET_NOT_CONFIGURED');
  return explicit || fallback!;
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function deriveRelayKey(parentToken: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secretMaterial()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`roneca:web:relay:v1:${parentToken}`),
  ));
  return base64UrlEncode(signature);
}

function bearer(request: Request) {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] || '';
}

async function verifyVercelOidc(token: string) {
  try {
    return (await jwtVerify(token, TEAM_JWKS, {
      issuer: TEAM_ISSUER,
      audience: AUDIENCE,
    })).payload;
  } catch {
    return (await jwtVerify(token, GLOBAL_JWKS, {
      issuer: GLOBAL_ISSUER,
      audience: AUDIENCE,
    })).payload;
  }
}

async function requireVercelProject(request: Request) {
  const token = bearer(request);
  if (!token || token.length > 16_384) throw new Error('WEB_RELAY_OIDC_REQUIRED');
  const payload = await verifyVercelOidc(token);
  const subject = String(payload.sub || '');
  const validSubject = new Set([
    `owner:${TEAM_SLUG}:project:${PROJECT_NAME}:environment:production`,
    `owner:${TEAM_SLUG}:project:${PROJECT_NAME}:environment:preview`,
  ]);
  if (!validSubject.has(subject)) throw new Error('WEB_RELAY_OIDC_FORBIDDEN');
}

async function readBody(request: Request) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > 256 * 1024) throw new Error('WEB_RELAY_PAYLOAD_TOO_LARGE');
  const parsed = await request.json().catch(() => ({}));
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}

function isIpLiteral(hostname: string) {
  const normalized = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized.includes(':')) return true;
  const parts = normalized.split('.');
  return parts.length === 4 && parts.every(part => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const value = Number(part);
    return Number.isInteger(value) && value >= 0 && value <= 255;
  });
}

function safeMediaUrl(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw || raw.length > 8192) throw new Error('WEB_RELAY_URL_INVALID');
  const url = assertAllowedPlaylistUrl(raw);
  if (url.username || url.password) throw new Error('WEB_RELAY_URL_INVALID');
  if (isIpLiteral(url.hostname) && isPrivateIpAddress(url.hostname)) {
    throw new Error('WEB_RELAY_PRIVATE_TARGET');
  }
  return url.toString();
}

async function openMediaToken(value: unknown) {
  const token = String(value || '').trim();
  if (!token || token.length > 8192) throw new Error('WEB_MEDIA_TOKEN_INVALID');
  const payload = await openWebPayload<MediaPayload & Record<string, unknown>>(token);
  if (
    payload.v !== 1 ||
    !String(payload.kind || '').startsWith('media') ||
    typeof payload.sessionId !== 'string' ||
    typeof payload.deviceId !== 'string' ||
    typeof payload.playlistId !== 'string' ||
    typeof payload.url !== 'string' ||
    Number(payload.exp || 0) <= Date.now()
  ) throw new Error('WEB_MEDIA_TOKEN_INVALID');
  payload.url = safeMediaUrl(payload.url);
  return { token, payload };
}

async function validateSession(payload: MediaPayload) {
  const supabase = serviceClient();
  const { data: session, error } = await supabase.from('web_player_sessions').select(`
    id, device_id, idle_expires_at, absolute_expires_at, revoked_at,
    device:panel_devices(
      id, status, subscription_expires_at, web_access_enabled, playlist_id,
      device_playlists:panel_device_playlists(playlist_id, active)
    )
  `).eq('id', payload.sessionId).eq('device_id', payload.deviceId).maybeSingle();
  if (error || !session || session.revoked_at) throw new Error('WEB_MEDIA_SESSION_INVALID');
  const device = Array.isArray(session.device) ? session.device[0] : session.device;
  const now = Date.now();
  if (
    !device ||
    device.status !== 'active' ||
    !device.web_access_enabled ||
    new Date(session.idle_expires_at).getTime() <= now ||
    new Date(session.absolute_expires_at).getTime() <= now ||
    (device.subscription_expires_at && new Date(device.subscription_expires_at).getTime() <= now)
  ) throw new Error('WEB_MEDIA_SESSION_INVALID');

  const assigned = String(device.playlist_id || '') === payload.playlistId ||
    (device.device_playlists || []).some((entry: { playlist_id?: string; active?: boolean }) =>
      entry.active !== false && String(entry.playlist_id || '') === payload.playlistId
    );
  if (!assigned) throw new Error('WEB_MEDIA_PLAYLIST_CHANGED');

  const absoluteAt = new Date(session.absolute_expires_at).getTime();
  await supabase.from('web_player_sessions').update({
    last_used_at: new Date(now).toISOString(),
    idle_expires_at: new Date(Math.min(absoluteAt, now + 30 * 60_000)).toISOString(),
  }).eq('id', session.id).is('revoked_at', null);
}

async function resolveMedia(body: Record<string, unknown>) {
  const { token, payload } = await openMediaToken(body.token);
  let relayKey: string | null = null;
  if (payload.kind !== 'media-child') {
    await validateSession(payload);
    relayKey = await deriveRelayKey(token);
  }
  return json({
    ok: true,
    url: payload.url,
    contentType: payload.contentType || null,
    playlistRole: payload.playlistRole || null,
    expiresAt: new Date(Number(payload.exp)).toISOString(),
    relayKey,
  });
}

async function sealChildren(body: Record<string, unknown>) {
  const { payload } = await openMediaToken(body.parentToken || body.token);
  await validateSession(payload);
  const rawUrls = Array.isArray(body.urls) ? body.urls : [];
  if (!rawUrls.length || rawUrls.length > MAX_CHILDREN) throw new Error('WEB_RELAY_CHILDREN_INVALID');
  const parentUrl = new URL(payload.url);
  const expiresAt = Math.min(Number(payload.exp), Date.now() + CHILD_TOKEN_TTL_MS);
  const tokens: string[] = [];
  for (const raw of rawUrls) {
    const absolute = new URL(String(raw || ''), parentUrl).toString();
    const childUrl = safeMediaUrl(absolute);
    tokens.push(await sealWebPayload({
      ...payload,
      kind: 'media-child',
      url: childUrl,
      exp: expiresAt,
    }));
  }
  return json({ ok: true, tokens, expiresAt: new Date(expiresAt).toISOString() });
}

serve(async request => {
  if (request.method !== 'POST') return json({ ok: false, code: 'WEB_METHOD_NOT_ALLOWED' }, 405);
  try {
    await requireVercelProject(request);
    const body = await readBody(request);
    const action = String(body.action || 'resolve');
    if (action === 'resolve') return await resolveMedia(body);
    if (action === 'sealChildren') return await sealChildren(body);
    return json({ ok: false, code: 'WEB_RELAY_ACTION_INVALID' }, 400);
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'WEB_RELAY_ERROR';
    const code = raw.startsWith('WEB_') ? raw : 'WEB_RELAY_OIDC_INVALID';
    if (code.includes('OIDC')) return json({ ok: false, code: 'WEB_RELAY_UNAUTHORIZED' }, 401);
    if (/TOKEN|SESSION|PLAYLIST_CHANGED/.test(code)) return json({ ok: false, code: 'WEB_MEDIA_UNAUTHORIZED' }, 401);
    if (/URL|PRIVATE_TARGET|CHILDREN|PAYLOAD/.test(code)) return json({ ok: false, code }, 400);
    console.error('web-player-media-resolve-v4 error', { code });
    return json({ ok: false, code: 'WEB_RELAY_UNAVAILABLE' }, 503);
  }
});
