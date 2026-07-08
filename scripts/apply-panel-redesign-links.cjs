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

function nextUxStylesheetFor(file) {
  if (file === 'admin-panel/dashboard.html') return './panel-next-ux.css';
  return null;
}

function sellerPortalStylesheetFor(file) {
  if (file === 'admin-panel/seller.html') return './seller-portal-ux.css';
  return null;
}

function sellerListsStylesheetFor(file) {
  if (file === 'admin-panel/seller.html') return './seller-lists-ux.css';
  return null;
}

function uxScriptFor(file) {
  return null;
}

function sellerPortalScriptFor(file) {
  if (file === 'admin-panel/seller.html') return './seller-portal-ux.js';
  return null;
}

function sellerListsScriptFor(file) {
  if (file === 'admin-panel/seller.html') return './seller-lists-ux.js';
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

  const nextUxHref = nextUxStylesheetFor(file);
  if (nextUxHref) {
    const nextUx = ensureHeadLink(html, nextUxHref, `${file} panel-next-ux.css`);
    html = nextUx.html;
    changed = changed || nextUx.changed;
    console.log(nextUx.message);
  }

  const sellerUxHref = sellerPortalStylesheetFor(file);
  if (sellerUxHref) {
    const sellerUx = ensureHeadLink(html, sellerUxHref, `${file} seller-portal-ux.css`);
    html = sellerUx.html;
    changed = changed || sellerUx.changed;
    console.log(sellerUx.message);
  }

  const sellerListsHref = sellerListsStylesheetFor(file);
  if (sellerListsHref) {
    const sellerLists = ensureHeadLink(html, sellerListsHref, `${file} seller-lists-ux.css`);
    html = sellerLists.html;
    changed = changed || sellerLists.changed;
    console.log(sellerLists.message);
  }

  const uxScript = uxScriptFor(file);
  if (uxScript) {
    const uxJs = ensureBodyScript(html, uxScript, `${file} panel-ux.js`);
    html = uxJs.html;
    changed = changed || uxJs.changed;
    console.log(uxJs.message);
  }

  const sellerUxScript = sellerPortalScriptFor(file);
  if (sellerUxScript) {
    const sellerJs = ensureBodyScript(html, sellerUxScript, `${file} seller-portal-ux.js`);
    html = sellerJs.html;
    changed = changed || sellerJs.changed;
    console.log(sellerJs.message);
  }

  const sellerListsScript = sellerListsScriptFor(file);
  if (sellerListsScript) {
    const sellerListsJs = ensureBodyScript(html, sellerListsScript, `${file} seller-lists-ux.js`);
    html = sellerListsJs.html;
    changed = changed || sellerListsJs.changed;
    console.log(sellerListsJs.message);
  }

  if (changed) {
    fs.writeFileSync(fullPath, html);
  }
}

for (const target of targets) {
  apply(target);
}
