import fs from 'node:fs';

const workflowPath = '.github/workflows/deploy-supabase-production.yml';
if (!fs.existsSync(workflowPath)) throw new Error('Workflow de produção do Supabase ausente.');
const source = fs.readFileSync(workflowPath, 'utf8');

for (const token of [
  "vars.SUPABASE_PRODUCTION_DEPLOY_ENABLED == 'true'",
  'secrets.SUPABASE_ACCESS_TOKEN',
  'secrets.SUPABASE_DB_PASSWORD',
  'secrets.SUPABASE_PROJECT_ID',
  'supabase link --project-ref',
  'supabase db push --dry-run',
  'supabase db push',
  'supabase functions deploy --project-ref',
  'cancel-in-progress: false',
  'persist-credentials: false',
]) {
  if (!source.includes(token)) throw new Error(`Proteção do deploy Supabase ausente: ${token}`);
}

const dryRun = source.indexOf('supabase db push --dry-run');
const apply = source.indexOf('supabase db push\n', dryRun + 1);
const functions = source.indexOf('supabase functions deploy --project-ref');
if (dryRun < 0 || apply < 0 || functions < 0 || !(dryRun < apply && apply < functions)) {
  throw new Error('A ordem obrigatória é preflight → migrations → Edge Functions.');
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

console.log('✅ Deploy Supabase protegido: gate explícito, secrets externos e preflight antes de migrations/Edges.');
