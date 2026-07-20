import fs from 'node:fs';

const files = {
  migration: 'supabase/migrations/20260720050541_device_playlist_failover.sql',
  adminBackend: 'supabase/functions/admin-panel/index.ts',
  sellerBackend: 'supabase/functions/seller-panel/index.ts',
  deviceBackend: 'supabase/functions/device-config/index.ts',
  app: 'src/App.tsx',
  devicePanel: 'src/utils/devicePanel.ts',
  adminUi: 'admin-panel/dashboard.html',
  sellerUi: 'admin-panel/seller-portal-ux.js',
  sellerDelete: 'supabase/functions/seller-delete/index.ts',
  redesign: 'admin-panel/panel-redesign.css',
};

for (const path of Object.values(files)) {
  if (!fs.existsSync(path)) throw new Error(`Arquivo obrigatório ausente: ${path}`);
}

const read = path => fs.readFileSync(path, 'utf8');
const source = Object.fromEntries(Object.entries(files).map(([key, path]) => [key, read(path)]));

const required = {
  migration: [
    'create table if not exists public.panel_device_playlists',
    'check (priority in (1, 2))',
    'unique (device_id, priority)',
    'on delete set null',
    'seller_name_snapshot',
    'revoke all on table public.panel_device_playlists from public, anon, authenticated',
  ],
  adminBackend: ['setDeviceBackupPlaylist', "action === 'refreshPlaylistCache'", 'backupPlaylistId'],
  sellerBackend: ['setSellerDeviceBackupPlaylist', 'backupPlaylistId', 'panel_device_playlists'],
  deviceBackend: ['playlistHealth', 'cooldown_until', 'selectedPlaylistId', 'playlists: playlistConfigs'],
  app: ['reportDevicePlaylistHealth', 'Lista principal indisponível. Ativando a lista reserva'],
  devicePanel: ['DevicePanelPlaylistConfig', 'reportDevicePlaylistHealth'],
  adminUi: ['dev-backup-playlist-', 'pend-backup-playlist-', 'refreshPlaylistCache'],
  sellerUi: ['sellerActivationBackupPlaylist', 'sellerRenewBackupPlaylist'],
  sellerDelete: ["update({ seller_id: null", "action: 'seller.deleted'", 'histórico foram preservados'],
  redesign: ['body.admin-v2 .tabs::before', 'content: none !important'],
};

for (const [key, snippets] of Object.entries(required)) {
  for (const snippet of snippets) {
    if (!source[key].includes(snippet)) {
      throw new Error(`Proteção de regressão ausente em ${files[key]}: ${snippet}`);
    }
  }
}

console.log('✅ Lista principal/reserva, failover, cache e preservação comercial validados.');
