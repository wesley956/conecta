import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import https from 'node:https';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const ENABLE_SINGLE_FILE = process.env.SINGLE_FILE === 'true' || process.env.VITE_SINGLE_FILE === 'true';

const execFileAsync = promisify(execFile);
const MAX_MEDIA_REDIRECTS = 6;

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value || '');
}

function setNoStoreCors(res: ServerResponse) {
  res.setHeader('cache-control', 'no-store');
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET,HEAD,OPTIONS');
  res.setHeader('access-control-allow-headers', 'range,content-type,accept');
}

function getTargetFromRequest(req: IncomingMessage) {
  const host = req.headers.host || 'localhost';
  const requestUrl = new URL(req.url || '/', `http://${host}`);
  return requestUrl.searchParams.get('url') || '';
}

function looksLikeM3U(content: string) {
  return content.includes('#EXTM3U') || content.includes('#EXTINF');
}

function getM3UFallbackUrls(rawUrl: string) {
  const urls = [rawUrl];

  try {
    const parsed = new URL(rawUrl);

    if (parsed.protocol === 'https:') {
      parsed.protocol = 'http:';
      urls.push(parsed.toString());
    }
  } catch {
    // ignora URL inválida aqui; o handler principal responde 400
  }

  return [...new Set(urls)];
}

async function fetchM3UWithNativeFetch(url: string) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent': 'VLC/3.0.20 LibVLC/3.0.20',
      accept: '*/*',
    },
  });

  const content = await response.text();

  if (!response.ok && !looksLikeM3U(content)) {
    throw new Error(`Fonte M3U respondeu HTTP ${response.status}.`);
  }

  return content;
}

async function fetchM3UWithCurl(url: string) {
  const { stdout } = await execFileAsync(
    'curl',
    [
      '-L',
      '--connect-timeout',
      '12',
      '--max-time',
      '60',
      '-A',
      'VLC/3.0.20 LibVLC/3.0.20',
      url,
    ],
    {
      maxBuffer: 80 * 1024 * 1024,
    }
  );

  if (!looksLikeM3U(stdout)) {
    throw new Error('A fonte respondeu, mas não parece ser uma lista M3U.');
  }

  return stdout;
}

function devM3UProxy(): Plugin {
  return {
    name: 'dev-m3u-proxy',
    configureServer(server) {
      const handleM3UProxy = async (req: IncomingMessage, res: ServerResponse) => {
        setNoStoreCors(res);

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        const target = getTargetFromRequest(req);

        if (!isHttpUrl(target)) {
          res.statusCode = 400;
          res.end('URL de lista inválida.');
          return;
        }

        const candidates = getM3UFallbackUrls(target);
        let lastError: unknown = null;

        for (const candidate of candidates) {
          try {
            const content = await fetchM3UWithNativeFetch(candidate);

            res.statusCode = 200;
            res.setHeader('content-type', 'application/vnd.apple.mpegurl; charset=utf-8');
            res.end(content);
            return;
          } catch (error) {
            lastError = error;
          }

          try {
            const content = await fetchM3UWithCurl(candidate);

            res.statusCode = 200;
            res.setHeader('content-type', 'application/vnd.apple.mpegurl; charset=utf-8');
            res.end(content);
            return;
          } catch (error) {
            lastError = error;
          }
        }

        res.statusCode = 502;
        res.end(lastError instanceof Error ? lastError.message : 'Erro ao buscar fonte M3U.');
      };

      server.middlewares.use('/api/dev-m3u-proxy', handleM3UProxy);
      server.middlewares.use('/api/m3u-proxy', handleM3UProxy);
    },
  };
}

function toAbsoluteMediaUrl(value: string, baseUrl: URL) {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function rewriteHLSManifest(content: string, baseUrl: URL) {
  return content
    .split(/\r?\n/)
    .map(line => {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('#')) {
        if (trimmed.startsWith('#EXT-X-KEY') && trimmed.includes('URI="')) {
          return line.replace(/URI="([^"]+)"/g, (_, uri: string) => {
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

function shouldRewriteAsHLS(targetUrl: URL, contentType: string) {
  return (
    /\.m3u8(\?|#|$)/i.test(targetUrl.pathname) ||
    contentType.includes('mpegurl') ||
    contentType.includes('application/vnd.apple')
  );
}

function pipeDevMediaProxy(
  target: string,
  req: IncomingMessage,
  res: ServerResponse,
  redirectsLeft = MAX_MEDIA_REDIRECTS
) {
  setNoStoreCors(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (!isHttpUrl(target)) {
    res.statusCode = 400;
    res.end('URL de mídia inválida.');
    return;
  }

  let targetUrl: URL;

  try {
    targetUrl = new URL(target);
  } catch {
    res.statusCode = 400;
    res.end('URL de mídia inválida.');
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
      },
    },
    upstream => {
      const status = upstream.statusCode || 502;
      const location = upstream.headers.location;

      if ([301, 302, 303, 307, 308].includes(status) && location && redirectsLeft > 0) {
        upstream.resume();
        pipeDevMediaProxy(new URL(location, targetUrl).toString(), req, res, redirectsLeft - 1);
        return;
      }

      const contentType = String(
        upstream.headers['content-type'] ||
        (targetUrl.pathname.endsWith('.ts') ? 'video/mp2t' : 'application/octet-stream')
      );

      if (shouldRewriteAsHLS(targetUrl, contentType)) {
        const chunks: Buffer[] = [];

        upstream.on('data', chunk => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        upstream.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          const rewritten = rewriteHLSManifest(raw, targetUrl);

          res.statusCode = status;
          res.setHeader('content-type', 'application/vnd.apple.mpegurl; charset=utf-8');
          res.end(rewritten);
        });

        upstream.on('error', error => {
          if (!res.headersSent) {
            res.statusCode = 502;
            res.end(error instanceof Error ? error.message : 'Falha ao ler HLS.');
          } else {
            res.destroy();
          }
        });

        return;
      }

      res.statusCode = status;
      res.setHeader('content-type', contentType);

      const contentLength = upstream.headers['content-length'];
      const acceptRanges = upstream.headers['accept-ranges'];
      const contentRange = upstream.headers['content-range'];

      if (contentLength) res.setHeader('content-length', String(contentLength));
      if (acceptRanges) res.setHeader('accept-ranges', String(acceptRanges));
      if (contentRange) res.setHeader('content-range', String(contentRange));

      upstream.pipe(res);
    }
  );

  upstreamReq.on('error', error => {
    if (!res.headersSent) {
      res.statusCode = 502;
      res.end(error instanceof Error ? error.message : 'Falha no proxy de mídia.');
    } else {
      res.destroy();
    }
  });

  req.on('close', () => {
    upstreamReq.destroy();
  });

  upstreamReq.end();
}

function devMediaProxy(): Plugin {
  return {
    name: 'dev-media-proxy',
    configureServer(server) {
      const handleMediaProxy = (req: IncomingMessage, res: ServerResponse) => {
        const target = getTargetFromRequest(req);
        pipeDevMediaProxy(target, req, res);
      };

      server.middlewares.use('/api/dev-media-proxy', handleMediaProxy);
      server.middlewares.use('/api/media-proxy', handleMediaProxy);
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    devM3UProxy(),
    devMediaProxy(),
    ENABLE_SINGLE_FILE ? viteSingleFile() : null,
  ],

  build: ENABLE_SINGLE_FILE ? {} : {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('hls.js')) return 'hls';
          if (id.includes('mpegts.js')) return 'mpegts';
          if (id.includes('lucide-react')) return 'icons';
          if (id.includes('zustand')) return 'zustand';
          if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) return 'vendor';
          return 'vendor-misc';
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
