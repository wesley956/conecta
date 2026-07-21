import fs from 'node:fs';

const files = {
  ui: 'admin-panel/finance-module.js',
  css: 'admin-panel/finance-module.css',
  edge: 'supabase/functions/finance-panel/index.ts',
  migration: 'supabase/migrations/2026072101_financial_module.sql',
  test: 'supabase/tests/financial_module_test.sql',
  loader: 'scripts/generate-panel-config.mjs',
};

for (const path of Object.values(files)) {
  if (!fs.existsSync(path)) throw new Error(`Arquivo financeiro obrigatório ausente: ${path}`);
}

const source = Object.fromEntries(
  Object.entries(files).map(([name, path]) => [name, fs.readFileSync(path, 'utf8')]),
);

const required = {
  ui: [
    'Financeiro operacional',
    'Meu financeiro',
    'Nova receita',
    'Nova despesa',
    'Exportar CSV',
    'Registrar venda no financeiro',
    'activateDeviceWithFinance',
    'renewDeviceWithFinance',
    'financeSellerSummary',
    'Não representa comissão',
  ],
  css: [
    '.finance-metrics',
    '.finance-status.overdue',
    '.finance-modal',
    '.seller-finance-record',
  ],
  edge: [
    "requirePanelPrincipal(request, supabase, ['admin', 'seller'])",
    "from('panel_financial_records')",
    "rpc('apply_device_subscription_with_finance'",
    "principal.role === 'seller'",
    "recordType = 'income'",
    "action === 'deleteRecord'",
  ],
  migration: [
    'create table if not exists public.panel_financial_records',
    'force row level security',
    'apply_device_subscription_with_finance',
    'p_finance_amount_cents',
    'panel_financial_records_idempotency_idx',
    'from public, anon, authenticated',
  ],
  test: [
    "has_table('public', 'panel_financial_records'",
    'Ativação, crédito e financeiro são processados juntos',
    'Retry não duplica a receita',
    'Falha comercial não deixa receita órfã',
  ],
  loader: [
    'loadFinanceModule',
    'finance-module.js?v=1.0',
  ],
};

for (const [name, snippets] of Object.entries(required)) {
  for (const snippet of snippets) {
    if (!source[name].includes(snippet)) {
      throw new Error(`Proteção financeira ausente em ${files[name]}: ${snippet}`);
    }
  }
}

if (/comiss[aã]o estimada/i.test(source.ui)) {
  throw new Error('O portal do vendedor não deve exibir comissão estimada.');
}

if (source.edge.includes('SUPABASE_SERVICE_ROLE_KEY') === false) {
  throw new Error('A Edge Function financeira deve manter acesso privilegiado somente no servidor.');
}

console.log('✅ Módulo financeiro validado para administrador e vendedor, sem comissão estimada.');
