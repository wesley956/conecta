const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();

const targets = [
  'admin-panel/index.html',
  'admin-panel/dashboard.html',
  'admin-panel/seller.html',
  'public/vendedor.html',
];

function stylesheetFor(file) {
  if (file.startsWith('admin-panel/')) return './pro-panel.css';
  return '../admin-panel/pro-panel.css';
}

function apply(file) {
  const fullPath = path.join(root, file);

  if (!fs.existsSync(fullPath)) {
    console.log(`Ignorado: ${file} não existe.`);
    return;
  }

  let html = fs.readFileSync(fullPath, 'utf8');
  const href = stylesheetFor(file);
  const tag = `<link rel="stylesheet" href="${href}" />`;

  if (html.includes(tag) || html.includes('pro-panel.css')) {
    console.log(`OK: ${file} já importa pro-panel.css.`);
    return;
  }

  if (!html.includes('</head>')) {
    console.log(`Aviso: ${file} não tem </head>. Nenhuma alteração feita.`);
    return;
  }

  html = html.replace('</head>', `  ${tag}\n</head>`);
  fs.writeFileSync(fullPath, html);
  console.log(`Aplicado: ${file}`);
}

for (const target of targets) {
  apply(target);
}
