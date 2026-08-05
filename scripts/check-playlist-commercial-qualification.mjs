import fs from 'node:fs';

const requiredFiles = [
  'docs/LOT1_PLAYLIST_QUALIFICATION_MAP_2026-08-05.md',
  'supabase/migrations/20260805010000_playlist_commercial_qualification.sql',
  'supabase/migrations/20260805010100_playlist_validation_device_safety.sql',
  'supabase/migrations/20260805010200_ready_direct_legacy_compatibility.sql',
  'supabase/migrations/20260805010300_commercial_playlist_replacement.sql',
  'supabase/migrations/20260805010400_direct_confirmation_precedence.sql',
  'supabase/migrations/20260805010500_playlist_insert_qualification_seed.sql',
  'supabase/migrations/20260805010600_playlist_platform_capability_guard.sql',
  'supabase/migrations/20260805010700_canonical_playlist_registration.sql',
  'supabase/functions/_shared/playlistQualification.ts',
  'supabase/functions/_shared/playlistSource.ts',
  'supabase/functions/playlist-registration/index.ts',
  'supabase/functions/playlist-validation/index.ts',
  'supabase/functions/playlist-fingerprint-backfill/index.ts',
  'supabase/functions/device-config-qualified/index.ts',
  'admin-panel/playlist-commercial-qualification.js',
  'admin-panel/playlist-commercial-qualification.css',
  'admin-panel/playlist-fingerprint-backfill-bootstrap.js',
  'supabase/tests/playlist_commercial_qualification_test.sql',
  'supabase/tests/playlist_platform_capability_test.sql',
  'supabase/tests/canonical_playlist_registration_test.sql',
];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) throw new Error(`Arquivo obrigatório do Lote 1 ausente: ${file}`);
}

const migration = fs.readFileSync(
  'supabase/migrations/20260805010000_playlist_commercial_qualification.sql',
  'utf8',
);
const safetyMigration = fs.readFileSync(
  'supabase/migrations/20260805010100_playlist_validation_device_safety.sql',
  'utf8',
);
const replacementMigration = fs.readFileSync(
  'supabase/migrations/20260805010300_commercial_playlist_replacement.sql',
  'utf8',
);
const precedenceMigration = fs.readFileSync(
  'supabase/migrations/20260805010400_direct_confirmation_precedence.sql',
  'utf8',
);
const insertSeedMigration = fs.readFileSync(
  'supabase/migrations/20260805010500_playlist_insert_qualification_seed.sql',
  'utf8',
);
const platformMigration = fs.readFileSync(
  'supabase/migrations/20260805010600_playlist_platform_capability_guard.sql',
  'utf8',
);
const canonicalMigration = fs.readFileSync(
  'supabase/migrations/20260805010700_canonical_playlist_registration.sql',
  'utf8',
);
const registration = fs.readFileSync('supabase/functions/playlist-registration/index.ts', 'utf8');
const validation = fs.readFileSync('supabase/functions/playlist-validation/index.ts', 'utf8');
const backfill = fs.readFileSync('supabase/functions/playlist-fingerprint-backfill/index.ts', 'utf8');
const deviceConfig = fs.readFileSync('supabase/functions/device-config-qualified/index.ts', 'utf8');
const qualificationModule = fs.readFileSync('supabase/functions/_shared/playlistQualification.ts', 'utf8');
const sourceModule = fs.readFileSync('supabase/functions/_shared/playlistSource.ts', 'utf8');
const panel = fs.readFileSync('admin-panel/playlist-commercial-qualification.js', 'utf8');
const backfillBootstrap = fs.readFileSync(
  'admin-panel/playlist-fingerprint-backfill-bootstrap.js',
  'utf8',
);
const panelGenerator = fs.readFileSync('scripts/generate-panel-config.mjs', 'utf8');
const androidApi = fs.readFileSync(
  'native-android/app/src/main/java/com/ronecaplaytv/nativeapp/network/DeviceConfigDirectApi.kt',
  'utf8',
);
const pgTap = fs.readFileSync('supabase/tests/playlist_commercial_qualification_test.sql', 'utf8');
const platformPgTap = fs.readFileSync('supabase/tests/playlist_platform_capability_test.sql', 'utf8');
const canonicalPgTap = fs.readFileSync('supabase/tests/canonical_playlist_registration_test.sql', 'utf8');
const supabaseConfig = fs.readFileSync('supabase/config.toml', 'utf8');

const states = [
  'validating',
  'ready_cache',
  'awaiting_device_test',
  'ready_direct',
  'retryable_error',
  'blocked',
];
for (const state of states) {
  if (!migration.includes(`'${state}'`) || !qualificationModule.includes(`'${state}'`)) {
    throw new Error(`Estado comercial ausente no banco ou no contrato: ${state}`);
  }
}

const databaseRequirements = [
  'panel_playlist_validation_sessions',
  'playlist_is_commercially_usable',
  'assert_playlist_commercially_usable',
  'start_playlist_validation_session',
  'mark_playlist_direct_success',
  'mark_playlist_validation_failure',
  'panel_devices_primary_playlist_qualification_guard',
  'panel_device_playlists_qualification_guard',
  'safe_playlist_qualification_message',
];
for (const token of databaseRequirements) {
  if (!migration.includes(token)) throw new Error(`Fundação comercial não contém: ${token}`);
}

for (const token of [
  "status = 'pending'",
  'seller_id is null',
  'customer_id is null',
  'playlist_id is null',
  'subscription_expires_at is null',
]) {
  if (!safetyMigration.includes(token)) {
    throw new Error(`Isolamento do aparelho de validação não contém: ${token}`);
  }
}

for (const token of [
  'replace_subscription_playlist_transaction',
  'replace_device_playlist_transaction',
  'assert_playlist_commercially_usable',
  'homologação comercial',
]) {
  if (!replacementMigration.includes(token)) {
    throw new Error(`Troca comercial não contém: ${token}`);
  }
}

for (const token of [
  "playlist_qualification_status = 'ready_direct'",
  'playlist_direct_confirmed_at is not null',
  'DIRECT_ALREADY_CONFIRMED',
]) {
  if (!precedenceMigration.includes(token)) {
    throw new Error(`Precedência da confirmação direta não contém: ${token}`);
  }
}

for (const token of [
  'aaa_panel_playlists_insert_qualification_seed',
  "playlist_access_mode = 'direct'",
  "playlist_cache_status = 'error'",
  'INVALID_CREDENTIALS',
]) {
  if (!insertSeedMigration.includes(token)) {
    throw new Error(`Classificação inicial não contém: ${token}`);
  }
}

for (const token of [
  'assert_playlist_commercially_usable_for_device',
  "v_device_type not in ('android', 'androidtv')",
  'panel_playlist_validation_device_capability_guard',
  'homologado somente para Android',
]) {
  if (!platformMigration.includes(token)) {
    throw new Error(`Proteção por plataforma não contém: ${token}`);
  }
}

for (const token of [
  'register_playlist_source_transaction',
  "playlist.source_fingerprint = v_fingerprint",
  'playlist.playlist_url = v_url',
  'pg_advisory_xact_lock',
  'panel_seller_playlists',
]) {
  if (!canonicalMigration.includes(token)) {
    throw new Error(`Cadastro atômico não contém: ${token}`);
  }
}

for (const token of [
  "action === 'create'",
  "action === 'retry'",
  'register_playlist_source_transaction',
  'source_fingerprint',
  'EdgeRuntime.waitUntil',
  'Esta origem já estava cadastrada',
  'Não cadastre novamente',
]) {
  if (!registration.includes(token)) throw new Error(`Cadastro canônico não contém: ${token}`);
}

for (const token of [
  "action === 'markDevice'",
  "action === 'start'",
  "action === 'revoke'",
  "['owner']",
  'start_playlist_validation_session',
  'Use um aparelho pendente e sem qualquer vínculo comercial',
]) {
  if (!validation.includes(token)) throw new Error(`Validação direta não contém: ${token}`);
}

for (const token of [
  'source_fingerprint',
  'register_playlist_source_transaction',
  'canonicalSources',
  "['owner']",
]) {
  if (!backfill.includes(token)) throw new Error(`Backfill protegido não contém: ${token}`);
}

for (const token of [
  '/device-config',
  'resolve_active_playlist_validation_session',
  'mark_playlist_direct_success',
  'validationMode: true',
  'Nenhuma venda ou vínculo de cliente será alterado',
]) {
  if (!deviceConfig.includes(token)) throw new Error(`Configuração qualificada não contém: ${token}`);
}

for (const token of [
  'playlist-registration',
  'playlist-validation',
  'commerciallyUsable',
  'requiresDeviceTest',
  'Gerar cache novamente',
  'Iniciar teste',
]) {
  if (!panel.includes(token)) throw new Error(`Painel comercial não contém: ${token}`);
}

for (const token of [
  'playlist-fingerprint-backfill',
  'localStorage.setItem',
  'sessionStorage.setItem',
  'completedAt',
]) {
  if (!backfillBootstrap.includes(token)) {
    throw new Error(`Inicialização do backfill não contém: ${token}`);
  }
}

if (!sourceModule.includes('PLAYLIST_FINGERPRINT_SECRET')) {
  throw new Error('O fingerprint não preserva o segredo histórico configurável.');
}
if (!panelGenerator.includes('playlist-commercial-qualification.js')
    || !panelGenerator.includes('playlist-fingerprint-backfill-bootstrap.js')) {
  throw new Error('O painel publicado não carrega homologação e consolidação legada.');
}
if (!androidApi.includes('/device-config-qualified')) {
  throw new Error('O Android não utiliza a configuração comercial qualificada.');
}
if (!supabaseConfig.includes('[functions.device-config-qualified]')
    || !supabaseConfig.includes('[functions.playlist-registration]')
    || !supabaseConfig.includes('[functions.playlist-validation]')
    || !supabaseConfig.includes('[functions.playlist-fingerprint-backfill]')) {
  throw new Error('As novas Edge Functions não estão configuradas.');
}

const testRequirements = [
  'Lista direta pendente é rejeitada antes da cobrança',
  'Falha de homologação preserva o saldo',
  'Sessão de validação não cria lançamento financeiro',
  'Sucesso do aparelho autorizado promove a lista',
  'Crédito é consumido somente após a homologação',
  'Alteração da origem invalida a homologação anterior',
];
for (const token of testRequirements) {
  if (!pgTap.includes(token)) throw new Error(`Teste comercial não contém: ${token}`);
}

for (const token of [
  'Tizen não consome uma lista somente direta',
  'Recusa por plataforma preserva o saldo',
  'Android pode ativar a lista direta homologada',
]) {
  if (!platformPgTap.includes(token)) throw new Error(`Teste de plataforma não contém: ${token}`);
}

for (const token of [
  'Cadastro retorna a linha legada equivalente',
  'Cadastro canônico não cria duplicata',
  'Fingerprint é preenchido no registro legado escolhido',
  'Permissão do vendedor é criada na mesma transação',
]) {
  if (!canonicalPgTap.includes(token)) throw new Error(`Teste canônico não contém: ${token}`);
}

const sensitiveLogPattern = /console\.(?:log|debug|info|warn|error)\s*\([^)]*(?:playlist_url|password|senha|username|usuario|token)/i;
for (const [name, source] of Object.entries({
  registration,
  validation,
  backfill,
  deviceConfig,
  panel,
  backfillBootstrap,
})) {
  if (sensitiveLogPattern.test(source)) {
    throw new Error(`${name} pode registrar credenciais em log.`);
  }
  if (/\beval\s*\(|\bFunction\s*\(/.test(source)) {
    throw new Error(`${name} não pode executar código dinâmico.`);
  }
}

console.log('✅ Qualificação, cadastro atômico, backfill, plataforma e crédito validados.');
