import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const exists = file => fs.existsSync(path.join(root, file));
const failures = [];
const requireFile = file => { if (!exists(file)) failures.push(`arquivo ausente: ${file}`); };
const expect = (condition, message) => { if (!condition) failures.push(message); };

const required = [
  'supabase/migrations/20260817060000_web_player_sync_security_observability.sql',
  'supabase/functions/_shared/contentIdentity.ts',
  'supabase/functions/_shared/webPlayerRecovery.ts',
  'supabase/functions/_shared/librarySync.ts',
  'supabase/functions/_shared/webRateLimit.ts',
  'supabase/functions/web-player-library/index.ts',
  'supabase/functions/device-library/index.ts',
  'supabase/functions/web-player-diagnostics/index.ts',
  'supabase/functions/web-access-panel/index.ts',
  'web-player/SECURITY.md',
  'web-player/RELEASE_GATE.md',
  'smart-tv/src/librarySync.ts',
  'native-android/app/src/main/java/com/ronecaplaytv/nativeapp/network/LibrarySyncApi.kt',
  'admin-panel/web-access-management.js',
  'admin-panel/web-access-management.css',
  'scripts/stage-web-player.mjs',
];
required.forEach(requireFile);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

const recovery = read('supabase/functions/_shared/webPlayerRecovery.ts');
for (const delay of ['2_000', '4_000', '8_000']) expect(recovery.includes(delay), `recovery sem backoff ${delay}`);
expect(recovery.includes("classification === 'offline'"), 'recovery precisa tratar offline sem loop');
expect(!/setInterval\([^,]+,\s*1_?000/.test(read('web-player/src/player/WebPlayer.tsx')), 'player não pode ter retry/watchdog a cada 1 segundo');
const player = read('web-player/src/player/WebPlayer.tsx');
for (const marker of ['WATCHDOG_STALL_TICKS', 'recoveryBusyRef', 'WEB_PLAYBACK_TOKEN_EXPIRED', 'roneca:web-session-invalid', 'STABLE_WINDOW_MS']) {
  expect(player.includes(marker), `player sem requisito de recovery: ${marker}`);
}

const broker = read('supabase/functions/web-player-playback/index.ts');
for (const marker of ['recoveryToken', 'resolveLogicalContent', 'afterPriority', "enforceWebRateLimit(supabase, 'playback'", 'WEB_RECOVERY_EXHAUSTED']) {
  expect(broker.includes(marker), `broker sem requisito: ${marker}`);
}
expect(!/searchParams\.get\(['"]url['"]\)/.test(broker), 'broker não pode aceitar URL arbitrária');

const migration = read('supabase/migrations/20260817060000_web_player_sync_security_observability.sql').toLowerCase();
for (const table of [
  'web_player_library_favorites', 'web_player_library_progress', 'web_player_library_preferences',
  'web_player_diagnostics', 'web_player_rate_events', 'web_player_admin_audit'
]) expect(migration.includes(`public.${table}`), `migration sem ${table}`);
for (const forbidden of ['playlist_url text', 'device_credential', 'refresh_token', 'access_token', 'web_pin_hash text']) {
  const librarySection = migration.slice(migration.indexOf('create table if not exists public.web_player_library_favorites'), migration.indexOf('create table if not exists public.web_player_diagnostics'));
  expect(!librarySection.includes(forbidden), `biblioteca canônica contém campo proibido: ${forbidden}`);
}
expect(migration.includes("when customer_id is not null then 'customer:'"), 'scope canônico deve priorizar customer_id');
expect(migration.includes('greatest(public.web_player_library_progress.position_ms'), 'progresso precisa ser monotônico');
expect(migration.includes('<= 45000'), 'threshold de conclusão deve permanecer 45 s');

const identity = read('supabase/functions/_shared/contentIdentity.ts');
for (const prefix of ['channel:', 'movie:', 'series:', 'episode:']) expect(identity.includes(prefix), `contentKey sem ${prefix}`);
const smartIdentity = read('smart-tv/src/contentIdentity.ts');
for (const prefix of ['channel:', 'movie:', 'series:', 'episode:']) expect(smartIdentity.includes(prefix), `Smart TV contentKey sem ${prefix}`);
const androidAdapter = read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/network/LibrarySyncApi.kt');
expect(androidAdapter.includes('/device-library'), 'Android adapter precisa usar device-library');
expect(!androidAdapter.includes('web_session'), 'Android não pode reutilizar web_session');

const rates = read('supabase/functions/_shared/webRateLimit.ts');
for (const policy of ['refresh:', 'catalog:', 'playback:', 'diagnostic:', 'panel:']) expect(rates.includes(policy), `rate policy ausente: ${policy}`);
expect(read('supabase/functions/web-player-auth/index.ts').includes("enforceWebRateLimit(supabase, 'refresh'"), 'refresh sem rate limit');
expect(read('supabase/functions/web-player-catalog/index.ts').includes("enforceWebRateLimit(supabase, 'catalog'"), 'catálogo sem rate limit');
expect(read('supabase/functions/web-player-diagnostics/index.ts').includes("enforceWebRateLimit(supabase, 'diagnostic'"), 'diagnóstico sem rate limit');
expect(read('supabase/functions/web-access-panel/index.ts').includes("enforceWebRateLimit(supabase, 'panel'"), 'painel sem rate limit');
expect(!read('supabase/functions/web-player-media/index.ts').includes('enforceWebRateLimit'), 'segmentos de mídia não devem bater rate-limit DB por request');

const panel = read('supabase/functions/web-access-panel/index.ts');
for (const marker of ["principal.role === 'seller'", 'device.seller_id', "principal.role === 'seller') throw", 'web_player_admin_audit', 'web_pin_hash: null', 'revoke-all']) {
  expect(panel.includes(marker), `gestão Web sem RBAC/auditoria: ${marker}`);
}
expect(!panel.includes('web_pin_salt:' + ' device.web_pin_salt'), 'painel não deve retornar salt do PIN');
const panelUi = read('admin-panel/web-access-management.js');
for (const marker of ['Acesso Web', 'Redefinir PIN', 'Revogar todas', 'data-wam-revoke', 'data-wam-disable']) expect(panelUi.includes(marker), `UI painel sem ação: ${marker}`);

const security = read('web-player/SECURITY.md');
for (const threat of ['Enumeração', 'Brute force', 'Replay', 'XSS', 'CSRF', 'Clickjacking', 'SSRF/open proxy', 'Abuso de bandwidth', 'PWA']) {
  expect(security.includes(threat), `threat model sem ${threat}`);
}
const vercel = read('vercel.json');
for (const header of ['Content-Security-Policy', "frame-ancestors 'none'", 'Strict-Transport-Security', 'Permissions-Policy', '/web/sw.js']) {
  expect(vercel.includes(header), `deploy sem header/rota: ${header}`);
}

console.log('Web batch #314–#319: recovery, sync, segurança, painel e release contracts validados.');
