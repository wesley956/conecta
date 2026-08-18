import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const WEB_BASE = '/web/';

function normalizeWebBrandPaths(): Plugin {
  return {
    name: 'roneca-web-brand-base',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('/web-player/src/') || !/\.[cm]?[jt]sx?$/.test(id)) return null;
      if (!code.includes('/brand/')) return null;
      return {
        code: code
          .replaceAll('"/brand/', `"${WEB_BASE}brand/`)
          .replaceAll("'/brand/", `'${WEB_BASE}brand/`)
          .replaceAll('`/brand/', `\`${WEB_BASE}brand/`),
        map: null,
      };
    },
  };
}

export default defineConfig({
  base: WEB_BASE,
  plugins: [normalizeWebBrandPaths(), react()],
  build: {
    target: 'es2020',
    sourcemap: false,
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/hls.js/')) return 'media-engine';
          return undefined;
        },
        chunkFileNames(chunkInfo) {
          return chunkInfo.name === 'media-engine'
            ? 'media/[name]-[hash].js'
            : 'assets/[name]-[hash].js';
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});
