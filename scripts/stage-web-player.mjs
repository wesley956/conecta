import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const source = path.join(root, 'web-player', 'dist');
const output = path.join(root, 'admin-panel');
const webTarget = path.join(output, 'web');

if (!fs.existsSync(source)) throw new Error('web-player/dist não existe. Rode o build do Web Player antes do staging.');
fs.rmSync(webTarget, { recursive: true, force: true });
fs.mkdirSync(webTarget, { recursive: true });
fs.cpSync(source, webTarget, { recursive: true });

const builtBrand = path.join(source, 'brand');
const rootBrand = path.join(output, 'brand');
if (fs.existsSync(builtBrand)) {
  fs.mkdirSync(rootBrand, { recursive: true });
  for (const name of ['ronecaplaytv-symbol.svg', 'ronecaplaytv-wordmark.svg']) {
    const from = path.join(builtBrand, name);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(rootBrand, name));
  }
}

const cssMarker = 'data-web-access-management="style"';
const jsMarker = 'data-web-access-management="script"';
const playerLinkMarker = 'data-web-player-link="script"';
for (const htmlName of ['dashboard.html', 'seller.html']) {
  const file = path.join(output, htmlName);
  if (!fs.existsSync(file)) throw new Error(`Painel esperado não encontrado: ${htmlName}`);
  let html = fs.readFileSync(file, 'utf8');
  if (!html.includes(cssMarker)) {
    html = html.replace('</head>', `  <link rel="stylesheet" href="/web-access-management.css" ${cssMarker} />\n</head>`);
  }
  if (!html.includes(jsMarker)) {
    html = html.replace('</body>', `  <script src="/web-access-management.js" defer ${jsMarker}></script>\n</body>`);
  }
  if (!html.includes(playerLinkMarker)) {
    html = html.replace('</body>', `  <script src="/web-player-link.js" defer ${playerLinkMarker}></script>\n</body>`);
  }
  fs.writeFileSync(file, html);
}

const required = [
  'web/index.html',
  'web/manifest.webmanifest',
  'web/sw.js',
  'web/offline.html',
  'web-access-management.js',
  'web-access-management.css',
  'web-player-link.js',
];
for (const relative of required) {
  if (!fs.existsSync(path.join(output, relative))) throw new Error(`Staging Web incompleto: ${relative}`);
}

console.log('Web Player staged em admin-panel/web e gestão Web injetada em ADM/Vendedor.');
