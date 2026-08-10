import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const dashboard = `${read('admin-panel/dashboard.html')}\n${read('admin-panel/dashboard.js')}`;
const seller = read('admin-panel/seller.html');
const sellerUx = read('admin-panel/seller-portal-ux.js');
const sellerWizard = read('admin-panel/seller-activation-wizard.js');
const sellerNavigationCompat = read('admin-panel/seller-dynamic-navigation-v2.js');
const mobileMoreNavigation = read('admin-panel/mobile-more-navigation.js');
const panelCss = read('admin-panel/panel-redesign.css');
const premiumCss = read('admin-panel/roneca-panel-premium.css');

function requireCheck(condition, message) {
  if (!condition) throw new Error(message);
}

for (const snippet of [
  'id="adminNavMore"',
  'class="admin-nav-more-menu"',
  "const overflowTabs = new Set(['customers', 'playlists', 'audit', 'app'])",
  '<script src="./mobile-more-navigation.js"></script>',
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
  requireCheck(mobileMoreNavigation.includes(`'${section}'`), `Destino principal ausente da navegação móvel: ${section}`);
}

for (const snippet of [
  "var SELLER_PRIMARY_SECTIONS = new Set(['home', 'activation', 'devices', 'lists'])",
  "more.className = 'seller-v2-more'",
  'seller-v2-more-menu',
  'ensureSellerMoreNavigation()',
  "var COMPACT_NAV_QUERY = '(max-width: 820px)'",
  "source.classList.add('seller-v2-overflow-source')",
  'showSellerSection',
  'sellerPortalNavigate = sellerNavigate',
]) {
  requireCheck(mobileMoreNavigation.includes(snippet), `Agrupamento móvel do vendedor incompleto: ${snippet}`);
}

requireCheck(!mobileMoreNavigation.includes('menu.appendChild(source)'), 'Os botões originais não podem ser movidos; módulos tardios dependem deles como referência.');
requireCheck(!mobileMoreNavigation.includes("(max-width: 760px)"), 'CSS e JavaScript precisam usar o mesmo limite móvel de 820 px.');
requireCheck(sellerNavigationCompat.includes('RonecaMobileMoreNavigation?.refresh(document)'), 'Shim legado do vendedor não delega ao controlador compartilhado.');
requireCheck(!sellerNavigationCompat.includes('seller-portal-section'), 'Shim legado não pode manter uma segunda implementação de navegação.');

for (const snippet of [
  "var COMPACT_NAV_QUERY = '(max-width: 820px)'",
  "var MORE_SELECTOR = 'details.admin-nav-more, details.seller-v2-more'",
  "summary.addEventListener('click'",
  "summary.setAttribute('aria-expanded', String(details.open))",
  "if (previousMode === mode) return",
  "document.addEventListener('click', closeFromInteraction)",
  "document.addEventListener('keydown', closeFromKeyboard)",
]) {
  requireCheck(mobileMoreNavigation.includes(snippet), `Controlador compartilhado do Mais incompleto: ${snippet}`);
}

requireCheck(!dashboard.includes("window.addEventListener('resize', syncAdminNavigationMode)"), 'O ADM não pode fechar o Mais em todo redimensionamento do navegador.');
requireCheck(
  (premiumCss.match(/bottom: calc\(78px \+ env\(safe-area-inset-bottom\)\) !important;/g) || []).length >= 2,
  'Os submenus do ADM e vendedor precisam permanecer ancorados acima da navegação inferior.',
);
requireCheck(
  (premiumCss.match(/max-height: calc\(100dvh - 98px\);/g) || []).length >= 2,
  'Os submenus móveis precisam respeitar a altura útil do viewport.',
);

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

console.log('✅ Operação responsiva validada com navegação compacta única e ações comerciais canônicas.');
