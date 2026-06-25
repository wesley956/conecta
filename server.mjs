import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');
const PORT = Number(process.env.PORT || 4173);
const MAX_REDIRECTS = 6;
const PROXY_RATE_LIMIT_WINDOW_MS = 60_000;
const PROXY_RATE_LIMIT_MAX_REQUESTS = Number(process.env.PROXY_RATE_LIMIT_MAX_REQUESTS || 180);
const proxyRateLimit = new Map();

const PROXY_ALLOWED_HOSTS = String(process.env.PROXY_ALLOWED_HOSTS || '')
  .split(',')
  .map(item => item.trim().toLowerCase())
  .filter(Boolean);

function isHttpUrl(value) {
  return /^https?:\/\//i.test(value || '');
}

function getRequestIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0]?.trim();

  return (
    forwarded ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

function checkProxyRateLimit(req) {
  const now = Date.now();
  const ip = getRequestIp(req);
  const current = proxyRateLimit.get(ip);

  if (!current || current.resetAt <= now) {
    proxyRateLimit.set(ip, { count: 1, resetAt: now + PROXY_RATE_LIMIT_WINDOW_MS });
    return true;
  }

  current.count += 1;

  return current.count <= PROXY_RATE_LIMIT_MAX_REQUESTS;
}

function hostMatchesAllowedList(hostname) {
  if (PROXY_ALLOWED_HOSTS.length === 0) return true;

  const host = hostname.toLowerCase();

  return PROXY_ALLOWED_HOSTS.some(allowed => {
    if (allowed.startsWith('.')) return host.endsWith(allowed);
    return host === allowed || host.endsWith(`.${allowed}`);
  });
}

function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(part => Number(part));

  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isBlockedIPv6(ip) {
  const normalized = ip.toLowerCase();

  return (
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
  );
}

function getProxyTargetBlockReason(targetUrl) {
  const hostname = targetUrl.hostname.toLowerCase();

  if (!hostMatchesAllowedList(hostname)) {
    return 'Host não permitido pelo servidor.';
  }

  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    return 'Host local não permitido no proxy.';
  }

  const ipVersion = net.isIP(hostname);

  if (ipVersion === 4 && isPrivateIPv4(hostname)) {
    return 'IP privado/local não permitido no proxy.';
  }

  if (ipVersion === 6 && isBlockedIPv6(hostname)) {
    return 'IPv6 privado/local não permitido no proxy.';
  }

  return null;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    ...headers,
  });
  res.end(body);
}

function pipeProxy(target, req, res, redirectsLeft = MAX_REDIRECTS) {
  if (!isHttpUrl(target)) {
    send(res, 400, 'URL inválida.');
    return;
  }

  let targetUrl;

  try {
    targetUrl = new URL(target);
  } catch {
    send(res, 400, 'URL inválida.');
    return;
  }

  const blockReason = getProxyTargetBlockReason(targetUrl);

  if (blockReason) {
    send(res, 403, blockReason);
    return;
  }

  if (!checkProxyRateLimit(req)) {
    send(res, 429, 'Muitas requisições ao proxy. Tente novamente em instantes.');
    return;
  }

  const client = targetUrl.protocol === 'https:' ? https : http;

  const upstreamReq = client.request(
    targetUrl,
    {
      method: 'GET',
      headers: {
        'user-agent': 'VLC/3.0.20 LibVLC/3.0.20',
        accept: '*/*',
        connection: 'keep-alive',
        ...(req.headers.range ? { range: req.headers.range } : {}),
        ...(req.headers.referer ? { referer: req.headers.referer } : {}),
      },
    },
    upstream => {
      const status = upstream.statusCode || 502;
      const location = upstream.headers.location;

      if ([301, 302, 303, 307, 308].includes(status) && location && redirectsLeft > 0) {
        upstream.resume();
        const nextUrl = new URL(location, targetUrl).toString();
        pipeProxy(nextUrl, req, res, redirectsLeft - 1);
        return;
      }

      const contentType =
        upstream.headers['content-type'] ||
        (targetUrl.pathname.endsWith('.ts') ? 'video/mp2t' : 'application/octet-stream');

      res.writeHead(status, {
        'content-type': String(contentType),
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
        ...(upstream.headers['content-length'] ? { 'content-length': String(upstream.headers['content-length']) } : {}),
        ...(upstream.headers['accept-ranges'] ? { 'accept-ranges': String(upstream.headers['accept-ranges']) } : {}),
        ...(upstream.headers['content-range'] ? { 'content-range': String(upstream.headers['content-range']) } : {}),
      });

      upstream.pipe(res);
    }
  );

  upstreamReq.on('error', error => {
    if (!res.headersSent) {
      send(res, 502, error instanceof Error ? error.message : 'Falha no proxy.');
    } else {
      res.destroy();
    }
  });

  req.on('close', () => upstreamReq.destroy());
  upstreamReq.end();
}

function serveStatic(req, res) {
  let filePath = path.join(distDir, req.url === '/' ? 'index.html' : decodeURIComponent(req.url || '/'));

  if (!filePath.startsWith(distDir)) {
    send(res, 403, 'Forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(distDir, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType =
    ext === '.html' ? 'text/html; charset=utf-8' :
    ext === '.js' ? 'text/javascript; charset=utf-8' :
    ext === '.css' ? 'text/css; charset=utf-8' :
    ext === '.json' ? 'application/json; charset=utf-8' :
    'application/octet-stream';

  const cacheControl = ext === '.html'
    ? 'no-cache'
    : 'public, max-age=31536000, immutable';

  res.writeHead(200, { 'content-type': contentType, 'cache-control': cacheControl });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (requestUrl.pathname === '/api/media-proxy' || requestUrl.pathname === '/api/dev-media-proxy') {
    pipeProxy(requestUrl.searchParams.get('url') || '', req, res);
    return;
  }

  if (requestUrl.pathname === '/api/m3u-proxy' || requestUrl.pathname === '/api/dev-m3u-proxy') {
    pipeProxy(requestUrl.searchParams.get('url') || '', req, res);
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`RonecaPlayTV server rodando em http://localhost:${PORT}`);
});
