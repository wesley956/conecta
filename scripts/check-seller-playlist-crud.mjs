import fs from 'node:fs';

const frontendPath = 'admin-panel/seller-lists-ux.js';
const backendPath = 'supabase/functions/seller-panel/index.ts';

for (const file of [frontendPath, backendPath]) {
  if (!fs.existsSync(file)) throw new Error(`Arquivo obrigatório ausente: ${file}`);
}

const frontend = fs.readFileSync(frontendPath, 'utf8');
const backend = fs.readFileSync(backendPath, 'utf8');

const requiredFrontend = [
  'sellerListsDelete',
  "api('deleteSellerPlaylist', { playlistId })",
  'window.confirm(',
  'class="red"',
];

const requiredBackend = [
  "action === 'deleteSellerPlaylist'",
  "rpc('remove_seller_playlist_transaction'",
  'p_seller_id: seller.id',
  'p_playlist_id: playlistId',
  'devices_count',
  "action: 'playlist.removed_by_seller'",
  "entityType: 'playlist'",
];

for (const snippet of requiredFrontend) {
  if (!frontend.includes(snippet)) throw new Error(`CRUD de listas frontend incompleto: ${snippet}`);
}
for (const snippet of requiredBackend) {
  if (!backend.includes(snippet)) throw new Error(`CRUD de listas backend incompleto: ${snippet}`);
}

const deleteAction = backend.match(/if \(action === 'deleteSellerPlaylist'\) \{([\s\S]*?)\n    \}\n\n    if \(action === 'lookupDeviceCode'\)/)?.[1] || '';
if (!deleteAction) throw new Error('Ação deleteSellerPlaylist não encontrada.');
if (deleteAction.includes(".from('panel_playlists')\n        .delete()")) {
  throw new Error('O vendedor não pode excluir globalmente uma lista compartilhada.');
}
if (!deleteAction.includes('if (!result?.removed)') || !deleteAction.includes('}, 409);')) {
  throw new Error('Lista em uso precisa ser bloqueada com HTTP 409.');
}

console.log('✅ Exclusão segura de listas pelo vendedor validada.');
