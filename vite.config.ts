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
              const response = await fetch(candidate, {
                method: 'GET',
                headers: {
                  'user-agent': 'Mozilla/5.0 RonecaPlayTV Dev Proxy',
                  accept: 'application/x-mpegURL, application/vnd.apple.mpegurl, text/plain, */*',
                },
                signal: AbortSignal.timeout(20000),
              });

              if (!response.ok) {
                errors.push(`${candidate} => HTTP ${response.status}`);
                continue;
              }

              const content = await response.text();

              res.statusCode = 200;
              res.setHeader('content-type', 'text/plain; charset=utf-8');
              res.setHeader('cache-control', 'no-store');
              res.end(content);
              return;
            } catch (error) {
              errors.push(`${candidate} => ${error instanceof Error ? error.message : 'erro desconhecido'}`);
            }
          }

          res.statusCode = 502;
          res.end(
            [
              'Não foi possível buscar a lista pelo proxy dev.',
              'Se a URL usa porta 80, use http:// em vez de https://.',
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

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    devM3UProxy(),
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
