import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns/promises';
import net from 'node:net';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const RESOLVER_URL = 'https://awauvkjkucjqulkklmuo.supabase.co/functions/v1/web-player-media-resolve';
const MAX_REDIRECTS = 4;
const HEADER_TIMEOUT_MS = 20_000;
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const MAX_RANGE_BYTES = 64 * 1024 * 1024;
const LOCAL_TICKET_TTL_MS = 9 * 60 * 1000;
const REDIRECT_CACHE_SECONDS = 300;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const PASS_HEADERS = new Set([
  'content-type', 'content-length', 'content-range', 'accept-ranges',
  'etag', 'last-modified', 'content-disposition',
]);
const UPSTREAM_HEADERS = {
  Accept: '*/*',
  'Accept-Encoding': 'identity',
  'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
};

const HTTP_AGENT = new http.Agent({ keepAlive: true, maxSockets: 32, maxFreeSockets: 8, timeout: 30_000 });
const HTTPS_AGENT = new https.Agent({ keepAlive: true, maxSockets: 32, maxFreeSockets: 8, timeout: 30_000 });
const LEGACY_HTTPS_AGENT = new https.Agent({ keepAlive: true, maxSockets: 32, maxFreeSockets: 8, timeout: 30_000, rejectUnauthorized: false });
const INITIAL_TICKET_CACHE = new Map();

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

function privateIpv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return true;
  const [a, b, c] = parts;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function privateIpv6(ip) {
  const value = ip.toLowerCase().split('%')[0];
  if (value === '::' || value === '::1') return true;
  if (value.startsWith('fc') || value.startsWith('fd') || /^f[89ab]/.test(value)) return true;
  if (value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')) return true;
  if (value.startsWith('2001:db8:')) return true;
  if (value.startsWith('::ffff:')) {
    const mapped = value.slice('::ffff:'.length);
    if (net.isIP(mapped) === 4) return privateIpv4(mapped);
  }
  return false;
}

function isPrivateIp(ip) {
  const normalized = ip.replace(/^\[|\]$/g, '');
  const family = net.isIP(normalized);
  if (family === 4) return privateIpv4(normalized);
  if (family === 6) return privateIpv6(normalized);
  return true;
}

function validateUrlShape(raw) {
  const url = new URL(String(raw || ''));
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('RELAY_PROTOCOL');
  if (url.username || url.password) throw new Error('RELAY_USERINFO');
  const hostname = url.hostname.toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('RELAY_LOCALHOST');
  }
  return url;
}

async function assertPublicTarget(url) {
  const literal = net.isIP(url.hostname.replace(/^\[|\]$/g, ''));
  if (literal) {
    if (isPrivateIp(url.hostname)) throw new Error('RELAY_PRIVATE_IP');
    return;
  }
  const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(item => isPrivateIp(item.address))) throw new Error('RELAY_PRIVATE_DNS');
}

function runtimeOidc(req) {
  const header = req.headers['x-vercel-oidc-token'];
  const value = Array.isArray(header) ? header[0] : header;
  return String(process.env.VERCEL_OIDC_TOKEN || value || '').trim();
}

function ticketKey(oidc) {
  if (!oidc) throw new Error('RELAY_OIDC_MISSING');
  return createHash('sha256').update('roneca:web-media-relay:v2\0').update(oidc).digest();
}

function encodeTicket(payload, oidc) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', ticketKey(oidc), iv);
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const encrypted = Buffer.concat([cipher.update(body), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

function decodeTicket(value, oidc) {
  const raw = Buffer.from(String(value || ''), 'base64url');
  if (raw.length < 29 || raw.length > 16_384) throw new Error('RELAY_TICKET_INVALID');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', ticketKey(oidc), iv);
  decipher.setAuthTag(tag);
  const decoded = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  const payload = JSON.parse(decoded);
  if (!payload || payload.v !== 2 || typeof payload.url !== 'string' || Number(payload.exp || 0) <= Date.now()) {
    throw new Error('RELAY_TICKET_EXPIRED');
  }
  payload.url = validateUrlShape(payload.url).toString();
  return payload;
}

async function resolver(payload, oidc) {
  if (!oidc) throw new Error('RELAY_OIDC_MISSING');
  const response = await fetch(RESOLVER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${oidc}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'resolve', ...payload }),
    cache: 'no-store',
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(String(body?.code || `RELAY_RESOLVER_${response.status}`));
    error.status = response.status;
    throw error;
  }
  return body;
}

function cacheInitialTicket(token, ticket, exp) {
  const now = Date.now();
  if (INITIAL_TICKET_CACHE.size > 2048) {
    for (const [key, value] of INITIAL_TICKET_CACHE) {
      if (Number(value.exp || 0) <= now) INITIAL_TICKET_CACHE.delete(key);
      if (INITIAL_TICKET_CACHE.size <= 1536) break;
    }
  }
  INITIAL_TICKET_CACHE.set(token, { ticket, exp });
}

function cachedInitialTicket(token) {
  const hit = INITIAL_TICKET_CACHE.get(token);
  if (!hit) return '';
  if (Number(hit.exp || 0) <= Date.now()) {
    INITIAL_TICKET_CACHE.delete(token);
    return '';
  }
  return String(hit.ticket || '');
}

function boundedRange(raw, forceFileRange) {
  const value = String(raw || '').trim();
  if (!value) return forceFileRange ? `bytes=0-${MAX_RANGE_BYTES - 1}` : '';
  let match = value.match(/^bytes=(\d+)-(\d*)$/i);
  if (match) {
    const start = Number(match[1]);
    if (!Number.isSafeInteger(start) || start < 0) return '';
    const requestedEnd = match[2] ? Number(match[2]) : start + MAX_RANGE_BYTES - 1;
    const end = Math.min(
      Number.isSafeInteger(requestedEnd) && requestedEnd >= start ? requestedEnd : start + MAX_RANGE_BYTES - 1,
      start + MAX_RANGE_BYTES - 1,
    );
    return `bytes=${start}-${end}`;
  }
  match = value.match(/^bytes=-(\d+)$/i);
  if (match) {
    const amount = Math.min(Math.max(1, Number(match[1]) || 1), MAX_RANGE_BYTES);
    return `bytes=-${amount}`;
  }
  return forceFileRange ? `bytes=0-${MAX_RANGE_BYTES - 1}` : '';
}

function isManifestUrl(url) {
  return /\.m3u8(?:$|\?)/i.test(url.toString());
}

function isFileMedia(url, contentType) {
  if (contentType === 'movie' || contentType === 'episode') return true;
  return /\.(mp4|m4v|webm|mov|mkv)(?:$|\?)/i.test(url.toString());
}

async function requestUpstream(rawUrl, options = {}, redirectsLeft = MAX_REDIRECTS) {
  const target = validateUrlShape(rawUrl);
  await assertPublicTarget(target);
  const isHttps = target.protocol === 'https:';
  const literalIp = net.isIP(target.hostname.replace(/^\[|\]$/g, '')) > 0;
  const requester = isHttps ? https.request : http.request;
  const agent = isHttps ? (literalIp ? LEGACY_HTTPS_AGENT : HTTPS_AGENT) : HTTP_AGENT;

  return await new Promise((resolve, reject) => {
    const headers = { ...UPSTREAM_HEADERS };
    if (options.range) headers.Range = options.range;
    const request = requester(target, {
      method: options.method === 'HEAD' ? 'HEAD' : 'GET',
      headers,
      agent,
      rejectUnauthorized: isHttps ? !literalIp : undefined,
    }, response => {
      const status = Number(response.statusCode || 502);
      const location = Array.isArray(response.headers.location) ? response.headers.location[0] : response.headers.location;
      if (REDIRECTS.has(status)) {
        response.resume();
        if (!location || redirectsLeft <= 0) return reject(new Error('RELAY_REDIRECT_INVALID'));
        let next;
        try { next = new URL(location, target); }
        catch { return reject(new Error('RELAY_REDIRECT_INVALID')); }
        void requestUpstream(next.toString(), options, redirectsLeft - 1).then(resolve).catch(reject);
        return;
      }
      resolve({ response, url: target });
    });
    request.setTimeout(HEADER_TIMEOUT_MS, () => request.destroy(new Error('RELAY_UPSTREAM_TIMEOUT')));
    request.on('error', reject);
    request.end();
  });
}

async function readLimited(stream, maxBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of stream) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += data.length;
    if (total > maxBytes) {
      stream.destroy();
      throw new Error('RELAY_MANIFEST_TOO_LARGE');
    }
    chunks.push(data);
  }
  return Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, '');
}

function manifestUrls(manifest, parentUrl) {
  const ordered = [];
  const seen = new Set();
  const add = raw => {
    try {
      const absolute = new URL(raw, parentUrl).toString();
      if (!seen.has(absolute)) { seen.add(absolute); ordered.push(absolute); }
    } catch { /* invalid child is left untouched */ }
  };
  for (const rawLine of manifest.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    for (const match of line.matchAll(/URI="([^"]+)"/g)) add(match[1]);
    if (!line.startsWith('#')) add(line);
  }
  return ordered;
}

function localTicketMap(urls, parent, oidc) {
  const map = new Map();
  const exp = Math.min(Number(parent.exp || 0), Date.now() + LOCAL_TICKET_TTL_MS);
  for (const url of urls) {
    const safe = validateUrlShape(url).toString();
    map.set(url, encodeTicket({ v: 2, url: safe, contentType: parent.contentType || null, exp }, oidc));
  }
  return map;
}

function rewriteManifest(manifest, parentUrl, ticketMap) {
  const relayPath = ticket => `/api/web-media-relay?ticket=${encodeURIComponent(ticket)}`;
  return manifest.split(/\r?\n/).map(rawLine => {
    const line = rawLine.trim();
    if (!line) return rawLine;
    let result = rawLine.replace(/URI="([^"]+)"/g, (full, raw) => {
      try {
        const absolute = new URL(raw, parentUrl).toString();
        const ticket = ticketMap.get(absolute);
        return ticket ? `URI="${relayPath(ticket)}"` : full;
      } catch { return full; }
    });
    if (!line.startsWith('#')) {
      try {
        const absolute = new URL(line, parentUrl).toString();
        const ticket = ticketMap.get(absolute);
        if (ticket) result = relayPath(ticket);
      } catch { /* unchanged */ }
    }
    return result;
  }).join('\n');
}

function copyHeaders(upstream, res, fileMedia) {
  for (const [name, value] of Object.entries(upstream.headers)) {
    if (!PASS_HEADERS.has(name.toLowerCase()) || value == null) continue;
    res.setHeader(name, value);
  }
  res.setHeader('Cache-Control', fileMedia ? 'private, max-age=30' : 'private, max-age=10');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-Roneca-Media-Relay', 'v2');
}

function redirectToTicket(res, ticket) {
  res.statusCode = 307;
  res.setHeader('Location', `/api/web-media-relay?ticket=${encodeURIComponent(ticket)}`);
  res.setHeader('Cache-Control', `private, max-age=${REDIRECT_CACHE_SECONDS}`);
  res.setHeader('X-Roneca-Media-Relay', 'v2-ticket');
  res.end();
}

export default async function mediaRelayHandler(req, res) {
  if (!['GET', 'HEAD'].includes(req.method || '')) return json(res, 405, { ok: false, code: 'WEB_METHOD_NOT_ALLOWED' });
  try {
    const requestUrl = new URL(req.url || '/', `https://${req.headers.host || 'localhost'}`);
    const oidc = runtimeOidc(req);
    if (!oidc) return json(res, 503, { ok: false, code: 'WEB_MEDIA_RELAY_OIDC_UNAVAILABLE' });

    const localTicket = String(requestUrl.searchParams.get('ticket') || '');
    const parentToken = String(requestUrl.searchParams.get('token') || '');
    let resolved;

    if (localTicket) {
      resolved = decodeTicket(localTicket, oidc);
    } else {
      if (!parentToken || parentToken.length > 8192) return json(res, 400, { ok: false, code: 'WEB_MEDIA_TOKEN_INVALID' });
      const cached = cachedInitialTicket(parentToken);
      if (cached) return redirectToTicket(res, cached);
      const remote = await resolver({ token: parentToken }, oidc);
      const remoteExp = new Date(remote.expiresAt || 0).getTime();
      const exp = Math.min(Number.isFinite(remoteExp) && remoteExp > Date.now() ? remoteExp : Date.now() + LOCAL_TICKET_TTL_MS, Date.now() + LOCAL_TICKET_TTL_MS);
      const ticket = encodeTicket({ v: 2, url: remote.url, contentType: remote.contentType || null, exp }, oidc);
      cacheInitialTicket(parentToken, ticket, exp);
      return redirectToTicket(res, ticket);
    }

    const target = validateUrlShape(resolved.url);
    const manifest = isManifestUrl(target);
    const fileMedia = !manifest && isFileMedia(target, resolved.contentType);
    const range = boundedRange(req.headers.range, fileMedia);
    const { response, url: finalUrl } = await requestUpstream(target.toString(), { method: req.method, range });
    const status = Number(response.statusCode || 502);
    if (status < 200 || status >= 300) {
      response.resume();
      return json(res, status, { ok: false, code: 'WEB_MEDIA_UPSTREAM_STATUS' });
    }

    const upstreamType = String(response.headers['content-type'] || '').toLowerCase();
    const treatAsManifest = req.method === 'GET' && (manifest || /mpegurl|m3u8/.test(upstreamType));
    if (treatAsManifest) {
      const body = await readLimited(response, MAX_MANIFEST_BYTES);
      if (!body.trim().startsWith('#EXTM3U')) return json(res, 502, { ok: false, code: 'WEB_MEDIA_MANIFEST_INVALID' });
      const urls = manifestUrls(body, finalUrl);
      const ticketMap = localTicketMap(urls, resolved, oidc);
      const rewritten = rewriteManifest(body, finalUrl, ticketMap);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, private');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Roneca-Media-Relay', 'v2-manifest');
      return res.end(rewritten);
    }

    copyHeaders(response, res, fileMedia);
    res.statusCode = status;
    if (req.method === 'HEAD') {
      response.resume();
      return res.end();
    }

    if (fileMedia && range && status !== 206) {
      const length = Number(response.headers['content-length'] || 0);
      if (!length || length > MAX_RANGE_BYTES) {
        response.destroy();
        return json(res, 502, { ok: false, code: 'WEB_MEDIA_RANGE_UNSUPPORTED' });
      }
    }

    response.on('error', () => { try { res.destroy(); } catch { /* noop */ } });
    response.pipe(res);
  } catch (error) {
    const status = Number(error?.status || 0);
    if (status === 401) return json(res, 401, { ok: false, code: 'WEB_MEDIA_UNAUTHORIZED' });
    console.error('web-media-relay-v2', {
      code: String(error?.message || 'RELAY_ERROR').replace(/https?:\/\/\S+/g, '[url]').slice(0, 160),
    });
    return json(res, 502, { ok: false, code: 'WEB_MEDIA_RELAY_ERROR' });
  }
}
