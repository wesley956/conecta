import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const dashboard = `${read('admin-panel/dashboard.html')}\n${read('admin-panel/dashboard.js')}`;
const seller = read('admin-panel/seller.html');
const sellerUx = read('admin-panel/seller-portal-ux.js');
const sellerWizard = read('admin-panel/seller-activation-wizard.js');
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
  '__ronecaSellerPortalUxV3Installed',
  'function renderToday()',
  'function deviceCard(device)',
  'class="seller-more-actions"',
  'function notify(text, tone = \'\')',
  'function formatWhatsapp(value)',
  "dateStyle: 'short', timeStyle: 'short'",
  "data-sp-action=\"renew\"",
  "data-sp-action=\"change\"",
  'RonecaSellerDeviceFlowUI?.openActivation',
  'RonecaSellerDeviceFlowUI?.openRenewal',
  'RonecaSellerDeviceFlowUI?.openChange',
]) {
  requireCheck(sellerUx.includes(snippet), `Operação do vendedor sem proteção: ${snippet}`);
}

requireCheck(!/\balert\s*\(/.test(sellerUx), 'O portal do vendedor não pode voltar a usar alertas bloqueantes.');
requireCheck(
  /<div class="seller-device-actions">[\s\S]*?<button class="btn primary" data-sp-action="details"[\s\S]*?<details class="seller-more-actions">/.test(sellerUx),
  'Cada aparelho precisa preservar uma ação direta e agrupar ações administrativas.',
);
requireCheck(
  sellerUx.includes('A renovação preserva cliente e listas.') && sellerUx.includes('Ativações e renovações debitam somente pelo fluxo canônico.'),
  'Resumo do vendedor precisa explicar as regras canônicas de renovação e crédito.',
);

for (const snippet of [
  "const FLOW_FUNCTION = 'seller-device-flow'",
  'data-aw-action="next"',
  'data-aw-action="submit"',
  'data-aw-field="playlistId"',
  'data-aw-field="backupPlaylistId"',
]) {
  requireCheck(sellerWizard.includes(snippet), `Wizard responsivo comercial incompleto: ${snippet}`);
}

for (const section of ['home', 'activation', 'devices', 'lists']) {
  requireCheck(sellerNavigation.includes(`'${section}'`), `Destino principal ausente da navegação móvel: ${section}`);
}

for (const snippet of [
  "const primarySections = new Set(['home', 'activation', 'devices', 'lists'])",
  "className = 'seller-v2-more'",
  'class="seller-v2-more-menu"',
  'syncCompactNavigation()',
  "const COMPACT_NAV_QUERY = '(max-width: 820px)'",
  "summary.addEventListener('click'",
  "summary.setAttribute('aria-expanded', String(more.open))",
  "window.addEventListener('roneca:seller-navigation-changed'",
  "source.classList.add('seller-v2-overflow-source')",
  'proxy.__sellerNavSource',
]) {
  requireCheck(sellerNavigation.includes(snippet), `Agrupamento móvel do vendedor incompleto: ${snippet}`);
}

requireCheck(!sellerNavigation.includes('menu.appendChild(button)'), 'Os botões originais não podem ser movidos; módulos tardios dependem deles como referência.');
requireCheck(!sellerNavigation.includes("(max-width: 760px)"), 'CSS e JavaScript precisam usar o mesmo limite móvel de 820 px.');

for (const snippet of [
  'body.admin-v2 .admin-nav-more-menu',
  'body.seller-v2 .seller-v2-more-menu',
  'body.seller-v2 .seller-today-actions',
  'body.seller-v2 .seller-more-actions-menu',
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

console.log('✅ Operação responsiva validada com navegação compacta e ações comerciais canônicas.');
