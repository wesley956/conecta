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
  "'playlist.removed_by_seller'",
  "'playlist'",
  'register_playlist_source_transaction',
  "['ready_cache', 'ready_direct']",
  'panel_devices_playlist_id_fkey',
  'panel_device_playlists_playlist_id_fkey',
  'panel_seller_playlists_playlist_id_fkey',
  'isPlaylistValidationDevice',
  'Este aparelho está reservado para homologação de listas.',
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

if (/usable:\s*playlist\.playlist_cache_status\s*===\s*'ready'\s*\|\|\s*accessMode\s*===\s*'direct'/.test(backend)) {
  throw new Error('Acesso direto técnico não pode substituir homologação comercial.');
}
if (backend.includes('playlist:panel_playlists (')) {
  throw new Error('Relações do PostgREST precisam declarar a chave estrangeira explicitamente.');
}

console.log('✅ Portal do vendedor, relações explícitas e qualificação comercial validados.');
