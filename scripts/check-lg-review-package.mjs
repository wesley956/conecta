import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const required = [
  'admin-panel/lg-review.html',
  'admin-panel/lg-review.css',
  'admin-panel/lg-review-auth.js',
  'admin-panel/lg-review.js',
  'admin-panel/privacy.html',
  'admin-panel/assets/roneca-player-tv-symbol.svg',
  'admin-panel/assets/roneca-player-tv-wordmark.svg',
  'admin-panel/lg-review/demo.m3u',
  'admin-panel/lg-review/assets/live-demo.svg',
  'admin-panel/lg-review/assets/big-buck-bunny.svg',
  'admin-panel/lg-review/assets/sintel.svg',
  'native-android/brand/ronecaplaytv-symbol.svg',
  'native-android/brand/ronecaplaytv-wordmark.svg',
  'supabase/functions/lg-review-panel/index.ts',
  'supabase/functions/lg-review-panel/catalog.ts',
  'supabase/migrations/20260728043000_lg_review_portal.sql',
  'docs/lg-review/UX_SCENARIO_EN.md',
  'docs/lg-review/SELF_CHECKLIST_GUIDE.md',
  'docs/lg-review/CONTENT_AND_LICENSES.md',
  'docs/lg-review/PRIVACY_POLICY_DRAFT_EN.md',
];

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizedSvg(path) {
  return read(path).replace(/\r\n/g, '\n').trim().replace(/>\s+</g, '><');
}

for (const path of required) check(fs.existsSync(path), `Arquivo obrigatório ausente: ${path}`);

const edge = read('supabase/functions/lg-review-panel/index.ts');
const catalog = read('supabase/functions/lg-review-panel/catalog.ts');
const migration = read('supabase/migrations/20260728043000_lg_review_portal.sql');
const portalHtml = read('admin-panel/lg-review.html');
const portalCss = read('admin-panel/lg-review.css');
const portalAuth = read('admin-panel/lg-review-auth.js');
const portal = read('admin-panel/lg-review.js');
const m3u = read('admin-panel/lg-review/demo.m3u');
const hostedStage = read('scripts/stage-hosted-tv.mjs');
const smartStage = read('smart-tv/scripts/stage-platform.mjs');
const smartPackage = JSON.parse(read('smart-tv/package.json'));
const webOsInfo = JSON.parse(read('smart-tv/platforms/webos/appinfo.json'));

check(edge.includes("REVIEW_PROVIDER = 'lg'"), 'A função não restringe o provedor LG.');
check(edge.includes('isAllowedWebOsDevice'), 'A função não restringe a ativação ao webOS.');
check(edge.includes('panel_review_accounts'), 'A conta de homologação não está isolada.');
check(edge.includes('panel_review_devices'), 'Os aparelhos de homologação não são rastreados.');
check(edge.includes("from('panel_device_playlists').delete()"), 'A ativação não limpa atribuições anteriores com segurança.');
check(!edge.match(/password\s*[:=]\s*['\"][^'\"]+/i), 'Uma senha parece ter sido incorporada à função.');
check(catalog.includes('playlist_updated_at: snapshot.generatedAt'), 'O catálogo não atualiza a data real da playlist.');
check(!/(^|\n)\s*updated_at\s*:/.test(catalog), 'O catálogo tenta gravar a coluna inexistente panel_playlists.updated_at.');
check(catalog.includes("DEMO_VERSION = 'lg-review-v2'"), 'O catálogo de homologação não está na versão corrigida v2.');
check(catalog.includes('video.blender.org/object-storage/web_videos'), 'O catálogo não usa os arquivos oficiais acessíveis da Blender.');
check(!catalog.includes('storage.googleapis.com/gtv-videos-bucket'), 'O catálogo ainda contém links do Google bloqueados com HTTP 403.');
check(migration.includes('enable row level security'), 'RLS não foi habilitado nas tabelas de homologação.');
check(migration.includes('revoke all on table public.panel_review_accounts from public, anon, authenticated'), 'Privilégios públicos da conta de homologação não foram revogados.');
check(portalHtml.includes('./lg-review-auth.js'), 'O portal LG não carrega a autenticação isolada.');
check(!portalHtml.includes('./panel-auth-session.js'), 'O portal LG ainda compartilha a sessão comercial.');
check(portalHtml.includes('id="review-panel" class="review-panel" hidden'), 'O painel de ativação não começa oculto no HTML.');
check(portalHtml.includes('./assets/roneca-player-tv-symbol.svg'), 'O portal LG não usa o símbolo vetorial oficial.');
check(portalHtml.includes('./assets/roneca-player-tv-wordmark.svg'), 'O portal LG não usa o wordmark vetorial oficial.');
check(!portalHtml.includes('class="brand-mark"') && !/>\s*RP\s*</.test(portalHtml), 'O portal LG ainda desenha a marca antiga RP manualmente.');
check(/\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/.test(portalCss), 'O CSS pode exibir elementos protegidos marcados como hidden.');
for (const token of ['#080809', '#131315', '#2b2b30', '#e3262e', '#ff454c', '#9c9ca5']) {
  check(portalCss.toLowerCase().includes(token), `O portal LG não contém o token oficial ${token}.`);
}
check(!portalCss.includes('--gold:'), 'O portal LG ainda usa dourado como token genérico de interface.');
check(normalizedSvg('admin-panel/assets/roneca-player-tv-symbol.svg') === normalizedSvg('native-android/brand/ronecaplaytv-symbol.svg'), 'O símbolo do portal/painel divergiu do SVG mestre Android.');
check(normalizedSvg('admin-panel/assets/roneca-player-tv-wordmark.svg') === normalizedSvg('native-android/brand/ronecaplaytv-wordmark.svg'), 'O wordmark do portal/painel divergiu do SVG mestre Android.');
check(portalAuth.includes("STORAGE_KEY = 'roneca-lg-review-auth-session-v1'"), 'A sessão LG não possui chave exclusiva.');
check(portalAuth.includes('clearSession();\n    var session = await authRequest'), 'Uma tentativa de login LG não limpa a sessão anterior.');
check(portal.includes("FUNCTION_NAME = 'lg-review-panel'"), 'O portal não usa a função de homologação dedicada.');
check(portal.includes('showLoggedOut'), 'O portal não volta ao estado seguro após falha de login.');
check(portal.includes('authFlowVersion'), 'O portal não protege o login contra concorrência com restauração de sessão.');
check(m3u.includes('devstreaming-cdn.apple.com'), 'O canal HLS oficial de teste não está no catálogo.');
check(m3u.includes('video.blender.org/object-storage/web_videos'), 'A lista M3U não usa os MP4 oficiais da Blender.');
check(!m3u.includes('storage.googleapis.com/gtv-videos-bucket'), 'A lista M3U ainda contém links bloqueados do Google.');
check((m3u.match(/#EXTINF:/g) || []).length === 5, 'O catálogo M3U precisa conter exatamente cinco entradas de demonstração.');
check(m3u.includes('S01E01') && m3u.includes('S01E02'), 'A série demonstrativa não possui dois episódios.');
check(smartPackage.version === '1.0.0', 'O pacote Smart TV precisa estar na versão 1.0.0.');
check(hostedStage.includes('smartPackagePath') && hostedStage.includes('smartVersion'), 'A versão hospedada não é derivada do package.json da Smart TV.');
check(webOsInfo.resolution === '1920x1080', 'O pacote webOS não declara a resolução FHD usada no Seller Lounge.');
check(smartStage.includes('resizePngFile(officialAppIcon') && smartStage.includes('lg-seller-lounge-icon-400.png'), 'O staging LG não deriva os ícones oficiais 80/130/400 da marca atual.');

console.log('Pacote de homologação LG validado com identidade vetorial oficial.');
