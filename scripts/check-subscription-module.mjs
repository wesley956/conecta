import fs from 'node:fs';

const requiredFiles = [
  'admin-panel/unified-playlist-entry.js',
  'admin-panel/playlist-flow-controller.js',
  'admin-panel/seller-activation-wizard.js',
  'admin-panel/admin-device-flow.js',
  'supabase/functions/seller-device-flow/index.ts',
  'supabase/functions/subscription-panel/index.ts',
  'supabase/functions/subscription-playlist-edit/index.ts',
  'supabase/functions/playlist-registration/index.ts',
  'supabase/migrations/2026072201_customer_subscriptions_lab.sql',
  'supabase/migrations/2026072205_subscription_playlist_edit.sql',
  'supabase/migrations/2026072206_legacy_device_playlist_edit.sql',
  'supabase/tests/customer_subscriptions_lab_test.sql',
  'supabase/tests/subscription_playlist_edit_test.sql',
  'supabase/tests/legacy_device_playlist_edit_test.sql',
  'scripts/generate-panel-config.mjs',
];
for (const file of requiredFiles) if (!fs.existsSync(file)) throw new Error(`Arquivo obrigatório ausente: ${file}`);

const read = file => fs.readFileSync(file, 'utf8');
const unified = read('admin-panel/unified-playlist-entry.js');
const controller = read('admin-panel/playlist-flow-controller.js');
const wizard = read('admin-panel/seller-activation-wizard.js');
const adminFlow = read('admin-panel/admin-device-flow.js');
const canonical = read('supabase/functions/seller-device-flow/index.ts');
const subscriptionApi = read('supabase/functions/subscription-panel/index.ts');
const legacyEditApi = read('supabase/functions/subscription-playlist-edit/index.ts');
const registration = read('supabase/functions/playlist-registration/index.ts');
const migration = read('supabase/migrations/2026072201_customer_subscriptions_lab.sql');
const editMigration = read('supabase/migrations/2026072205_subscription_playlist_edit.sql');
const deviceEditMigration = read('supabase/migrations/2026072206_legacy_device_playlist_edit.sql');
const loader = read('scripts/generate-panel-config.mjs');

for (const token of ['admin-base', 'seller-base', 'Login Xtream — host, usuário e senha', 'prepare(key)', 'O cadastro da lista é independente da ativação']) {
  if (!unified.includes(token)) throw new Error(`Entrada universal não contém: ${token}`);
}
for (const forbidden of ['sellerActivationBackupPlaylist', 'sellerRenewPlaylist', 'sellerRenewBackupPlaylist', 'MutationObserver', 'activatePending']) {
  if (unified.includes(forbidden)) throw new Error(`Entrada universal voltou a depender do formulário comercial antigo: ${forbidden}`);
}

for (const token of ['__ronecaPlaylistFlowControllerInstalled', "action: 'create'", 'createPromises', 'operationLocks']) {
  if (!controller.includes(token)) throw new Error(`Controlador de cadastro não contém: ${token}`);
}
for (const forbidden of ['PlaylistSavedPendingError', "wrapBefore('sellerUxActivateDevice'", "wrapBefore('sellerUxRenewDevice'", "wrapBefore('activatePending'"]) {
  if (controller.includes(forbidden)) throw new Error(`Controlador de listas voltou a interceptar venda: ${forbidden}`);
}

for (const [name, source] of [['vendedor', wizard], ['ADM', adminFlow]]) {
  for (const token of ["seller-device-flow", 'changePlaylists']) {
    if (!source.includes(token)) throw new Error(`Fluxo ${name} não usa o backend canônico: ${token}`);
  }
}
for (const token of ["['activate', 'renew', 'changePlaylists']", "rpc('seller_device_flow_transaction'", 'idempotencyKey']) {
  if (!canonical.includes(token)) throw new Error(`seller-device-flow não contém: ${token}`);
}

for (const token of ['register_playlist_source_transaction', 'commerciallyUsable', 'source_fingerprint']) {
  if (!registration.includes(token)) throw new Error(`Cadastro de listas não contém: ${token}`);
}

// O domínio histórico de assinaturas continua íntegro para dados existentes e
// migrações antigas, mas não é mais carregado como autoridade comercial do painel.
for (const token of ['panel_subscriptions', 'panel_subscription_devices', 'panel_subscription_playlists', 'panel_lab_sessions', 'panel_subscription_playlists_exclusive_uidx']) {
  if (!migration.includes(token)) throw new Error(`Migração histórica de assinatura perdeu: ${token}`);
}
for (const token of ['panel_playlist_revisions', 'replace_subscription_playlist_transaction', 'subscription.playlist_replaced']) {
  if (!editMigration.includes(token)) throw new Error(`Histórico de revisão de assinatura perdeu: ${token}`);
}
for (const token of ['panel_device_playlist_operations', 'panel_device_playlist_revisions', 'replace_device_playlist_transaction', 'device.playlist_replaced']) {
  if (!deviceEditMigration.includes(token)) throw new Error(`Histórico de revisão de aparelho perdeu: ${token}`);
}
for (const token of ["['owner', 'admin', 'seller']", 'create_customer_subscription_transaction']) {
  if (!subscriptionApi.includes(token)) throw new Error(`API histórica de assinatura perdeu compatibilidade de leitura/laboratório: ${token}`);
}
if (!legacyEditApi.includes('subscription-playlist-edit')) {
  // O nome pode aparecer apenas em comentário/import no futuro; o arquivo precisa
  // continuar reconhecível até a remoção definitiva em um lote de limpeza.
  if (!legacyEditApi.includes("action === 'replace'")) throw new Error('API histórica de edição de assinatura ficou irreconhecível para migração controlada.');
}

for (const token of ['loadUnifiedPlaylistEntry', 'loadPlaylistFlowController', 'loadAdminDeviceFlow']) {
  if (!loader.includes(token)) throw new Error(`Deploy canônico não contém: ${token}`);
}
for (const forbidden of ['playlist-edit-module.js', 'subscription-module.js', 'inline-playlist-activation.js', 'playlist-save-feedback-hotfix.js']) {
  if (loader.includes(forbidden)) throw new Error(`Deploy ainda carrega caminho comercial histórico: ${forbidden}`);
}

if (/\bFunction\s*\(|\beval\s*\(/.test(`${unified}\n${controller}\n${wizard}\n${adminFlow}`)) {
  throw new Error('Módulos publicados não podem executar código dinâmico.');
}
if (/console\.(?:log|debug)\s*\([^)]*(?:password|senha|username|usuario)/i.test(`${unified}\n${controller}`)) {
  throw new Error('Cadastro de listas não pode registrar credenciais no console.');
}

console.log('✅ Assinaturas históricas preservadas; runtime comercial publicado pertence ao seller-device-flow.');
