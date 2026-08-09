import fs from 'node:fs';
import path from 'node:path';

const panelDir = 'admin-panel';
const pages = ['index.html', 'dashboard.html', 'seller.html'];
const premiumCss = fs.readFileSync(path.join(panelDir, 'roneca-panel-premium.css'), 'utf8');
const premiumJs = fs.readFileSync(path.join(panelDir, 'roneca-panel-premium.js'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const page of pages) {
  const source = fs.readFileSync(path.join(panelDir, page), 'utf8');
  assert(source.includes('roneca-panel-premium.css'), `${page} não carrega o tema premium.`);
  assert(source.includes('roneca-panel-premium.js'), `${page} não carrega os recursos responsivos.`);
  assert(!/Cruz\s+(?:Stars|Jade)/i.test(source), `${page} ainda exibe a marca antiga.`);
  assert(!source.includes('cruz-stars-logo.png'), `${page} ainda referencia a logo antiga.`);
}

for (const asset of [
  'assets/roneca-player-tv-emblem.png',
  'assets/roneca-player-tv-wordmark.png',
  'assets/roneca-player-tv-icon.png',
]) {
  const fullPath = path.join(panelDir, asset);
  assert(fs.existsSync(fullPath) && fs.statSync(fullPath).size > 1024, `Ativo oficial ausente ou vazio: ${asset}`);
}

for (const contract of [
  '--rp-sidebar-width: 248px',
  '.panel-global-search',
  '@media (max-width: 820px)',
  'position: fixed !important;',
  'content: attr(data-label)',
  '@media (prefers-reduced-motion: reduce)',
]) {
  assert(premiumCss.includes(contract), `Contrato visual premium ausente: ${contract}`);
}

for (const contract of [
  'function applyTableLabels(',
  'function routeAdminSearch(',
  'function routeSellerSearch(',
  "event.key === '/'",
  'MutationObserver',
]) {
  assert(premiumJs.includes(contract), `Contrato de interação premium ausente: ${contract}`);
}

const visibleSources = [
  'dashboard.html',
  'seller.html',
  'index.html',
  'admin-operations-redesign.js',
].map(file => fs.readFileSync(path.join(panelDir, file), 'utf8')).join('\n');
assert(!/Cruz\s+(?:Stars|Jade)/i.test(visibleSources), 'A marca antiga ainda aparece em conteúdo visível.');

console.log('✅ Roneca Player TV: marca oficial, busca, sidebar, cartões, tabelas e navegação mobile validados.');
