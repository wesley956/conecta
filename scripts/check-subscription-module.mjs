import fs from 'node:fs';

const requiredFiles = [
  'admin-panel/subscription-module.js',
  'admin-panel/subscription-module.css',
  'supabase/functions/subscription-panel/index.ts',
  'supabase/functions/_shared/labSession.ts',
  'supabase/migrations/2026072201_customer_subscriptions_lab.sql',
  'supabase/migrations/2026072202_owner_role_compat.sql',
  'supabase/tests/customer_subscriptions_lab_test.sql',
];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) throw new Error(`Arquivo obrigatório ausente: ${file}`);
}

const ui = fs.readFileSync('admin-panel/subscription-module.js', 'utf8');
const api = fs.readFileSync('supabase/functions/subscription-panel/index.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/2026072201_customer_subscriptions_lab.sql', 'utf8');
const deviceConfig = fs.readFileSync('supabase/functions/device-config/index.ts', 'utf8');
const configGenerator = fs.readFileSync('scripts/generate-panel-config.mjs', 'utf8');

const uiRequirements = [
  'Nova assinatura',
  'Adicionar aparelho',
  'Substituir aparelho',
  'Alterar plano',
  'Renovar assinatura',
  'Modo Laboratório do proprietário',
  'durationMinutes',
  'Diagnóstico de cache',
];
for (const token of uiRequirements) {
  if (!ui.includes(token)) throw new Error(`Interface de assinatura não contém: ${token}`);
}
if (/\bFunction\s*\(|\beval\s*\(/.test(ui)) {
  throw new Error('Módulo de assinatura não pode executar código dinâmico.');
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

if (!deviceConfig.includes('resolveActiveLabSession')) {
  throw new Error('device-config não aplica sessão temporária de laboratório.');
}
if (!deviceConfig.includes('allowDirectPlaylistFallback() && !labContext')) {
  throw new Error('Laboratório precisa bloquear exposição direta da lista.');
}
if (!configGenerator.includes('subscription-module.js')) {
  throw new Error('Deploy dos painéis não carrega o módulo de assinatura.');
}

console.log('✅ Assinaturas, planos de até cinco aparelhos e laboratório validados.');
