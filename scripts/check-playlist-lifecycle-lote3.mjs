import fs from 'node:fs';

const files = {
  migration: 'supabase/migrations/20260807060000_playlist_lifecycle_and_server_profiles.sql',
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
};

for (const path of Object.values(files)) {
  if (!fs.existsSync(path)) throw new Error(`Arquivo obrigatório do Lote 3 ausente: ${path}`);
}
const source = Object.fromEntries(Object.entries(files).map(([key, path]) => [key, fs.readFileSync(path, 'utf8')]));

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
  "then 'provisional'",
]) {
  if (!source.migration.includes(token)) throw new Error(`Migração do Lote 3 não contém: ${token}`);
}

const safeHeaderFunction = source.migration.match(/create or replace function public\.playlist_safe_profile_headers[\s\S]*?\$\$;/i)?.[0] || '';
for (const allowed of ['user-agent', 'accept', 'accept-language']) {
  if (!safeHeaderFunction.includes(`'${allowed}'`)) throw new Error(`Perfil de servidor não preserva header seguro esperado: ${allowed}`);
}
for (const forbidden of ['authorization', 'cookie', 'x-api-key', 'proxy-authorization']) {
  if (new RegExp(`'${forbidden}'`, 'i').test(safeHeaderFunction)) {
    throw new Error(`Perfil compartilhado não pode reaproveitar ${forbidden}.`);
  }
}
if (/username|password|senha|passwd|token\s+text/i.test(
  source.migration.match(/create table if not exists public\.panel_playlist_server_profiles[\s\S]*?\);/i)?.[0] || '',
)) {
  throw new Error('Tabela de perfil do servidor não pode armazenar credenciais do cliente.');
}

for (const token of [
  'get_playlist_lifecycle_decision',
  'lifecycleStatus',
  'platformCapabilities',
  'androidActivationAllowed',
  'adminDiagnosticRecommended',
]) {
  if (!source.shared.includes(token)) throw new Error(`Contrato de ciclo de vida incompleto: ${token}`);
}

for (const token of [
  "PLAYLIST_FUNCTION = 'playlist-registration'",
  "panelApi(PLAYLIST_FUNCTION, { action: 'list' })",
  'lifecycleStatus',
  'Aguardando confirmação no aparelho',
]) {
  if (!source.sellerWizard.includes(token)) throw new Error(`Assistente do vendedor não usa o estado canônico: ${token}`);
}
if (source.sellerWizard.includes("playlist-validation")) {
  throw new Error('Fluxo comercial do vendedor não pode chamar a homologação/diagnóstico manual.');
}

for (const token of [
  "if (!/\\/dashboard\\.html$/.test(location.pathname)) return",
  'Diagnóstico técnico de listas',
  'Esta área não é etapa da ativação do vendedor',
  'Iniciar diagnóstico',
]) {
  if (!source.adminDiagnostic.includes(token)) throw new Error(`Diagnóstico ADM não está isolado corretamente: ${token}`);
}

if (!source.generator.includes("pages: ['dashboard']")
    || !source.generator.includes("id: 'playlist-lifecycle-ui'")) {
  throw new Error('Carregador publicado não restringe diagnóstico ao ADM ou não carrega o ciclo de vida oficial.');
}
for (const token of [
  'playlist-registration',
  'playlist-lifecycle-platforms',
  'platformCapabilities',
  'playlistOptions',
]) {
  if (!source.adminLifecycle.includes(token)) throw new Error(`ADM não apresenta o estado oficial: ${token}`);
}
for (const token of [
  'officialApi',
  'mergeOfficial',
  'playlist-registration',
  'Android', 'LG', 'Samsung',
]) {
  if (!source.sellerLists.includes(token)) throw new Error(`Portal do vendedor não apresenta o estado oficial: ${token}`);
}

for (const token of [
  'lifecycleStatus',
  'lifecycleLabel',
  'lifecycleMessage',
  'platformCapabilities',
  'androidActivationAllowed',
]) {
  if (!source.registration.includes(token)) throw new Error(`Cadastro canônico não devolve ${token}.`);
}

const userFacing = [source.registration, source.sellerWizard, source.sellerLists, source.adminDiagnostic, source.adminLifecycle];
const forbiddenSellerMessages = [
  /somente listas homologadas podem consumir cr[eé]dito/i,
  /ainda n[aã]o est[aá] homologada/i,
  /precisa ser homologada antes/i,
  /homologa[cç][aã]o obrigat[oó]ria/i,
];
for (const pattern of forbiddenSellerMessages) {
  for (const text of userFacing) {
    if (pattern.test(text)) throw new Error(`Mensagem comercial antiga reintroduzida: ${pattern}`);
  }
}

for (const token of [
  "device.status = 'active'",
  'panel_device_playlists assignment',
  "playlist_qualification_code = 'DEVICE_TEST_FAILED'",
]) {
  if (!source.migration.includes(token)) throw new Error(`Falha confirmada pelo aparelho comercial não está coberta: ${token}`);
}

for (const token of [
  'Perfil compartilhado nunca guarda Authorization ou Cookie',
  'Nova conta no mesmo servidor reaproveita o perfil técnico conhecido',
  'Android aceita provisoriamente lista não confirmada pelo servidor',
  'LG não recebe lista sem cache',
  'Samsung recebe lista com cache pronto',
  'Falha do aparelho comercial aparece no estado oficial',
]) {
  if (!source.pgTap.includes(token)) throw new Error(`pgTAP do Lote 3 não contém: ${token}`);
}

if (!source.sourceManager.includes('panel_playlist_test_runs')) {
  throw new Error('Cadastro universal não registra testes que alimentam o perfil do servidor.');
}
if (!source.sellerFlow.includes('O aplicativo confirmará a lista automaticamente')) {
  throw new Error('Fluxo comercial não informa confirmação automática no aparelho.');
}

console.log('✅ Lote 3: ciclo de vida único, compatibilidade por plataforma, diagnóstico ADM e perfis seguros de servidor validados.');
