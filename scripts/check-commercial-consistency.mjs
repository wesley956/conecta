import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = {
  historicalMigration: 'supabase/migrations/20260801032340_commercial_consistency_transactions.sql',
  historicalTest: 'supabase/tests/commercial_consistency_transactions_test.sql',
  canonicalMigration: 'supabase/migrations/20260807053000_canonical_seller_device_flow.sql',
  experienceMigration: 'supabase/migrations/20260807070000_lote4_activation_experience.sql',
  legacyBoundary: 'supabase/migrations/20260807053100_disable_legacy_device_commercial_paths.sql',
  playlistBoundary: 'supabase/migrations/20260807053200_enforce_canonical_device_mutations.sql',
  canonicalEdge: 'supabase/functions/seller-device-flow/index.ts',
  adminEdge: 'supabase/functions/admin-panel/index.ts',
  sellerEdge: 'supabase/functions/seller-panel/index.ts',
  adminUi: 'admin-panel/admin-device-flow.js',
  sellerUi: 'admin-panel/seller-activation-wizard.js',
  canonicalTest: 'supabase/tests/canonical_seller_device_flow_test.sql',
  experienceTest: 'supabase/tests/lote4_activation_experience_test.sql',
};

const source = Object.fromEntries(await Promise.all(
  Object.entries(files).map(async ([name, path]) => [name, await readFile(path, 'utf8')]),
));

for (const required of [
  'apply_device_subscription_complete_transaction',
  'set_device_playlists_transaction',
  'remove_seller_playlist_transaction',
  'delete_playlist_with_reassignment',
  'pg_advisory_xact_lock',
  "set search_path = ''",
  'for update',
]) assert.ok(source.historicalMigration.includes(required), `Proteção transacional histórica ausente: ${required}`);

for (const required of [
  'Retry idêntico não duplica o débito',
  'Falha de reserva não cria débito',
  'A mesma chave não pode trocar a reserva',
  'Vendedor não remove lista usada',
  'Aparelho promove a reserva na mesma transação',
]) assert.ok(source.historicalTest.includes(required), `Cobertura histórica pgTAP ausente: ${required}`);

for (const required of [
  'panel_device_commercial_operations',
  'seller_device_flow_transaction',
  "v_operation in ('activation', 'renewal')",
  "v_operation = 'change_playlists'",
  'v_old_primary',
  'v_old_backup',
  'panel_device_playlist_revisions',
  'device.playlists_changed_canonical',
  'idempotency_key',
]) assert.ok(source.canonicalMigration.includes(required), `Transação canônica incompleta: ${required}`);

for (const required of [
  'seller_device_flow_transaction_v4',
  'p_customer_notes',
  "'America/Sao_Paulo'",
  'seller_device_flow_transaction(',
]) assert.ok(source.experienceMigration.includes(required), `Wrapper comercial v4 incompleto: ${required}`);

for (const required of [
  "['activate', 'renew', 'changePlaylists']",
  "rpc('seller_device_flow_transaction_v4'",
  'p_customer_notes',
  'Renovação não altera cliente nem listas',
  'Alterar listas não muda cliente, plano ou validade',
  'idempotencyKey',
]) assert.ok(source.canonicalEdge.includes(required), `seller-device-flow v4 incompleto: ${required}`);

for (const [name, ui] of [['admin', source.adminUi], ['seller', source.sellerUi]]) {
  assert.ok(ui.includes('seller-device-flow'), `${name} não aponta para seller-device-flow.`);
  assert.ok(ui.includes("action: 'activate'"), `${name} não usa ativação canônica.`);
  assert.ok(ui.includes("action: 'renew'"), `${name} não usa renovação canônica.`);
  assert.ok(ui.includes("action: 'changePlaylists'"), `${name} não usa troca canônica.`);
}

const sellerDeprecation = source.sellerEdge.indexOf("if (action === 'activateDeviceByCode' || action === 'renewDevice')");
const sellerLegacyActivation = source.sellerEdge.indexOf("if (action === 'activateDeviceByCode')");
const sellerLegacyRenewal = source.sellerEdge.indexOf("if (action === 'renewDevice')");
assert.ok(sellerDeprecation >= 0, 'seller-panel não possui barreira explícita para ações comerciais antigas.');
assert.ok(sellerLegacyActivation > sellerDeprecation, 'Ativação antiga do seller-panel pode executar antes da barreira.');
assert.ok(sellerLegacyRenewal > sellerDeprecation, 'Renovação antiga do seller-panel pode executar antes da barreira.');
for (const required of ["canonicalFunction: 'seller-device-flow'", 'canonicalAction', '}, 410)']) {
  assert.ok(source.sellerEdge.includes(required), `Depreciação do seller-panel sem orientação: ${required}`);
}

for (const required of [
  "v_request_role = 'service_role'",
  'Operação comercial antiga desativada. Use seller-device-flow.',
  'Troca comercial antiga desativada. Use seller-device-flow.',
]) assert.ok(source.legacyBoundary.includes(required), `Barreira de RPC comercial antiga ausente: ${required}`);
for (const required of [
  "v_request_role = 'service_role'",
  'Troca de listas por RPC genérica desativada. Use seller-device-flow',
  'repair_device_playlists_transaction',
  'set_device_playlists_transaction_legacy_core',
]) assert.ok(source.playlistBoundary.includes(required), `Barreira de lista genérica ausente: ${required}`);

assert.ok(source.adminEdge.includes("rpc('apply_device_subscription_complete_transaction'"), 'Compatibilidade administrativa histórica deveria permanecer identificável até sua remoção definitiva.');
assert.ok(source.adminEdge.includes("rpc('set_device_playlists_transaction'"), 'Compatibilidade administrativa de listas deveria permanecer identificável e bloqueada na fronteira.');

for (const required of [
  'Ativação canônica com lista reserva é aplicada',
  'Retry idêntico da ativação retorna replay idempotente',
  'Renovação preserva o cliente',
  'Renovação preserva a lista principal',
  'Renovação preserva a lista reserva',
  'Troca de listas não consome crédito',
  'Troca de listas não altera a validade',
  'Saldo insuficiente aborta a ativação canônica',
  'Falha por saldo não persiste operação parcial',
]) assert.ok(source.canonicalTest.includes(required), `Cobertura canônica ausente: ${required}`);

for (const required of [
  'Observação é salva no mesmo cliente criado pela ativação',
  'Validade automática termina exatamente às 23:59:59.999 em São Paulo',
  'Falha de observação não consome crédito adicional',
]) assert.ok(source.experienceTest.includes(required), `Cobertura v4 ausente: ${required}`);

console.log('✅ Consistência comercial: seller-device-flow v4 preserva o núcleo atômico e adiciona UX sem criar caminho alternativo.');
