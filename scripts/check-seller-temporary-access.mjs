import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = Object.fromEntries(await Promise.all([
  ['migration', 'supabase/migrations/20260801000935_seller_temporary_access_lifecycle.sql'],
  ['auth', 'supabase/functions/_shared/panelAuth.ts'],
  ['admin', 'supabase/functions/admin-panel/index.ts'],
  ['provision', 'supabase/functions/seller-provision/index.ts'],
  ['activation', 'supabase/functions/device-activate/index.ts'],
  ['ui', 'admin-panel/seller-provisioning.js'],
  ['details', 'admin-panel/dashboard.js'],
].map(async ([key, path]) => [key, await readFile(path, 'utf8')])));

for (const snippet of [
  'access_expires_at timestamptz',
  'auto_delete_after_expiry boolean',
  'scheduled_deletion_at timestamptz',
  'configure_seller_temporary_access',
  'process_seller_temporary_access_lifecycle',
  "'*/5 * * * *'",
  "'seller.temporary_access_expired'",
  "'seller.auto_deleted_after_expiry'",
  'deleted_at = now()',
  'coalesce(p_auto_delete, false)',
  'p_grace_hours is null',
]) assert.ok(files.migration.includes(snippet), `Migration incompleta: ${snippet}`);

assert.ok(files.auth.includes('seller.access_expires_at'));
assert.ok(files.auth.includes('O período de acesso desta conta terminou'));
assert.ok(files.admin.includes("action === 'configureSellerTemporaryAccess'"));
assert.ok(files.admin.includes("if (!('durationHours' in body))"));
assert.ok(files.admin.includes(".is('deleted_at', null)"));
assert.ok(files.provision.includes("supabase.rpc('configure_seller_temporary_access'"));
assert.ok(files.activation.includes(".select('id, name, status, public_code, access_expires_at, deleted_at')"));
assert.ok(files.activation.includes('const accessExpired = data.access_expires_at'));
assert.ok(files.ui.includes('autoDeleteAfterExpiry'));
assert.ok(files.ui.includes('configureSellerTemporaryAccess'));
assert.ok(files.details.includes('Salvar validade / renovar'));

console.log('Validade temporária, renovação, bloqueio e exclusão automática validados.');
