import fs from 'node:fs';

const files = {
  migration: 'supabase/migrations/20260807060000_playlist_lifecycle_and_server_profiles.sql',
  edgeFix: 'supabase/migrations/20260807060100_playlist_lifecycle_edge_fixes.sql',
  deviceLearning: 'supabase/migrations/20260807060200_device_attempt_server_profile_learning.sql',
  shared: 'supabase/functions/_shared/playlistQualification.ts',
  registration: 'supabase/functions/playlist-registration/index.ts',
  validation: 'supabase/functions/playlist-validation/index.ts',
  sellerFlow: 'supabase/functions/seller-device-flow/index.ts',
  sourceManager: 'supabase/functions/playlist-source-manager/index.ts',
  sellerWizard: 'admin-panel/seller-activation-wizard.js',
  sellerLists: 'admin-panel/seller-lists-ux.js',
  adminDiagnostic: 'admin-panel/playlist-commercial-qualification.js',
  adminLifecycle: 'admin-panel/playlist-lifecycle-ui.js',
  generator: 'scripts/generate-panel-config.mjs',
  pgTap: 'supabase/tests/playlist_lifecycle_lote3_test.sql',
  devicePgTap: 'supabase/tests/playlist_server_profile_device_learning_test.sql',
};

for (const path of Object.values(files)) {
  if (!fs.existsSync(path)) throw new Error(`Arquivo obrigatório do Lote 3 ausente: ${path}`);
}
const source = Object.fromEntries(Object.entries(files).map(([key, path]) => [key, fs.readFileSync(path, 'utf8')]));
const sql = `${source.migration}\n${source.edgeFix}\n${source.deviceLearning}`;

const officialStates = [
  'saving',
  'generating_cache',
  'ready_cache',
  'awaiting_device_confirmation',
  'confirmed_by_device',
  'device_failed',
  'blocked',
  'archived',
];
for (const status of officialStates) {
  if (!source.shared.includes(`'${status}'`)) throw new Error(`Estado oficial ausente no contrato compartilhado: ${status}`);
}
for (const label of [
  'Salvando', 'Gerando cache', 'Pronta com cache', 'Aguardando confirmação no aparelho',
  'Confirmada pelo aparelho', 'Falhou no aparelho', 'Bloqueada', 'Arquivada',
]) {
  if (!source.shared.includes(label)) throw new Error(`Rótulo oficial ausente no contrato compartilhado: ${label}`);
  if (!sql.includes(label)) throw new Error(`Rótulo oficial ausente na decisão SQL: ${label}`);
}

for (const token of [
  'panel_playlist_server_profiles',
  'playlist_safe_profile_headers',
  'playlist_safe_profile_path',
  'learn_playlist_server_profile',
  'apply_known_playlist_server_profile',
  'get_playlist_lifecycle_decision',
  "when playlist.playlist_qualification_code = 'DEVICE_TEST_FAILED' then 'device_failed'",
  "then 'awaiting_device_confirmation'",
  "then 'available_by_cache'",
  "else 'provisional'",
]) {
  if (!sql.includes(token)) throw new Error(`Migrações do Lote 3 não contêm: ${token}`);
}
if (!source.edgeFix.includes("then 'saving'")) throw new Error('SQL não distingue Salvando de Gerando cache.');
if (!source.edgeFix.includes("playlist.playlist_qualification_code = 'DEVICE_TEST_FAILED' then 'blocked'")) {
  throw new Error('Falhou no aparelho precisa bloquear nova ativação Android até retry/correção.');
}
if (!source.edgeFix.includes("v_playlist.playlist_qualification_code = 'DEVICE_TEST_FAILED'")) {
  throw new Error('Guard transacional não bloqueia lista já falhada no aparelho.');
}

const safeHeaderFunction = source.migration.match(/create or replace function public\.playlist_safe_profile_headers[\s\S]*?\$\$;/i)?.[0] || '';
for (const allowed of ['user-agent', 'accept', 'accept-language']) {
  if (!safeHeaderFunction.includes(`'${allowed}'`)) throw new Error(`Perfil de servidor não preserva header seguro esperado: ${allowed}`);
}
for (const forbidden of ['authorization', 'cookie', 'x-api-key', 'proxy-authorization']) {
  if (new RegExp(`'${forbidden}'`, 'i').test(safeHeaderFunction)) throw new Error(`Perfil compartilhado não pode reaproveitar ${forbidden}.`);
}
if (/username|password|senha|passwd|token\s+text/i.test(
  source.migration.match(/create table if not exists public\.panel_playlist_server_profiles[\s\S]*?\);/i)?.[0] || '',
)) {
  throw new Error('Tabela de perfil do servidor não pode armazenar credenciais do cliente.');
}
for (const token of ["return '/get.php'", "return '/player_api.php'", "return '/{resource}'", '/{credential}/{credential}/{resource}']) {
  if (!source.edgeFix.includes(token)) throw new Error(`Template seguro de caminho incompleto: ${token}`);
}
if (!source.edgeFix.includes('on conflict (profile_key) do nothing')) throw new Error('Backfill de perfis conhecidos não é idempotente.');

for (const token of [
  'learn_playlist_server_profile_from_device_attempt',
  "new.result <> 'success'",
  "new.transport not in ('xtream','m3u')",
  'playlist_provider_attempts_learn_server_profile',
  'new.strategy_key',
]) {
  if (!source.deviceLearning.includes(token)) throw new Error(`Aprendizado pelo aparelho incompleto: ${token}`);
}
if (source.deviceLearning.includes("new.transport = 'cache'")) {
  throw new Error('Aprendizado pelo aparelho não deve tratar cache como servidor do fornecedor.');
}

for (const token of ['get_playlist_lifecycle_decision','lifecycleStatus','platformCapabilities','androidActivationAllowed','adminDiagnosticRecommended']) {
  if (!source.shared.includes(token)) throw new Error(`Contrato de ciclo de vida incompleto: ${token}`);
}
if (!source.shared.includes("lifecycle === 'device_failed'")) throw new Error('Contrato compartilhado não trata falha do aparelho como indisponível.');

for (const token of [
  "PLAYLIST_FUNCTION = 'playlist-registration'",
  "panelApi(PLAYLIST_FUNCTION, { action: 'list' })",
  'lifecycleStatus',
  'Aguardando confirmação no aparelho',
  'playlistUnavailable',
]) {
  if (!source.sellerWizard.includes(token)) throw new Error(`Assistente do vendedor não usa o estado canônico: ${token}`);
}
if (source.sellerWizard.includes('playlist-validation')) throw new Error('Fluxo comercial do vendedor não pode chamar o diagnóstico manual.');
if (!source.sellerWizard.includes("info.status === 'device_failed'")) throw new Error('Wizard precisa impedir seleção de lista que falhou no aparelho.');

for (const token of ['function isAdminPage()','if (!isAdminPage()) return','Diagnóstico técnico de listas','Esta área não é etapa da ativação do vendedor','Iniciar diagnóstico']) {
  if (!source.adminDiagnostic.includes(token)) throw new Error(`Diagnóstico ADM não está isolado corretamente: ${token}`);
}

if (!source.generator.includes("pages: ['dashboard']") || !source.generator.includes("id: 'playlist-lifecycle-ui'")) {
  throw new Error('Carregador publicado não restringe diagnóstico ao ADM ou não carrega o ciclo de vida oficial.');
}
for (const token of ['playlist-registration','playlist-lifecycle-platforms','platformCapabilities','playlistOptions','unavailableForNewActivation']) {
  if (!source.adminLifecycle.includes(token)) throw new Error(`ADM não apresenta o estado oficial: ${token}`);
}
for (const token of ['officialApi','mergeOfficial','playlist-registration','sellerListsOpenUniversal','RonecaUniversalPlaylists','Android','LG','Samsung']) {
  if (!source.sellerLists.includes(token)) throw new Error(`Portal do vendedor não apresenta/usa o fluxo oficial: ${token}`);
}
if (source.sellerLists.includes("api('createSellerPlaylist'")) throw new Error('Portal do vendedor não pode manter um segundo cadastro simples fora da entrada universal.');

for (const token of ['lifecycleStatus','lifecycleLabel','lifecycleMessage','platformCapabilities','androidActivationAllowed']) {
  if (!source.registration.includes(token)) throw new Error(`Cadastro canônico não devolve ${token}.`);
}

const userFacing = [source.registration, source.sellerWizard, source.sellerLists, source.adminDiagnostic, source.adminLifecycle];
const forbiddenSellerMessages = [
  /somente listas homologadas podem consumir cr[eé]dito/i,
  /ainda n[aã]o est[aá] homologada/i,
  /precisa ser homologada antes/i,
  /homologa[cç][aã]o obrigat[oó]ria/i,
  /acesso direto homologado/i,
];
for (const pattern of forbiddenSellerMessages) {
  for (const text of userFacing) if (pattern.test(text)) throw new Error(`Mensagem comercial antiga reintroduzida: ${pattern}`);
}

for (const token of ["device.status = 'active'",'panel_device_playlists assignment',"playlist_qualification_code = 'DEVICE_TEST_FAILED'"]) {
  if (!source.migration.includes(token)) throw new Error(`Falha confirmada pelo aparelho comercial não está coberta: ${token}`);
}

for (const token of [
  'Cadastro recém salvo aparece como Salvando',
  'Perfil compartilhado nunca guarda Authorization ou Cookie',
  'Nova conta no mesmo servidor reaproveita o perfil técnico conhecido',
  'Android aceita provisoriamente lista não confirmada pelo servidor',
  'Falha confirmada pelo aparelho bloqueia nova ativação até retry ou correção',
  'LG não recebe lista sem cache',
  'Samsung recebe lista com cache pronto',
  'Falha do aparelho comercial aparece no estado oficial',
  'Lista que falhou no aparelho não pode ser ativada de novo sem retry ou correção',
]) {
  if (!source.pgTap.includes(token)) throw new Error(`pgTAP do Lote 3 não contém: ${token}`);
}
for (const token of [
  'Sucesso real do aparelho aprende perfil técnico do servidor',
  'Estratégia vencedora do aparelho é armazenada no perfil técnico',
  'Aprendizado pelo aparelho não copia headers sensíveis',
  'Sucesso do cache é ignorado e não vira perfil de servidor do fornecedor',
]) {
  if (!source.devicePgTap.includes(token)) throw new Error(`pgTAP de aprendizado do aparelho não contém: ${token}`);
}

if (!source.sourceManager.includes('panel_playlist_test_runs')) throw new Error('Cadastro universal não registra testes que alimentam o perfil do servidor.');
if (!source.sellerFlow.includes('O aplicativo confirmará a lista automaticamente')) throw new Error('Fluxo comercial não informa confirmação automática no aparelho.');

console.log('✅ Lote 3: ciclo de vida único, compatibilidade por plataforma, diagnóstico ADM e perfis seguros de servidor validados.');
