import fs from 'node:fs';

const requiredFiles = [
  'admin-panel/playlist-edit-module.js',
  'admin-panel/playlist-edit-module.css',
  'supabase/functions/subscription-panel/index.ts',
  'supabase/functions/subscription-playlist-edit/index.ts',
  'supabase/functions/_shared/labSession.ts',
  'supabase/migrations/2026072201_customer_subscriptions_lab.sql',
  'supabase/migrations/2026072202_owner_role_compat.sql',
  'supabase/migrations/2026072205_subscription_playlist_edit.sql',
  'supabase/migrations/2026072206_legacy_device_playlist_edit.sql',
  'supabase/tests/customer_subscriptions_lab_test.sql',
  'supabase/tests/subscription_playlist_edit_test.sql',
  'supabase/tests/legacy_device_playlist_edit_test.sql',
];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) throw new Error(`Arquivo obrigatório ausente: ${file}`);
}

const playlistEditUi = fs.readFileSync('admin-panel/playlist-edit-module.js', 'utf8');
const api = fs.readFileSync('supabase/functions/subscription-panel/index.ts', 'utf8');
const playlistEditApi = fs.readFileSync('supabase/functions/subscription-playlist-edit/index.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/2026072201_customer_subscriptions_lab.sql', 'utf8');
const playlistEditMigration = fs.readFileSync('supabase/migrations/2026072205_subscription_playlist_edit.sql', 'utf8');
const legacyEditMigration = fs.readFileSync('supabase/migrations/2026072206_legacy_device_playlist_edit.sql', 'utf8');
const deviceConfig = fs.readFileSync('supabase/functions/device-config/index.ts', 'utf8');
const configGenerator = fs.readFileSync('scripts/generate-panel-config.mjs', 'utf8');
const supabaseConfig = fs.readFileSync('supabase/config.toml', 'utf8');

const playlistEditUiRequirements = [
  'Editar / trocar',
  'Adicionar lista reserva',
  'Editar lista principal',
  'Editar / adicionar reserva',
  '.admin-device-card, .seller-device-card',
  'a lista atual permanece funcionando',
  'Validar e aplicar',
  'Nova URL completa',
  'Motivo da alteração',
];
for (const token of playlistEditUiRequirements) {
  if (!playlistEditUi.includes(token)) throw new Error(`Interface de edição de lista não contém: ${token}`);
}

if (/\bFunction\s*\(|\beval\s*\(/.test(playlistEditUi)) {
  throw new Error('Módulos do painel não podem executar código dinâmico.');
}

const apiRequirements = [
  "['owner', 'admin', 'seller']",
  "case 'createLabSession'",
  "case 'diagnoseCache'",
  'requireOwner(principal)',
  'create_customer_subscription_transaction',
  'add_subscription_device_transaction',
  'replace_subscription_device_transaction',
  'change_subscription_plan_transaction',
  'renew_customer_subscription_transaction',
];
for (const token of apiRequirements) {
  if (!api.includes(token)) throw new Error(`API de assinatura não contém: ${token}`);
}

const playlistEditApiRequirements = [
  "['owner', 'admin', 'seller']",
  "action === 'details'",
  "action === 'replace'",
  'replace_subscription_playlist_transaction',
  'replace_device_playlist_transaction',
  'resolveDeviceTarget',
  'resolveSubscriptionTarget',
  'triggerPlaylistCache',
  'inspectSource',
  'hmacSha256Hex',
  'A lista anterior continua funcionando',
];
for (const token of playlistEditApiRequirements) {
  if (!playlistEditApi.includes(token)) throw new Error(`API de edição de lista não contém: ${token}`);
}
if (playlistEditApi.includes('playlistUrl: playlistUrl') && playlistEditApi.includes('return {\n      ...result')) {
  throw new Error('API de edição não pode devolver a URL completa da lista.');
}

const migrationRequirements = [
  "role in ('owner', 'admin', 'seller')",
  'panel_subscriptions',
  'panel_subscription_devices',
  'panel_subscription_playlists',
  'panel_lab_sessions',
  'max_devices between 1 and 5',
  'duration_minutes between 1 and 43200',
  'panel_subscription_playlists_exclusive_uidx',
];
for (const token of migrationRequirements) {
  if (!migration.includes(token)) throw new Error(`Migração de assinatura não contém: ${token}`);
}

const playlistEditMigrationRequirements = [
  'panel_playlist_revisions',
  "'replace_playlist'",
  'replace_subscription_playlist_transaction',
  "playlist_cache_status <> 'ready'",
  'simultaneous_connections_snapshot',
  'subscription.playlist_replaced',
  'on conflict on constraint panel_device_playlists_device_id_priority_key',
];
for (const token of playlistEditMigrationRequirements) {
  if (!playlistEditMigration.includes(token)) throw new Error(`Migração de edição de lista não contém: ${token}`);
}

const legacyMigrationRequirements = [
  'panel_device_playlist_operations',
  'panel_device_playlist_revisions',
  'replace_device_playlist_transaction',
  "playlist_cache_status <> 'ready'",
  'device.playlist_replaced',
  'on conflict on constraint panel_device_playlists_device_id_priority_key',
];
for (const token of legacyMigrationRequirements) {
  if (!legacyEditMigration.includes(token)) throw new Error(`Compatibilidade dos aparelhos atuais não contém: ${token}`);
}

if (!deviceConfig.includes('resolveActiveLabSession')) {
  throw new Error('device-config não aplica sessão temporária de laboratório.');
}
if (!deviceConfig.includes('allowDirectPlaylistFallback() && !labContext')) {
  throw new Error('Laboratório precisa bloquear exposição direta da lista.');
}
if (configGenerator.includes('subscription-module.js')) {
  throw new Error('O protótipo visual de assinaturas não pode voltar ao painel publicado.');
}
if (!configGenerator.includes('commercial-consolidation-v2.js')) {
  throw new Error('O painel publicado precisa carregar a consolidação comercial V2 que remove a aba incompleta sem travar o DOM.');
}
if (!configGenerator.includes('playlist-edit-module.js')) {
  throw new Error('Deploy dos painéis não carrega a edição de listas.');
}
if (!supabaseConfig.includes('[functions.subscription-playlist-edit]') || !supabaseConfig.includes('verify_jwt = true')) {
  throw new Error('Função de edição de listas precisa exigir JWT.');
}

console.log('✅ Backend de assinaturas e edição publicada de listas validados sem aprovar interface visual inativa.');
