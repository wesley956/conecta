import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns/promises';
import net from 'node:net';

const RESOLVER_URL = 'https://awauvkjkucjqulkklmuo.supabase.co/functions/v1/web-player-media-resolve';
const MAX_REDIRECTS = 4;
const HEADER_TIMEOUT_MS = 15_000;
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const MAX_RANGE_BYTES = 8 * 1024 * 1024;
const CHILD_BATCH = 100;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const PASS_HEADERS = new Set([
  'content-type', 'content-length', 'content-range', 'accept-ranges',
  'etag', 'last-modified', 'content-disposition',
]);
const UPSTREAM_HEADERS = {
  Accept: '*/*',
  'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
};

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
  const family = net.isIP(ip.replace(/^\[|\]$/g, ''));
  if (family === 4) return privateIpv4(ip);
  if (family === 6) return privateIpv6(ip.replace(/^\[|\]$/g, ''));
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

async function resolver(action, payload) {
  const oidc = process.env.VERCEL_OIDC_TOKEN;
  if (!oidc) throw new Error('RELAY_OIDC_MISSING');
  const response = await fetch(RESOLVER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${oidc}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(String(body?.code || `RELAY_RESOLVER_${response.status}`));
    error.status = response.status;
    throw error;
  }
  return body;
}

async function requestUpstream(rawUrl, options = {}, redirectsLeft = MAX_REDIRECTS, redirectedFromTrustedHost = false) {
  const target = validateUrlShape(rawUrl);
  await assertPublicTarget(target);
  const isHttps = target.protocol === 'https:';
  const literalIp = net.isIP(target.hostname.replace(/^\[|\]$/g, '')) > 0;
  const insecurePublicIpCompatibility = Boolean(isHttps && literalIp && redirectedFromTrustedHost);
  const requester = isHttps ? https.request : http.request;

  return await new Promise((resolve, reject) => {
    const headers = { ...UPSTREAM_HEADERS };
    if (options.range) headers.Range = options.range;
    const request = requester(target, {
      method: options.method === 'HEAD' ? 'HEAD' : 'GET',
      headers,
      rejectUnauthorized: isHttps ? !insecurePublicIpCompatibility : undefined,
    }, response => {
      const status = Number(response.statusCode || 502);
      const location = Array.isArray(response.headers.location)
        ? response.headers.location[0]
        : response.headers.location;
      if (REDIRECTS.has(status)) {
        response.resume();
        if (!location || redirectsLeft <= 0) {
          reject(new Error('RELAY_REDIRECT_INVALID'));
          return;
        }
        let next;
        try { next = new URL(location, target); }
        catch {
          reject(new Error('RELAY_REDIRECT_INVALID'));
          return;
        }
        const trustedHop = redirectedFromTrustedHost || !literalIp;
        void requestUpstream(next.toString(), options, redirectsLeft - 1, trustedHop)
          .then(resolve)
          .catch(reject);
        return;
      }
      resolve({ response, url: target });
    });
    request.setTimeout(HEADER_TIMEOUT_MS, () => request.destroy(new Error('RELAY_UPSTREAM_TIMEOUT')));
    request.on('error', error => reject(error));
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
    } catch { /* invalid HLS URI is left untouched and will fail safely client-side */ }
  };
  for (const rawLine of manifest.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    for (const match of line.matchAll(/URI="([^"]+)"/g)) add(match[1]);
    if (!line.startsWith('#')) add(line);
  }
  return ordered;
}

async function sealUrlMap(parentToken, urls) {
  const map = new Map();
  for (let offset = 0; offset < urls.length; offset += CHILD_BATCH) {
    const batch = urls.slice(offset, offset + CHILD_BATCH);
    const result = await resolver('sealChildren', { parentToken, urls: batch });
    if (!Array.isArray(result.tokens) || result.tokens.length !== batch.length) throw new Error('RELAY_CHILD_TOKEN_MISMATCH');
    batch.forEach((url, index) => map.set(url, result.tokens[index]));
  }
  return map;
}

function rewriteManifest(manifest, parentUrl, tokenMap) {
  const relayPath = token => `/api/web-media-relay?token=${encodeURIComponent(token)}`;
  return manifest.split(/\r?\n/).map(rawLine => {
    const line = rawLine.trim();
    if (!line) return rawLine;
    let result = rawLine.replace(/URI="([^"]+)"/g, (full, raw) => {
      try {
        const absolute = new URL(raw, parentUrl).toString();
        const token = tokenMap.get(absolute);
        return token ? `URI="${relayPath(token)}"` : full;
      } catch { return full; }
    });
    if (!line.startsWith('#')) {
      try {
        const absolute = new URL(line, parentUrl).toString();
        const token = tokenMap.get(absolute);
        if (token) result = relayPath(token);
      } catch { /* unchanged */ }
    }
    return result;
  }).join('\n');
}

function copyHeaders(upstream, res) {
  for (const [name, value] of Object.entries(upstream.headers)) {
    if (!PASS_HEADERS.has(name.toLowerCase()) || value == null) continue;
    res.setHeader(name, value);
  }
  res.setHeader('Cache-Control', 'private, max-age=15');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
}

export default async function handler(req, res) {
  if (!['GET', 'HEAD'].includes(req.method || '')) return json(res, 405, { ok: false, code: 'WEB_METHOD_NOT_ALLOWED' });
  try {
    const requestUrl = new URL(req.url || '/', `https://${req.headers.host || 'localhost'}`);
    const token = String(requestUrl.searchParams.get('token') || '');
    if (!token || token.length > 8192) return json(res, 400, { ok: false, code: 'WEB_MEDIA_TOKEN_INVALID' });

    const resolved = await resolver('resolve', { token });
    const target = validateUrlShape(resolved.url);
    const manifest = isManifestUrl(target);
    const fileMedia = !manifest && isFileMedia(target, resolved.contentType);
    const range = boundedRange(req.headers.range, fileMedia);
    const { response, url: finalUrl } = await requestUpstream(target.toString(), {
      method: req.method,
      range,
    });
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
      const tokenMap = await sealUrlMap(token, urls);
      const rewritten = rewriteManifest(body, finalUrl, tokenMap);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, private');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.end(rewritten);
    }

    copyHeaders(response, res);
    res.statusCode = status;
    if (req.method === 'HEAD') {
      response.resume();
      return res.end();
    }

    // For files, the bounded Range keeps each serverless invocation short. If
    // an upstream ignores the Range and returns a huge 200, fail closed rather
    // than holding a function open for the whole movie.
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
    console.error('web-media-relay', {
      code: String(error?.message || 'RELAY_ERROR').replace(/https?:\/\/\S+/g, '[url]').slice(0, 160),
    });
    return json(res, 502, { ok: false, code: 'WEB_MEDIA_RELAY_ERROR' });
  }
}
