import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const dashboard = read('admin-panel/dashboard.html');
const seller = read('admin-panel/seller.html');
const sellerUx = read('admin-panel/seller-portal-ux.js');
const sellerNavigation = read('admin-panel/seller-dynamic-navigation-v2.js');
const panelCss = read('admin-panel/panel-redesign.css');

function requireCheck(condition, message) {
  if (!condition) throw new Error(message);
}

for (const snippet of [
  'id="adminNavMore"',
  'class="admin-nav-more-menu"',
  "const overflowTabs = new Set(['customers', 'playlists', 'audit', 'app'])",
  'syncAdminNavigationMode()',
]) {
  requireCheck(dashboard.includes(snippet), `Navegação administrativa compacta incompleta: ${snippet}`);
}

for (const snippet of [
  'id="sellerTodayActions"',
  'Ações de hoje',
  "dateStyle: 'short', timeStyle: 'short'",
  'function formatWhatsapp(value)',
]) {
  requireCheck(seller.includes(snippet), `Base responsiva do vendedor incompleta: ${snippet}`);
}

for (const snippet of [
  'function renderTodayActions()',
  'window.sellerUxOpenToday',
  'class="seller-more-actions"',
  'class="seller-destructive-actions"',
  'class="seller-technical-details"',
  'function ensureToast()',
  'className = `seller-toast ${type} visible`',
  'function formatWhatsapp(value)',
  "dateStyle: 'short', timeStyle: 'short'",
]) {
  requireCheck(sellerUx.includes(snippet), `Operação do vendedor sem proteção: ${snippet}`);
}

requireCheck(!/\balert\s*\(/.test(sellerUx), 'O portal do vendedor não pode voltar a usar alertas bloqueantes.');
requireCheck(
  /<div class="seller-device-actions">\s*<button class="btn primary"[\s\S]*?<details class="seller-more-actions">/.test(sellerUx),
  'Cada aparelho precisa preservar uma ação direta e agrupar as demais em Mais ações.',
);

for (const section of ['home', 'activation', 'devices', 'lists']) {
  requireCheck(sellerNavigation.includes(`'${section}'`), `Destino principal ausente da navegação móvel: ${section}`);
}

for (const snippet of [
  "const primarySections = new Set(['home', 'activation', 'devices', 'lists'])",
  'className = \'seller-v2-more\'',
  'class="seller-v2-more-menu"',
  'syncCompactNavigation()',
  "matchMedia('(max-width: 760px)')",
  "source.classList.add('seller-v2-overflow-source')",
  'proxy.__sellerNavSource',
]) {
  requireCheck(sellerNavigation.includes(snippet), `Agrupamento móvel do vendedor incompleto: ${snippet}`);
}

requireCheck(!sellerNavigation.includes('menu.appendChild(button)'), 'Os botões originais não podem ser movidos; módulos tardios dependem deles como referência.');

for (const snippet of [
  'body.admin-v2 .admin-nav-more-menu',
  'body.seller-v2 .seller-v2-more-menu',
  'body.seller-v2 .seller-today-actions',
  'body.seller-v2 .seller-more-actions-menu',
  'body.seller-v2 .seller-toast',
  'body.seller-v2 .seller-v2-overflow-source',
  'grid-template-columns: repeat(5, minmax(0, 1fr))',
  'env(safe-area-inset-bottom)',
]) {
  requireCheck(panelCss.includes(snippet), `Estilo responsivo sem proteção: ${snippet}`);
}

requireCheck(
  (panelCss.match(/grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/g) || []).length >= 4,
  'As navegações administrativas e do vendedor precisam manter cinco destinos no celular.',
);

console.log('✅ Operação responsiva validada: navegação compacta, prioridades, ações seguras, datas, telefone e feedback.');
