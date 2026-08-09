import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

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
  'function ensureNavigationIcons(',
  'function usesCompactNavigation(',
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

const sellerDynamicNavigation = fs.readFileSync(path.join(panelDir, 'seller-dynamic-navigation-v2.js'), 'utf8');
assert(sellerDynamicNavigation.includes('proxy.innerHTML = source.innerHTML'), 'O submenu do vendedor deve preservar os ícones dos itens originais.');
assert(!sellerDynamicNavigation.includes("proxy.textContent = source.textContent.trim()"), 'O submenu do vendedor não pode reduzir os itens a texto puro.');

function navigationHarness(compact) {
  const listeners = new Map();
  const context = {
    window: null,
    document: {
      readyState: 'complete',
      body: {},
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: (type, listener) => listeners.set(type, listener),
    },
    matchMedia: query => ({ matches: query === '(max-width: 820px)' && compact }),
    setTimeout: callback => callback(),
    MutationObserver: class {
      observe() {}
    },
    HTMLInputElement: class {},
    HTMLTextAreaElement: class {},
    HTMLSelectElement: class {},
    Node: { ELEMENT_NODE: 1 },
  };
  context.window = context;
  vm.runInNewContext(premiumJs, context, { filename: 'roneca-panel-premium.js' });
  return { context, listeners };
}

function clickOverflowItem(harness, tab) {
  const details = {
    open: true,
    removeAttribute(name) {
      if (name === 'open') this.open = false;
    },
  };
  const button = {
    dataset: { tab },
    closest: selector => selector === 'details' ? details : null,
  };
  const target = {
    closest: selector => selector === '[data-tab], [data-seller-nav]' ? button : null,
  };
  harness.listeners.get('click')({ target });
  return details.open;
}

for (const tab of ['customers', 'playlists', 'audit', 'app']) {
  assert(clickOverflowItem(navigationHarness(false), tab), `Desktop: ${tab} não pode recolher o menu lateral.`);
  assert(!clickOverflowItem(navigationHarness(true), tab), `Mobile: ${tab} deve fechar o menu suspenso após a escolha.`);
}

{
  const desktop = navigationHarness(false);
  let queried = false;
  desktop.context.document.querySelectorAll = () => {
    queried = true;
    return [];
  };
  desktop.listeners.get('keydown')({ key: 'Escape', target: {} });
  assert(!queried, 'Desktop: Esc não pode tentar recolher a navegação lateral permanente.');
}

{
  const mobile = navigationHarness(true);
  let open = true;
  mobile.context.document.querySelectorAll = () => [{ removeAttribute: () => { open = false; } }];
  mobile.listeners.get('keydown')({ key: 'Escape', target: {} });
  assert(!open, 'Mobile: Esc deve fechar o menu suspenso aberto.');
}

const visibleSources = [
  'dashboard.html',
  'seller.html',
  'index.html',
  'admin-operations-redesign.js',
].map(file => fs.readFileSync(path.join(panelDir, file), 'utf8')).join('\n');
assert(!/Cruz\s+(?:Stars|Jade)/i.test(visibleSources), 'A marca antiga ainda aparece em conteúdo visível.');

console.log('✅ Roneca Player TV: marca oficial, busca, sidebar, cartões, tabelas e navegação mobile validados.');
