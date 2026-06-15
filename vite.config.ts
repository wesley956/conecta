import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

function devM3UProxy(): Plugin {
  return {
    name: 'ronecaplaytv-dev-m3u-proxy',
    configureServer(server) {
      server.middlewares.use('/api/dev-m3u-proxy', async (req, res) => {
        try {
          const host = req.headers.host || 'localhost';
          const requestUrl = new URL(req.url || '', `http://${host}`);
          const target = requestUrl.searchParams.get('url') || '';

          if (!/^https?:\/\//i.test(target)) {
            res.statusCode = 400;
            res.end('URL inválida. Use http:// ou https://');
            return;
          }

          const response = await fetch(target, {
            method: 'GET',
            headers: {
              'user-agent': 'RonecaPlayTV Dev Proxy',
              accept: 'application/x-mpegURL, application/vnd.apple.mpegurl, text/plain, */*',
            },
          });

          if (!response.ok) {
            res.statusCode = response.status;
            res.end(`Fonte respondeu HTTP ${response.status}`);
            return;
          }

          const content = await response.text();

          res.statusCode = 200;
          res.setHeader('content-type', 'text/plain; charset=utf-8');
          res.setHeader('cache-control', 'no-store');
          res.end(content);
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
