import fs from 'node:fs';

const requiredFiles = [
  'docs/LOT1_PLAYLIST_QUALIFICATION_MAP_2026-08-05.md',
  'supabase/migrations/20260805010000_playlist_commercial_qualification.sql',
  'supabase/migrations/20260805010100_playlist_validation_device_safety.sql',
  'supabase/migrations/20260805010300_commercial_playlist_replacement.sql',
  'supabase/migrations/20260805010400_direct_confirmation_precedence.sql',
  'supabase/migrations/20260805010500_playlist_insert_qualification_seed.sql',
  'supabase/migrations/20260805010600_playlist_platform_capability_guard.sql',
  'supabase/migrations/20260805010700_canonical_playlist_registration.sql',
  'supabase/migrations/20260805010900_direct_confirmation_device_reference_compatibility.sql',
  'supabase/migrations/20260807060000_playlist_lifecycle_and_server_profiles.sql',
  'supabase/migrations/20260807060100_playlist_lifecycle_edge_fixes.sql',
  'supabase/functions/_shared/playlistQualification.ts',
  'supabase/functions/_shared/playlistSource.ts',
  'supabase/functions/playlist-registration/index.ts',
  'supabase/functions/playlist-validation/index.ts',
  'supabase/functions/playlist-fingerprint-backfill/index.ts',
  'supabase/functions/device-config-qualified/index.ts',
  'admin-panel/playlist-commercial-qualification.js',
  'admin-panel/playlist-lifecycle-ui.js',
  'admin-panel/playlist-fingerprint-backfill-bootstrap.js',
  'supabase/tests/playlist_commercial_qualification_test.sql',
  'supabase/tests/playlist_platform_capability_test.sql',
  'supabase/tests/canonical_playlist_registration_test.sql',
  'supabase/tests/playlist_lifecycle_lote3_test.sql',
];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) throw new Error(`Arquivo obrigatório da qualificação/ciclo de listas ausente: ${file}`);
}

const read = path => fs.readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20260805010000_playlist_commercial_qualification.sql');
const safetyMigration = read('supabase/migrations/20260805010100_playlist_validation_device_safety.sql');
const precedenceMigration = read('supabase/migrations/20260805010400_direct_confirmation_precedence.sql');
const platformMigration = read('supabase/migrations/20260805010600_playlist_platform_capability_guard.sql');
const canonicalMigration = read('supabase/migrations/20260805010700_canonical_playlist_registration.sql');
const lifecycleMigration = read('supabase/migrations/20260807060000_playlist_lifecycle_and_server_profiles.sql');
const lifecycleFix = read('supabase/migrations/20260807060100_playlist_lifecycle_edge_fixes.sql');
const registration = read('supabase/functions/playlist-registration/index.ts');
const validation = read('supabase/functions/playlist-validation/index.ts');
const backfill = read('supabase/functions/playlist-fingerprint-backfill/index.ts');
const deviceConfig = read('supabase/functions/device-config-qualified/index.ts');
const qualificationModule = read('supabase/functions/_shared/playlistQualification.ts');
const sourceModule = read('supabase/functions/_shared/playlistSource.ts');
const panel = read('admin-panel/playlist-commercial-qualification.js');
const lifecycleUi = read('admin-panel/playlist-lifecycle-ui.js');
const backfillBootstrap = read('admin-panel/playlist-fingerprint-backfill-bootstrap.js');
const panelGenerator = read('scripts/generate-panel-config.mjs');
const androidApi = read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/network/DeviceConfigDirectApi.kt');
const pgTap = read('supabase/tests/playlist_commercial_qualification_test.sql');
const platformPgTap = read('supabase/tests/playlist_platform_capability_test.sql');
const canonicalPgTap = read('supabase/tests/canonical_playlist_registration_test.sql');
const lifecyclePgTap = read('supabase/tests/playlist_lifecycle_lote3_test.sql');
const supabaseConfig = read('supabase/config.toml');

// Os estados técnicos são preservados para compatibilidade com app/migrações antigas.
for (const state of ['validating','ready_cache','awaiting_device_test','ready_direct','retryable_error','blocked']) {
  if (!migration.includes(`'${state}'`) || !qualificationModule.includes(`'${state}'`)) {
    throw new Error(`Estado técnico ausente no banco ou no contrato: ${state}`);
  }
}

for (const token of [
  'panel_playlist_validation_sessions',
  'playlist_is_commercially_usable',
  'assert_playlist_commercially_usable',
  'start_playlist_validation_session',
  'mark_playlist_direct_success',
  'mark_playlist_validation_failure',
  'safe_playlist_qualification_message',
]) {
  if (!migration.includes(token)) throw new Error(`Fundação de qualificação não contém: ${token}`);
}

for (const token of ["status = 'pending'", 'seller_id is null', 'customer_id is null', 'playlist_id is null', 'subscription_expires_at is null']) {
  if (!safetyMigration.includes(token)) throw new Error(`Isolamento do aparelho técnico não contém: ${token}`);
}
for (const token of ["playlist_qualification_status = 'ready_direct'", 'playlist_direct_confirmed_at is not null', 'DIRECT_ALREADY_CONFIRMED']) {
  if (!precedenceMigration.includes(token)) throw new Error(`Precedência da confirmação direta não contém: ${token}`);
}
for (const token of ['assert_playlist_commercially_usable_for_device', "v_device_type not in ('android', 'androidtv')", 'panel_playlist_validation_device_capability_guard']) {
  if (!platformMigration.includes(token)) throw new Error(`Proteção histórica por plataforma não contém: ${token}`);
}
for (const token of ['register_playlist_source_transaction', 'playlist.source_fingerprint = v_fingerprint', 'pg_advisory_xact_lock', 'panel_seller_playlists']) {
  if (!canonicalMigration.includes(token)) throw new Error(`Cadastro atômico não contém: ${token}`);
}

// Lote 3: uma apresentação pública única, mantendo a fundação técnica anterior.
for (const token of [
  'get_playlist_lifecycle_decision',
  'panel_playlist_server_profiles',
  'learn_playlist_server_profile',
  'apply_known_playlist_server_profile',
]) {
  if (!lifecycleMigration.includes(token)) throw new Error(`Ciclo público do Lote 3 não contém: ${token}`);
}
for (const token of ["then 'saving'", "playlist_qualification_code = 'DEVICE_TEST_FAILED'", "return '/{resource}'"]) {
  if (!lifecycleFix.includes(token)) throw new Error(`Correção de borda do Lote 3 não contém: ${token}`);
}
for (const token of ['lifecycleStatus','platformCapabilities','androidActivationAllowed','adminDiagnosticRecommended']) {
  if (!qualificationModule.includes(token)) throw new Error(`Contrato público de lista incompleto: ${token}`);
}

for (const token of [
  "action === 'create'",
  "action === 'retry'",
  'register_playlist_source_transaction',
  'source_fingerprint',
  'lifecycleStatus',
  'platformCapabilities',
  'Não cadastre novamente',
]) {
  if (!registration.includes(token)) throw new Error(`Cadastro canônico não contém: ${token}`);
}

// A homologação/teste manual virou ferramenta técnica exclusiva de owner/admin.
for (const token of [
  "['owner', 'admin']",
  "action === 'markDevice'",
  "action === 'start'",
  "action === 'revoke'",
  'start_playlist_validation_session',
]) {
  if (!validation.includes(token)) throw new Error(`Diagnóstico direto protegido não contém: ${token}`);
}
for (const token of [
  'Diagnóstico técnico de listas',
  'Esta área não é etapa da ativação do vendedor',
  'Iniciar diagnóstico',
  'Aguardando confirmação no aparelho',
]) {
  if (!panel.includes(token)) throw new Error(`Painel de diagnóstico ADM não contém: ${token}`);
}
if (!panel.includes('isAdminPage()') || !panel.includes('if (!isAdminPage()) return')) {
  throw new Error('Diagnóstico manual não está restrito ao dashboard administrativo.');
}
for (const forbidden of [/somente listas homologadas podem consumir cr[eé]dito/i, /homologa[cç][aã]o obrigat[oó]ria/i]) {
  if (forbidden.test(panel) || forbidden.test(lifecycleUi) || forbidden.test(registration)) {
    throw new Error(`Mensagem comercial antiga reintroduzida: ${forbidden}`);
  }
}

for (const token of ['source_fingerprint','register_playlist_source_transaction','canonicalSources',"['owner', 'admin']"]) {
  if (!backfill.includes(token)) throw new Error(`Backfill protegido não contém: ${token}`);
}
for (const token of ['/device-config','resolve_active_playlist_validation_session','mark_playlist_direct_success','validationMode: true']) {
  if (!deviceConfig.includes(token)) throw new Error(`Configuração Android qualificada não contém: ${token}`);
}
for (const token of ['playlist-fingerprint-backfill','localStorage.setItem','completedAt']) {
  if (!backfillBootstrap.includes(token)) throw new Error(`Inicialização do backfill não contém: ${token}`);
}
if (!sourceModule.includes('PLAYLIST_FINGERPRINT_SECRET')) throw new Error('Fingerprint não preserva o segredo histórico configurável.');
if (!panelGenerator.includes('playlist-commercial-qualification.js') || !panelGenerator.includes('playlist-lifecycle-ui.js')) {
  throw new Error('Painel publicado não carrega diagnóstico ADM e ciclo público oficial.');
}
if (!androidApi.includes('/device-config-qualified')) throw new Error('Android não utiliza a configuração qualificada.');
for (const functionName of ['device-config-qualified','playlist-registration','playlist-validation','playlist-fingerprint-backfill']) {
  if (!supabaseConfig.includes(`[functions.${functionName}]`)) throw new Error(`Edge Function não configurada: ${functionName}`);
}

// Preserva as provas históricas e acrescenta a prova do contrato público novo.
for (const token of ['Ativação provisória consome o crédito normal do plano','Sessão de validação não cria lançamento financeiro adicional','Sucesso do aparelho autorizado promove a lista']) {
  if (!pgTap.includes(token)) throw new Error(`Teste histórico não contém: ${token}`);
}
for (const token of ['Tizen não consome uma lista somente direta','Recusa por plataforma preserva o saldo','Android pode ativar a lista direta homologada']) {
  if (!platformPgTap.includes(token)) throw new Error(`Teste histórico de plataforma não contém: ${token}`);
}
for (const token of ['Cadastro retorna a linha legada equivalente','Cadastro canônico não cria duplicata','Permissão do vendedor é criada na mesma transação']) {
  if (!canonicalPgTap.includes(token)) throw new Error(`Teste histórico de cadastro não contém: ${token}`);
}
for (const token of ['Cadastro recém salvo aparece como Salvando','Android aceita provisoriamente lista não confirmada pelo servidor','Falha confirmada pelo aparelho bloqueia nova ativação até retry ou correção']) {
  if (!lifecyclePgTap.includes(token)) throw new Error(`Teste de ciclo público não contém: ${token}`);
}

const sensitiveLogPattern = /console\.(?:log|debug|info|warn|error)\s*\([^)]*(?:playlistUrl|playlist_url|password|senha|username|token)/i;
for (const [name, source] of Object.entries({ registration, validation, backfill, deviceConfig, panel, lifecycleUi, backfillBootstrap })) {
  if (sensitiveLogPattern.test(source)) throw new Error(`${name} pode registrar credenciais em log.`);
  if (/\beval\s*\(|\bFunction\s*\(/.test(source)) throw new Error(`${name} não pode executar código dinâmico.`);
}

console.log('✅ Fundação técnica preservada; ciclo público, diagnóstico ADM e compatibilidade do Lote 3 validados.');
