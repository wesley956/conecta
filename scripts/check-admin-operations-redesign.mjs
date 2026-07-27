import fs from 'node:fs';

const files = {
  ui: 'admin-panel/admin-operations-redesign.js',
  css: 'admin-panel/admin-operations-redesign.css',
  endpoint: 'supabase/functions/admin-operations-panel/index.ts',
  loader: 'scripts/generate-panel-config.mjs',
  config: 'supabase/config.toml',
};

for (const path of Object.values(files)) {
  if (!fs.existsSync(path)) throw new Error(`Arquivo obrigatório ausente: ${path}`);
}

const source = Object.fromEntries(
  Object.entries(files).map(([key, path]) => [key, fs.readFileSync(path, 'utf8')]),
);

const required = {
  ui: [
    'adminPendingCards',
    'adminPendingActivationModal',
    'pend-customer-',
    'pend-seller-',
    'pend-plan-',
    'pend-playlist-',
    'pend-backup-playlist-',
    'pend-exp-',
    'activatePending',
    'admin-device-card-compact',
    'dev-customer-',
    'dev-seller-',
    'dev-plan-',
    'dev-status-',
    'dev-playlist-',
    'dev-backup-playlist-',
    'dev-exp-',
    'Clientes por vendedor',
    'Listas por vendedor',
    'sellerIds',
    'Histórico e extrato de créditos',
    'company-finance',
    'Financeiro da empresa',
    'adminCompanyOrders',
    'commercial-ledger-card',
  ],
  css: [
    '.admin-pending-grid',
    '.admin-device-card-compact',
    '.admin-seller-group-grid',
    '.admin-customer-card-grid',
    '.admin-playlist-card-grid',
    '.admin-history-timeline',
    '.admin-finance-metrics',
  ],
  endpoint: [
    "requirePanelPrincipal(request, supabase, ['owner', 'admin'])",
    "from('panel_seller_playlists')",
    "from('panel_company_financial_records')",
    'paidExpensesCents',
    'paidResultCents',
    'playlistAccess',
  ],
  loader: [
    'loadAdminOperationsRedesign',
    'admin-operations-redesign.css?v=1.0',
    'admin-operations-redesign.js?v=1.0',
  ],
  config: [
    '[functions.admin-operations-panel]',
    'verify_jwt = true',
  ],
};

for (const [group, snippets] of Object.entries(required)) {
  for (const snippet of snippets) {
    if (!source[group].includes(snippet)) {
      throw new Error(`Proteção ausente em ${files[group]}: ${snippet}`);
    }
  }
}

if (/\bMutationObserver\s*\(/.test(source.ui)) {
  throw new Error('A reorganização administrativa não pode observar a página inteira continuamente.');
}

if (/\beval\s*\(|\bFunction\s*\(/.test(source.ui)) {
  throw new Error('A reorganização administrativa não pode executar código dinâmico.');
}

if (source.endpoint.includes("['seller']") || source.endpoint.includes("['owner', 'admin', 'seller']")) {
  throw new Error('O endpoint de organização administrativa não pode aceitar vendedor.');
}

console.log('✅ Painel administrativo organizado: cards, modal seguro, agrupamento, histórico e financeiro da empresa validados.');
