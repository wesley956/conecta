import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const workflowPath = '.github/workflows/deploy-supabase-production.yml';
const guardPath = 'scripts/assert-supabase-safe-dry-run.mjs';
if (!fs.existsSync(workflowPath)) throw new Error('Workflow de produção do Supabase ausente.');
if (!fs.existsSync(guardPath)) throw new Error('Analisador de dry-run do Supabase ausente.');

const source = fs.readFileSync(workflowPath, 'utf8');
const guard = fs.readFileSync(guardPath, 'utf8');

for (const token of [
  "vars.SUPABASE_PRODUCTION_DEPLOY_ENABLED == 'true'",
  'secrets.SUPABASE_ACCESS_TOKEN',
  'secrets.SUPABASE_DB_PASSWORD',
  'secrets.SUPABASE_PROJECT_ID',
  'supabase link --project-ref',
  'supabase db push --dry-run',
  'scripts/assert-supabase-safe-dry-run.mjs',
  'supabase db push',
  'supabase functions deploy --project-ref',
  'cancel-in-progress: false',
  'persist-credentials: false',
]) {
  if (!source.includes(token)) throw new Error(`Proteção do deploy Supabase ausente: ${token}`);
}

const dryRun = source.indexOf('supabase db push --dry-run');
const analyzer = source.indexOf('scripts/assert-supabase-safe-dry-run.mjs', dryRun + 1);
const apply = source.indexOf('supabase db push\n', analyzer + 1);
const functions = source.indexOf('supabase functions deploy --project-ref');
if (dryRun < 0 || analyzer < 0 || apply < 0 || functions < 0 || !(dryRun < analyzer && analyzer < apply && apply < functions)) {
  throw new Error('A ordem obrigatória é dry-run → análise de histórico → migrations → Edge Functions.');
}

for (const forbidden of [
  'awauvkjkucjqulkklmuo',
  'SUPABASE_ACCESS_TOKEN: sbp_',
  'SUPABASE_DB_PASSWORD: postgres',
  'db reset --linked',
  '--include-seed',
]) {
  if (source.includes(forbidden)) throw new Error(`Workflow de produção contém configuração proibida: ${forbidden}`);
}

for (const token of [
  "const firstLote6Version = '20260807200000'",
  'Preflight bloqueado',
  'migration repair',
  'historical',
]) {
  if (!guard.includes(token)) throw new Error(`Analisador de dry-run incompleto: ${token}`);
}

const historicalName = fs.readdirSync('supabase/migrations')
  .filter(name => /^\d+_.+\.sql$/.test(name))
  .sort()
  .find(name => String(name.match(/^(\d+)_/)?.[1] || '') < '20260807200000');
if (!historicalName) throw new Error('Fixture histórica de migration não encontrada para validar o bloqueio.');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roneca-supabase-preflight-'));
try {
  const safeLog = path.join(tempDir, 'safe.log');
  fs.writeFileSync(safeLog, 'DRY RUN\nWould push migration 20260807200000_lote6_atomic_admin_credit_adjustment.sql\n');
  const safe = spawnSync(process.execPath, [guardPath, safeLog], { encoding: 'utf8' });
  if (safe.status !== 0) throw new Error(`Analisador rejeitou um dry-run seguro:\n${safe.stderr || safe.stdout}`);

  const unsafeLog = path.join(tempDir, 'unsafe.log');
  fs.writeFileSync(unsafeLog, `DRY RUN\nWould push migration ${historicalName}\n`);
  const unsafe = spawnSync(process.execPath, [guardPath, unsafeLog], { encoding: 'utf8' });
  if (unsafe.status === 0) throw new Error('Analisador permitiu uma migration histórica no dry-run.');
  if (!`${unsafe.stderr}\n${unsafe.stdout}`.includes('Preflight bloqueado')) {
    throw new Error(`Falha histórica não produziu a mensagem esperada:\n${unsafe.stderr || unsafe.stdout}`);
  }
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('✅ Deploy Supabase protegido: gate explícito, dry-run analisado, histórico antigo bloqueado e Edges só depois das migrations.');
