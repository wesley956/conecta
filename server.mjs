import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');
const PORT = Number(process.env.PORT || 4173);
const MAX_REDIRECTS = 6;
const ALLOWED_PROXY_HOSTS = String(process.env.RONECA_PROXY_ALLOWED_HOSTS || '')
  .split(',')
  .map(value => value.trim().toLowerCase())
  .filter(Boolean);
const ALLOW_PRIVATE_PROXY = /^(1|true|yes|sim)$/i.test(String(process.env.RONECA_ALLOW_PRIVATE_PROXY || ''));

function isHttpUrl(value) {
  return /^https?:\/\//i.test(value || '');
}

function setProxyHeaders(res, extraHeaders = {}) {
  res.writeHead(extraHeaders.statusCode || res.statusCode || 200, {
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,HEAD,OPTIONS',
    'access-control-allow-headers': 'range,content-type,accept,referer',
    ...extraHeaders.headers,
  });
}

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  setProxyHeaders(res, { statusCode: status, headers });
  res.end(body);
}

function isPrivateIp(hostname) {
  const ipType = net.isIP(hostname);

  if (!ipType) return false;

  if (ipType === 4) {
    const parts = hostname.split('.').map(Number);
    const [a, b] = parts;

    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 0
    );
  }

  const normalized = hostname.toLowerCase();
  return (
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
  );
}

function isPrivateHostname(hostname) {
  const normalized = hostname.toLowerCase();

  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    isPrivateIp(normalized)
  );
}

function assertProxyTargetAllowed(targetUrl) {
  const hostname = targetUrl.hostname.toLowerCase();

  if (ALLOWED_PROXY_HOSTS.length > 0 && !ALLOWED_PROXY_HOSTS.includes(hostname)) {
    throw new Error(`Host não permitido no proxy: ${hostname}. Configure RONECA_PROXY_ALLOWED_HOSTS.`);
  }

  if (!ALLOW_PRIVATE_PROXY && isPrivateHostname(hostname)) {
    throw new Error('URL privada/local bloqueada pelo proxy. Use RONECA_ALLOW_PRIVATE_PROXY=true apenas em ambiente controlado.');
  }
}

function toAbsoluteMediaUrl(value, baseUrl) {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function rewriteHLSManifest(content, baseUrl) {
  return content
    .split(/\r?\n/)
    .map(line => {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('#')) {
        if (trimmed.startsWith('#EXT-X-KEY') && trimmed.includes('URI="')) {
          return line.replace(/URI="([^"]+)"/g, (_, uri) => {
            const absolute = toAbsoluteMediaUrl(uri, baseUrl);
            return `URI="/api/media-proxy?url=${encodeURIComponent(absolute)}"`;
          });
        }

        return line;
      }

      const absolute = toAbsoluteMediaUrl(trimmed, baseUrl);
      return `/api/media-proxy?url=${encodeURIComponent(absolute)}`;
    })
    .join('\n');
}

function shouldRewriteAsHLS(targetUrl, contentType) {
  return (
    /\.m3u8(\?|#|$)/i.test(targetUrl.pathname) ||
    contentType.includes('mpegurl') ||
    contentType.includes('application/vnd.apple')
  );
}

function pipeProxy(target, req, res, options = {}, redirectsLeft = MAX_REDIRECTS) {
  const { rewriteHls = true } = options;

  if (req.method === 'OPTIONS') {
    send(res, 204, '');
    return;
  }

  if (!isHttpUrl(target)) {
    send(res, 400, 'URL inválida.');
    return;
  }

  let targetUrl;

  try {
    targetUrl = new URL(target);
    assertProxyTargetAllowed(targetUrl);
  } catch (error) {
    send(res, 403, error instanceof Error ? error.message : 'URL bloqueada.');
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
        pipeProxy(nextUrl, req, res, options, redirectsLeft - 1);
        return;
      }

      const contentType = String(
        upstream.headers['content-type'] ||
        (targetUrl.pathname.endsWith('.ts') ? 'video/mp2t' : 'application/octet-stream')
      );

      if (rewriteHls && shouldRewriteAsHLS(targetUrl, contentType)) {
        const chunks = [];

        upstream.on('data', chunk => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        upstream.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          const rewritten = rewriteHLSManifest(raw, targetUrl);

          res.statusCode = status;
          setProxyHeaders(res, {
            statusCode: status,
            headers: {
              'content-type': 'application/vnd.apple.mpegurl; charset=utf-8',
            },
          });
          res.end(rewritten);
        });

        upstream.on('error', error => {
          if (!res.headersSent) {
            send(res, 502, error instanceof Error ? error.message : 'Falha ao ler HLS.');
          } else {
            res.destroy();
          }
        });

        return;
      }

      res.statusCode = status;
      setProxyHeaders(res, {
        statusCode: status,
        headers: {
          'content-type': contentType,
          ...(upstream.headers['content-length'] ? { 'content-length': String(upstream.headers['content-length']) } : {}),
          ...(upstream.headers['accept-ranges'] ? { 'accept-ranges': String(upstream.headers['accept-ranges']) } : {}),
          ...(upstream.headers['content-range'] ? { 'content-range': String(upstream.headers['content-range']) } : {}),
        },
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
    pipeProxy(requestUrl.searchParams.get('url') || '', req, res, { rewriteHls: true });
    return;
  }

  if (requestUrl.pathname === '/api/m3u-proxy' || requestUrl.pathname === '/api/dev-m3u-proxy') {
    pipeProxy(requestUrl.searchParams.get('url') || '', req, res, { rewriteHls: false });
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`RonecaPlayTV server rodando em http://localhost:${PORT}`);
});
