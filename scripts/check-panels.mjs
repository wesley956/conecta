import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const htmlFiles = [
  'admin-panel/index.html',
  'admin-panel/dashboard.html',
  'admin-panel/seller.html',
  'public/vendedor.html',
];
const jsFiles = ['admin-panel/seller.js'];
const cssFiles = [
  'admin-panel/pro-panel.css',
  'admin-panel/panel-ux.css',
  'admin-panel/panel-next-ux.css',
  'admin-panel/seller.css',
];
const forbiddenLegacyFiles = [
  'admin-panel/panel-ux.js',
  'admin-panel/seller-portal-ux.js',
  'admin-panel/seller-lists-ux.js',
  'admin-panel/seller-portal-ux.css',
  'admin-panel/seller-lists-ux.css',
  'scripts/apply-panel-redesign-links.cjs',
  'scripts/apply-panel-next-ux.cjs',
  'scripts/apply-commercial-structural-ux.cjs',
];

const errors = [];
const warnings = [];

function read(path) {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) {
    errors.push(`Arquivo obrigatório ausente: ${path}`);
    return '';
  }
  return readFileSync(absolute, 'utf8');
}

function localReferences(html) {
  const refs = [];
  const regex = /(?:src|href)=["']([^"']+)["']/g;
  let match;
  while ((match = regex.exec(html))) {
    const value = match[1].trim();
    if (!value || /^(?:https?:|data:|mailto:|tel:|#)/i.test(value)) continue;
    refs.push(value.split(/[?#]/)[0]);
  }
  return refs;
}

function duplicateIds(html) {
  const seen = new Set();
  const duplicates = new Set();
  const regex = /\bid=["']([^"']+)["']/g;
  let match;
  while ((match = regex.exec(html))) {
    if (seen.has(match[1])) duplicates.add(match[1]);
    seen.add(match[1]);
  }
  return [...duplicates];
}

for (const path of htmlFiles) {
  const html = read(path);
  if (!html) continue;

  const duplicates = duplicateIds(html);
  if (duplicates.length) errors.push(`${path}: IDs duplicados: ${duplicates.join(', ')}`);

  for (const reference of localReferences(html)) {
    const target = resolve(root, dirname(path), reference);
    if (!existsSync(target)) {
      errors.push(`${path}: referência local inexistente: ${reference}`);
    }
  }

  if (path === 'admin-panel/seller.html') {
    if (/<style\b/i.test(html)) errors.push(`${path}: CSS inline voltou a ser usado.`);
    if (/<script(?![^>]+\bsrc=)[^>]*>/i.test(html)) errors.push(`${path}: JavaScript inline voltou a ser usado.`);
    if (/\son[a-z]+\s*=/i.test(html)) errors.push(`${path}: manipulador inline on*= voltou a ser usado.`);
  }

  if (path === 'admin-panel/dashboard.html' && html.split(/\r?\n/).length > 3500) {
    warnings.push(`${path}: arquivo cresceu além de 3500 linhas; considere nova extração modular.`);
  }
}

for (const path of jsFiles) {
  read(path);
  const result = spawnSync(process.execPath, ['--check', resolve(root, path)], { encoding: 'utf8' });
  if (result.status !== 0) errors.push(`${path}: JavaScript inválido: ${result.stderr.trim()}`);
}

for (const path of cssFiles) {
  const css = read(path);
  if (!css) continue;
  const opening = (css.match(/\{/g) || []).length;
  const closing = (css.match(/\}/g) || []).length;
  if (opening !== closing) errors.push(`${path}: chaves CSS desbalanceadas (${opening}/${closing}).`);
}

for (const path of forbiddenLegacyFiles) {
  if (existsSync(resolve(root, path))) errors.push(`Arquivo legado deveria ter sido removido: ${path}`);
}

if (warnings.length) {
  console.log('\nAvisos:');
  warnings.forEach(item => console.log(`- ${item}`));
}

if (errors.length) {
  console.error('\nFalhas na auditoria dos painéis:');
  errors.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

console.log(`✅ Painéis validados: ${htmlFiles.length} HTML, ${jsFiles.length} JS e ${cssFiles.length} CSS.`);
