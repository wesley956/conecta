import { execFile } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

function buildM3UProxyCandidates(target: string): string[] {
  const candidates = new Set<string>();
  candidates.add(target);

  try {
    const parsed = new URL(target);

    if (parsed.protocol === 'https:' && parsed.port === '80') {
      parsed.protocol = 'http:';
      candidates.add(parsed.toString());
    }

    if (parsed.protocol === 'http:' && parsed.port === '443') {
      parsed.protocol = 'https:';
      candidates.add(parsed.toString());
    }
  } catch {
    // validação fica no handler
  }

  return [...candidates];
}

function looksLikeM3U(content: string): boolean {
  return content.trimStart().startsWith('#EXTM3U') || content.includes('#EXTINF');
}

async function fetchM3UWithNativeFetch(candidate: string): Promise<string> {
  const response = await fetch(candidate, {
    method: 'GET',
    headers: {
      'user-agent': 'VLC/3.0.20 LibVLC/3.0.20',
      accept: 'application/x-mpegURL, application/vnd.apple.mpegurl, text/plain, application/octet-stream, */*',
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const content = await response.text();

  if (!looksLikeM3U(content)) {
    throw new Error('A fonte respondeu, mas não retornou conteúdo M3U.');
  }

  return content;
}

async function fetchM3UWithCurl(candidate: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'curl',
      [
        '-L',
        '--connect-timeout',
        '10',
        '--max-time',
        '30',
        '--http1.1',
        '--silent',
        '--show-error',
        '-A',
        'VLC/3.0.20 LibVLC/3.0.20',
        candidate,
      ],
      {
        maxBuffer: 128 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        // Alguns servidores IPTV mantêm a conexão aberta ou encerram estranho.
        // Se já recebemos #EXTM3U/#EXTINF, aceitamos o conteúdo mesmo com timeout do curl.
        if (stdout && looksLikeM3U(stdout)) {
          resolve(stdout);
          return;
        }

        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }

        reject(new Error('O curl baixou a fonte, mas o conteúdo não parece M3U.'));
      }
    );
  });
}

function devM3UProxy(): Plugin {
  return {
    name: 'ronecaplaytv-dev-m3u-proxy',
    configureServer(server) {
      server.middlewares.use('/api/dev-m3u-proxy', async (req, res) => {
        const errors: string[] = [];

        try {
          const host = req.headers.host || 'localhost';
          const requestUrl = new URL(req.url || '', `http://${host}`);
          const target = requestUrl.searchParams.get('url') || '';

          if (!/^https?:\/\//i.test(target)) {
            res.statusCode = 400;
            res.end('URL inválida. Use http:// ou https://');
            return;
          }

          for (const candidate of buildM3UProxyCandidates(target)) {
            try {
              const content = await fetchM3UWithCurl(candidate);

              res.statusCode = 200;
              res.setHeader('content-type', 'text/plain; charset=utf-8');
              res.setHeader('cache-control', 'no-store');
              res.end(content);
              return;
            } catch (error) {
              errors.push(`curl ${candidate} => ${error instanceof Error ? error.message : 'erro desconhecido'}`);
            }

            try {
              const content = await fetchM3UWithNativeFetch(candidate);

              res.statusCode = 200;
              res.setHeader('content-type', 'text/plain; charset=utf-8');
              res.setHeader('cache-control', 'no-store');
              res.end(content);
              return;
            } catch (error) {
              errors.push(`fetch ${candidate} => ${error instanceof Error ? error.message : 'erro desconhecido'}`);
            }
          }

          res.statusCode = 502;
          res.end(
            [
              'Não foi possível buscar a lista pelo proxy dev.',
              'A URL pode estar bloqueando o ambiente atual, a credencial pode ter expirado ou o servidor pode exigir outro formato.',
              errors.length ? `Detalhe: ${errors[errors.length - 1]}` : '',
            ].filter(Boolean).join(' ')
          );
        } catch (error) {
          res.statusCode = 502;
          res.end(error instanceof Error ? error.message : 'Erro ao buscar fonte M3U.');
        }
      });
    },
  };
}

function devMediaProxy(): Plugin {
  return {
    name: 'ronecaplaytv-dev-media-proxy',
    configureServer(server) {
      server.middlewares.use('/api/dev-media-proxy', (req, res) => {
        const host = req.headers.host || 'localhost';
        const requestUrl = new URL(req.url || '', `http://${host}`);
        const target = requestUrl.searchParams.get('url') || '';

        if (!/^https?:\/\//i.test(target)) {
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
              ...(req.headers.range ? { range: req.headers.range } : {}),
            },
          },
          upstream => {
            res.statusCode = upstream.statusCode || 200;

            const contentType =
              upstream.headers['content-type'] ||
              (targetUrl.pathname.endsWith('.ts') ? 'video/mp2t' : 'application/octet-stream');

            res.setHeader('content-type', String(contentType));
            res.setHeader('cache-control', 'no-store');
            res.setHeader('access-control-allow-origin', '*');

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
      });
    },
  };
}


export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    devM3UProxy(),
    devMediaProxy(),
    viteSingleFile(),
  ],
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
