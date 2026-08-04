import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

const migration = read('supabase/migrations/20260801060000_diagnostics_security_hardening.sql');
const matrixMigration = read('supabase/migrations/20260804044000_provider_compatibility_matrix_attempts.sql');
const safety = read('supabase/functions/_shared/diagnosticSafety.ts');
const report = read('supabase/functions/playback-diagnostics-report/index.ts');
const matrixReport = read('supabase/functions/playlist-provider-attempt-report/index.ts');
const deviceConfig = read('supabase/functions/device-config/index.ts');
const deviceActivate = read('supabase/functions/device-activate/index.ts');
const cache = read('supabase/functions/playlist-cache/index.ts');
const cleanup = read('supabase/functions/seller-auth-cleanup/index.ts');
const panel = read('supabase/functions/playback-diagnostics-panel/index.ts');
const panelUi = read('admin-panel/playback-diagnostics-module.js');
const smartSession = read('smart-tv/src/deviceSession.ts');
const smartCatalog = read('smart-tv/src/catalog.ts');
const androidRepository = read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/activation/DeviceSessionRepository.kt');
const androidAttemptApi = read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/network/ProviderAttemptApi.kt');
const androidCatalogClient = read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/catalog/CatalogPartClient.kt');
const androidCatalogViewModel = read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/catalog/CatalogViewModel.kt');
const androidApp = read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/RonecaPlayTVApp.kt');
const supabaseConfig = read('supabase/config.toml');

for (const field of ['correlation_id', 'failover_attempt_id', 'cache_attempt_id']) {
  expect(migration.includes(field), `Migration sem o campo ${field}.`);
}
expect(migration.includes('redact_sensitive_text'), 'Saneamento textual do banco ausente.');
expect(migration.includes('redact_sensitive_jsonb'), 'Saneamento JSON do banco ausente.');
expect(migration.includes('sanitize_panel_audit_log_trigger'), 'Auditorias novas não são saneadas.');
expect(migration.includes('update public.panel_audit_logs'), 'Histórico de auditoria não é saneado.');
expect(migration.includes("interval '7 days'"), 'Janela adicional de recuperação Auth ausente.');
expect(migration.includes('for update skip locked'), 'Fila Auth não possui claim concorrente seguro.');
expect(!migration.includes('delete from auth.users'), 'Migration não pode excluir diretamente auth.users.');

for (const source of [safety, report, deviceConfig, cache, matrixReport]) {
  expect(source.includes('safeDiagnostic'), 'Entrada ou saída diagnóstica sem saneamento compartilhado.');
}
expect(!deviceConfig.includes("supabase-js@2'"), 'device-config não pode depender de versão flutuante do SDK.');
expect(!deviceActivate.includes("supabase-js@2'"), 'device-activate não pode depender de versão flutuante do SDK.');
expect(report.includes('cache_attempt_id'), 'Relatório não liga falha à tentativa de cache.');
expect(report.includes('failover_attempt_id'), 'Relatório não liga falha ao failover.');
expect(deviceConfig.includes('last_correlation_id'), 'Saúde da lista não persiste correlação.');
expect(cache.includes('correlationId: `cache:${lease.attemptId}`'), 'Cache não devolve correlação segura.');

expect(cleanup.includes("requirePanelPrincipal(request, supabase, ['owner', 'admin'])"), 'Cleanup Auth não protege invocação administrativa.');
expect(cleanup.includes("rpc('claim_seller_auth_deletions'"), 'Cleanup Auth não usa claim idempotente.');
expect(cleanup.includes('supabase.auth.admin.deleteUser'), 'Cleanup Auth não remove o usuário pelo Admin API.');
expect(!cleanup.includes("from('auth.users')"), 'Cleanup Auth não pode consultar auth.users diretamente.');

for (const field of ['correlationId', 'failoverAttemptId', 'cacheAttemptId']) {
  expect(panel.includes(field), `Resposta administrativa sem ${field}.`);
  expect(panelUi.includes(field), `Detalhe administrativo sem ${field}.`);
}
expect(smartSession.includes('correlationId?: string'), 'Smart TV não envia correlação.');
expect(smartCatalog.includes('correlationId: attemptId'), 'Failover Smart TV não compartilha a tentativa.');
expect(androidRepository.includes('correlationId: String'), 'Android não envia correlação tipada.');
expect(androidApp.includes('correlationId = attemptId'), 'Failover Android não compartilha a tentativa.');

expect(matrixMigration.includes('create table if not exists public.playlist_provider_attempts'), 'Tabela da matriz ausente.');
expect(matrixMigration.includes('enable row level security'), 'Matriz sem RLS.');
expect(matrixMigration.includes('revoke all on table public.playlist_provider_attempts from anon, authenticated'), 'Matriz exposta aos clientes.');
expect(matrixMigration.includes("position('?' in host_snapshot) = 0"), 'Banco não bloqueia query no host da matriz.');
expect(matrixMigration.includes("position('@' in path_snapshot) = 0"), 'Banco não bloqueia credencial no caminho da matriz.');
expect(matrixReport.includes(".eq('playlist_id', playlistId)"), 'Endpoint não confirma vínculo da lista com o aparelho.');
expect(matrixReport.includes('constantTimeEqual'), 'Endpoint não valida credencial em tempo constante.');
expect(matrixReport.includes('safeHost(payload.host)'), 'Endpoint não sanitiza host.');
expect(matrixReport.includes('safePath(payload.path)'), 'Endpoint não sanitiza caminho.');
expect(!matrixReport.includes('playlist_url'), 'Endpoint da matriz não deve consultar ou devolver URL completa.');
expect(supabaseConfig.includes('[functions.playlist-provider-attempt-report]'), 'Função da matriz não está configurada.');
expect(androidAttemptApi.includes('/playlist-provider-attempt-report'), 'Android não envia tentativas para o endpoint dedicado.');
expect(androidRepository.includes('reportProviderAttempt'), 'Repositório Android não autentica o relatório da matriz.');
expect(androidCatalogClient.includes('ProviderAttemptContext'), 'Carregador Android não agrupa tentativas da matriz.');
expect(androidCatalogClient.includes('items != null'), 'M3U vazia ainda pode interromper a matriz cedo demais.');
expect(androidCatalogClient.includes('strategyKey('), 'Android não identifica a combinação testada.');
expect(androidCatalogViewModel.includes('matrixCorrelationId'), 'Seções do catálogo não compartilham correlação.');

console.log('Correlação, saneamento, matriz de compatibilidade e limpeza Auth recuperável validados.');
