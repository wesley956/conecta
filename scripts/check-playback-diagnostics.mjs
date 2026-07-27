import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

const moduleJs = read('admin-panel/playback-diagnostics-module.js');
const moduleCss = read('admin-panel/playback-diagnostics-module.css');
const generator = read('scripts/generate-panel-config.mjs');
const edge = read('supabase/functions/playback-diagnostics-panel/index.ts');
const migration = read('supabase/migrations/20260727234000_playback_diagnostics.sql');

expect(!moduleJs.includes('MutationObserver'), 'Diagnóstico não pode usar MutationObserver contínuo.');
expect(moduleJs.includes("data-tab = 'diagnostics'") || moduleJs.includes("dataset.tab = 'diagnostics'"), 'Aba Diagnóstico do administrador não foi criada.');
expect(moduleJs.includes("dataset.sellerNav = 'diagnostics'"), 'Aba Diagnóstico do vendedor não foi criada.');
expect(moduleJs.includes("data-seller-section=\"diagnostics\"") || moduleJs.includes("dataset.sellerSection = 'diagnostics'"), 'Seção reduzida do vendedor ausente.');
expect(moduleJs.includes("action === 'updateStatus'") === false, 'Regra de autorização deve permanecer no servidor, não no módulo visual.');
expect(moduleJs.includes('playback-diagnostics-panel'), 'Módulo visual não consulta a Edge Function de diagnóstico.');
expect(moduleJs.includes('RonecaPanelAuth.getAccessToken'), 'Módulo não usa a sessão autenticada do painel.');
expect(moduleJs.includes('copySeller') || moduleJs.includes('CopySeller'), 'Vendedor precisa poder copiar um resumo simplificado.');
expect(moduleCss.includes('.pd-seller-section'), 'Estilo reduzido do vendedor ausente.');
expect(moduleCss.includes('.pd-ranking-grid'), 'Visão analítica do administrador ausente.');

expect(generator.includes('playback-diagnostics-module.js?v=1.0'), 'Gerador não carrega o JavaScript de diagnóstico.');
expect(generator.includes('playback-diagnostics-module.css?v=1.0'), 'Gerador não carrega o CSS de diagnóstico.');

expect(edge.includes("requirePanelPrincipal(request, supabase, ['owner', 'admin', 'seller'])"), 'Edge Function não valida os papéis permitidos.');
expect(edge.includes("if (principal.role === 'seller')"), 'Edge Function não separa a resposta do vendedor.');
expect(edge.includes("query.eq('seller_id', principal.sellerId)"), 'Vendedor não está restrito ao próprio seller_id.');
expect(edge.includes("return json({ error: 'Ação restrita ao administrador.' }, 403)"), 'Atualização administrativa não está protegida.');
expect(!edge.includes('playlist_url'), 'Edge Function não pode devolver URL da lista.');
expect(!edge.includes('device_credential'), 'Edge Function não pode consultar credenciais do aparelho.');

expect(migration.includes('alter table public.panel_playback_diagnostics enable row level security'), 'RLS não foi habilitado.');
expect(migration.includes('revoke all on table public.panel_playback_diagnostics from anon, authenticated'), 'Tabela não foi retirada do acesso direto do navegador.');
expect(migration.includes('capture_panel_playback_health_trigger'), 'Trigger automático de falhas ausente.');
expect(migration.includes('client_event_id text unique'), 'Diagnósticos não possuem chave idempotente.');
expect(!migration.includes('playlist_url'), 'Diagnóstico não pode armazenar a URL da lista.');

console.log('Diagnóstico de reprodução validado.');
