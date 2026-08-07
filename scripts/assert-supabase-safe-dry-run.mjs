import fs from 'node:fs';
import path from 'node:path';

const logPath = process.argv[2];
if (!logPath) throw new Error('Informe o arquivo de saída do `supabase db push --dry-run`.');
if (!fs.existsSync(logPath)) throw new Error(`Dry-run não encontrado: ${logPath}`);

const migrationsDir = 'supabase/migrations';
const firstLote6Version = '20260807200000';
const dryRun = fs.readFileSync(logPath, 'utf8');

const historical = fs.readdirSync(migrationsDir)
  .filter(name => /^\d+_.+\.sql$/.test(name))
  .map(name => ({
    name,
    version: name.match(/^(\d+)_/)?.[1] || '',
  }))
  .filter(item => item.version && item.version < firstLote6Version);

const mentioned = historical.filter(item => {
  const escapedName = item.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedVersion = item.version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:${escapedName}|\\b${escapedVersion}\\b)`).test(dryRun);
});

if (mentioned.length > 0) {
  const details = mentioned.map(item => `- ${item.name}`).join('\n');
  throw new Error(
    `Preflight bloqueado: o Supabase considera migration(s) histórica(s) anterior(es) ao Lote 6 como pendente(s). ` +
    `Alinhe o baseline remoto com migration repair antes de publicar:\n${details}`,
  );
}

const suspiciousReset = /db\s+reset|drop\s+database|include-seed/i.test(dryRun);
if (suspiciousReset) {
  throw new Error('Preflight bloqueado: saída do dry-run contém operação destrutiva ou seed inesperado.');
}

console.log(`✅ Dry-run seguro: nenhuma migration histórica anterior a ${firstLote6Version} apareceu como pendente.`);
console.log(`   Arquivo analisado: ${path.basename(logPath)}`);
