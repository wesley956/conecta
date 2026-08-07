import fs from 'node:fs';

const files = {
  provision: 'supabase/functions/seller-provision/index.ts',
  deletion: 'supabase/functions/seller-delete/index.ts',
  activation: 'supabase/functions/device-activate/index.ts',
  session: 'admin-panel/panel-auth-session.js',
  sellerUi: 'admin-panel/seller-provisioning.js',
  migration: 'supabase/migrations/20260807190000_lote5_seller_auth_security.sql',
  pgTap: 'supabase/tests/lote5_seller_auth_security_test.sql',
};

for (const file of Object.values(files)) {
  if (!fs.existsSync(file)) throw new Error(`Arquivo obrigatório do Lote 5 ausente: ${file}`);
}
const source = Object.fromEntries(Object.entries(files).map(([name, path]) => [name, fs.readFileSync(path, 'utf8')]));

for (const token of [
  "access_token: null",
  "public_code: null",
  'legacyCredentialsCreated: false',
  "assign_panel_role",
]) {
  if (!source.provision.includes(token)) throw new Error(`Provisionamento moderno incompleto: ${token}`);
}
for (const forbidden of [
  'createSellerAccessToken',
  'seller-token-',
  'seller-public-code-',
]) {
  if (source.provision.includes(forbidden)) throw new Error(`Provisionamento voltou a gerar credencial legada: ${forbidden}`);
}

for (const token of [
  "rpc('delete_seller_account_transaction'",
  'supabase.auth.admin.deleteUser(authUserId)',
  'preservedHistory',
  'seller.auth_revoke_pending',
]) {
  if (!source.deletion.includes(token)) throw new Error(`Exclusão segura incompleta: ${token}`);
}
for (const forbidden of [
  ".from('panel_sellers')\n        .delete()",
  ".from('panel_sellers').delete()",
]) {
  if (source.deletion.includes(forbidden)) throw new Error('Exclusão manual não pode apagar fisicamente o vendedor.');
}

for (const forbidden of ['sellerCode', 'public_code', 'findSellerByCode']) {
  if (source.activation.includes(forbidden)) throw new Error(`Ativação do aparelho ainda depende de credencial do vendedor: ${forbidden}`);
}
for (const token of [
  'const preservedSellerId = existingDevice?.seller_id || null',
  'seller_id: null',
  'Código criado. Envie este código ao vendedor/admin',
]) {
  if (!source.activation.includes(token)) throw new Error(`Ativação sem código de vendedor incompleta: ${token}`);
}

for (const token of [
  "var STORAGE_KEY = 'roneca-panel-auth-session-v1'",
  'retireLegacyStorage()',
  "'seller-device-flow': true",
  "'seller-provision': true",
  "'seller-delete': true",
  'REFRESH_MARGIN_SECONDS = 90',
]) {
  if (!source.session.includes(token)) throw new Error(`Política única de sessão incompleta: ${token}`);
}
for (const forbidden of [
  'LEGACY_SESSION_MARKER',
  "setItem(key, 'supabase-session')",
  'syncLegacySessionMarkers',
]) {
  if (source.session.includes(forbidden)) throw new Error(`Sessão voltou a criar marcador legado: ${forbidden}`);
}

for (const token of [
  "['renderSellerReports', 'renderCommercial', 'showSellerDetails']",
  'removeLegacyAccessControls',
  "callProtectedFunction('seller-provision'",
  "callProtectedFunction('seller-delete'",
]) {
  if (!source.sellerUi.includes(token)) throw new Error(`Gestão visual do vendedor incompleta: ${token}`);
}
if (source.sellerUi.includes('MutationObserver')) {
  throw new Error('Gestão de vendedor não pode observar o DOM inteiro para esconder controles legados.');
}

for (const token of [
  'panel_sellers_legacy_access_token_retired_check',
  'panel_sellers_public_code_retired_check',
  'delete_seller_account_transaction',
  "set search_path = ''",
  'panel_finance_scope_for_role(text)',
  'revoke all on function public.learn_playlist_server_profile()',
]) {
  if (!source.migration.includes(token)) throw new Error(`Migração de segurança incompleta: ${token}`);
}
for (const token of [
  'Histórico de créditos não é apagado',
  'Registro comercial do vendedor é preservado',
  'Aparelho é apenas desvinculado do vendedor',
  'Cliente é apenas desvinculado do vendedor',
  'Exclusão repetida não altera novamente o histórico',
]) {
  if (!source.pgTap.includes(token)) throw new Error(`pgTAP do Lote 5 incompleto: ${token}`);
}

console.log('✅ Lote 5: Supabase Auth único, credenciais legadas aposentadas e exclusão lógica protegida.');
