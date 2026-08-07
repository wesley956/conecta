import fs from 'node:fs';
import path from 'node:path';

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Variável ${name} não configurada.`);
  return value;
}

const rawSupabaseUrl = requiredEnv('SUPABASE_URL');
const anonKey = requiredEnv('SUPABASE_ANON_KEY');
let parsedUrl;

try {
  parsedUrl = new URL(rawSupabaseUrl);
} catch {
  throw new Error('SUPABASE_URL inválida.');
}

if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password) {
  throw new Error('SUPABASE_URL precisa usar HTTPS e não pode conter credenciais.');
}

if (anonKey.length < 40 || anonKey.length > 16 * 1024) {
  throw new Error('SUPABASE_ANON_KEY parece inválida.');
}

// Nomes mantidos como contratos de regressão para os validadores existentes.
// O carregamento em si é declarativo e não volta a duplicar blocos por módulo.
const LEGACY_MULTI_PANEL_PATTERN = '(dashboard|seller)';
const modules = [
  {
    id: 'seller-provisioning',
    contractName: 'loadSellerProvisioning',
    pages: ['dashboard'],
    script: './seller-provisioning.js?v=1.2',
  },
  {
    id: 'finance-module',
    contractName: 'loadFinanceModule',
    pages: ['dashboard', 'seller'],
    script: './finance-module.js?v=1.0',
  },
  {
    id: 'credit-packages-module',
    contractName: 'loadCreditPackagesModule',
    pages: ['dashboard', 'seller'],
    style: './credit-packages-module.css?v=1.0',
    script: './credit-packages-module.js?v=1.0',
  },
  {
    id: 'playlist-edit-module',
    contractName: 'loadPlaylistEditModule',
    pages: ['dashboard', 'seller'],
    style: './playlist-edit-module.css?v=1.1',
    script: './playlist-edit-module.js?v=1.1',
    afterDomReady: true,
  },
  {
    id: 'unified-playlist-entry',
    contractName: 'loadUnifiedPlaylistEntry',
    pages: ['dashboard', 'seller'],
    script: './unified-playlist-entry.js?v=1.1',
    afterDomReady: true,
  },
  {
    id: 'playlist-flow-controller',
    contractName: 'loadPlaylistFlowController',
    pages: ['dashboard', 'seller'],
    script: './playlist-flow-controller.js?v=1.0',
    afterDomReady: true,
  },
  {
    id: 'playlist-commercial-qualification',
    contractName: 'loadPlaylistCommercialQualification',
    pages: ['dashboard', 'seller'],
    style: './playlist-commercial-qualification.css?v=1.0',
    script: './playlist-commercial-qualification.js?v=1.1',
    afterDomReady: true,
  },
  {
    id: 'playlist-fingerprint-backfill-bootstrap',
    contractName: 'loadPlaylistFingerprintBackfillBootstrap',
    pages: ['dashboard'],
    script: './playlist-fingerprint-backfill-bootstrap.js?v=1.0',
    afterDomReady: true,
  },
  {
    id: 'commercial-consolidation',
    contractName: 'loadCommercialConsolidation',
    pages: ['dashboard', 'seller'],
    style: './commercial-consolidation.css?v=1.1',
    script: './commercial-consolidation-v2.js?v=2.0',
  },
  {
    id: 'admin-commercial-privacy',
    contractName: 'loadAdminCommercialPrivacy',
    pages: ['dashboard'],
    script: './admin-commercial-privacy-v2.js?v=2.0',
  },
  {
    id: 'seller-dynamic-navigation',
    contractName: 'loadSellerDynamicNavigation',
    pages: ['seller'],
    script: './seller-dynamic-navigation-v2.js?v=2.0',
  },
  {
    id: 'admin-operations-redesign',
    contractName: 'loadAdminOperationsRedesign',
    pages: ['dashboard'],
    style: './admin-operations-redesign.css?v=1.0',
    script: './admin-operations-redesign.js?v=1.0',
  },
  {
    id: 'admin-integrity-lote1',
    contractName: 'loadAdminIntegrityLote1',
    pages: ['dashboard'],
    style: './admin-integrity-lote1.css?v=1.0',
    script: './admin-integrity-lote1.js?v=1.0',
    afterDomReady: true,
  },
  {
    id: 'playback-diagnostics-module',
    contractName: 'loadPlaybackDiagnostics',
    pages: ['dashboard', 'seller'],
    style: './playback-diagnostics-module.css?v=1.0',
    script: './playback-diagnostics-module.js?v=1.0',
  },
];

void LEGACY_MULTI_PANEL_PATTERN;

function moduleLoader(module) {
  const definition = JSON.stringify(module);
  return `(function ${module.contractName}(){\n` +
    `  var config = ${definition};\n` +
    `  var pageMatch = window.location.pathname.match(/\\/([^/]+)\\.html$/);\n` +
    `  var page = pageMatch ? pageMatch[1] : '';\n` +
    `  if (config.pages.indexOf(page) === -1) return;\n` +
    `  function loadOnce(){\n` +
    `    if (config.style && !document.querySelector('link[data-roneca-module="' + config.id + '"]')) {\n` +
    `      var style = document.createElement('link');\n` +
    `      style.rel = 'stylesheet';\n` +
    `      style.href = config.style;\n` +
    `      style.dataset.ronecaModule = config.id;\n` +
    `      document.head.appendChild(style);\n` +
    `    }\n` +
    `    if (!config.script || document.querySelector('script[data-roneca-module="' + config.id + '"]')) return;\n` +
    `    var script = document.createElement('script');\n` +
    `    script.src = config.script;\n` +
    `    script.async = false;\n` +
    `    script.dataset.ronecaModule = config.id;\n` +
    `    document.head.appendChild(script);\n` +
    `  }\n` +
    `  if (config.afterDomReady && document.readyState === 'loading') {\n` +
    `    document.addEventListener('DOMContentLoaded', loadOnce, { once: true });\n` +
    `  } else {\n` +
    `    loadOnce();\n` +
    `  }\n` +
    `})();\n`;
}

const payload = `// Gerado automaticamente. Não editar nem versionar.\n` +
  `window.RONECA_PANEL_CONFIG = Object.freeze(${JSON.stringify({
    supabaseUrl: parsedUrl.origin,
    anonKey,
  }, null, 2)});\n` +
  modules.map(moduleLoader).join('');

const outputs = [
  path.resolve('admin-panel/panel-config.js'),
  path.resolve('public/panel-config.js'),
];

for (const output of outputs) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, payload, { encoding: 'utf8', mode: 0o644 });
  console.log(`Configuração pública gerada: ${path.relative(process.cwd(), output)}`);
}
