import dns from 'node:dns/promises';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, 'dist');
const PORT = Number(process.env.PORT || 4173);
const MAX_REDIRECTS = 6;
const MAX_MANIFEST_BYTES = Number(process.env.RONECA_MAX_MANIFEST_BYTES || 4 * 1024 * 1024);
const UPSTREAM_TIMEOUT_MS = Number(process.env.RONECA_UPSTREAM_TIMEOUT_MS || 20_000);
const MAX_STREAMS_PER_IP = Number(process.env.RONECA_MAX_STREAMS_PER_IP || 16);
const ALLOWED_PROXY_HOSTS = String(process.env.RONECA_PROXY_ALLOWED_HOSTS || '')
  .split(',')
  .map(value => value.trim().toLowerCase())
  .filter(Boolean);
const ALLOW_PRIVATE_PROXY = /^(1|true|yes|sim)$/i.test(
  String(process.env.RONECA_ALLOW_PRIVATE_PROXY || ''),
);

const activeStreamsByIp = new Map();

function isHttpUrl(value) {
  return /^https?:\/\//i.test(value || '');
}

function setSecurityHeaders(res) {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('x-frame-options', 'DENY');
}

function setProxyHeaders(res, extraHeaders = {}) {
  setSecurityHeaders(res);
  res.writeHead(extraHeaders.statusCode || res.statusCode || 200, {
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,HEAD,OPTIONS',
    'access-control-allow-headers': 'range,content-type,accept,referer',
    ...extraHeaders.headers,
  });
}

function send(res, status, body, headers = {}) {
  if (res.headersSent) {
    res.destroy();
    return;
  }

  res.statusCode = status;
  setProxyHeaders(res, { statusCode: status, headers });
  res.end(body);
}

function isPrivateIpv4(hostname) {
  const parts = hostname.split('.').map(Number);
  const [a, b] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIp(hostname) {
  const ipType = net.isIP(hostname);
  if (!ipType) return false;

  if (ipType === 4) return isPrivateIpv4(hostname);

  const normalized = hostname.toLowerCase().split('%')[0];
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];

  if (mappedIpv4) return isPrivateIpv4(mappedIpv4);

  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
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

function isAllowedHostname(hostname) {
  if (ALLOWED_PROXY_HOSTS.length === 0) return false;

  const normalized = hostname.toLowerCase();

  return ALLOWED_PROXY_HOSTS.some(
    allowed => normalized === allowed || normalized.endsWith(`.${allowed}`),
  );
}

async function resolveProxyTarget(target) {
  if (!isHttpUrl(target)) {
    throw new Error('URL inválida.');
  }

  const targetUrl = new URL(target);

  if (!['http:', 'https:'].includes(targetUrl.protocol)) {
    throw new Error('Protocolo não permitido.');
  }

  if (!isAllowedHostname(targetUrl.hostname)) {
    throw new Error(`Host não permitido no proxy: ${targetUrl.hostname}.`);
  }

  if (!ALLOW_PRIVATE_PROXY && isPrivateHostname(targetUrl.hostname)) {
    throw new Error('URL privada/local bloqueada pelo proxy.');
  }

  const addresses = net.isIP(targetUrl.hostname)
    ? [{ address: targetUrl.hostname, family: net.isIP(targetUrl.hostname) }]
    : await dns.lookup(targetUrl.hostname, { all: true, verbatim: true });

  if (addresses.length === 0) {
    throw new Error('O host não possui endereço de rede válido.');
  }

  if (!ALLOW_PRIVATE_PROXY && addresses.some(item => isPrivateIp(item.address))) {
    throw new Error('O host resolveu para uma rede privada/local bloqueada.');
  }

  return {
    targetUrl,
    resolved: addresses[0],
  };
}

function toAbsoluteMediaUrl(value, baseUrl) {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

const HLS_URI_TAGS = new Set([
  '#EXT-X-KEY',
  '#EXT-X-MAP',
  '#EXT-X-MEDIA',
  '#EXT-X-I-FRAME-STREAM-INF',
  '#EXT-X-SESSION-KEY',
  '#EXT-X-PART',
  '#EXT-X-PRELOAD-HINT',
  '#EXT-X-RENDITION-REPORT',
]);

function proxiedMediaUrl(value, baseUrl) {
  const absolute = toAbsoluteMediaUrl(value, baseUrl);
  return `/api/media-proxy?url=${encodeURIComponent(absolute)}`;
}

function rewriteHLSManifest(content, baseUrl) {
  return content
    .split(/\r?\n/)
    .map(line => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      if (!trimmed.startsWith('#')) {
        return proxiedMediaUrl(trimmed, baseUrl);
      }

      const tag = trimmed.split(':', 1)[0];
      if (!HLS_URI_TAGS.has(tag)) return line;

      return line.replace(
        /\bURI=(?:"([^"]+)"|'([^']+)'|([^,\s]+))/gi,
        (_match, doubleQuoted, singleQuoted, unquoted) => {
          const original = doubleQuoted || singleQuoted || unquoted || '';
          return `URI="${proxiedMediaUrl(original, baseUrl)}"`;
        },
      );
    })
    .join('\n');
}

function shouldRewriteAsHLS(targetUrl, contentType) {
  return (
    /\.m3u8(?:$|[?#])/i.test(targetUrl.pathname + targetUrl.search) ||
    contentType.includes('mpegurl') ||
    contentType.includes('application/vnd.apple')
  );
}

function acquireStreamLease(req, res) {
  const ip = req.socket.remoteAddress || 'unknown';
  const current = activeStreamsByIp.get(ip) || 0;

  if (current >= MAX_STREAMS_PER_IP) return null;

  activeStreamsByIp.set(ip, current + 1);
  let released = false;

  const release = () => {
    if (released) return;
    released = true;

    const next = Math.max(0, (activeStreamsByIp.get(ip) || 1) - 1);
    if (next === 0) activeStreamsByIp.delete(ip);
    else activeStreamsByIp.set(ip, next);
  };

  res.once('close', release);
  res.once('finish', release);

  return release;
}

async function pipeProxy(target, req, res, options = {}, redirectsLeft = MAX_REDIRECTS) {
  const { rewriteHls = true } = options;

  if (req.method === 'OPTIONS') {
    send(res, 204, '');
    return;
  }

  if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
    send(res, 405, 'Método não permitido.');
    return;
  }

  let resolvedTarget;

  try {
    resolvedTarget = await resolveProxyTarget(target);
  } catch (error) {
    send(res, 403, error instanceof Error ? error.message : 'URL bloqueada.');
    return;
  }

  const { targetUrl, resolved } = resolvedTarget;
  const client = targetUrl.protocol === 'https:' ? https : http;

  const upstreamReq = client.request(
    targetUrl,
    {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: {
        host: targetUrl.host,
        'user-agent': 'VLC/3.0.20 LibVLC/3.0.20',
        accept: '*/*',
        connection: 'keep-alive',
        ...(req.headers.range ? { range: req.headers.range } : {}),
        ...(req.headers.referer ? { referer: req.headers.referer } : {}),
      },
      lookup: (_hostname, _options, callback) => {
        callback(null, resolved.address, resolved.family);
      },
      ...(targetUrl.protocol === 'https:' ? { servername: targetUrl.hostname } : {}),
    },
    upstream => {
      const status = upstream.statusCode || 502;
      const location = upstream.headers.location;

      if ([301, 302, 303, 307, 308].includes(status) && location) {
        upstream.resume();

        if (redirectsLeft <= 0) {
          send(res, 508, 'Limite de redirecionamentos excedido.');
          return;
        }

        try {
          const nextUrl = new URL(location, targetUrl).toString();
          void pipeProxy(nextUrl, req, res, options, redirectsLeft - 1);
        } catch {
          send(res, 502, 'Redirecionamento inválido recebido do servidor de mídia.');
        }
        return;
      }

      const contentType = String(
        upstream.headers['content-type'] ||
        (targetUrl.pathname.endsWith('.ts') ? 'video/mp2t' : 'application/octet-stream'),
      );

      if (rewriteHls && shouldRewriteAsHLS(targetUrl, contentType)) {
        const chunks = [];
        let receivedBytes = 0;

        upstream.on('data', chunk => {
          receivedBytes += chunk.length;

          if (receivedBytes > MAX_MANIFEST_BYTES) {
            upstream.destroy(new Error('Manifesto HLS excedeu o limite permitido.'));
            return;
          }

          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        upstream.on('end', () => {
          if (res.destroyed || res.headersSent) return;

          const raw = Buffer.concat(chunks).toString('utf-8');
          const rewritten = rewriteHLSManifest(raw, targetUrl);

          res.statusCode = status;
          setProxyHeaders(res, {
            statusCode: status,
            headers: {
              'content-type': 'application/vnd.apple.mpegurl; charset=utf-8',
            },
          });
          res.end(req.method === 'HEAD' ? '' : rewritten);
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
          ...(upstream.headers['content-length']
            ? { 'content-length': String(upstream.headers['content-length']) }
            : {}),
          ...(upstream.headers['accept-ranges']
            ? { 'accept-ranges': String(upstream.headers['accept-ranges']) }
            : {}),
          ...(upstream.headers['content-range']
            ? { 'content-range': String(upstream.headers['content-range']) }
            : {}),
        },
      });

      if (req.method === 'HEAD') {
        upstream.resume();
        res.end();
        return;
      }

      upstream.pipe(res);
    },
  );

  upstreamReq.setTimeout(UPSTREAM_TIMEOUT_MS, () => {
    upstreamReq.destroy(new Error('Tempo limite do servidor de mídia atingido.'));
  });

  upstreamReq.on('error', error => {
    if (!res.headersSent) {
      send(res, 502, error instanceof Error ? error.message : 'Falha no proxy.');
    } else {
      res.destroy();
    }
  });

  req.once('close', () => upstreamReq.destroy());
  upstreamReq.end();
}

function getStaticFilePath(requestPathname) {
  let decodedPathname;

  try {
    decodedPathname = decodeURIComponent(requestPathname);
  } catch {
    return { error: 'URL inválida.' };
  }

  const relativePath = decodedPathname === '/'
    ? 'index.html'
    : decodedPathname.replace(/^\/+/, '');
  const filePath = path.resolve(distDir, relativePath);
  const insideDist = filePath === distDir || filePath.startsWith(`${distDir}${path.sep}`);

  if (!insideDist) return { error: 'Forbidden' };
  return { filePath };
}

function serveStatic(requestUrl, req, res) {
  const resolvedPath = getStaticFilePath(requestUrl.pathname);

  if (resolvedPath.error) {
    send(res, resolvedPath.error === 'Forbidden' ? 403 : 400, resolvedPath.error);
    return;
  }

  let filePath = resolvedPath.filePath;

  try {
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(distDir, 'index.html');
    }
  } catch {
    filePath = path.join(distDir, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType =
    ext === '.html' ? 'text/html; charset=utf-8' :
    ext === '.js' ? 'text/javascript; charset=utf-8' :
    ext === '.css' ? 'text/css; charset=utf-8' :
    ext === '.json' ? 'application/json; charset=utf-8' :
    ext === '.svg' ? 'image/svg+xml' :
    ext === '.png' ? 'image/png' :
    ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
    ext === '.webp' ? 'image/webp' :
    'application/octet-stream';

  const cacheControl = ext === '.html'
    ? 'no-cache'
    : 'public, max-age=31536000, immutable';

  setSecurityHeaders(res);
  res.writeHead(200, {
    'content-type': contentType,
    'cache-control': cacheControl,
  });

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    if (!res.headersSent) send(res, 500, 'Falha ao ler arquivo.');
    else res.destroy();
  });
  stream.pipe(res);
}

const server = http.createServer((req, res) => {
  let requestUrl;

  try {
    requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  } catch {
    send(res, 400, 'URL inválida.');
    return;
  }

  if (requestUrl.pathname === '/api/media-proxy' || requestUrl.pathname === '/api/dev-media-proxy') {
    const release = acquireStreamLease(req, res);

    if (!release) {
      send(res, 429, 'Limite de conexões simultâneas atingido.');
      return;
    }

    void pipeProxy(requestUrl.searchParams.get('url') || '', req, res, { rewriteHls: true });
    return;
  }

  if (requestUrl.pathname === '/api/m3u-proxy' || requestUrl.pathname === '/api/dev-m3u-proxy') {
    const release = acquireStreamLease(req, res);

    if (!release) {
      send(res, 429, 'Limite de conexões simultâneas atingido.');
      return;
    }

    void pipeProxy(requestUrl.searchParams.get('url') || '', req, res, { rewriteHls: false });
    return;
  }

  if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
    send(res, 405, 'Método não permitido.');
    return;
  }

  serveStatic(requestUrl, req, res);
});

server.requestTimeout = 0;
server.headersTimeout = 25_000;
server.keepAliveTimeout = 5_000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`RonecaPlayTV server rodando em http://localhost:${PORT}`);
});
