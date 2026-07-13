import fs from 'node:fs';
import path from 'node:path';

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Variável ${name} não configurada.`);
  return value;
}

const supabaseUrl = requiredEnv('SUPABASE_URL').replace(/\/$/, '');
const anonKey = requiredEnv('SUPABASE_ANON_KEY');

if (!/^https:\/\//i.test(supabaseUrl)) {
  throw new Error('SUPABASE_URL precisa usar HTTPS.');
}

if (anonKey.length < 40) {
  throw new Error('SUPABASE_ANON_KEY parece inválida.');
}

const payload = `// Gerado automaticamente. Não editar nem versionar.\n` +
  `window.RONECA_PANEL_CONFIG = Object.freeze(${JSON.stringify({
    supabaseUrl,
    anonKey,
  }, null, 2)});\n`;

const outputs = [
  path.resolve('admin-panel/panel-config.js'),
  path.resolve('public/panel-config.js'),
];

for (const output of outputs) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, payload, { encoding: 'utf8', mode: 0o600 });
  console.log(`Configuração pública gerada: ${path.relative(process.cwd(), output)}`);
}
