import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const migration = read('supabase/migrations/20260802190000_playlist_progressive_diagnostics.sql');
const shared = read('supabase/functions/_shared/progressivePlaylistDiagnostic.ts');
const endpoint = read('supabase/functions/playlist-diagnostics/index.ts');
const direct = read('supabase/functions/device-config-direct/index.ts');
const androidApi = read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/network/DeviceApi.kt');
const androidDirect = read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/network/DeviceConfigDirectApi.kt');
const androidRunner = read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/network/PlaylistDiagnosticRunner.kt');
const androidRepository = read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/activation/DeviceSessionRepository.kt');
const panel = read('admin-panel/playlist-diagnostics-module.js');
const loader = read('admin-panel/app-release.js');
const config = read('supabase/config.toml');

assert.match(migration, /create table if not exists public\.panel_playlist_diagnostics/i);
assert.match(migration, /create table if not exists public\.panel_playlist_diagnostic_tasks/i);
assert.match(migration, /'waiting_device'/);
assert.match(migration, /interval '10 minutes'/i);
assert.match(migration, /enable row level security/i);
assert.match(migration, /revoke all on table public\.panel_playlist_diagnostic_tasks from anon, authenticated/i);
assert.match(migration, /grant all on table public\.panel_playlist_diagnostic_tasks to service_role/i);

assert.match(shared, /runProgressivePlaylistDiagnostic/);
assert.match(shared, /method: 'HEAD', timeoutMs: 2_000/);
assert.match(shared, /method: 'GET', timeoutMs: 5_000/);
assert.match(shared, /step\(11, 'playback'/);
assert.match(shared, /combineServerAndDeviceDiagnostics/);
assert.match(shared, /value\.slice\(0, 3\)/);
assert.match(shared, /extraParams\.forEach/);
assert.doesNotMatch(shared, /Promise\.all\(/);

assert.match(endpoint, /requirePanelPrincipal\(request, supabase, \['owner', 'admin', 'seller'\]\)/);
assert.match(endpoint, /findOfficialAndroid/);
assert.match(endpoint, /status: 'waiting_device'/);
assert.match(endpoint, /requested_checks: \['head', 'auth', 'playback'\]/);
assert.match(endpoint, /Nenhum Android oficial ativo/);
assert.doesNotMatch(endpoint, /playlistUrl\s*:/);
assert.doesNotMatch(endpoint, /sourceUrl\s*:/);

assert.match(direct, /playlistDiagnosticResult/);
assert.match(direct, /\.eq\('device_id', deviceId\)/);
assert.match(direct, /normalizeDeviceDiagnosticChecks/);
assert.match(direct, /playlistDiagnosticTask/);
assert.match(direct, /sourceUrl: source\.url/);
assert.match(direct, /\.slice\(0, 3\)/);

assert.match(androidApi, /data class PlaylistDiagnosticTask/);
assert.match(androidApi, /data class PlaylistDiagnosticSubmission/);
assert.match(androidApi, /playlistDiagnosticTask = PlaylistDiagnosticTask\.from/);
assert.match(androidDirect, /playlistDiagnosticSubmission/);
assert.match(androidDirect, /submission\.checks\.take\(3\)/);
assert.match(androidRunner, /class PlaylistDiagnosticRunner/);
assert.match(androidRunner, /instanceFollowRedirects = false/);
assert.match(androidRunner, /sameOrigin/);
assert.match(androidRunner, /checks\.take\(3\)/);
assert.doesNotMatch(androidRunner, /Log\./);
assert.match(androidRepository, /scheduleDiagnostic/);
assert.match(androidRepository, /SupervisorJob\(\) \+ Dispatchers\.IO/);
assert.match(androidRepository, /Diagnóstico é auxiliar/);

assert.match(panel, /textContent = 'Diagnosticar'/);
assert.match(panel, /getFunctionUrl\?\.\('playlist-diagnostics'\)/);
assert.match(panel, /Executando etapas 5 a 11/);
assert.match(panel, /Aguardando Android oficial/);
assert.match(panel, /Servidor × aparelho/);
assert.doesNotMatch(panel, /playlistUrl/);
assert.doesNotMatch(panel, /sourceUrl/);
assert.match(loader, /playlist-diagnostics-module\.js/);
assert.match(config, /\[functions\.playlist-diagnostics\]\s+verify_jwt = true/m);

console.log('Diagnóstico progressivo de playlists: contratos estruturais aprovados.');
