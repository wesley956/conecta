const VERSION = 'roneca-web-shell-v3';
const SHELL_CACHE = `${VERSION}:shell`;
const SAFE_PATHS = new Set([
  '/web/',
  '/web/offline.html',
  '/web/manifest.webmanifest',
  '/web/brand/ronecaplaytv-symbol.svg',
  '/web/brand/ronecaplaytv-wordmark.svg',
]);

function sameOrigin(url) {
  return url.origin === self.location.origin;
}

function forbidden(request, url) {
  if (request.method !== 'GET') return true;
  if (!sameOrigin(url)) return true;
  if (request.headers.has('authorization')) return true;
  if (url.searchParams.has('token') || url.searchParams.has('access_token') || url.searchParams.has('refresh_token')) return true;
  const path = url.pathname.toLowerCase();
  if (path.includes('/functions/') || path.includes('web-player-')) return true;
  if (/\.(m3u8|m3u|ts|mp4|m4v|webm|mov|mkv|aac|mp3|m4a)(?:$|\?)/i.test(path)) return true;
  return false;
}

function safeAsset(url) {
  if (SAFE_PATHS.has(url.pathname)) return true;
  return url.pathname.startsWith('/web/assets/') || url.pathname.startsWith('/web/brand/');
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll([
      '/web/offline.html',
      '/web/manifest.webmanifest',
      '/web/brand/ronecaplaytv-symbol.svg',
      '/web/brand/ronecaplaytv-wordmark.svg',
    ]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('roneca-web-') && name !== SHELL_CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CLEAR_PRIVATE_STATE') {
    // Nenhum cache privado é permitido. Mantemos somente o shell allowlisted.
    event.waitUntil((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const requests = await cache.keys();
      await Promise.all(requests.filter(request => !safeAsset(new URL(request.url))).map(request => cache.delete(request)));
    })());
  }
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (forbidden(request, url)) return;

  if (request.mode === 'navigate' && url.pathname.startsWith('/web/')) {
    event.respondWith((async () => {
      try {
        return await fetch(request, { cache: 'no-store' });
      } catch {
        return (await caches.match('/web/offline.html')) || Response.error();
      }
    })());
    return;
  }

  if (!safeAsset(url)) return;
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  })());
});
