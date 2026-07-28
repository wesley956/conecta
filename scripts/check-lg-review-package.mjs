import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const required = [
  'admin-panel/lg-review.html',
  'admin-panel/lg-review.css',
  'admin-panel/lg-review-auth.js',
  'admin-panel/lg-review.js',
  'admin-panel/privacy.html',
  'admin-panel/lg-review/demo.m3u',
  'admin-panel/lg-review/assets/live-demo.svg',
  'admin-panel/lg-review/assets/big-buck-bunny.svg',
  'admin-panel/lg-review/assets/sintel.svg',
  'supabase/functions/lg-review-panel/index.ts',
  'supabase/migrations/20260728043000_lg_review_portal.sql',
  'docs/lg-review/UX_SCENARIO_EN.md',
  'docs/lg-review/SELF_CHECKLIST_GUIDE.md',
  'docs/lg-review/CONTENT_AND_LICENSES.md',
  'docs/lg-review/PRIVACY_POLICY_DRAFT_EN.md',
];

function check(condition, message) {
  if (!condition) throw new Error(message);
}

for (const path of required) check(fs.existsSync(path), `Arquivo obrigatório ausente: ${path}`);

const edge = read('supabase/functions/lg-review-panel/index.ts');
const migration = read('supabase/migrations/20260728043000_lg_review_portal.sql');
const portalHtml = read('admin-panel/lg-review.html');
const portalAuth = read('admin-panel/lg-review-auth.js');
const portal = read('admin-panel/lg-review.js');
const m3u = read('admin-panel/lg-review/demo.m3u');
const hostedStage = read('scripts/stage-hosted-tv.mjs');
const smartPackage = JSON.parse(read('smart-tv/package.json'));

check(edge.includes("REVIEW_PROVIDER = 'lg'"), 'A função não restringe o provedor LG.');
check(edge.includes('isAllowedWebOsDevice'), 'A função não restringe a ativação ao webOS.');
check(edge.includes('panel_review_accounts'), 'A conta de homologação não está isolada.');
check(edge.includes('panel_review_devices'), 'Os aparelhos de homologação não são rastreados.');
check(edge.includes("from('panel_device_playlists').delete()"), 'A ativação não limpa atribuições anteriores com segurança.');
check(!edge.match(/password\s*[:=]\s*['\"][^'\"]+/i), 'Uma senha parece ter sido incorporada à função.');
check(migration.includes('enable row level security'), 'RLS não foi habilitado nas tabelas de homologação.');
check(migration.includes('revoke all on table public.panel_review_accounts from public, anon, authenticated'), 'Privilégios públicos da conta de homologação não foram revogados.');
check(portalHtml.includes('./lg-review-auth.js'), 'O portal LG não carrega a autenticação isolada.');
check(!portalHtml.includes('./panel-auth-session.js'), 'O portal LG ainda compartilha a sessão comercial.');
check(portalAuth.includes("STORAGE_KEY = 'roneca-lg-review-auth-session-v1'"), 'A sessão LG não possui chave exclusiva.');
check(portalAuth.includes('clearSession();\n    var session = await authRequest'), 'Uma tentativa de login LG não limpa a sessão anterior.');
check(portal.includes("FUNCTION_NAME = 'lg-review-panel'"), 'O portal não usa a função de homologação dedicada.');
check(portal.includes('showLoggedOut'), 'O portal não volta ao estado seguro após falha de login.');
check(portal.includes('authFlowVersion'), 'O portal não protege o login contra concorrência com restauração de sessão.');
check(m3u.includes('devstreaming-cdn.apple.com'), 'O canal HLS oficial de teste não está no catálogo.');
check((m3u.match(/#EXTINF:/g) || []).length === 5, 'O catálogo M3U precisa conter exatamente cinco entradas de demonstração.');
check(m3u.includes('S01E01') && m3u.includes('S01E02'), 'A série demonstrativa não possui dois episódios.');
check(smartPackage.version === '1.0.0', 'O pacote Smart TV precisa estar na versão 1.0.0.');
check(hostedStage.includes('smartPackagePath') && hostedStage.includes('smartVersion'), 'A versão hospedada não é derivada do package.json da Smart TV.');

console.log('Pacote de homologação LG validado.');
