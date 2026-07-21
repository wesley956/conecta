import fs from 'node:fs';
import path from 'node:path';

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Variável ${name} não configurada.`);
  return value;
}

const rawSupabaseUrl = requiredEnv('SUPABASE_URL');
const anonKey = requiredEnv('SUPABASE_ANON_KEY');
let parsedUrl;

try {
  parsedUrl = new URL(rawSupabaseUrl);
} catch {
  throw new Error('SUPABASE_URL inválida.');
}

if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password) {
  throw new Error('SUPABASE_URL precisa usar HTTPS e não pode conter credenciais.');
}

if (anonKey.length < 40 || anonKey.length > 16 * 1024) {
  throw new Error('SUPABASE_ANON_KEY parece inválida.');
}

const payload = `// Gerado automaticamente. Não editar nem versionar.\n` +
  `window.RONECA_PANEL_CONFIG = Object.freeze(${JSON.stringify({
    supabaseUrl: parsedUrl.origin,
    anonKey,
  }, null, 2)});\n` +
  `(function loadSellerProvisioning(){\n` +
  `  if (!/\\/dashboard\\.html$/.test(window.location.pathname)) return;\n` +
  `  var script = document.createElement('script');\n` +
  `  script.src = './seller-provisioning.js?v=1.2';\n` +
  `  script.async = false;\n` +
  `  document.head.appendChild(script);\n` +
  `})();\n` +
  `(function loadInlinePlaylistActivation(){\n` +
  `  if (!/\\/(dashboard|seller)\\.html$/.test(window.location.pathname)) return;\n` +
  `  var script = document.createElement('script');\n` +
  `  script.src = './inline-playlist-activation.js?v=1.0';\n` +
  `  script.async = false;\n` +
  `  document.head.appendChild(script);\n` +
  `})();\n` +
  `(function loadFinanceModule(){\n` +
  `  if (!/\\/(dashboard|seller)\\.html$/.test(window.location.pathname)) return;\n` +
  `  var script = document.createElement('script');\n` +
  `  script.src = './finance-module.js?v=1.0';\n` +
  `  script.async = false;\n` +
  `  document.head.appendChild(script);\n` +
  `})();\n`;

const outputs = [
  path.resolve('admin-panel/panel-config.js'),
  path.resolve('public/panel-config.js'),
];

for (const output of outputs) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, payload, { encoding: 'utf8', mode: 0o644 });
  console.log(`Configuração pública gerada: ${path.relative(process.cwd(), output)}`);
}
