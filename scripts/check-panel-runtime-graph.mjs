import fs from 'node:fs';
import path from 'node:path';

const panelDir = 'admin-panel';
const generatorPath = 'scripts/generate-panel-config.mjs';
const htmlFiles = fs.readdirSync(panelDir).filter(file => file.endsWith('.html')).sort();
const generator = fs.readFileSync(generatorPath, 'utf8');
const published = new Set();

function collectLocalAssets(source) {
  const assets = [];
  for (const match of source.matchAll(/\.\/([A-Za-z0-9_./-]+\.(?:js|css))(?:\?[^'"\s]*)?/g)) {
    assets.push(match[1]);
  }
  return assets;
}

for (const htmlFile of htmlFiles) {
  const html = fs.readFileSync(path.join(panelDir, htmlFile), 'utf8');
  for (const asset of collectLocalAssets(html)) published.add(asset);
}
for (const asset of collectLocalAssets(generator)) published.add(asset);

const queue = [...published];
while (queue.length) {
  const asset = queue.shift();
  if (asset === 'panel-config.js') continue;
  const fullPath = path.join(panelDir, asset);
  if (!fs.existsSync(fullPath)) throw new Error('Recurso publicado ausente: ' + fullPath);
  if (!asset.endsWith('.js')) continue;

  const source = fs.readFileSync(fullPath, 'utf8');
  for (const dependency of collectLocalAssets(source)) {
    if (!published.has(dependency)) {
      published.add(dependency);
      queue.push(dependency);
    }
  }
}

const ignored = new Set(['panel-config.example.js']);
const topLevelAssets = fs.readdirSync(panelDir)
  .filter(file => /\.(?:js|css)$/.test(file) && !ignored.has(file))
  .sort();
const unreachable = topLevelAssets.filter(file => !published.has(file));
if (unreachable.length) {
  throw new Error('JavaScript/CSS fora do grafo publicado: ' + unreachable.join(', '));
}

const retired = [
  'commercial-consolidation.js',
  'admin-commercial-privacy.js',
  'seller-dynamic-navigation.js',
  'panel-ux.js',
  'panel-next-ux.css',
  'subscription-module.js',
  'subscription-module.css',
];
for (const file of retired) {
  if (fs.existsSync(path.join(panelDir, file))) throw new Error('Camada aposentada voltou ao painel: ' + file);
  if (generator.includes(file)) throw new Error('Gerador ainda referencia camada aposentada: ' + file);
}

const dashboardHtml = fs.readFileSync(path.join(panelDir, 'dashboard.html'), 'utf8');
const dashboardJs = fs.readFileSync(path.join(panelDir, 'dashboard.js'), 'utf8');
if (!dashboardHtml.includes('<script src="./dashboard.js"></script>')) {
  throw new Error('O dashboard não carrega o núcleo JavaScript extraído.');
}
if (/<script>\s*const API\s*=/.test(dashboardHtml)) {
  throw new Error('A lógica monolítica voltou para dentro do dashboard.html.');
}
for (const contract of ['function api(', 'async function loadAll(', 'function showSellerDetails(', 'function renderCommercial(']) {
  if (!dashboardJs.includes(contract)) throw new Error('Contrato global do dashboard ausente: ' + contract);
}

const consolidatedCss = fs.readFileSync(path.join(panelDir, 'panel-redesign.css'), 'utf8')
  .split('/* Administrador — ações de entidades consolidadas na base visual final. */')[1] || '';
if (!consolidatedCss) throw new Error('Componentes administrativos não foram consolidados na base visual.');
if (consolidatedCss.includes('!important')) throw new Error('A camada consolidada não pode reintroduzir !important.');
for (const rule of ['width: 44px;', 'min-height: 44px;', 'grid-template-columns: repeat(2, 44px);']) {
  if (!consolidatedCss.includes(rule)) throw new Error('Alvo acessível ausente na camada consolidada: ' + rule);
}

console.log('✅ Grafo do painel validado: ' + htmlFiles.length + ' páginas e ' + (published.size - 1) + ' recursos publicados, sem camadas v1/inativas.');
