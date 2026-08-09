import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  parseProviderMessage,
  parseStructuredSource,
  resolveSafePrimaryIndex,
  safeEndpointPreview,
} from '../supabase/functions/_shared/universalPlaylistSource.ts';

const message = `⚡ BEM VINDO A NETPLAY ⚡

✅ Usuário: 10000000001
✅ Senha: 90000000009
📦 Plano: TESTE C/ ADULTO 12 HORAS
💵 Preço do Plano: R$ 0,00
🗓️ Criado em: 04/08/2026 20:09:47
🗓️ Vencimento: 05/08/2026 08:09:47
📶 Conexões: 2

💳 Assinar/Renovar Plano: https://netplay.mplll.com/#/checkout/EXAMPLE
ID GPC Pro Windows
Link para Download: https://www.mediafire.com/file/example/player.exe/file
Código Downloader: 9468503
Link para Download: https://dl.ntdev.in/64767
NETPLAY 2.0 APP PRÓPRIO
Link Curto: http://aftv.news/8454237
Link Direto: https://dl.explouddev.com/netplay

🌎 Links DNS
URL XC: http://xtream-fixture.example.invalid
URL: http://secondary-fixture.example.invalid
Link (M3U): http://playlist-fixture.example.invalid/get.php?username=10000000001&password=90000000009&type=m3u_plus&output=mpegts
Link Curto (M3U): http://short-fixture.example.invalid/p/10000000001/90000000009/m3u
Link (HLS): http://playlist-fixture.example.invalid/get.php?username=10000000001&password=90000000009&type=m3u_plus&output=hls
Link Curto (HLS): http://short-fixture.example.invalid/p/10000000001/90000000009/hls
Link (SSIPTV): http://short-fixture.example.invalid/p/10000000001/90000000009/ssiptv`;

const parsed = await parseProviderMessage(message, 'test-secret');
assert.equal(parsed.provider.name, 'NETPLAY');
assert.equal(parsed.provider.planName, 'TESTE C/ ADULTO 12 HORAS');
assert.equal(parsed.provider.maxConnections, 2);
assert.equal(parsed.provider.passwordConfigured, true);
assert.ok(parsed.provider.expiresAt);
assert.ok(parsed.warnings.some(item => item.includes('vencida')));
assert.equal(parsed.endpoints.length, 7);
assert.equal(parsed.endpoints.filter(item => item.type === 'xtream').length, 2);
assert.equal(parsed.endpoints.filter(item => item.type === 'm3u').length, 2);
assert.equal(parsed.endpoints.filter(item => item.type === 'hls').length, 2);
assert.equal(parsed.endpoints.filter(item => item.type === 'ssiptv').length, 1);
assert.equal(parsed.endpoints.filter(item => item.primary).length, 1);
assert.ok(parsed.externalLinks.length >= 4);
assert.ok(parsed.endpoints.every(item => !item.preview.includes('90000000009')));
assert.ok(!JSON.stringify(parsed.redactedSummary).includes('90000000009'));
assert.ok(!safeEndpointPreview(parsed.endpoints[0].url).includes('90000000009'));
assert.ok(parsed.endpoints.some(item => item.host === 'secondary-fixture.example.invalid'));

const protectedPrimary = resolveSafePrimaryIndex([
  { type: 'xtream', path: '/player_api.php', active: true },
  { type: 'direct', path: '/', active: true },
], 1, 0);
assert.equal(protectedPrimary, 0, 'Domínio raiz genérico não substitui Xtream completo');
const standaloneDirect = resolveSafePrimaryIndex([
  { type: 'direct', path: '/', active: true },
], 0, 0);
assert.equal(standaloneDirect, 0, 'Origem direta isolada continua permitida');

const special = await parseStructuredSource({
  sourceKind: 'direct',
  endpoints: [
    { type: 'rtmp', label: 'RTMP principal', url: 'rtmp://stream.example.com:1935/live/channel', primary: true },
    { type: 'rtsp', label: 'RTSP reserva', url: 'rtsp://stream.example.com:554/channel' },
  ],
}, 'test-secret');
assert.equal(special.endpoints[0].protocol, 'rtmp');
assert.equal(special.endpoints[1].protocol, 'rtsp');
assert.equal(special.endpoints.filter(item => item.primary).length, 1);

console.log('Cadastro universal: parser da mensagem Netplay e origens especiais aprovados.');


const managerSource = await readFile(new URL('../supabase/functions/playlist-source-manager/index.ts', import.meta.url), 'utf8');
const migrationSource = await readFile(new URL('../supabase/migrations/20260805210500_universal_playlist_sources.sql', import.meta.url), 'utf8');
const guardMigrationSource = await readFile(new URL('../supabase/migrations/20260806012800_universal_playlist_shared_source_guard.sql', import.meta.url), 'utf8');
const panelSource = await readFile(new URL('../admin-panel/universal-playlist-registration.js', import.meta.url), 'utf8');
const authSource = await readFile(new URL('../admin-panel/panel-auth-session.js', import.meta.url), 'utf8');

assert.match(managerSource, /resolveSafePrimaryIndex/);
assert.match(managerSource, /principal\.role === 'seller' && security\.mode !== 'strict'/);
assert.match(managerSource, /A edição da origem e da segurança é restrita ao administrador/);
assert.match(managerSource, /Os detalhes sensíveis da origem são restritos ao administrador/);
assert.match(managerSource, /if \(!created && !editing\)/);
assert.match(managerSource, /sem alterar configuração, segurança ou endpoints/);
assert.match(migrationSource, /v_role = 'seller' and p_existing_playlist_id is not null/);
assert.match(migrationSource, /v_role = 'seller' and v_tls_mode <> 'strict'/);
assert.match(migrationSource, /p_existing_playlist_id is null and v_created is false/);
assert.match(guardMigrationSource, /v_role = 'seller' and p_existing_playlist_id is not null/);
assert.match(guardMigrationSource, /v_role = 'seller' and v_tls_mode <> 'strict'/);
assert.match(guardMigrationSource, /p_existing_playlist_id is null and v_created is false/);
assert.match(guardMigrationSource, /universal_playlist_reused/);
assert.match(panelSource, /data-upl-admin-security/);
assert.match(panelSource, /state\.surface === 'seller' \? 'strict'/);
assert.match(panelSource, /state\.surface === 'admin' \? `<button class="upl-btn"/);
assert.match(authSource, /'playlist-source-manager': true/);
for (const functionName of ['subscription-panel', 'playlist-source-manager', 'app-release']) {
  assert.match(authSource, new RegExp(`'${functionName}': true`));
}

console.log('Cadastro universal: isolamento de fontes compartilhadas, autenticação e TLS administrativo aprovados.');


const qualifiedConfigSource = await readFile(new URL('../supabase/functions/device-config-qualified/index.ts', import.meta.url), 'utf8');
const deviceApiSource = await readFile(new URL('../native-android/app/src/main/java/com/ronecaplaytv/nativeapp/network/DeviceApi.kt', import.meta.url), 'utf8');
const sessionStateSource = await readFile(new URL('../native-android/app/src/main/java/com/ronecaplaytv/nativeapp/activation/DeviceSessionState.kt', import.meta.url), 'utf8');
const catalogSource = await readFile(new URL('../native-android/app/src/main/java/com/ronecaplaytv/nativeapp/catalog/CatalogViewModel.kt', import.meta.url), 'utf8');
assert.match(qualifiedConfigSource, /sourceEndpoints: sources/);
assert.match(qualifiedConfigSource, /panel_playlist_endpoints/);
assert.match(deviceApiSource, /DeviceSourceEndpoint/);
assert.match(sessionStateSource, /sourceEndpoints: List<DeviceSourceEndpoint>/);
assert.match(catalogSource, /loadSingleEndpointCatalog/);
assert.match(catalogSource, /endpointCandidates/);
console.log('Homologação universal: matriz de endpoints enviada e testada dentro da mesma lista.');
