import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

for (const file of [
  'web-player/public/manifest.webmanifest',
  'web-player/public/sw.js',
  'web-player/public/offline.html',
  'web-player/src/pwa.ts',
  'web-player/src/PwaUpdatePrompt.tsx',
]) {
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
  const pwaPrompt = read('web-player/src/PwaUpdatePrompt.tsx');
  expect(pwa.includes('registration.waiting'), 'update flow precisa detectar worker waiting');
  expect(pwaPrompt.includes('Atualizar agora'), 'update flow precisa de confirmação explícita na UI');
  expect(pwaPrompt.includes('applyPwaUpdate'), 'prompt precisa delegar aplicação ao controlador explícito');
  expect(pwa.includes("postMessage({ type: 'SKIP_WAITING' })"), 'controlador precisa ativar worker somente após ação explícita');
  expect(pwa.includes('deferred_playback'), 'update flow precisa suportar adiamento durante reprodução');
  expect(pwa.includes('playerActive'), 'update flow precisa bloquear aplicação com player ativo');
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
console.log('PWA Web: manifest, update control explícito e allowlist de cache validados.');
