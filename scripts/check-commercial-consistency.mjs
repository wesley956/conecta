import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = {
  migration: 'supabase/migrations/20260801032340_commercial_consistency_transactions.sql',
  test: 'supabase/tests/commercial_consistency_transactions_test.sql',
  admin: 'supabase/functions/admin-panel/index.ts',
  seller: 'supabase/functions/seller-panel/index.ts',
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
  'from public, anon, authenticated',
  'to service_role',
]) {
  assert.ok(source.migration.includes(required), `Proteção transacional ausente na migration: ${required}`);
}

for (const required of [
  'Retry idêntico não duplica o débito',
  'Falha de reserva não cria débito',
  'A mesma chave não pode trocar a reserva',
  'Vendedor não remove lista usada',
  'Aparelho promove a reserva na mesma transação',
  'Exclusão sem reserva é bloqueada',
]) {
  assert.ok(source.test.includes(required), `Cobertura pgTAP ausente: ${required}`);
}

for (const [name, edge] of [['admin', source.admin], ['seller', source.seller]]) {
  assert.ok(
    edge.includes("rpc('apply_device_subscription_complete_transaction'"),
    `${name} não usa a ativação comercial completa.`,
  );
  assert.ok(
    !edge.includes("rpc('apply_device_subscription_transaction'"),
    `${name} ainda chama a cobrança sem reserva transacional.`,
  );
}

assert.ok(source.admin.includes("rpc('set_device_playlists_transaction'"));
assert.ok(source.admin.includes("rpc('delete_playlist_with_reassignment'"));
assert.ok(source.seller.includes("rpc('remove_seller_playlist_transaction'"));
assert.ok(!source.seller.includes('setSellerDeviceBackupPlaylist'));

console.log('Consistência comercial validada: cobrança, reserva e exclusões usam RPCs transacionais e idempotentes.');
