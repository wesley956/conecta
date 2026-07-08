const fs = require('node:fs');
const path = require('node:path');

const file = path.join(process.cwd(), 'admin-panel/dashboard.html');
let html = fs.readFileSync(file, 'utf8');
let changed = false;

function mark(label) {
  changed = true;
  console.log(`OK: ${label}`);
}

function replaceOnce(search, replacement, label) {
  if (!html.includes(search)) {
    console.log(`Ignorado: ${label}`);
    return false;
  }
  html = html.replace(search, replacement);
  mark(label);
  return true;
}

function ensureHeadLink(href, label) {
  if (html.includes(href)) {
    console.log(`OK: ${label} já existe.`);
    return;
  }

  if (!html.includes('</head>')) {
    console.log(`Aviso: não encontrei </head> para ${label}.`);
    return;
  }

  html = html.replace('</head>', `  <link rel="stylesheet" href="${href}" />\n</head>`);
  mark(label);
}

function insertBefore(marker, insertion, label) {
  if (html.includes(insertion.trim().slice(0, 80))) {
    console.log(`OK: ${label} já existe.`);
    return;
  }

  if (!html.includes(marker)) {
    console.log(`Ignorado: ${label}. Marcador não encontrado.`);
    return;
  }

  html = html.replace(marker, `${insertion}\n${marker}`);
  mark(label);
}

ensureHeadLink('./panel-next-ux.css', 'panel-next-ux.css');

// Clientes: esconde cadastro fixo, cria painel de ação e deixa tabela principal em largura total.
html = html.replace(
  '<div class="card col4">\n          <h2>Novo Cliente</h2>',
  '<div class="card col4 entity-hidden-form">\n          <h2>Novo Cliente</h2>'
);

if (!html.includes('id="customerActionPanel"')) {
  replaceOnce(
    '<section id="section-customers" class="section">\n      <div class="grid">',
    `<section id="section-customers" class="section">\n      <div class="grid">\n        <div id="customerActionPanel" class="entity-action-panel">\n          <div>\n            <h2>Clientes</h2>\n            <p>Cadastre clientes somente quando precisar. A lista ganha mais espaço para leitura.</p>\n          </div>\n          <button class="btn primary" type="button" onclick="openCustomerActionModal()">Novo cliente</button>\n        </div>`,
    'painel de ação de clientes'
  );
}

html = html.replace(
  '<div class="card col8">\n          <h2>Clientes cadastrados</h2>',
  '<div class="card col12 entity-primary-card">\n          <h2>Clientes cadastrados</h2>'
);

// Listas: esconde cadastro fixo, cria painel de ação e deixa biblioteca em largura total.
html = html.replace(
  '<div class="card col4">\n          <h2>Nova Lista</h2>',
  '<div class="card col4 entity-hidden-form">\n          <h2>Nova Lista</h2>'
);

if (!html.includes('id="playlistActionPanel"')) {
  replaceOnce(
    '<section id="section-playlists" class="section">\n      <div class="grid">',
    `<section id="section-playlists" class="section">\n      <div class="grid">\n        <div id="playlistActionPanel" class="entity-action-panel">\n          <div>\n            <h2>Listas</h2>\n            <p>Adicione uma lista em um quadro separado e mantenha a biblioteca limpa.</p>\n          </div>\n          <button class="btn primary" type="button" onclick="openPlaylistActionModal()">Nova lista</button>\n        </div>`,
    'painel de ação de listas'
  );
}

html = html.replace(
  '<div class="card col8">\n          <h2>Biblioteca de Listas</h2>',
  '<div class="card col12 entity-primary-card">\n          <h2>Biblioteca de Listas</h2>'
);

// Modais de Cliente e Lista.
const detailsMarker = '    <div id="detailsModal" class="modal" onclick="modalBackdropClose(event)">';
const entityModals = `    <div id="customerActionModal" class="panel-ux-modal" onclick="customerActionBackdropClose(event)">
      <div class="panel-ux-card" onclick="event.stopPropagation()">
        <div class="panel-ux-head">
          <div>
            <h2>Novo cliente</h2>
            <p>Preencha nome e WhatsApp para cadastrar um cliente.</p>
          </div>
          <button class="btn panel-ux-close" type="button" onclick="closeCustomerActionModal()" aria-label="Fechar">×</button>
        </div>

        <div class="panel-ux-body">
          <section class="panel-ux-form active">
            <label>Nome</label>
            <input id="uxNewCustomerName" placeholder="Ex: João Silva" />

            <label>WhatsApp</label>
            <input id="uxNewCustomerWhatsapp" placeholder="Ex: 19999999999" />

            <div class="panel-ux-actions">
              <button class="btn primary" type="button" onclick="submitCustomerModal()">Cadastrar cliente</button>
            </div>
          </section>
        </div>
      </div>
    </div>

    <div id="playlistActionModal" class="panel-ux-modal" onclick="playlistActionBackdropClose(event)">
      <div class="panel-ux-card" onclick="event.stopPropagation()">
        <div class="panel-ux-head">
          <div>
            <h2>Nova lista</h2>
            <p>Cadastre a lista sem ocupar espaço fixo na biblioteca.</p>
          </div>
          <button class="btn panel-ux-close" type="button" onclick="closePlaylistActionModal()" aria-label="Fechar">×</button>
        </div>

        <div class="panel-ux-body">
          <section class="panel-ux-form active">
            <label>Nome da lista</label>
            <input id="uxNewPlaylistName" placeholder="Ex: Lista Premium 01" />

            <label>URL M3U</label>
            <input id="uxNewPlaylistUrl" placeholder="https://.../lista.m3u" />

            <label>Tipo</label>
            <select id="uxNewPlaylistType">
              <option value="m3u">M3U</option>
              <option value="xtream">Xtream</option>
              <option value="stalker">Stalker</option>
            </select>

            <div class="panel-ux-actions">
              <button class="btn primary" type="button" onclick="submitPlaylistModal()">Salvar lista</button>
            </div>
          </section>
        </div>
      </div>
    </div>
`;

if (!html.includes('id="customerActionModal"')) {
  insertBefore(detailsMarker, entityModals, 'modais de clientes e listas');
}

// Funções dos modais de Cliente e Lista.
const commercialFunctionsMarker = 'function fillUxSellerSelect(selectedId = \'\') {';
const entityFunctions = `
function openCustomerActionModal() {
  $('customerActionModal').classList.add('open');
  setTimeout(() => $('uxNewCustomerName')?.focus(), 0);
}

function closeCustomerActionModal() {
  $('customerActionModal').classList.remove('open');
}

function customerActionBackdropClose(event) {
  if (event.target && event.target.id === 'customerActionModal') {
    closeCustomerActionModal();
  }
}

async function submitCustomerModal() {
  $('newCustomerName').value = $('uxNewCustomerName').value;
  $('newCustomerWhatsapp').value = $('uxNewCustomerWhatsapp').value;

  await createCustomer();
  closeCustomerActionModal();
}

function openPlaylistActionModal() {
  $('playlistActionModal').classList.add('open');
  setTimeout(() => $('uxNewPlaylistName')?.focus(), 0);
}

function closePlaylistActionModal() {
  $('playlistActionModal').classList.remove('open');
}

function playlistActionBackdropClose(event) {
  if (event.target && event.target.id === 'playlistActionModal') {
    closePlaylistActionModal();
  }
}

async function submitPlaylistModal() {
  $('newPlaylistName').value = $('uxNewPlaylistName').value;
  $('newPlaylistUrl').value = $('uxNewPlaylistUrl').value;
  $('newPlaylistType').value = $('uxNewPlaylistType').value;

  await createPlaylist();
  closePlaylistActionModal();
}

`;

if (!html.includes('function openCustomerActionModal()')) {
  insertBefore(commercialFunctionsMarker, entityFunctions, 'funções de clientes e listas');
}

// Ações de aparelhos com ícones.
html = html.replace(
  `<div class="actions">\n          <button class="btn" onclick="showDeviceDetails('\${esc(d.id)}')">Detalhes</button>\n          <button class="btn green" onclick="saveDevice('\${esc(d.id)}')">Salvar</button>\n          <button class="btn orange" onclick="renewDevice('\${esc(d.id)}')">Renovar 30d</button>\n          <button class="btn red" onclick="blockDevice('\${esc(d.id)}')">Bloquear</button>\n          <button class="btn red" onclick="deleteDevice('\${esc(d.id)}')">Excluir</button>\n        </div>`,
  `<div class="icon-actions">\n          <button class="btn icon-btn" title="Detalhes" aria-label="Detalhes" onclick="showDeviceDetails('\${esc(d.id)}')">👁️</button>\n          <button class="btn green icon-btn" title="Salvar" aria-label="Salvar" onclick="saveDevice('\${esc(d.id)}')">💾</button>\n          <button class="btn orange icon-btn icon-wide" title="Renovar 30 dias" aria-label="Renovar 30 dias" onclick="renewDevice('\${esc(d.id)}')">🔄 30d</button>\n          <button class="btn red icon-btn danger-zone" title="Bloquear" aria-label="Bloquear" onclick="blockDevice('\${esc(d.id)}')">🚫</button>\n          <button class="btn red icon-btn" title="Excluir" aria-label="Excluir" onclick="deleteDevice('\${esc(d.id)}')">🗑️</button>\n        </div>`
);

html = html.replace(
  `<button class="btn primary" onclick="activatePending('\${esc(d.id)}')">Liberar aparelho</button>`,
  `<button class="btn primary icon-btn icon-wide" title="Liberar aparelho" aria-label="Liberar aparelho" onclick="activatePending('\${esc(d.id)}')">✅ Liberar</button>`
);

html = html.replaceAll(
  `<button class="btn" onclick="showDeviceDetails('\${esc(d.id)}')">Abrir</button>`,
  `<button class="btn icon-btn" title="Abrir aparelho" aria-label="Abrir aparelho" onclick="showDeviceDetails('\${esc(d.id)}')">👁️</button>`
);

html = html.replaceAll(
  `<button class="btn orange" onclick="renewDevice('\${esc(d.id)}')">Renovar</button>`,
  `<button class="btn orange icon-btn" title="Renovar" aria-label="Renovar" onclick="renewDevice('\${esc(d.id)}')">🔄</button>`
);

html = html.replaceAll(
  `<button class="btn" onclick="copyText('\${esc(d.deviceCode)}')">Copiar</button>`,
  `<button class="btn icon-btn" title="Copiar código" aria-label="Copiar código" onclick="copyText('\${esc(d.deviceCode)}')">📋</button>`
);

fs.writeFileSync(file, html);
console.log(changed ? 'Patch de clientes, listas e ícones aplicado.' : 'Nada novo para aplicar.');
