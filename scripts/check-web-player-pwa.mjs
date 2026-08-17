import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

for (const file of ['web-player/public/manifest.webmanifest','web-player/public/sw.js','web-player/public/offline.html','web-player/src/pwa.ts']) {
  expect(fs.existsSync(path.join(root, file)), `PWA file ausente: ${file}`);
}
if (!failures.length) {
  const manifest = JSON.parse(read('web-player/public/manifest.webmanifest'));
  expect(manifest.start_url === '/web/', 'manifest start_url deve ser /web/');
  expect(manifest.scope === '/web/', 'manifest scope deve ser /web/');
  expect(manifest.display === 'standalone', 'manifest deve ser instalável standalone');
  expect(Array.isArray(manifest.icons) && manifest.icons.length >= 1, 'manifest sem ícone oficial');

  const sw = read('web-player/public/sw.js');
  for (const marker of [
    "request.headers.has('authorization')",
    "url.searchParams.has('token')",
    "path.includes('/functions/')",
    'm3u8',
    'CLEAR_PRIVATE_STATE',
    "name.startsWith('roneca-web-')",
    'SKIP_WAITING'
  ]) expect(sw.includes(marker), `service worker sem proteção: ${marker}`);
  expect(!/backgroundsync|sync\.register|periodicsync/i.test(sw), 'PWA não pode iniciar streaming/background sync');
  expect(!/cache\.put\([^\n]*(authorization|token|playback|m3u8)/i.test(sw), 'service worker pode estar cacheando resposta privada');

  const pwa = read('web-player/src/pwa.ts');
  expect(pwa.includes('registration.waiting'), 'update flow precisa detectar worker waiting');
  expect(pwa.includes('Atualizar agora'), 'update flow precisa de confirmação explícita');
  expect(!pwa.includes('skipWaiting()'), 'cliente não deve forçar atualização automática');

  const offline = read('web-player/public/offline.html');
  expect(!/onclick=|<script/i.test(offline), 'offline fallback não deve exigir script inline');
  expect(offline.includes('não salva catálogo privado'), 'offline fallback deve explicar ausência de conteúdo privado offline');
}

if (failures.length) {
  console.error('PWA safety gate FAILED');
  failures.forEach(item => console.error(` - ${item}`));
  process.exit(1);
}
console.log('PWA Web: manifest, update control e allowlist de cache validados.');
