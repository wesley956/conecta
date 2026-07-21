import fs from 'node:fs';

const files = {
  ui: 'admin-panel/inline-playlist-activation.js',
  styles: 'admin-panel/inline-playlist-activation.css',
  loader: 'scripts/generate-panel-config.mjs',
  adminFunction: 'supabase/functions/admin-inline-playlist/index.ts',
  supabaseConfig: 'supabase/config.toml',
};

for (const path of Object.values(files)) {
  if (!fs.existsSync(path)) throw new Error(`Arquivo obrigatório ausente: ${path}`);
}

const source = Object.fromEntries(
  Object.entries(files).map(([name, path]) => [name, fs.readFileSync(path, 'utf8')]),
);

const required = {
  ui: [
    '__roneca_new_playlist__',
    'Cadastrar uma nova lista agora',
    'resolveAdminPlaylist',
    'resolveSellerPlaylist',
    "callPanelFunction('admin-inline-playlist'",
    "action: 'createSellerPlaylist'",
    "action: 'refreshSellerPlaylistCache'",
    "action: 'refreshPlaylistCache'",
    'confirmCreditConsumption',
    'withDeviceActionLock',
    'idempotencyKey',
  ],
  styles: [
    '.inline-playlist-fields[hidden]',
    '.inline-playlist-fields.open',
    '.inline-playlist-fields-admin',
    '.inline-playlist-fields-seller',
  ],
  loader: [
    'loadInlinePlaylistActivation',
    'inline-playlist-activation.js?v=1.0',
    '(dashboard|seller)',
  ],
  adminFunction: [
    "requirePanelPrincipal(request, supabase, ['admin'])",
    "from('panel_seller_playlists')",
    "onConflict: 'seller_id,playlist_id'",
    "action: 'playlist.created_during_device_activation'",
    'triggerPlaylistCache',
  ],
  supabaseConfig: [
    '[functions.admin-inline-playlist]',
    'verify_jwt = true',
  ],
};

for (const [name, snippets] of Object.entries(required)) {
  for (const snippet of snippets) {
    if (!source[name].includes(snippet)) {
      throw new Error(`Proteção de regressão ausente em ${files[name]}: ${snippet}`);
    }
  }
}

if (source.adminFunction.includes('metadata: { name, playlistUrl')) {
  throw new Error('A URL completa da lista não pode ser gravada na auditoria da ativação inline.');
}

console.log('✅ Cadastro de lista durante ativação validado para administrador e vendedor.');
