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

function uxStylesheetFor(file) {
  if (file === 'admin-panel/dashboard.html') return './panel-ux.css';
  return null;
}

function uxScriptFor(file) {
  if (file === 'admin-panel/dashboard.html') return './panel-ux.js';
  return null;
}

function ensureHeadLink(html, href, label) {
  const tag = `<link rel="stylesheet" href="${href}" />`;

  if (html.includes(tag) || html.includes(href)) {
    return { html, changed: false, message: `OK: ${label} já está importado.` };
  }

  if (!html.includes('</head>')) {
    return { html, changed: false, message: `Aviso: não encontrei </head> para ${label}.` };
  }

  return {
    html: html.replace('</head>', `  ${tag}\n</head>`),
    changed: true,
    message: `Aplicado: ${label}`,
  };
}

function ensureBodyScript(html, src, label) {
  const tag = `<script src="${src}"></script>`;

  if (html.includes(tag) || html.includes(src)) {
    return { html, changed: false, message: `OK: ${label} já está importado.` };
  }

  if (!html.includes('</body>')) {
    return { html, changed: false, message: `Aviso: não encontrei </body> para ${label}.` };
  }

  return {
    html: html.replace('</body>', `  ${tag}\n</body>`),
    changed: true,
    message: `Aplicado: ${label}`,
  };
}

function apply(file) {
  const fullPath = path.join(root, file);

  if (!fs.existsSync(fullPath)) {
    console.log(`Ignorado: ${file} não existe.`);
    return;
  }

  let html = fs.readFileSync(fullPath, 'utf8');
  let changed = false;

  const baseHref = stylesheetFor(file);
  const base = ensureHeadLink(html, baseHref, `${file} pro-panel.css`);
  html = base.html;
  changed = changed || base.changed;
  console.log(base.message);

  const uxHref = uxStylesheetFor(file);
  if (uxHref) {
    const ux = ensureHeadLink(html, uxHref, `${file} panel-ux.css`);
    html = ux.html;
    changed = changed || ux.changed;
    console.log(ux.message);
  }

  const uxScript = uxScriptFor(file);
  if (uxScript) {
    const uxJs = ensureBodyScript(html, uxScript, `${file} panel-ux.js`);
    html = uxJs.html;
    changed = changed || uxJs.changed;
    console.log(uxJs.message);
  }

  if (changed) {
    fs.writeFileSync(fullPath, html);
  }
}

for (const target of targets) {
  apply(target);
}
