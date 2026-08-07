import fs from 'node:fs';

const files = {
  migration: 'supabase/migrations/20260807200000_lote6_atomic_admin_credit_adjustment.sql',
  edge: 'supabase/functions/admin-credit-adjust/index.ts',
  ui: 'admin-panel/admin-commercial-privacy-v2.js',
  auth: 'admin-panel/panel-auth-session.js',
  config: 'supabase/config.toml',
  pgTap: 'supabase/tests/lote6_atomic_admin_credit_adjustment_test.sql',
};

for (const file of Object.values(files)) {
  if (!fs.existsSync(file)) throw new Error(`Arquivo obrigatório do Lote 6 ausente: ${file}`);
}
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, 'utf8')]));

for (const token of [
  'admin_adjust_seller_credit_transaction',
  'apply_seller_credit_transaction',
  "set search_path = ''",
  'panel_credit_ledger',
  'panel_audit_logs',
  'p_idempotency_key',
  'to service_role',
]) {
  if (!source.migration.includes(token)) throw new Error(`Migração atômica incompleta: ${token}`);
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
  if (!source.pgTap.includes(token)) throw new Error(`pgTAP do Lote 6 incompleto: ${token}`);
}

console.log('✅ Lote 6: ajuste administrativo usa uma única transação com ledger, auditoria e idempotência.');
