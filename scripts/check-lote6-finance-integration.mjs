import fs from 'node:fs';

const files = {
  migration: 'supabase/migrations/20260807200000_lote6_atomic_admin_credit_adjustment.sql',
  creditBase: 'supabase/migrations/2026072604_consolidated_commercial_credit_flow.sql',
  packageMigration: 'supabase/migrations/20260807201000_lote6_atomic_credit_order_payment.sql',
  edge: 'supabase/functions/admin-credit-adjust/index.ts',
  packageEdge: 'supabase/functions/credit-packages-panel/index.ts',
  ui: 'admin-panel/admin-commercial-privacy-v2.js',
  auth: 'admin-panel/panel-auth-session.js',
  config: 'supabase/config.toml',
  pgTap: 'supabase/tests/lote6_atomic_admin_credit_adjustment_test.sql',
  packagePgTap: 'supabase/tests/lote6_atomic_credit_order_payment_test.sql',
};

for (const file of Object.values(files)) {
  if (!fs.existsSync(file)) throw new Error(`Arquivo obrigatório do Lote 6 ausente: ${file}`);
}
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, 'utf8')]));

for (const token of [
  'admin_adjust_seller_credit_transaction',
  'apply_seller_credit_transaction',
  "set search_path = ''",
  'panel_audit_logs',
  'p_idempotency_key',
  'to service_role',
]) {
  if (!source.migration.includes(token)) throw new Error(`Migração atômica incompleta: ${token}`);
}
if (!source.creditBase.includes('panel_credit_ledger')) {
  throw new Error('A transação atômica precisa continuar apoiada no ledger canônico de créditos.');
}

for (const token of [
  'update_credit_order_payment_transaction',
  "alter function public.release_credit_order(uuid)",
  "set search_path = ''",
  'panel_financial_records',
  'release_credit_order(p_order_id)',
  'previousPaymentStatus',
  'to service_role',
]) {
  if (!source.packageMigration.includes(token)) throw new Error(`Pagamento de pacote ainda não está atômico: ${token}`);
}

for (const token of [
  "requirePanelPrincipal(request, supabase, ['owner', 'admin'])",
  "rpc('admin_adjust_seller_credit_transaction'",
  'idempotencyKey',
  'balanceBefore',
  'balanceAfter',
]) {
  if (!source.edge.includes(token)) throw new Error(`Edge de ajuste incompleta: ${token}`);
}
for (const forbidden of [
  ".from('panel_sellers').update",
  ".from('panel_credit_ledger').insert",
]) {
  if (source.edge.includes(forbidden)) throw new Error(`Edge não pode repetir DML fora da RPC: ${forbidden}`);
}

for (const token of [
  "rpc('update_credit_order_payment_transaction'",
  'p_payment_status: status',
  'p_performed_by_user_id: principal.userId',
]) {
  if (!source.packageEdge.includes(token)) throw new Error(`Edge de pacotes não usa a transação canônica: ${token}`);
}
for (const forbidden of [
  ".from('panel_credit_orders').update",
  ".from('panel_financial_records').update",
  "rpc('release_credit_order'",
]) {
  if (source.packageEdge.includes(forbidden)) throw new Error(`Pagamento de pacote voltou a usar etapas separadas: ${forbidden}`);
}

for (const token of [
  "getFunctionUrl('admin-credit-adjust')",
  'ensureCreditAttempt',
  'idempotencyKey: attempt.idempotencyKey',
  'window.addSellerCredits = canonicalAddSellerCredits',
  'window.submitCommercialCredits = canonicalSubmitCommercialCredits',
]) {
  if (!source.ui.includes(token)) throw new Error(`ADM ainda não está canônico no ajuste de créditos: ${token}`);
}

if (!source.auth.includes("'admin-credit-adjust': true")) {
  throw new Error('Sessão do painel não reconhece admin-credit-adjust.');
}
if (!source.config.includes('[functions.admin-credit-adjust]\nverify_jwt = true')) {
  throw new Error('admin-credit-adjust precisa exigir JWT no config do Supabase.');
}

for (const token of [
  'Saldo sobe uma única vez',
  'Retry não duplica saldo',
  'Retry não duplica auditoria',
  'manual_remove',
  'service_role executa ajuste administrativo',
]) {
  if (!source.pgTap.includes(token)) throw new Error(`pgTAP do ajuste manual incompleto: ${token}`);
}
for (const token of [
  'Pagamento e liberação executam na mesma transação',
  'Pedido pago termina com créditos liberados',
  'Registro financeiro fica pago na mesma operação',
  'Retry não duplica saldo, ledger, lote nem auditoria',
  'Cancelamento de créditos já liberados continua bloqueado',
]) {
  if (!source.packagePgTap.includes(token)) throw new Error(`pgTAP de pacote incompleto: ${token}`);
}

console.log('✅ Lote 6: ajustes manuais e pagamentos de pacotes usam transações canônicas e idempotentes.');
