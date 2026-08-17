import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'web-player/src/App.tsx',
  'web-player/src/api.ts',
  'web-player/src/session.ts',
  'web-player/src/player/WebPlayer.tsx',
  'supabase/functions/web-player-auth/index.ts',
  'supabase/functions/web-player-access/index.ts',
  'supabase/functions/web-player-catalog/index.ts',
  'supabase/functions/web-player-playback/index.ts',
  'supabase/functions/web-player-media/index.ts',
  'supabase/functions/_shared/webMediaTransport.ts',
  'supabase/functions/_shared/webPlayerSecurity.ts',
  'supabase/functions/_shared/webPlayerCatalog.ts',
  'supabase/migrations/20260817043000_web_player_foundation.sql',
];

const failures = [];
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`arquivo obrigatório ausente: ${file}`);
}

function walk(directory) {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap(entry => {
    const relative = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(relative) : [relative];
  });
}

const browserFiles = [
  ...walk('web-player/src'),
  'web-player/index.html',
].filter(file => /\.(?:ts|tsx|js|jsx|html)$/.test(file));

const forbiddenBrowserPatterns = [
  [/deviceCredential/gi, 'deviceCredential'],
  [/device_credential/gi, 'device_credential'],
  [/playlist_url/gi, 'playlist_url'],
  [/SUPABASE_SERVICE_ROLE_KEY/gi, 'service role env'],
  [/service_role/gi, 'service_role'],
  [/password=.*xtream/gi, 'Xtream password'],
];

for (const file of browserFiles) {
  const content = read(file);
  for (const [pattern, label] of forbiddenBrowserPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) failures.push(`segredo/contrato proibido no browser (${label}): ${file}`);
  }
}

if (fs.existsSync(path.join(root, 'web-player/src/api.ts'))) {
  const api = read('web-player/src/api.ts');
  if (/localStorage/.test(api)) failures.push('tokens Web não podem ser persistidos em localStorage');
  if (!/sessionStorage/.test(api)) failures.push('refresh token deve permanecer limitado à sessão da aba');
  if (!/Authorization:\s*`Bearer/.test(api)) failures.push('cliente Web deve usar token Web próprio no header Authorization');
}

if (fs.existsSync(path.join(root, 'supabase/functions/web-player-catalog/index.ts'))) {
  const catalog = read('supabase/functions/web-player-catalog/index.ts');
  if (!/requireWebSession/.test(catalog)) failures.push('catálogo Web precisa validar web_session');
  if (!/projectChannels/.test(catalog) || !/projectMovies/.test(catalog) || !/projectSeries/.test(catalog)) {
    failures.push('catálogo Web deve passar pela projeção sanitizada');
  }
}

if (fs.existsSync(path.join(root, 'supabase/functions/_shared/webPlayerCatalog.ts'))) {
  const projection = read('supabase/functions/_shared/webPlayerCatalog.ts');
  if (!/sealWebPayload/.test(projection)) failures.push('contentId precisa ser opaco/selado');
  if (!/safePublicImage/.test(projection)) failures.push('imagens públicas precisam de classificação Web');
}

if (fs.existsSync(path.join(root, 'supabase/functions/web-player-playback/index.ts'))) {
  const broker = read('supabase/functions/web-player-playback/index.ts');
  if (!/WEB_MEDIA_GATEWAY_ENABLED/.test(broker)) failures.push('gateway precisa permanecer protegido por feature env');
  if (!/sealWebPayload/.test(broker)) failures.push('broker precisa gerar token curto selado');
}

if (fs.existsSync(path.join(root, 'supabase/functions/web-player-media/index.ts'))) {
  const media = read('supabase/functions/web-player-media/index.ts');
  if (/searchParams\.get\(['"]url['"]\)/.test(media)) failures.push('media gateway não pode aceitar URL arbitrária do browser');
  for (const marker of ['validateSession', 'rewriteManifest']) {
    if (!media.includes(marker)) failures.push(`media gateway sem proteção obrigatória: ${marker}`);
  }
}

if (fs.existsSync(path.join(root, 'supabase/functions/_shared/webMediaTransport.ts'))) {
  const transport = read('supabase/functions/_shared/webMediaTransport.ts');
  for (const marker of ['assertAllowedPlaylistUrl', 'assertPublicPlaylistTarget']) {
    if (!transport.includes(marker)) failures.push(`transporte de mídia sem proteção obrigatória: ${marker}`);
  }
}

if (fs.existsSync(path.join(root, 'supabase/functions/web-player-auth/index.ts'))) {
  const auth = read('supabase/functions/web-player-auth/index.ts');
  for (const marker of ['deriveWebPin', 'WEB_SESSION_LIMIT_REACHED', 'refresh_token_hash', 'web_player_login_attempts']) {
    if (!auth.includes(marker)) failures.push(`auth Web sem requisito: ${marker}`);
  }
}

if (fs.existsSync(path.join(root, 'supabase/migrations/20260817043000_web_player_foundation.sql'))) {
  const migration = read('supabase/migrations/20260817043000_web_player_foundation.sql');
  for (const marker of ['enable row level security', 'revoke all on table public.web_player_sessions', 'web_player_create_session', 'for update']) {
    if (!migration.toLowerCase().includes(marker.toLowerCase())) failures.push(`migration Web sem requisito: ${marker}`);
  }
}

if (failures.length) {
  console.error('Web Player foundation gate FAILED');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log('Web Player: sessão própria, catálogo opaco, broker, gateway protegido e frontend sem credenciais validados.');
