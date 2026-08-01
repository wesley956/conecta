import fs from 'node:fs';

const files = {
  financeUi: 'admin-panel/finance-module.js',
  financeCss: 'admin-panel/finance-module.css',
  creditUi: 'admin-panel/credit-packages-module.js',
  creditCss: 'admin-panel/credit-packages-module.css',
  financeEdge: 'supabase/functions/finance-panel/index.ts',
  creditEdge: 'supabase/functions/credit-packages-panel/index.ts',
  financeMigration: 'supabase/migrations/2026072101_financial_module.sql',
  packageMigration: 'supabase/migrations/2026072601_credit_packages_private_finance.sql',
  scopeGuardMigration: 'supabase/migrations/20260726125413_financial_scope_guard.sql',
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
  financeUi: [
    'Meu financeiro',
    'Registrar recebimento',
    'sellerFinanceRecords',
    'financeUpdateStatus',
    "financeDeleteRecord('${esc(record.id)}','seller')",
    'nenhum crédito será devolvido',
  ],
  financeCss: [
    '.finance-metrics',
    '.finance-status.overdue',
    '.seller-finance-record',
  ],
  creditUi: [
    'Financeiro da empresa',
    'Venda de créditos',
    'Meus créditos',
    'Somente compras de créditos feitas pelos vendedores aparecem aqui',
    'Pagamento: ${esc(paymentLabel(o.paymentStatus))}',
    "data.role==='seller'?renderSeller():renderAdmin()",
  ],
  creditCss: [
    '[data-tab="finance"]',
    '#section-finance',
    '.credit-package-metrics',
    '.credit-package-option.featured',
    '.credit-seller-orders',
  ],
  financeEdge: [
    "requirePanelPrincipal(request, supabase, ['seller'])",
    ".eq('financial_scope', 'seller_private')",
    ".eq('seller_id', principal.sellerId)",
    "financial_scope: 'seller_private'",
    "action === 'deleteRecord'",
    "action: 'finance.record_deleted_by_seller'",
    "entity_type: 'financial_record'",
  ],
  creditEdge: [
    "requirePanelPrincipal(request, supabase, ['owner', 'admin', 'seller'])",
    "from('panel_credit_orders')",
    "rpc('create_credit_package_order'",
    "rpc('release_credit_order'",
    "Somente o administrador pode vender créditos",
  ],
  financeMigration: [
    'create table if not exists public.panel_financial_records',
    'force row level security',
    'apply_device_subscription_with_finance',
    'panel_financial_records_idempotency_idx',
  ],
  packageMigration: [
    'panel_credit_packages',
    'panel_credit_orders',
    'panel_credit_lots',
    'financial_scope',
    "('AVULSO_10', 'Pacote Avulso', 10, 3000",
    "('INTERMEDIARIO_25', 'Pacote Intermediário', 25, 3750",
    "('BASICO_50', 'Plano Básico', 50, 5000",
  ],
  scopeGuardMigration: [
    'enforce_panel_financial_scope',
    "new.source = 'credit_sale'",
    "new.financial_scope := 'seller_private'",
    'panel_financial_records_scope_guard',
  ],
  test: [
    "has_table('public', 'panel_financial_records'",
    'Ativação, crédito e financeiro são processados juntos',
    'Retry não duplica a receita',
  ],
  loader: [
    'loadFinanceModule',
    'loadCreditPackagesModule',
    'credit-packages-module.js?v=1.0',
  ],
};

for (const [name, snippets] of Object.entries(required)) {
  for (const snippet of snippets) {
    if (!source[name].includes(snippet)) {
      throw new Error(`Proteção financeira ausente em ${files[name]}: ${snippet}`);
    }
  }
}

if (/requirePanelPrincipal\(request, supabase, \[[^\]]*(owner|admin)/.test(source.financeEdge)) {
  throw new Error('A API do financeiro privado não pode autorizar administrador ou proprietário.');
}
if (!source.creditEdge.includes('SUPABASE_SERVICE_ROLE_KEY') || !source.financeEdge.includes('SUPABASE_SERVICE_ROLE_KEY')) {
  throw new Error('As Edge Functions financeiras devem manter acesso privilegiado somente no servidor.');
}
if (/comiss[aã]o estimada/i.test(source.financeUi)) {
  throw new Error('O portal do vendedor não deve exibir comissão estimada.');
}

console.log('✅ Financeiro privado do vendedor e venda de créditos da empresa validados separadamente.');
