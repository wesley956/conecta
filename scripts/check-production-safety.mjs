import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = relative => fs.existsSync(path.join(root, relative));

const backupPath = path.join(root, 'scripts/production-backup.sh');
const verifyPath = path.join(root, 'scripts/verify-production-backup.sh');
const restorePath = path.join(root, 'scripts/restore-backup-to-disposable.sh');

for (const file of [backupPath, verifyPath, restorePath]) {
  assert.ok(fs.existsSync(file), `Arquivo de segurança ausente: ${path.relative(root, file)}`);
  const syntax = spawnSync('bash', ['-n', file], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, `Sintaxe Bash inválida em ${file}: ${syntax.stderr}`);
}

const backup = fs.readFileSync(backupPath, 'utf8');
const verify = fs.readFileSync(verifyPath, 'utf8');
const restore = fs.readFileSync(restorePath, 'utf8');
const gitignore = read('.gitignore');
const packageJson = JSON.parse(read('package.json'));

assert.match(backup, /set -Eeuo pipefail/);
assert.match(backup, /umask 077/);
assert.match(backup, /--role-only/);
assert.match(backup, /--data-only/);
assert.match(backup, /--use-copy/);
assert.match(backup, /INCOMPLETE/);
assert.match(backup, /READY/);
assert.match(backup, /SHA256SUMS/);
assert.match(backup, /verify-production-backup\.sh/);
assert.match(backup, /fora do repositório/);
assert.doesNotMatch(backup, /set\s+-x/);
assert.doesNotMatch(backup, /echo\s+.*RONECA_DB_URL/);

assert.match(verify, /sha256sum -c SHA256SUMS/);
assert.match(verify, /link simbólico/);
assert.match(verify, /acesso de grupo ou terceiros/);
assert.match(verify, /forbiddenKeys/);
assert.match(verify, /--pre-finalize/);
assert.doesNotMatch(verify, /set\s+-x/);

assert.match(restore, /RESTORE_TO_DISPOSABLE_DATABASE/);
assert.match(restore, /I_UNDERSTAND_THIS_ERASES_THE_TARGET/);
assert.match(restore, /awauvkjkucjqulkklmuo/);
assert.match(restore, /O banco descartável não está vazio/);
assert.match(restore, /target_id.*source_id/is);
assert.doesNotMatch(restore, /DROP\s+(DATABASE|SCHEMA)/i);
assert.doesNotMatch(restore, /set\s+-x/);

assert.match(gitignore, /(?:^|\n)backups\//);
assert.match(gitignore, /\.roneca-backups\//);
assert.match(gitignore, /\*\.dump/);

assert.equal(
  packageJson.scripts['check:production-safety'],
  'node scripts/check-production-safety.mjs',
  'package.json precisa expor check:production-safety.',
);
assert.match(packageJson.scripts.verify, /check:production-safety/);

assert.ok(exists('docs/PRODUCTION_SAFETY_GATE_2026-08-02.md'));
const runbook = read('docs/PRODUCTION_SAFETY_GATE_2026-08-02.md');
assert.match(runbook, /20260802190000_playlist_progressive_diagnostics\.sql/);
assert.match(runbook, /playlist-diagnostics/);
assert.match(runbook, /production-backup\.sh/);
assert.match(runbook, /restore-backup-to-disposable\.sh/);
assert.match(runbook, /nenhuma alteração.*aplicada automaticamente/is);

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'roneca-production-safety-'));
const backupDir = path.join(temporaryRoot, 'valid-backup');
fs.mkdirSync(backupDir, { mode: 0o700 });

try {
  const fixtures = {
    'roles.sql': '-- roles dump\nSET statement_timeout = 0;\nGRANT USAGE ON SCHEMA public TO postgres;\n',
    'schema.sql': '-- schema dump\nSET statement_timeout = 0;\nCREATE TABLE public.safety_fixture (id bigint primary key, name text);\n',
    'data.sql': '-- data dump\nSET statement_timeout = 0;\nCOPY public.safety_fixture (id, name) FROM stdin;\n1\ttest\n\\.\n',
  };

  for (const [name, content] of Object.entries(fixtures)) {
    fs.writeFileSync(path.join(backupDir, name), content, { mode: 0o600 });
  }

  const metadata = {
    schemaVersion: 1,
    createdAt: '2026-08-02T22:45:00Z',
    source: {
      host: 'aws-0-sa-east-1.pooler.supabase.com',
      port: 5432,
      database: 'postgres',
      id: crypto.createHash('sha256').update('fixture').digest('hex'),
    },
    tooling: { supabaseCli: '2.111.0', gitCommit: 'fixture' },
    files: ['roles.sql', 'schema.sql', 'data.sql'],
    containsSensitiveData: true,
  };
  fs.writeFileSync(path.join(backupDir, 'METADATA.json'), `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 });

  const protectedNames = ['roles.sql', 'schema.sql', 'data.sql', 'METADATA.json'];
  const checksums = protectedNames.map(name => {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(backupDir, name))).digest('hex');
    return `${hash}  ${name}`;
  }).join('\n');
  fs.writeFileSync(path.join(backupDir, 'SHA256SUMS'), `${checksums}\n`, { mode: 0o600 });
  fs.writeFileSync(path.join(backupDir, 'READY'), 'fixture ready\n', { mode: 0o600 });

  const valid = spawnSync('bash', [verifyPath, backupDir], { encoding: 'utf8' });
  assert.equal(valid.status, 0, `Backup válido foi rejeitado:\n${valid.stdout}\n${valid.stderr}`);

  fs.appendFileSync(path.join(backupDir, 'data.sql'), '-- tampered\n');
  const tampered = spawnSync('bash', [verifyPath, backupDir], { encoding: 'utf8' });
  assert.notEqual(tampered.status, 0, 'Backup adulterado deveria ser rejeitado.');
  assert.match(`${tampered.stdout}\n${tampered.stderr}`, /SHA-256|assinatura/i);

  const blockedRestore = spawnSync('bash', [restorePath, backupDir], {
    encoding: 'utf8',
    env: {
      ...process.env,
      RONECA_RESTORE_TARGET_URL: 'postgresql://user:password@127.0.0.1:5432/disposable',
      RONECA_RESTORE_CONFIRM: '',
    },
  });
  assert.notEqual(blockedRestore.status, 0, 'Restauração sem confirmação deveria ser bloqueada.');
  assert.match(`${blockedRestore.stdout}\n${blockedRestore.stderr}`, /RONECA_RESTORE_CONFIRM/);

  const noSecretEnv = { ...process.env, HOME: temporaryRoot };
  delete noSecretEnv.RONECA_DB_URL;
  delete noSecretEnv.RONECA_BACKUP_DIR;
  delete noSecretEnv.RONECA_BACKUP_ROOT;
  const blockedBackup = spawnSync('bash', [backupPath], {
    encoding: 'utf8',
    input: '',
    env: noSecretEnv,
  });
  assert.notEqual(blockedBackup.status, 0, 'Backup sem URL segura deveria falhar fechado.');
  assert.match(`${blockedBackup.stdout}\n${blockedBackup.stderr}`, /RONECA_DB_URL/);
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

console.log('Production safety gate: OK');
