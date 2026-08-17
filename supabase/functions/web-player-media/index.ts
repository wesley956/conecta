import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  assertAllowedPlaylistUrl,
  assertPublicPlaylistTarget,
} from '../_shared/outboundFetch.ts';
import {
  assertWebOrigin,
  openWebPayload,
  sealWebPayload,
  webCorsHeaders,
  webJson,
} from '../_shared/webPlayerSecurity.ts';

const MAX_REDIRECTS = 4;
const HEADER_TIMEOUT_MS = 20_000;
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const CHILD_TOKEN_TTL_MS = 12 * 60 * 1000;
const HOMOLOG_ORIGIN = 'https://raw.githack.com';
const UPSTREAM_HEADERS = {
  Accept: '*/*',
  'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
};

type MediaToken = {
  v: number;
  kind: string;
  sessionId: string;
  deviceId: string;
  contentType?: string;
  playlistId: string;
  playlistRole?: string;
  url: string;
  exp: number;
};

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('WEB_SERVER_NOT_CONFIGURED');
  return createClient(url, key, { auth: { persistSession: false } });
}

function gatewayOriginAllowed(request: Request) {
  const origin = String(request.headers.get('origin') || '').trim();
  if (!origin) return false;
  const configured = String(Deno.env.get('WEB_PLAYER_ORIGINS') || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  if (configured.includes(origin) || origin === HOMOLOG_ORIGIN) return true;
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && url.hostname.endsWith('.vercel.app');
  } catch {
    return false;
  }
}

async function validateSession(sessionId: string, deviceId: string, playlistId: string) {
  const supabase = serviceClient();
  const { data: session, error } = await supabase.from('web_player_sessions').select(`
    id, device_id, idle_expires_at, absolute_expires_at, revoked_at,
    device:panel_devices(
      id, status, subscription_expires_at, web_access_enabled, playlist_id,
      device_playlists:panel_device_playlists(playlist_id, active)
    )
  `).eq('id', sessionId).eq('device_id', deviceId).maybeSingle();
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

  const assigned = String(device.playlist_id || '') === playlistId ||
    (device.device_playlists || []).some((entry: { playlist_id?: string; active?: boolean }) =>
      entry.active !== false && String(entry.playlist_id || '') === playlistId
    );
  if (!assigned) throw new Error('WEB_MEDIA_PLAYLIST_CHANGED');

  const absoluteAt = new Date(session.absolute_expires_at).getTime();
  await supabase.from('web_player_sessions').update({
    last_used_at: new Date(now).toISOString(),
    idle_expires_at: new Date(Math.min(absoluteAt, now + 30 * 60_000)).toISOString(),
  }).eq('id', session.id).is('revoked_at', null);
}

async function fetchUpstream(rawUrl: string, request: Request, redirectsLeft = MAX_REDIRECTS): Promise<Response> {
  const target = assertAllowedPlaylistUrl(rawUrl);
  await assertPublicPlaylistTarget(target);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEADER_TIMEOUT_MS);
  try {
    const headers = new Headers(UPSTREAM_HEADERS);
    const range = request.headers.get('range');
    if (range && /^bytes=\d*-\d*$/i.test(range)) headers.set('Range', range);
    const response = await fetch(target, {
      method: request.method === 'HEAD' ? 'HEAD' : 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers,
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirectsLeft <= 0) throw new Error('WEB_MEDIA_REDIRECT_INVALID');
      return await fetchUpstream(new URL(location, target).toString(), request, redirectsLeft - 1);
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}

function isManifest(response: Response, targetUrl: string) {
  const type = String(response.headers.get('content-type') || '').toLowerCase();
  return /mpegurl|m3u8/.test(type) || /\.m3u8(?:$|\?)/i.test(targetUrl);
}

async function readManifest(response: Response) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > MAX_MANIFEST_BYTES) throw new Error('WEB_MEDIA_MANIFEST_TOO_LARGE');
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_MANIFEST_BYTES) {
      await reader.cancel('manifest too large');
      throw new Error('WEB_MEDIA_MANIFEST_TOO_LARGE');
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged).replace(/^\uFEFF/, '');
}

async function childUrl(request: Request, parent: MediaToken, rawUrl: string) {
  const absolute = new URL(rawUrl, parent.url).toString();
  const exp = Math.min(Number(parent.exp), Date.now() + CHILD_TOKEN_TTL_MS);
  const token = await sealWebPayload({
    ...parent,
    kind: 'media-child',
    url: absolute,
    exp,
  });
  const current = new URL(request.url);
  return `${current.origin}${current.pathname}?token=${encodeURIComponent(token)}`;
}

async function rewriteAttributeUris(request: Request, parent: MediaToken, line: string) {
  const regex = /URI="([^"]+)"/g;
  let cursor = 0;
  let result = '';
  for (const match of line.matchAll(regex)) {
    const index = match.index ?? 0;
    result += line.slice(cursor, index);
    const replacement = await childUrl(request, parent, match[1]);
    result += `URI="${replacement}"`;
    cursor = index + match[0].length;
  }
  return result + line.slice(cursor);
}

async function rewriteManifest(request: Request, parent: MediaToken, manifest: string) {
  const output: string[] = [];
  for (const rawLine of manifest.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      output.push(rawLine);
      continue;
    }
    if (line.startsWith('#')) {
      output.push(line.includes('URI="') ? await rewriteAttributeUris(request, parent, rawLine) : rawLine);
      continue;
    }
    output.push(await childUrl(request, parent, line));
  }
  return output.join('\n');
}

function mediaHeaders(request: Request, upstream: Response) {
  const headers = new Headers(webCorsHeaders(request));
  const pass = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified'];
  for (const name of pass) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set('Cache-Control', 'private, max-age=30');
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  return headers;
}

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: webCorsHeaders(request) });
  if (!['GET', 'HEAD'].includes(request.method)) return webJson(request, { ok: false, code: 'WEB_METHOD_NOT_ALLOWED' }, 405);
  try {
    assertWebOrigin(request);
    const gatewayEnabled =
      /^(1|true|yes)$/i.test(String(Deno.env.get('WEB_MEDIA_GATEWAY_ENABLED') || '')) ||
      gatewayOriginAllowed(request);
    if (!gatewayEnabled) {
      return webJson(request, { ok: false, code: 'WEB_MEDIA_GATEWAY_DISABLED' }, 503);
    }
    const tokenValue = new URL(request.url).searchParams.get('token') || '';
    const payload = await openWebPayload<MediaToken & Record<string, unknown>>(tokenValue);
    if (
      payload.v !== 1 ||
      !String(payload.kind || '').startsWith('media') ||
      typeof payload.sessionId !== 'string' ||
      typeof payload.deviceId !== 'string' ||
      typeof payload.playlistId !== 'string' ||
      typeof payload.url !== 'string' ||
      Number(payload.exp || 0) <= Date.now()
    ) throw new Error('WEB_MEDIA_TOKEN_INVALID');

    await validateSession(payload.sessionId, payload.deviceId, payload.playlistId);
    const upstream = await fetchUpstream(payload.url, request);
    if (!upstream.ok && upstream.status !== 206) {
      return new Response(null, { status: upstream.status, headers: mediaHeaders(request, upstream) });
    }

    if (request.method === 'GET' && isManifest(upstream, payload.url)) {
      const manifest = await readManifest(upstream);
      const rewritten = await rewriteManifest(request, payload as MediaToken, manifest);
      return new Response(rewritten, {
        status: 200,
        headers: {
          ...webCorsHeaders(request),
          'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
          'Cache-Control': 'no-store, private',
          'Cross-Origin-Resource-Policy': 'cross-origin',
        },
      });
    }

    return new Response(request.method === 'HEAD' ? null : upstream.body, {
      status: upstream.status,
      headers: mediaHeaders(request, upstream),
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'WEB_MEDIA_ERROR';
    if (code === 'WEB_ORIGIN_NOT_ALLOWED') return webJson(request, { ok: false, code }, 403);
    if (/TOKEN|SESSION|PLAYLIST_CHANGED/.test(code)) return webJson(request, { ok: false, code: 'WEB_MEDIA_UNAUTHORIZED' }, 401);
    console.error('web-player-media error', { code });
    return webJson(request, {
      ok: false,
      code: 'WEB_MEDIA_UPSTREAM_ERROR',
      message: 'A mídia não pôde ser entregue pelo gateway Web.',
    }, 502);
  }
});
