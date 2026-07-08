(() => {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

  function waitForPanel() {
    if (typeof window.renderCommercial === 'function' && typeof window.openDetails === 'function') {
      enhanceCommercialPanel();
      return;
    }

    window.setTimeout(waitForPanel, 120);
  }

  function closestCard(node) {
    return node ? node.closest('.card') : null;
  }

  function ensureActionPanel() {
    const commercialGrid = document.querySelector('#section-commercial > .grid');
    if (!commercialGrid || $('commercialActionPanel')) return;

    const panel = document.createElement('div');
    panel.id = 'commercialActionPanel';
    panel.className = 'commercial-action-panel';
    panel.innerHTML = `
      <div>
        <h2>Ações comerciais</h2>
        <p>Cadastre vendedores, crie planos ou adicione créditos somente quando precisar.</p>
      </div>
      <button class="btn primary" type="button" onclick="openCommercialActionModal('seller')">Nova ação comercial</button>
    `;

    const firstCard = commercialGrid.querySelector('.card');
    if (firstCard && firstCard.nextSibling) {
      commercialGrid.insertBefore(panel, firstCard.nextSibling);
    } else {
      commercialGrid.prepend(panel);
    }
  }

  function ensureActionModal() {
    if ($('commercialActionModal')) return;

    const modal = document.createElement('div');
    modal.id = 'commercialActionModal';
    modal.className = 'panel-ux-modal';
    modal.addEventListener('click', event => {
      if (event.target === modal) closeCommercialActionModal();
    });

    modal.innerHTML = `
      <div class="panel-ux-card" onclick="event.stopPropagation()">
        <div class="panel-ux-head">
          <div>
            <h2>Nova ação comercial</h2>
            <p>Escolha o tipo de ação e preencha somente os campos necessários.</p>
          </div>
          <button class="btn panel-ux-close" type="button" onclick="closeCommercialActionModal()" aria-label="Fechar">×</button>
        </div>

        <div class="panel-ux-tabs">
          <button class="btn panel-ux-tab" type="button" data-ux-action="seller" onclick="setCommercialActionType('seller')">Novo vendedor</button>
          <button class="btn panel-ux-tab" type="button" data-ux-action="plan" onclick="setCommercialActionType('plan')">Novo plano</button>
          <button class="btn panel-ux-tab" type="button" data-ux-action="credits" onclick="setCommercialActionType('credits')">Adicionar créditos</button>
        </div>

        <div class="panel-ux-body">
          <section class="panel-ux-form" data-ux-form="seller">
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
    `;

    document.body.appendChild(modal);
  }

  function syncNativeCommercialFields(type) {
    if (type === 'seller') {
      if ($('newSellerName')) $('newSellerName').value = $('uxNewSellerName')?.value || '';
      if ($('newSellerWhatsapp')) $('newSellerWhatsapp').value = $('uxNewSellerWhatsapp')?.value || '';
      if ($('newSellerEmail')) $('newSellerEmail').value = $('uxNewSellerEmail')?.value || '';
      if ($('newSellerInitialCredits')) $('newSellerInitialCredits').value = $('uxNewSellerInitialCredits')?.value || '0';
      if ($('newSellerCanGoNegative')) $('newSellerCanGoNegative').checked = $('uxNewSellerCanGoNegative')?.checked || false;
      return;
    }

    if (type === 'plan') {
      if ($('newPlanName')) $('newPlanName').value = $('uxNewPlanName')?.value || '';
      if ($('newPlanDurationDays')) $('newPlanDurationDays').value = $('uxNewPlanDurationDays')?.value || '30';
      if ($('newPlanCreditCost')) $('newPlanCreditCost').value = $('uxNewPlanCreditCost')?.value || '1';
      if ($('newPlanMaxDevices')) $('newPlanMaxDevices').value = $('uxNewPlanMaxDevices')?.value || '1';
      return;
    }

    if (type === 'credits') {
      if ($('sellerCreditSeller')) $('sellerCreditSeller').value = $('uxSellerCreditSeller')?.value || '';
      if ($('sellerCreditAmount')) $('sellerCreditAmount').value = $('uxSellerCreditAmount')?.value || '1';
      if ($('sellerCreditDescription')) $('sellerCreditDescription').value = $('uxSellerCreditDescription')?.value || '';
    }
  }

  function fillUxSellerSelect(selectedId = '') {
    const select = $('uxSellerCreditSeller');
    if (!select || !Array.isArray(window.sellers)) return;

    select.innerHTML = '<option value="">Escolha um vendedor</option>' +
      window.sellers.map(seller => `<option value="${esc(seller.id)}">${esc(seller.name)} — ${Number(seller.creditBalance || 0)} crédito(s)</option>`).join('');
    select.value = selectedId;
  }

  window.openCommercialActionModal = function openCommercialActionModal(type = 'seller', sellerId = '') {
    ensureActionModal();
    fillUxSellerSelect(sellerId);
    setCommercialActionType(type);
    $('commercialActionModal')?.classList.add('open');
  };

  window.closeCommercialActionModal = function closeCommercialActionModal() {
    $('commercialActionModal')?.classList.remove('open');
  };

  window.setCommercialActionType = function setCommercialActionType(type) {
    document.querySelectorAll('.panel-ux-tab').forEach(button => {
      button.classList.toggle('active', button.dataset.uxAction === type);
    });

    document.querySelectorAll('.panel-ux-form').forEach(form => {
      form.classList.toggle('active', form.dataset.uxForm === type);
    });
  };

  window.submitCommercialSeller = async function submitCommercialSeller() {
    syncNativeCommercialFields('seller');
    if (typeof window.createSeller === 'function') {
      await window.createSeller();
      closeCommercialActionModal();
    }
  };

  window.submitCommercialPlan = async function submitCommercialPlan() {
    syncNativeCommercialFields('plan');
    if (typeof window.createPlan === 'function') {
      await window.createPlan();
      closeCommercialActionModal();
    }
  };

  window.submitCommercialCredits = async function submitCommercialCredits() {
    syncNativeCommercialFields('credits');
    if (typeof window.addSellerCredits === 'function') {
      await window.addSellerCredits();
      closeCommercialActionModal();
    }
  };

  function commercialSellerReportHtml(seller) {
    const linkedDevices = typeof window.sellerDevices === 'function' ? window.sellerDevices(seller.id) : [];
    const ledger = typeof window.sellerLedger === 'function' ? window.sellerLedger(seller.id) : [];
    const daysLeftFn = typeof window.daysLeft === 'function' ? window.daysLeft : () => null;
    const isExpiringSoonFn = typeof window.isExpiringSoon === 'function' ? window.isExpiringSoon : () => false;
    const badgeFn = typeof window.badge === 'function' ? window.badge : status => `<span class="badge ${esc(status)}">${esc(status)}</span>`;
    const fmtDateFn = typeof window.fmtDate === 'function' ? window.fmtDate : value => value || '—';
    const reportNumberFn = typeof window.reportNumber === 'function' ? window.reportNumber : value => Number(value || 0).toLocaleString('pt-BR');
    const ledgerTypeTextFn = typeof window.ledgerTypeText === 'function' ? window.ledgerTypeText : value => value || 'Movimento';

    const active = linkedDevices.filter(d => d.status === 'active').length;
    const pending = linkedDevices.filter(d => d.status === 'pending').length;
    const blocked = linkedDevices.filter(d => d.status === 'blocked').length;
    const expired = linkedDevices.filter(d => d.status === 'expired' || daysLeftFn(d.expiresAt) < 0).length;
    const expiring = linkedDevices.filter(isExpiringSoonFn).length;
    const creditsAdded = ledger.filter(entry => Number(entry.amount || 0) > 0).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const creditsConsumed = Math.abs(ledger.filter(entry => Number(entry.amount || 0) < 0).reduce((sum, entry) => sum + Number(entry.amount || 0), 0));
    const balance = Number(seller.creditBalance || 0);

    const recentLedger = ledger.slice(0, 8).map(entry => {
      const amount = Number(entry.amount || 0);
      const amountClass = amount >= 0 ? 'positive' : 'negative';
      return `
        <div class="seller-ledger-item">
          <div>
            <strong>${esc(ledgerTypeTextFn(entry.type))}</strong>
            <span class="amount ${amountClass}">${amount > 0 ? '+' : ''}${reportNumberFn(amount)}</span>
          </div>
          <div class="small muted">${esc(entry.description || 'Sem descrição')}</div>
          <div class="small muted">${fmtDateFn(entry.createdAt)}</div>
        </div>
      `;
    }).join('');

    return `
      <div class="seller-detail-report">
        <div class="seller-detail-hero">
          <div class="seller-detail-balance">
            <small>Saldo atual</small>
            <strong class="${balance < 0 ? 'negative' : 'positive'}">${reportNumberFn(balance)}</strong>
            <div class="small muted">crédito(s)</div>
          </div>

          <div class="seller-detail-section">
            <h3>${esc(seller.name)}</h3>
            <div class="small muted">${esc(seller.whatsapp || 'Sem WhatsApp')}</div>
            ${seller.email ? `<div class="small muted">${esc(seller.email)}</div>` : ''}
            <div style="margin-top:10px;">${badgeFn(seller.status || 'active')}</div>
          </div>
        </div>

        <div class="seller-detail-grid">
          <div class="seller-detail-metric"><small>Ativos</small><strong>${active}</strong></div>
          <div class="seller-detail-metric"><small>Pendentes</small><strong>${pending}</strong></div>
          <div class="seller-detail-metric"><small>Vencidos</small><strong>${expired}</strong></div>
          <div class="seller-detail-metric"><small>Vencendo 7d</small><strong>${expiring}</strong></div>
          <div class="seller-detail-metric"><small>Bloqueados</small><strong>${blocked}</strong></div>
          <div class="seller-detail-metric"><small>Total aparelhos</small><strong>${linkedDevices.length}</strong></div>
          <div class="seller-detail-metric"><small>Créditos adicionados</small><strong>${reportNumberFn(creditsAdded)}</strong></div>
          <div class="seller-detail-metric"><small>Créditos consumidos</small><strong>${reportNumberFn(creditsConsumed)}</strong></div>
        </div>

        <div class="seller-detail-section">
          <h3>Códigos de acesso</h3>
          <label for="seller-public-code-${esc(seller.id)}">Código público do vendedor para o APK</label>
          <input class="table-input" id="seller-public-code-${esc(seller.id)}" value="${esc(seller.publicCode || '')}" placeholder="Ex: ronaldo-123456">
          <p class="muted" style="margin-top:6px;">Esse é o código que o cliente digita no APK. Não é a senha do portal.</p>

          <label for="seller-token-${esc(seller.id)}" style="margin-top:14px;">Token privado do vendedor para o portal</label>
          <input class="table-input" id="seller-token-${esc(seller.id)}" value="${esc(seller.accessToken || '')}" placeholder="Defina um token de acesso">
        </div>

        <div class="seller-detail-section">
          <h3>Ações do vendedor</h3>
          <div class="actions">
            <button class="btn" onclick="openSellerDeviceFilter('${esc(seller.id)}'); closeDetails();">Ver aparelhos</button>
            <button class="btn green" onclick="saveSellerPublicCode('${esc(seller.id)}')">Salvar código público</button>
            <button class="btn" onclick="copyText($('seller-public-code-${esc(seller.id)}').value)">Copiar código público</button>
            <button class="btn green" onclick="saveSellerToken('${esc(seller.id)}')">Salvar token</button>
            <button class="btn" onclick="copyText($('seller-token-${esc(seller.id)}').value)">Copiar token</button>
            <a class="btn" href="./seller.html" target="_blank" rel="noreferrer">Portal vendedor</a>
            <button class="btn green" onclick="closeDetails(); openCommercialActionModal('credits', '${esc(seller.id)}')">Adicionar créditos</button>
          </div>
        </div>

        <div class="seller-detail-section">
          <h3>Últimas movimentações</h3>
          <div class="seller-ledger-list">
            ${recentLedger || '<div class="muted">Nenhuma movimentação recente.</div>'}
          </div>
        </div>
      </div>
    `;
  }

  window.showSellerDetails = function showSellerDetails(id) {
    const seller = Array.isArray(window.sellers) ? window.sellers.find(item => item.id === id) : null;
    if (!seller) {
      if (typeof window.show === 'function') window.show('Vendedor não encontrado.', true);
      return;
    }

    window.openDetails(
      'Vendedor',
      `<span class="mono">${esc(seller.name)}</span>`,
      commercialSellerReportHtml(seller)
    );
  };

  function hideCommercialFormsAndReports() {
    const sellerName = $('newSellerName');
    const planName = $('newPlanName');
    const creditAmount = $('sellerCreditAmount');
    closestCard(sellerName)?.classList.add('commercial-hidden-form');
    closestCard(planName)?.classList.add('commercial-hidden-form');
    closestCard(creditAmount)?.classList.add('commercial-hidden-form');

    const sellersBody = $('sellersBody');
    closestCard(sellersBody)?.classList.add('commercial-primary-card');

    const plansBody = $('plansBody');
    closestCard(plansBody)?.classList.add('commercial-plans-card');

    const ledgerBody = $('creditLedgerBody');
    closestCard(ledgerBody)?.classList.add('commercial-ledger-card');

    const reportsGrid = $('sellerReportsGrid');
    closestCard(reportsGrid)?.classList.add('commercial-report-card-hidden');
  }

  function addSellerDetailButtons() {
    const sellersBody = $('sellersBody');
    if (!sellersBody) return;

    sellersBody.querySelectorAll('tr').forEach(row => {
      const firstInput = row.querySelector('input[id^="seller-name-"]');
      if (!firstInput) return;

      const sellerId = firstInput.id.replace('seller-name-', '');
      const actionCell = row.querySelector('td:last-child');
      if (!actionCell || actionCell.querySelector('.ux-seller-details')) return;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn ux-seller-details';
      button.textContent = 'Detalhes';
      button.addEventListener('click', () => window.showSellerDetails(sellerId));
      actionCell.prepend(button);
    });
  }

  function enhanceCommercialPanel() {
    ensureActionPanel();
    ensureActionModal();
    hideCommercialFormsAndReports();
    addSellerDetailButtons();
  }

  const originalRenderCommercial = window.renderCommercial;
  if (typeof originalRenderCommercial === 'function') {
    window.renderCommercial = function patchedRenderCommercial(...args) {
      const result = originalRenderCommercial.apply(this, args);
      window.setTimeout(enhanceCommercialPanel, 0);
      return result;
    };
  }

  document.addEventListener('DOMContentLoaded', waitForPanel);
  waitForPanel();
})();
