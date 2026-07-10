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
const auditNotes = [];

function read(path) {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) {
    errors.push(`Arquivo obrigatório ausente: ${path}`);
    return '';
  }
  return readFileSync(absolute, 'utf8');
}

function collectMatches(text, regex, group = 1) {
  const values = [];
  let match;
  while ((match = regex.exec(text))) values.push(match[group]);
  return values;
}

function localReferences(html) {
  return collectMatches(html, /(?:src|href)=["']([^"']+)["']/g)
    .map(value => value.trim())
    .filter(value => value && !/^(?:https?:|data:|mailto:|tel:|#)/i.test(value))
    .map(value => value.split(/[?#]/)[0]);
}

function htmlIds(html) {
  return collectMatches(html, /\bid=["']([^"']+)["']/g);
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function inlineScripts(html) {
  const scripts = [];
  const regex = /<script(?![^>]+\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html))) scripts.push(match[1]);
  return scripts;
}

function checkJavaScript(source, label) {
  if (!source.trim()) return;
  const result = spawnSync(process.execPath, ['--check'], {
    input: source,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    errors.push(`${label}: JavaScript inválido: ${(result.stderr || result.stdout).trim()}`);
  }
}

function countWord(text, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (text.match(new RegExp(`\\b${escaped}\\b`, 'g')) || []).length;
}

function auditDashboard(html) {
  const ids = new Set(htmlIds(html));
  const scripts = inlineScripts(html);
  const script = scripts.join('\n');

  const staticDomRefs = new Set([
    ...collectMatches(script, /\$\(\s*["']([^"']+)["']\s*\)/g),
    ...collectMatches(script, /getElementById\(\s*["']([^"']+)["']\s*\)/g),
    ...collectMatches(script, /querySelector\(\s*["']#([^"']+)["']\s*\)/g),
  ]);

  const missingIds = [...staticDomRefs].filter(id => !ids.has(id));
  if (missingIds.length) {
    errors.push(`admin-panel/dashboard.html: referências a IDs inexistentes: ${missingIds.join(', ')}`);
  }

  const functionNames = collectMatches(script, /\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g);
  const duplicateFunctions = duplicateValues(functionNames);
  if (duplicateFunctions.length) {
    errors.push(`admin-panel/dashboard.html: funções declaradas mais de uma vez: ${duplicateFunctions.join(', ')}`);
  }

  const handlerBodies = collectMatches(html, /\son(?:click|change|input|submit|keydown)=["']([^"']+)["']/gi);
  const handlerFunctions = new Set();
  for (const body of handlerBodies) {
    const directCall = body.trim().match(/^([A-Za-z_$][\w$]*)\s*\(/);
    if (directCall) handlerFunctions.add(directCall[1]);
  }

  const declared = new Set(functionNames);
  const missingHandlers = [...handlerFunctions].filter(name => !declared.has(name));
  if (missingHandlers.length) {
    errors.push(`admin-panel/dashboard.html: ações HTML sem função declarada: ${missingHandlers.join(', ')}`);
  }

  const unusedCandidates = [...declared]
    .filter(name => countWord(html, name) === 1)
    .sort();

  if (unusedCandidates.length) {
    warnings.push(`admin-panel/dashboard.html: possíveis funções sem uso: ${unusedCandidates.join(', ')}`);
  }

  auditNotes.push(
    `Dashboard admin: ${ids.size} IDs, ${functionNames.length} funções, ${handlerBodies.length} ações inline e ${staticDomRefs.size} referências estáticas ao DOM.`,
  );
}

for (const path of htmlFiles) {
  const html = read(path);
  if (!html) continue;

  const duplicates = duplicateValues(htmlIds(html));
  if (duplicates.length) errors.push(`${path}: IDs duplicados: ${duplicates.join(', ')}`);

  for (const reference of localReferences(html)) {
    const target = resolve(root, dirname(path), reference);
    if (!existsSync(target)) errors.push(`${path}: referência local inexistente: ${reference}`);
  }

  inlineScripts(html).forEach((script, index) => {
    checkJavaScript(script, `${path} script inline ${index + 1}`);
  });

  if (path === 'admin-panel/seller.html') {
    if (/<style\b/i.test(html)) errors.push(`${path}: CSS inline voltou a ser usado.`);
    if (/<script(?![^>]+\bsrc=)[^>]*>/i.test(html)) errors.push(`${path}: JavaScript inline voltou a ser usado.`);
    if (/\son[a-z]+\s*=/i.test(html)) errors.push(`${path}: manipulador inline on*= voltou a ser usado.`);
  }

  if (path === 'admin-panel/dashboard.html') {
    auditDashboard(html);
    const lines = html.split(/\r?\n/).length;
    if (lines > 3500) warnings.push(`${path}: arquivo cresceu além de 3500 linhas; considere nova extração modular.`);
    auditNotes.push(`Dashboard admin: ${lines} linhas no HTML principal.`);
  }
}

for (const path of jsFiles) {
  const source = read(path);
  if (source) checkJavaScript(source, path);
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

if (auditNotes.length) {
  console.log('\nResumo da auditoria:');
  auditNotes.forEach(item => console.log(`- ${item}`));
}

if (warnings.length) {
  console.log('\nAvisos para revisão humana:');
  warnings.forEach(item => console.log(`- ${item}`));
}

if (errors.length) {
  console.error('\nFalhas na auditoria dos painéis:');
  errors.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

console.log(`\n✅ Painéis validados: ${htmlFiles.length} HTML, ${jsFiles.length} JS e ${cssFiles.length} CSS.`);
