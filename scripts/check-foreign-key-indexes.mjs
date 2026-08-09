import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../supabase/migrations/20260809063815_add_missing_foreign_key_indexes.sql', import.meta.url),
  'utf8',
);

const expected = [
  ['panel_credit_orders', 'package_id'],
  ['panel_device_playlist_revisions', 'new_playlist_id'],
  ['panel_device_playlist_revisions', 'previous_playlist_id'],
  ['panel_device_playlist_revisions', 'seller_id'],
  ['panel_financial_records', 'device_id'],
  ['panel_financial_records', 'plan_id'],
  ['panel_playback_diagnostics', 'resolved_by'],
  ['panel_playlist_server_profiles', 'last_playlist_id'],
  ['panel_playlists', 'playlist_cache_active_attempt_id'],
  ['panel_playlists', 'primary_endpoint_id'],
  ['panel_review_accounts', 'customer_id'],
  ['panel_review_accounts', 'plan_id'],
  ['panel_review_accounts', 'playlist_id'],
  ['panel_review_accounts', 'seller_id'],
  ['panel_seller_plan_prices', 'plan_id'],
  ['playlist_cache_generation_lock', 'playlist_id'],
  ['playlist_provider_attempts', 'assignment_id'],
];

for (const [table, column] of expected) {
  assert.match(
    source,
    new RegExp(`on public\\.${table} \\(${column}\\)`),
    `Índice ausente para ${table}.${column}`,
  );
}
assert.equal((source.match(/create index if not exists/g) || []).length, expected.length);
assert.doesNotMatch(source, /drop\s+(?:index|table|column)|delete\s+from|truncate/i);

console.log('✅ Migration aditiva contém os 17 índices de FKs e nenhuma operação destrutiva.');
