import fs from 'node:fs';

const required = new Map([
  ['supabase/functions/playlist-cache/index.ts', [
    'classifyPlaylistCacheFailure',
    "rpc('fail_playlist_cache_generation'",
    'p_access_mode: failure.accessMode',
    'p_cache_attempts: attempts',
  ]],
  ['supabase/migrations/20260801024610_playlist_cache_leases_and_manifests.sql', [
    'playlist_access_mode',
    'playlist_cache_attempts',
  ]],
  ['supabase/functions/seller-panel/index.ts', [
    'isPlaylistUsable',
    'playlistAccessMode',
  ]],
  ['supabase/functions/device-config/index.ts', [
    'playlist_access_mode',
    'accessMode',
  ]],
  ['supabase/functions/device-config-direct/index.ts', [
    "item?.accessMode !== 'direct'",
  ]],
  ['admin-panel/seller-lists-ux.js', [
    'Acesso direto',
  ]],
  ['admin-panel/dashboard.html', [
    'Acesso direto',
  ]],
]);

for (const [file, markers] of required) {
  const source = fs.readFileSync(file, 'utf8');
  for (const marker of markers) {
    if (!source.includes(marker)) {
      throw new Error(`${file} não contém a proteção obrigatória: ${marker}`);
    }
  }
}

console.log('Modo híbrido de listas validado.');
