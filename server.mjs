import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');
const PORT = Number(process.env.PORT || 4173);
const MAX_REDIRECTS = 6;

function isHttpUrl(value) {
  return /^https?:\/\//i.test(value || '');
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

  res.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-store' });
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
