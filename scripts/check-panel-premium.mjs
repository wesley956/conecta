import fs from 'node:fs';
import path from 'node:path';

const panelDir = 'admin-panel';
const pages = ['index.html', 'dashboard.html', 'seller.html'];
const premiumCss = fs.readFileSync(path.join(panelDir, 'roneca-panel-premium.css'), 'utf8');
const premiumJs = fs.readFileSync(path.join(panelDir, 'roneca-panel-premium.js'), 'utf8');
const mobileMore = fs.readFileSync(path.join(panelDir, 'mobile-more-navigation.js'), 'utf8');
const sellerHtml = fs.readFileSync(path.join(panelDir, 'seller.html'), 'utf8');

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
  'assets/roneca-player-tv-wordmark.svg',
  'assets/roneca-player-tv-icon.png',
]) {
  const fullPath = path.join(panelDir, asset);
  assert(fs.existsSync(fullPath) && fs.statSync(fullPath).size > 512, `Ativo oficial ausente ou vazio: ${asset}`);
}

assert(!fs.existsSync(path.join(panelDir, 'assets/roneca-player-tv-wordmark.png')), 'Wordmark PNG paralelo ainda existe.');
assert(!fs.existsSync(path.join(panelDir, 'assets/roneca-player-tv-wordmark-v2.svg')), 'Wordmark SVG v2 paralelo ainda existe.');
assert(sellerHtml.includes('roneca-player-tv-wordmark.svg?v=20260810-brand-v4'), 'Vendedor não usa diretamente o SVG oficial.');
assert(!sellerHtml.includes('roneca-player-tv-wordmark.png'), 'Vendedor ainda referencia o wordmark PNG antigo.');
assert(!premiumJs.includes('brandWordmark'), 'Painel ainda troca o wordmark por JavaScript.');
assert(!premiumJs.includes('image.src ='), 'Painel ainda altera a identidade visual em runtime.');
assert(premiumJs.includes('directLogos.slice(1)'), 'Painel não possui proteção contra logo duplicada no login.');
assert(mobileMore.includes('ensureSellerMoreNavigation'), 'Menu Mais do vendedor não é criado pelo módulo mobile carregado.');
assert(mobileMore.includes("SELLER_PRIMARY_SECTIONS = new Set(['home', 'activation', 'devices', 'lists'])"), 'Menu Mais não possui regra explícita para overflow do vendedor.');
assert(!fs.existsSync(path.join(panelDir, 'seller-dynamic-navigation-v2.js')), 'Módulo paralelo antigo de navegação do vendedor ainda existe.');

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
  'function ensureNavigationIcons(',
  'function syncMoreNavigation()',
  "event.key === '/'",
  'MutationObserver',
]) {
  assert(premiumJs.includes(contract), `Contrato de interação premium ausente: ${contract}`);
}

for (const section of ['dashboard', 'pending', 'devices', 'commercial', 'customers', 'playlists', 'audit', 'app', 'home', 'activation', 'lists', 'credits', 'credit-purchases', 'finance', 'company-finance', 'diagnostics']) {
  assert(premiumJs.includes(`${section.includes('-') ? `'${section}'` : section}:`), `Ícone de navegação ausente para: ${section}`);
}

const adminOperations = fs.readFileSync(path.join(panelDir, 'admin-operations-redesign.js'), 'utf8');
assert(
  /dataset\.tab = 'company-finance'[\s\S]*?<svg aria-hidden="true"[\s\S]*?<span>Financeiro<\/span>/.test(adminOperations),
  'O Financeiro administrativo deve nascer com ícone e nome acessível.',
);

const visibleSources = [
  'dashboard.html',
  'seller.html',
  'index.html',
  'admin-operations-redesign.js',
].map(file => fs.readFileSync(path.join(panelDir, file), 'utf8')).join('\n');
assert(!/Cruz\s+(?:Stars|Jade)/i.test(visibleSources), 'A marca antiga ainda aparece em conteúdo visível.');

console.log('✅ Roneca Player TV: SVG único, busca, sidebar, cartões, tabelas e navegação mobile validados.');
