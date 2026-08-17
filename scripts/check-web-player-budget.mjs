import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'web-player', 'dist');
const indexPath = path.join(dist, 'index.html');

if (!fs.existsSync(indexPath)) {
  throw new Error('Build do Web Player ausente. Rode o build antes do budget gate.');
}

const indexHtml = fs.readFileSync(indexPath, 'utf8');
const scripts = [...indexHtml.matchAll(/<script[^>]+type=["']module["'][^>]+src=["']([^"']+\.js)["'][^>]*>/gi)]
  .map(match => match[1]);
if (scripts.length !== 1) {
  throw new Error(`Esperado exatamente 1 entry module no index.html; encontrados ${scripts.length}.`);
}

const normalizeAsset = src => {
  const withoutBase = src.replace(/^\/web\//, '').replace(/^\.\//, '').replace(/^\//, '');
  return path.join(dist, withoutBase);
};
const entryPath = normalizeAsset(scripts[0]);
if (!fs.existsSync(entryPath)) throw new Error(`Entry JS não encontrado: ${entryPath}`);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

const rows = walk(dist)
  .filter(file => file.endsWith('.js'))
  .map(file => ({
    file,
    name: path.basename(file),
    relative: path.relative(dist, file).replaceAll(path.sep, '/'),
    bytes: fs.statSync(file).size,
  }))
  .sort((a, b) => a.relative.localeCompare(b.relative));
if (!rows.length) throw new Error('Nenhum JavaScript foi gerado no build do Web Player.');

const totalBytes = rows.reduce((sum, item) => sum + item.bytes, 0);
const entryBytes = fs.statSync(entryPath).size;
const shellBytes = rows
  .filter(item => item.relative.startsWith('assets/'))
  .reduce((sum, item) => sum + item.bytes, 0);
const mediaEngine = rows.find(item => item.name.startsWith('media-engine-'));
const playerCore = rows.find(item => item.name.startsWith('WebPlayerCore-'));

const ENTRY_LIMIT = 330_000;
const SHELL_LIMIT = 700_000;
const MEDIA_ENGINE_LIMIT = 600_000;
const PLAYER_CORE_LIMIT = 130_000;
const TOTAL_LIMIT = 810_000;

console.log('Web Player JS budget:');
for (const row of rows) console.log(` - ${row.relative}: ${row.bytes} bytes`);
console.log(`Entry inicial: ${entryBytes} bytes`);
console.log(`Shell em assets/: ${shellBytes} bytes`);
console.log(`Total JS: ${totalBytes} bytes`);

const failures = [];
if (entryBytes > ENTRY_LIMIT) failures.push(`entry inicial excedeu ${ENTRY_LIMIT} bytes (${entryBytes})`);
if (shellBytes > SHELL_LIMIT) failures.push(`shell assets excedeu ${SHELL_LIMIT} bytes (${shellBytes})`);
if (totalBytes > TOTAL_LIMIT) failures.push(`total JS excedeu ${TOTAL_LIMIT} bytes (${totalBytes})`);
if (!mediaEngine) {
  failures.push('chunk media-engine não foi gerado; HLS voltou ao carregamento inicial');
} else {
  if (!mediaEngine.relative.startsWith('media/')) failures.push('media-engine precisa permanecer no diretório lazy media/');
  if (mediaEngine.bytes > MEDIA_ENGINE_LIMIT) failures.push(`media-engine excedeu ${MEDIA_ENGINE_LIMIT} bytes (${mediaEngine.bytes})`);
  if (indexHtml.includes(mediaEngine.name)) failures.push('media-engine está referenciado pelo index.html e deixou de ser lazy');
}
if (playerCore && playerCore.bytes > PLAYER_CORE_LIMIT) {
  failures.push(`WebPlayerCore excedeu ${PLAYER_CORE_LIMIT} bytes (${playerCore.bytes})`);
}

if (failures.length) {
  console.error('Web Player performance budget FAILED');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log('✅ Budget validado: shell inicial separado do engine HLS e limites de regressão ativos.');
