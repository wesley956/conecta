import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

const migration = read('supabase/migrations/20260801060000_diagnostics_security_hardening.sql');
const safety = read('supabase/functions/_shared/diagnosticSafety.ts');
const report = read('supabase/functions/playback-diagnostics-report/index.ts');
const deviceConfig = read('supabase/functions/device-config/index.ts');
const deviceActivate = read('supabase/functions/device-activate/index.ts');
const cache = read('supabase/functions/playlist-cache/index.ts');
const cleanup = read('supabase/functions/seller-auth-cleanup/index.ts');
const panel = read('supabase/functions/playback-diagnostics-panel/index.ts');
const panelUi = read('admin-panel/playback-diagnostics-module.js');
const smartSession = read('smart-tv/src/deviceSession.ts');
const smartCatalog = read('smart-tv/src/catalog.ts');
const androidRepository = read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/activation/DeviceSessionRepository.kt');
const androidApp = read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/RonecaPlayTVApp.kt');

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

for (const source of [safety, report, deviceConfig, cache]) {
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

console.log('Correlação, saneamento e limpeza Auth recuperável validados.');
