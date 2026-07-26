import fs from 'node:fs';

const files = {
  ui: 'admin-panel/commercial-consolidation.js',
  css: 'admin-panel/commercial-consolidation.css',
  endpoint: 'supabase/functions/seller-commercial-panel/index.ts',
  migration: 'supabase/migrations/2026072604_consolidated_commercial_credit_flow.sql',
  loader: 'scripts/generate-panel-config.mjs',
};

for (const path of Object.values(files)) {
  if (!fs.existsSync(path)) throw new Error(`Arquivo obrigatório ausente: ${path}`);
}

const source = Object.fromEntries(Object.entries(files).map(([key, path]) => [key, fs.readFileSync(path, 'utf8')]));
const required = {
  ui: [
    'Meus créditos',
    'Minhas vendas',
    'Clientes',
    'Meus preços por plano',
    'commercialCreditPackagesHost',
    'sellerActivationCustomerSelect',
    'sellerCommercialSavePrice',
    'sellerCommercialSaveCustomer',
    'data-subscription-tab',
  ],
  css: ['.commercial-consolidated-area', '.seller-plan-price-grid', '.seller-customer-grid', '.auto-sale-price'],
  endpoint: [
    "requirePanelPrincipal(request, supabase, ['seller'])",
    "from('panel_seller_plan_prices')",
    "from('panel_customers')",
    "action === 'savePlanPrice'",
    "action === 'createCustomer'",
    "action === 'updateCustomer'",
  ],
  migration: [
    'create table if not exists public.panel_seller_plan_prices',
    'perform public.expire_credit_lots(p_seller_id)',
    "status = case when credits_remaining - v_lot_take = 0 then 'consumed'",
    'preservando o saldo legado',
  ],
  loader: [
    'loadCommercialConsolidation',
    'commercial-consolidation.css?v=1.0',
    'commercial-consolidation.js?v=1.0',
  ],
};

for (const [group, snippets] of Object.entries(required)) {
  for (const snippet of snippets) {
    if (!source[group].includes(snippet)) throw new Error(`Proteção ausente em ${files[group]}: ${snippet}`);
  }
}

if (source.loader.includes('loadSubscriptionModule')) {
  throw new Error('O módulo incompleto de assinaturas não deve ser carregado no painel publicado.');
}

console.log('✅ Fluxo comercial consolidado: pacotes, preços, clientes e consumo FIFO validados.');
