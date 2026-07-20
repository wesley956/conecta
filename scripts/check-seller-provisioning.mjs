import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const frontendPath = 'admin-panel/seller-provisioning.js';
const backendPath = 'supabase/functions/seller-provision/index.ts';
const configPath = 'supabase/config.toml';
const generatorPath = 'scripts/generate-panel-config.mjs';

for (const file of [frontendPath, backendPath, configPath, generatorPath]) {
  if (!fs.existsSync(file)) throw new Error(`Arquivo obrigatório ausente: ${file}`);
}

execFileSync(process.execPath, ['--check', frontendPath], { stdio: 'inherit' });
execFileSync(process.execPath, ['--check', generatorPath], { stdio: 'inherit' });

const frontend = fs.readFileSync(frontendPath, 'utf8');
const backend = fs.readFileSync(backendPath, 'utf8');
const config = fs.readFileSync(configPath, 'utf8');
const generator = fs.readFileSync(generatorPath, 'utf8');

const requiredFrontendSnippets = [
  "type = 'password'",
  "autocomplete = 'new-password'",
  "supabaseUrl + '/functions/v1/' + functionName",
  "callProtectedFunction('seller-provision'",
  "RonecaPanelAuth.getAccessToken()",
  'password: password',
  'global.createSeller =',
  'global.submitCommercialSeller =',
];

const requiredBackendSnippets = [
  "requirePanelPrincipal(request, supabase, ['admin'])",
  'supabase.auth.admin.createUser',
  "p_role: 'seller'",
  'p_seller_id: createdSellerId',
  'supabase.auth.admin.deleteUser(createdUserId)',
  "const auditAction = existingSellerId ? 'seller.login_migrated' : 'seller.provisioned'",
  'action: auditAction',
];

for (const snippet of requiredFrontendSnippets) {
  if (!frontend.includes(snippet)) throw new Error(`Provisionamento frontend incompleto: ${snippet}`);
}

for (const snippet of requiredBackendSnippets) {
  if (!backend.includes(snippet)) throw new Error(`Provisionamento backend incompleto: ${snippet}`);
}

const sellerInsert = backend.match(/\.from\('panel_sellers'\)[\s\S]*?\.insert\(\{([\s\S]*?)\}\)/)?.[1] || '';
if (!sellerInsert) throw new Error('Não foi possível localizar o insert comercial do vendedor.');
if (/\bpassword\s*:/.test(sellerInsert)) {
  throw new Error('A senha não pode ser persistida em panel_sellers.');
}

if (!config.includes('[functions.seller-provision]\nverify_jwt = true')) {
  throw new Error('seller-provision precisa exigir JWT no gateway.');
}
if (!config.includes('[functions.seller-panel]\nverify_jwt = true')) {
  throw new Error('seller-panel precisa exigir JWT no gateway.');
}
if (!generator.includes('seller-provisioning.js')) {
  throw new Error('O dashboard não carrega seller-provisioning.js.');
}

console.log('✅ Provisionamento de vendedor com Auth validado.');
