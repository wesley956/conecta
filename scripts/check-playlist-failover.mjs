import fs from 'node:fs';

const files = {
  migration: 'supabase/migrations/20260720050541_device_playlist_failover.sql',
  adminBackend: 'supabase/functions/admin-panel/index.ts',
  canonicalBackend: 'supabase/functions/seller-device-flow/index.ts',
  deviceBackend: 'supabase/functions/device-config/index.ts',
  seriesDetail: 'supabase/functions/series-detail/index.ts',
  nativeDeviceApi: 'native-android/app/src/main/java/com/ronecaplaytv/nativeapp/network/DeviceApi.kt',
  nativeSeriesViewModel: 'native-android/app/src/main/java/com/ronecaplaytv/nativeapp/series/SeriesEpisodesViewModel.kt',
  nativeCatalogViewModel: 'native-android/app/src/main/java/com/ronecaplaytv/nativeapp/catalog/CatalogViewModel.kt',
  nativePlayer: 'native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/player/NativePlayerScreen.kt',
  nativeSeriesPlayer: 'native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/player/SeriesNativePlayerScreen.kt',
  nativeActivation: 'native-android/app/src/main/java/com/ronecaplaytv/nativeapp/activation/ActivationViewModel.kt',
  smartSession: 'smart-tv/src/deviceSession.ts',
  smartCatalog: 'smart-tv/src/catalog.ts',
  smartPlayer: 'smart-tv/src/player/PlayerScreen.tsx',
  adminUi: 'admin-panel/admin-device-flow.js',
  sellerUi: 'admin-panel/seller-activation-wizard.js',
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
  adminBackend: [
    'backupPlaylistId',
    'panel_device_playlists',
    "action === 'refreshPlaylistCache'",
  ],
  canonicalBackend: [
    "const action = requiredText(input.action",
    "['activate', 'renew', 'changePlaylists']",
    'backupPlaylistId',
    "rpc('seller_device_flow_transaction_v4'",
    'p_backup_playlist_id',
  ],
  deviceBackend: ['playlistHealth', 'cooldown_until', 'selectedPlaylistId', 'playlists: playlistConfigs'],
  seriesDetail: ['device_playlists:panel_device_playlists', 'requestedPlaylistId', 'attemptedPlaylistIds', 'sourcePlaylistId'],
  nativeDeviceApi: ['selectedPlaylistId: String?', 'json.optNullableString("selectedPlaylistId")', 'playlistId: String?', 'put("playlistId", it)'],
  nativeSeriesViewModel: ['current.playlistId == playlistId', 'playlistId = playlistId'],
  nativeCatalogViewModel: [
    'failoverActivePlaylist',
    'loadCompleteCatalog',
    'Catálogo substituído pela lista reserva',
    'channels.isEmpty() && movies.isEmpty() && series.isEmpty()',
    'lastFailoverAtMillis = System.currentTimeMillis()',
    'if (it.id == selectedPlaylistId) 0 else 1',
  ],
  nativePlayer: [
    'onTerminalPlaybackFailure',
    'STARTUP_TIMEOUT_MS',
    'LIVE_STALL_TIMEOUT_MS',
    'VOD_STALL_TIMEOUT_MS',
  ],
  nativeSeriesPlayer: [
    'onTerminalPlaybackFailure',
    'SERIES_STARTUP_TIMEOUT_MS',
    'SERIES_STALL_TIMEOUT_MS',
  ],
  nativeActivation: ['reportPlaylistFailure', 'repository.reportPlaylistFailure'],
  smartSession: ['playlists: DevicePlaylist[]', 'validPlaylists', 'reportPlaylistFailure'],
  smartCatalog: [
    'Lista principal indisponível. Catálogo substituído pela lista reserva.',
    'useCallback(async (request: CatalogFailoverRequest)',
    '!data.channels.length && !data.movies.length && !data.series.length',
    'left.id === session.selectedPlaylistId',
  ],
  smartPlayer: ['onTerminalPlaybackFailure', '20_000', '12_000', '25_000'],
  adminUi: ["const FLOW_FUNCTION = 'seller-device-flow'", 'backupPlaylistId', 'openPlaylistChange'],
  sellerUi: ["const FLOW_FUNCTION = 'seller-device-flow'", 'backupPlaylistId', 'useBackup'],
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

console.log('✅ Lista principal/reserva, failover e fluxo comercial canônico v4 validados.');
