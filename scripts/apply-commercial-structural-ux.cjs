const fs = require('node:fs');
const path = require('node:path');

const file = path.join(process.cwd(), 'admin-panel/dashboard.html');
let html = fs.readFileSync(file, 'utf8');

function replaceOnce(search, replacement, label) {
  if (!html.includes(search)) {
    console.log(`Não encontrei: ${label}`);
    return false;
  }
  html = html.replace(search, replacement);
  console.log(`OK: ${label}`);
  return true;
}

// 1) Oculta os cards fixos de cadastro da aba comercial via classe.
// Mantém os campos no DOM para as funções antigas continuarem funcionando.
html = html.replace(
  '<div class="card col4">\n          <h2>Novo Vendedor</h2>',
  '<div class="card col4 commercial-hidden-form">\n          <h2>Novo Vendedor</h2>'
);

html = html.replace(
  '<div class="card col4">\n          <h2>Novo Plano</h2>',
  '<div class="card col4 commercial-hidden-form">\n          <h2>Novo Plano</h2>'
);

html = html.replace(
  '<div class="card col4">\n          <h2>Adicionar Créditos</h2>',
  '<div class="card col4 commercial-hidden-form">\n          <h2>Adicionar Créditos</h2>'
);

// 2) Insere bloco de ações comerciais depois dos stats da aba comercial.
const commercialStatsEnd = `          </div>
        </div>

        <div class="card col4 commercial-hidden-form">
          <h2>Novo Vendedor</h2>`;

const commercialActions = `          </div>
        </div>

        <div class="commercial-action-panel">
          <div>
            <h2>Ações comerciais</h2>
            <p>Cadastre vendedores, crie planos ou adicione créditos somente quando precisar.</p>
          </div>
          <button class="btn primary" type="button" onclick="openCommercialActionModal('seller')">Nova ação comercial</button>
        </div>

        <div class="card col4 commercial-hidden-form">
          <h2>Novo Vendedor</h2>`;

replaceOnce(commercialStatsEnd, commercialActions, 'bloco Ações comerciais');

// 3) Vendedores e Planos em largura total.
html = html.replace(
  '<div class="card col7">\n          <h2>Vendedores</h2>',
  '<div class="card col12 commercial-primary-card">\n          <h2>Vendedores</h2>'
);

html = html.replace(
  '<div class="card col5">\n          <h2>Planos</h2>',
  '<div class="card col12 commercial-plans-card">\n          <h2>Planos</h2>'
);

// 4) Esconde relatório por vendedor da tela principal.
html = html.replace(
  '<div class="card">\n        <div class="section-title">\n          <div>\n            <h2>Relatório por vendedor</h2>',
  '<div class="card commercial-report-card-hidden">\n        <div class="section-title">\n          <div>\n            <h2>Relatório por vendedor</h2>'
);

// 5) Extrato largura total.
html = html.replace(
  '<div class="card">\n          <h2>Extrato de Créditos</h2>',
  '<div class="card commercial-ledger-card">\n          <h2>Extrato de Créditos</h2>'
);

// 6) Botão detalhes em vendedores.
html = html.replace(
  `<td>
            <button class="btn" onclick="updateSeller('\${esc(seller.id)}')">Salvar</button>
          </td>`,
  `<td>
            <div class="seller-inline-actions">
              <button class="btn" onclick="showSellerDetails('\${esc(seller.id)}')">Detalhes</button>
              <button class="btn green" onclick="updateSeller('\${esc(seller.id)}')">Salvar</button>
            </div>
          </td>`
);

// 7) Adiciona modal comercial antes do modal de detalhes.
const detailsModal = `    <div id="detailsModal" class="modal" onclick="modalBackdropClose(event)">`;

const commercialModal = `    <div id="commercialActionModal" class="panel-ux-modal" onclick="commercialActionBackdropClose(event)">
      <div class="panel-ux-card" onclick="event.stopPropagation()">
        <div class="panel-ux-head">
          <div>
            <h2>Nova ação comercial</h2>
            <p>Escolha o tipo de ação e preencha somente os campos necessários.</p>
          </div>
          <button class="btn panel-ux-close" type="button" onclick="closeCommercialActionModal()" aria-label="Fechar">×</button>
        </div>

        <div class="panel-ux-tabs">
          <button class="btn panel-ux-tab active" type="button" data-ux-action="seller" onclick="setCommercialActionType('seller')">Novo vendedor</button>
          <button class="btn panel-ux-tab" type="button" data-ux-action="plan" onclick="setCommercialActionType('plan')">Novo plano</button>
          <button class="btn panel-ux-tab" type="button" data-ux-action="credits" onclick="setCommercialActionType('credits')">Adicionar créditos</button>
        </div>

        <div class="panel-ux-body">
          <section class="panel-ux-form active" data-ux-form="seller">
            <label>Nome</label>
            <input id="uxNewSellerName" placeholder="Ex: Revendedor João" />

            <label>WhatsApp</label>
            <input id="uxNewSellerWhatsapp" placeholder="Ex: 19999999999" />

            <label>E-mail opcional</label>
            <input id="uxNewSellerEmail" placeholder="email@exemplo.com" />

            <label>Créditos iniciais</label>
            <input id="uxNewSellerInitialCredits" type="number" min="0" value="0" />

            <label class="ux-check-row">
              <input id="uxNewSellerCanGoNegative" type="checkbox" />
              Permitir saldo negativo
            </label>

            <div class="panel-ux-actions">
              <button class="btn primary" type="button" onclick="submitCommercialSeller()">Cadastrar vendedor</button>
            </div>
          </section>

          <section class="panel-ux-form" data-ux-form="plan">
            <label>Nome do plano</label>
            <input id="uxNewPlanName" placeholder="Ex: Mensal 1 tela" />

            <label>Duração em dias</label>
            <input id="uxNewPlanDurationDays" type="number" min="1" value="30" />

            <label>Custo em créditos</label>
            <input id="uxNewPlanCreditCost" type="number" min="1" value="1" />

            <label>Máx. aparelhos</label>
            <input id="uxNewPlanMaxDevices" type="number" min="1" value="1" />

            <div class="panel-ux-actions">
              <button class="btn primary" type="button" onclick="submitCommercialPlan()">Cadastrar plano</button>
            </div>
          </section>

          <section class="panel-ux-form" data-ux-form="credits">
            <label>Vendedor</label>
            <select id="uxSellerCreditSeller"></select>

            <label>Quantidade</label>
            <input id="uxSellerCreditAmount" type="number" min="1" value="1" />

            <label>Descrição</label>
            <input id="uxSellerCreditDescription" placeholder="Ex: Pagamento recebido" />

            <div class="panel-ux-actions">
              <button class="btn green" type="button" onclick="submitCommercialCredits()">Adicionar créditos</button>
            </div>
          </section>
        </div>
      </div>
    </div>

${detailsModal}`;

replaceOnce(detailsModal, commercialModal, 'modal Nova ação comercial');

// 8) Funções comerciais internas antes de createSeller().
const createSellerMarker = `async function createSeller() {`;

const commercialFunctions = `
function fillUxSellerSelect(selectedId = '') {
  const select = $('uxSellerCreditSeller');
  if (!select) return;

  select.innerHTML = '<option value="">Escolha um vendedor</option>' +
    sellers.map(seller => \`<option value="\${esc(seller.id)}">\${esc(seller.name)} — \${Number(seller.creditBalance || 0)} crédito(s)</option>\`).join('');

  select.value = selectedId;
}

function openCommercialActionModal(type = 'seller', sellerId = '') {
  fillUxSellerSelect(sellerId);
  setCommercialActionType(type);
  $('commercialActionModal').classList.add('open');
}

function closeCommercialActionModal() {
  $('commercialActionModal').classList.remove('open');
}

function commercialActionBackdropClose(event) {
  if (event.target && event.target.id === 'commercialActionModal') {
    closeCommercialActionModal();
  }
}

function setCommercialActionType(type) {
  document.querySelectorAll('.panel-ux-tab').forEach(button => {
    button.classList.toggle('active', button.dataset.uxAction === type);
  });

  document.querySelectorAll('.panel-ux-form').forEach(form => {
    form.classList.toggle('active', form.dataset.uxForm === type);
  });
}

async function submitCommercialSeller() {
  $('newSellerName').value = $('uxNewSellerName').value;
  $('newSellerWhatsapp').value = $('uxNewSellerWhatsapp').value;
  $('newSellerEmail').value = $('uxNewSellerEmail').value;
  $('newSellerInitialCredits').value = $('uxNewSellerInitialCredits').value || '0';
  $('newSellerCanGoNegative').checked = $('uxNewSellerCanGoNegative').checked;

  await createSeller();
  closeCommercialActionModal();
}

async function submitCommercialPlan() {
  $('newPlanName').value = $('uxNewPlanName').value;
  $('newPlanDurationDays').value = $('uxNewPlanDurationDays').value || '30';
  $('newPlanCreditCost').value = $('uxNewPlanCreditCost').value || '1';
  $('newPlanMaxDevices').value = $('uxNewPlanMaxDevices').value || '1';

  await createPlan();
  closeCommercialActionModal();
}

async function submitCommercialCredits() {
  $('sellerCreditSeller').value = $('uxSellerCreditSeller').value;
  $('sellerCreditAmount').value = $('uxSellerCreditAmount').value || '1';
  $('sellerCreditDescription').value = $('uxSellerCreditDescription').value;

  await addSellerCredits();
  closeCommercialActionModal();
}

function showSellerDetails(id) {
  const seller = sellers.find(item => item.id === id);
  if (!seller) {
    show('Vendedor não encontrado.', true);
    return;
  }

  const linkedDevices = sellerDevices(id);
  const ledger = sellerLedger(id);

  const active = linkedDevices.filter(d => d.status === 'active').length;
  const pending = linkedDevices.filter(d => d.status === 'pending').length;
  const blocked = linkedDevices.filter(d => d.status === 'blocked').length;
  const expired = linkedDevices.filter(d => d.status === 'expired' || daysLeft(d.expiresAt) < 0).length;
  const expiring = linkedDevices.filter(isExpiringSoon).length;

  const creditsAdded = ledger
    .filter(entry => Number(entry.amount || 0) > 0)
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  const creditsConsumed = Math.abs(
    ledger
      .filter(entry => Number(entry.amount || 0) < 0)
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
  );

  const balance = Number(seller.creditBalance || 0);
  const recentLedger = ledger.slice(0, 8).map(entry => {
    const amount = Number(entry.amount || 0);
    const amountClass = amount >= 0 ? 'positive' : 'negative';

    return \`
      <div class="seller-ledger-item">
        <div>
          <strong>\${esc(ledgerTypeText(entry.type))}</strong>
          <span class="amount \${amountClass}">\${amount > 0 ? '+' : ''}\${reportNumber(amount)}</span>
        </div>
        <div class="small muted">\${esc(entry.description || 'Sem descrição')}</div>
        <div class="small muted">\${fmtDate(entry.createdAt)}</div>
      </div>
    \`;
  }).join('');

  openDetails(
    'Vendedor',
    \`<span class="mono">\${esc(seller.name)}</span> · \${badge(seller.status || 'active')}\`,
    \`
      <div class="seller-detail-report">
        <div class="seller-detail-hero">
          <div class="seller-detail-balance">
            <small>Saldo atual</small>
            <strong class="\${balance < 0 ? 'negative' : 'positive'}">\${reportNumber(balance)}</strong>
            <div class="small muted">crédito(s)</div>
          </div>

          <div class="seller-detail-section">
            <h3>\${esc(seller.name)}</h3>
            <div class="small muted">\${esc(seller.whatsapp || 'Sem WhatsApp')}</div>
            \${seller.email ? \`<div class="small muted">\${esc(seller.email)}</div>\` : ''}
            <div style="margin-top:10px;">\${badge(seller.status || 'active')}</div>
          </div>
        </div>

        <div class="seller-detail-grid">
          <div class="seller-detail-metric"><small>Ativos</small><strong>\${active}</strong></div>
          <div class="seller-detail-metric"><small>Pendentes</small><strong>\${pending}</strong></div>
          <div class="seller-detail-metric"><small>Vencidos</small><strong>\${expired}</strong></div>
          <div class="seller-detail-metric"><small>Vencendo 7d</small><strong>\${expiring}</strong></div>
          <div class="seller-detail-metric"><small>Bloqueados</small><strong>\${blocked}</strong></div>
          <div class="seller-detail-metric"><small>Total aparelhos</small><strong>\${linkedDevices.length}</strong></div>
          <div class="seller-detail-metric"><small>Créditos adicionados</small><strong>\${reportNumber(creditsAdded)}</strong></div>
          <div class="seller-detail-metric"><small>Créditos consumidos</small><strong>\${reportNumber(creditsConsumed)}</strong></div>
        </div>

        <div class="seller-detail-section">
          <h3>Códigos de acesso</h3>

          <label for="seller-public-code-\${esc(seller.id)}">Código público do vendedor para o APK</label>
          <input class="table-input" id="seller-public-code-\${esc(seller.id)}" value="\${esc(seller.publicCode || '')}" placeholder="Ex: ronaldo-123456">
          <p class="muted" style="margin-top:6px;">Esse é o código que o cliente digita no APK. Não é a senha do portal.</p>

          <label for="seller-token-\${esc(seller.id)}" style="margin-top:14px;">Token privado do vendedor para o portal</label>
          <input class="table-input" id="seller-token-\${esc(seller.id)}" value="\${esc(seller.accessToken || '')}" placeholder="Defina um token de acesso">
        </div>

        <div class="seller-detail-section">
          <h3>Ações</h3>
          <div class="actions">
            <button class="btn" onclick="openSellerDeviceFilter('\${esc(seller.id)}'); closeDetails();">Ver aparelhos</button>
            <button class="btn green" onclick="saveSellerPublicCode('\${esc(seller.id)}')">Salvar código público</button>
            <button class="btn" onclick="copyText($('seller-public-code-\${esc(seller.id)}').value)">Copiar código público</button>
            <button class="btn green" onclick="saveSellerToken('\${esc(seller.id)}')">Salvar token</button>
            <button class="btn" onclick="copyText($('seller-token-\${esc(seller.id)}').value)">Copiar token</button>
            <a class="btn" href="./seller.html" target="_blank" rel="noreferrer">Portal vendedor</a>
            <button class="btn green" onclick="closeDetails(); openCommercialActionModal('credits', '\${esc(seller.id)}')">Adicionar créditos</button>
          </div>
        </div>

        <div class="seller-detail-section">
          <h3>Últimas movimentações</h3>
          <div class="seller-ledger-list">
            \${recentLedger || '<div class="muted">Nenhuma movimentação recente.</div>'}
          </div>
        </div>
      </div>
    \`
  );
}

${createSellerMarker}`;

replaceOnce(createSellerMarker, commercialFunctions, 'funções internas da UX comercial');

fs.writeFileSync(file, html);
console.log('Patch estrutural da aba Comercial aplicado.');
