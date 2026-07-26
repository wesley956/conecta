(() => {
  'use strict';

  const FUNCTION_NAME = 'seller-commercial-panel';
  const $ = id => document.getElementById(id);
  const state = {
    commercial: null,
    loading: false,
    customerEditingId: null,
    sellerRenderPatched: false,
  };

  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const money = cents => new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(cents || 0) / 100);

  function setText(element, text) {
    if (element && element.textContent !== text) element.textContent = text;
  }

  async function api(payload) {
    const config = window.RONECA_PANEL_CONFIG || {};
    const token = await window.RonecaPanelAuth?.getAccessToken?.();
    if (!config.supabaseUrl || !config.anonKey || !token) {
      throw new Error('Sessão do painel indisponível.');
    }

    const response = await fetch(`${String(config.supabaseUrl).replace(/\/$/, '')}/functions/v1/${FUNCTION_NAME}`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.anonKey,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload || {}),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Falha na operação.');
    return result;
  }

  function removeSubscriptionUi() {
    document.querySelectorAll('[data-subscription-tab], [data-seller-nav="subscriptions"]').forEach(item => item.remove());
    $('section-subscriptions')?.remove();
    $('sellerSubscriptionsCard')?.remove();
  }

  function consolidateAdmin() {
    if (!/\/dashboard\.html$/i.test(location.pathname)) return false;

    removeSubscriptionUi();
    document.querySelectorAll('.tab[data-tab="finance"], .tab[data-tab="credit-packages"]').forEach(tab => tab.remove());
    $('section-finance')?.remove();

    const commercial = $('section-commercial');
    const creditSection = $('section-credit-packages');
    if (!commercial) return false;

    if (creditSection && !$('commercialCreditPackagesHost')) {
      const host = document.createElement('div');
      host.id = 'commercialCreditPackagesHost';
      host.className = 'commercial-consolidated-area';
      host.innerHTML = `
        <div class="commercial-consolidated-heading">
          <div><span>Venda de pacotes</span><h2>Créditos dos vendedores</h2><p>Pacotes, cobranças, validade e limite a prazo dentro da área comercial existente.</p></div>
        </div>`;
      while (creditSection.firstChild) host.appendChild(creditSection.firstChild);
      commercial.querySelector('.grid')?.appendChild(host);
      creditSection.remove();
    }

    const oldCreditForm = Array.from(commercial.querySelectorAll('.card')).find(card => {
      const title = card.querySelector('h2')?.textContent || '';
      return /Adicionar Créditos|Ajuste manual de créditos/i.test(title);
    });

    if (oldCreditForm) {
      setText(oldCreditForm.querySelector('h2'), 'Ajuste manual de créditos');
      setText(oldCreditForm.querySelector('.sub'), 'Use apenas para cortesia, bônus, estorno ou correção. O motivo é obrigatório e não gera venda.');
      setText(oldCreditForm.querySelector('button'), 'Registrar ajuste');
      const description = $('sellerCreditDescription');
      if (description) {
        description.required = true;
        if (description.placeholder !== 'Motivo obrigatório do ajuste') {
          description.placeholder = 'Motivo obrigatório do ajuste';
        }
      }
    }

    const commercialTab = document.querySelector('.tab[data-tab="commercial"]');
    if (commercialTab && !commercialTab.dataset.consolidatedCommercial) {
      commercialTab.dataset.consolidatedCommercial = 'true';
      commercialTab.addEventListener('click', () => {
        setTimeout(() => window.creditPackagesLoad?.().catch?.(() => {}), 50);
      });
    }

    const host = $('commercialCreditPackagesHost');
    if (host && window.RonecaPanelAuth?.hasSession?.() && host.dataset.initialLoad !== 'true') {
      host.dataset.initialLoad = 'true';
      window.creditPackagesLoad?.().catch?.(() => {
        delete host.dataset.initialLoad;
      });
    }

    return true;
  }

  function customerSectionHtml() {
    return `
      <div class="seller-commercial-head">
        <div><small>Minha carteira</small><h2>Clientes</h2><p>Cadastre nome e WhatsApp uma vez e reutilize o cliente nas ativações e renovações.</p></div>
        <button class="primary" type="button" onclick="sellerCommercialOpenCustomer()">Novo cliente</button>
      </div>
      <div class="seller-customer-toolbar"><input id="sellerCustomerSearch" placeholder="Buscar por nome ou WhatsApp" oninput="sellerCommercialRenderCustomers()"></div>
      <div id="sellerCustomerList" class="seller-customer-grid"><div class="commercial-empty">Carregando clientes...</div></div>`;
  }

  function ensureCustomersSection() {
    const nav = document.querySelector('.seller-v2-nav');
    const dashboard = $('dashboardView');
    if (!nav || !dashboard) return false;

    if (!nav.querySelector('[data-seller-nav="customers"]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.sellerNav = 'customers';
      button.textContent = 'Clientes';
      button.onclick = () => window.sellerPortalNavigate?.('customers');
      nav.insertBefore(button, nav.querySelector('[data-seller-nav="lists"]') || null);
    }

    if (!$('sellerCustomersCard')) {
      const card = document.createElement('div');
      card.id = 'sellerCustomersCard';
      card.className = 'card seller-portal-section seller-customers-card';
      card.dataset.sellerSection = 'customers';
      card.hidden = true;
      card.setAttribute('aria-hidden', 'true');
      card.innerHTML = customerSectionHtml();
      const devices = $('sellerDevicesCard');
      dashboard.insertBefore(card, devices || dashboard.firstChild);
    }

    return true;
  }

  function mergeCreditSections() {
    const oldNav = document.querySelector('[data-seller-nav="credits"]');
    const newNav = document.querySelector('[data-seller-nav="credit-purchases"]');
    const oldCard = $('sellerCreditsCard');
    const newCard = $('sellerCreditPurchasesCard');

    setText(newNav, 'Meus créditos');

    if (newCard && oldCard && !$('sellerUnifiedCreditLedger')) {
      const ledger = document.createElement('div');
      ledger.id = 'sellerUnifiedCreditLedger';
      ledger.className = 'credit-package-card seller-unified-ledger';
      ledger.innerHTML = '<div class="credit-package-card-head"><div><h3>Movimentações</h3><p>Entradas, ativações, renovações, estornos e expirações.</p></div></div>';
      const list = $('ledgerList');
      if (list) ledger.appendChild(list);
      newCard.querySelector('.credit-packages-shell')?.appendChild(ledger);
      oldCard.remove();
    }

    oldNav?.remove();
  }

  function ensurePriceSettings() {
    const card = $('sellerFinanceCard');
    if (!card || $('sellerPlanPrices')) return;

    const block = document.createElement('section');
    block.id = 'sellerPlanPrices';
    block.className = 'seller-plan-prices';
    block.innerHTML = `
      <div class="seller-plan-prices-head"><div><small>Automação</small><h3>Meus preços por plano</h3><p>Defina uma vez. A ativação e a renovação usarão este valor automaticamente.</p></div></div>
      <div id="sellerPlanPriceGrid" class="seller-plan-price-grid"><div class="commercial-empty">Carregando planos...</div></div>`;
    card.querySelector('.finance-card-head')?.insertAdjacentElement('afterend', block);
  }

  function renameFinance() {
    const nav = document.querySelector('[data-seller-nav="finance"]');
    setText(nav, 'Minhas vendas');

    const card = $('sellerFinanceCard');
    if (!card) return;

    setText(card.querySelector('.finance-card-head h2'), 'Minhas vendas');
    setText(card.querySelector('.finance-card-head p'), 'Valores cobrados dos seus clientes. Compras e saldo de créditos ficam em Meus créditos.');
    setText(card.querySelector('.finance-card-head button'), 'Registrar venda avulsa');
    ensurePriceSettings();
  }

  function customerOptions(selected = '') {
    const rows = ['<option value="">Novo cliente ou preencher abaixo</option>'];
    for (const customer of state.commercial?.customers || []) {
      rows.push(`<option value="${esc(customer.id)}" ${customer.id === selected ? 'selected' : ''}>${esc(customer.name)} — ${esc(customer.whatsapp)}</option>`);
    }
    return rows.join('');
  }

  function ensureActivationCustomerSelector() {
    const grid = $('sellerActivationForm')?.querySelector('.seller-form-grid');
    const name = $('sellerActivationCustomerName');
    if (!grid || !name || $('sellerActivationCustomerSelect')) return;

    const host = document.createElement('div');
    host.className = 'wide';
    host.innerHTML = '<label for="sellerActivationCustomerSelect">Cliente cadastrado</label><select id="sellerActivationCustomerSelect"><option value="">Novo cliente ou preencher abaixo</option></select>';
    grid.insertBefore(host, grid.firstChild);

    $('sellerActivationCustomerSelect').addEventListener('change', event => {
      const customer = (state.commercial?.customers || []).find(item => item.id === event.target.value);
      if (!customer) return;
      $('sellerActivationCustomerName').value = customer.name || '';
      $('sellerActivationCustomerWhatsapp').value = customer.whatsapp || '';
    });
  }

  function planPrice(planId) {
    return (state.commercial?.plans || []).find(plan => plan.id === planId)?.defaultSalePriceCents || null;
  }

  function applyAutomaticPrice(prefix, planId) {
    const host = $(prefix);
    const amount = $(`${prefix}-amount`);
    const enabled = $(`${prefix}-enabled`);
    if (!host || !amount) return;

    if (enabled) {
      enabled.checked = true;
      enabled.closest('label')?.classList.add('commercial-hidden-toggle');
    }

    let banner = host.querySelector('[data-auto-sale-price]');
    if (!banner) {
      banner = document.createElement('div');
      banner.dataset.autoSalePrice = 'true';
      banner.className = 'auto-sale-price';
      host.querySelector('.finance-inline-title')?.insertAdjacentElement('afterend', banner);
    }

    const price = planPrice(planId);
    const renderKey = `${planId || 'none'}:${price || 0}`;
    if (banner.dataset.renderKey === renderKey) return;
    banner.dataset.renderKey = renderKey;

    if (price) {
      const value = (price / 100).toFixed(2);
      if (amount.value !== value) amount.value = value;
      amount.readOnly = true;
      banner.innerHTML = `<div><small>Preço configurado</small><strong>${money(price)}</strong></div><button type="button" onclick="sellerCommercialUnlockPrice('${esc(prefix)}')">Alterar somente nesta venda</button>`;
      host.classList.remove('price-missing');
    } else {
      amount.readOnly = false;
      banner.innerHTML = '<div><small>Preço ainda não configurado</small><strong>Defina em Minhas vendas ou informe apenas nesta venda.</strong></div>';
      host.classList.add('price-missing');
    }
  }

  window.sellerCommercialUnlockPrice = prefix => {
    const amount = $(`${prefix}-amount`);
    if (!amount) return;
    amount.readOnly = false;
    amount.focus();
    amount.select();
  };

  function wireAutomaticPrices() {
    const activationPlan = $('sellerActivationPlan');
    if (activationPlan && !activationPlan.dataset.autoPriceWired) {
      activationPlan.dataset.autoPriceWired = 'true';
      activationPlan.addEventListener('change', () => {
        applyAutomaticPrice('finance-seller-activation', activationPlan.value);
      });
    }
    if (activationPlan) applyAutomaticPrice('finance-seller-activation', activationPlan.value);

    const renewPlan = $('sellerRenewPlan');
    if (renewPlan && !renewPlan.dataset.autoPriceWired) {
      renewPlan.dataset.autoPriceWired = 'true';
      renewPlan.addEventListener('change', () => {
        applyAutomaticPrice('finance-seller-renew', renewPlan.value);
      });
    }
    if (renewPlan) applyAutomaticPrice('finance-seller-renew', renewPlan.value);
  }

  async function loadCommercial(force = false) {
    if (!/\/seller\.html$/i.test(location.pathname) || !window.RonecaPanelAuth?.hasSession?.()) return;
    if (state.loading) return;

    if (state.commercial && !force) {
      renderCommercial();
      return;
    }

    state.loading = true;
    try {
      state.commercial = await api({ action: 'dashboard' });
      renderCommercial();
    } finally {
      state.loading = false;
    }
  }

  function renderCommercial() {
    ensureCustomersSection();
    ensurePriceSettings();
    ensureActivationCustomerSelector();

    const select = $('sellerActivationCustomerSelect');
    if (select) {
      const selected = select.value;
      const html = customerOptions(selected);
      if (select.innerHTML !== html) select.innerHTML = html;
      if ([...select.options].some(option => option.value === selected)) select.value = selected;
    }

    const priceGrid = $('sellerPlanPriceGrid');
    if (priceGrid) {
      const html = (state.commercial?.plans || []).length
        ? state.commercial.plans.map(plan => `
          <article class="seller-plan-price-card">
            <div><small>${esc(plan.durationDays)} dias · custo ${esc(plan.creditCost)} crédito(s)</small><strong>${esc(plan.name)}</strong></div>
            <label>Meu preço de venda (R$)<input id="sellerPlanPrice-${esc(plan.id)}" type="number" min="0.01" step="0.01" value="${plan.defaultSalePriceCents ? (plan.defaultSalePriceCents / 100).toFixed(2) : ''}" placeholder="0,00"></label>
            <button type="button" onclick="sellerCommercialSavePrice('${esc(plan.id)}')">Salvar preço</button>
          </article>`).join('')
        : '<div class="commercial-empty">Nenhum plano ativo disponível.</div>';
      if (priceGrid.innerHTML !== html) priceGrid.innerHTML = html;
    }

    window.sellerCommercialRenderCustomers?.();
    wireAutomaticPrices();
  }

  window.sellerCommercialSavePrice = async planId => {
    try {
      const input = $(`sellerPlanPrice-${planId}`);
      const value = Number(String(input?.value || '').replace(',', '.'));
      if (!Number.isFinite(value) || value <= 0) throw new Error('Informe um preço válido.');
      await api({ action: 'savePlanPrice', planId, defaultSalePriceCents: Math.round(value * 100) });
      await loadCommercial(true);
      notify('Preço salvo. As próximas ativações e renovações usarão este valor.');
    } catch (error) {
      notify(error.message, true);
    }
  };

  window.sellerCommercialRenderCustomers = () => {
    const target = $('sellerCustomerList');
    if (!target) return;

    const rawSearch = String($('sellerCustomerSearch')?.value || '');
    const normalized = rawSearch.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const digits = rawSearch.replace(/\D/g, '');
    const customers = (state.commercial?.customers || []).filter(customer => {
      const haystack = `${customer.name} ${customer.whatsapp}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return !normalized || haystack.includes(normalized) || (digits && customer.whatsapp.includes(digits));
    });

    const html = customers.length ? customers.map(customer => `
      <article class="seller-customer-card">
        <div><strong>${esc(customer.name)}</strong><span>${esc(customer.whatsapp)}</span></div>
        <div class="seller-customer-actions"><a href="https://wa.me/${esc(customer.whatsapp.startsWith('55') ? customer.whatsapp : `55${customer.whatsapp}`)}" target="_blank" rel="noreferrer">WhatsApp</a><button type="button" onclick="sellerCommercialOpenCustomer('${esc(customer.id)}')">Editar</button></div>
      </article>`).join('') : '<div class="commercial-empty">Nenhum cliente encontrado.</div>';

    if (target.innerHTML !== html) target.innerHTML = html;
  };

  function ensureCustomerModal() {
    if ($('sellerCustomerModal')) return;

    const modal = document.createElement('div');
    modal.id = 'sellerCustomerModal';
    modal.className = 'seller-commercial-modal';
    modal.innerHTML = `
      <div class="seller-commercial-modal-card">
        <div class="seller-commercial-modal-head"><div><h2 id="sellerCustomerModalTitle">Novo cliente</h2><p>Nome e WhatsApp serão reutilizados nas ativações.</p></div><button type="button" onclick="sellerCommercialCloseCustomer()">×</button></div>
        <label>Nome<input id="sellerCustomerName" maxlength="160"></label>
        <label>WhatsApp<input id="sellerCustomerWhatsapp" inputmode="numeric"></label>
        <div class="actions"><button class="primary" type="button" onclick="sellerCommercialSaveCustomer()">Salvar cliente</button><button type="button" onclick="sellerCommercialCloseCustomer()">Cancelar</button></div>
      </div>`;
    modal.addEventListener('click', event => {
      if (event.target === modal) window.sellerCommercialCloseCustomer();
    });
    document.body.appendChild(modal);
  }

  window.sellerCommercialOpenCustomer = customerId => {
    ensureCustomerModal();
    const customer = (state.commercial?.customers || []).find(item => item.id === customerId) || null;
    state.customerEditingId = customer?.id || null;
    setText($('sellerCustomerModalTitle'), customer ? 'Editar cliente' : 'Novo cliente');
    $('sellerCustomerName').value = customer?.name || '';
    $('sellerCustomerWhatsapp').value = customer?.whatsapp || '';
    $('sellerCustomerModal').classList.add('open');
    setTimeout(() => $('sellerCustomerName')?.focus(), 20);
  };

  window.sellerCommercialCloseCustomer = () => {
    $('sellerCustomerModal')?.classList.remove('open');
    state.customerEditingId = null;
  };

  window.sellerCommercialSaveCustomer = async () => {
    try {
      await api({
        action: state.customerEditingId ? 'updateCustomer' : 'createCustomer',
        customerId: state.customerEditingId,
        name: $('sellerCustomerName')?.value,
        whatsapp: $('sellerCustomerWhatsapp')?.value,
      });
      window.sellerCommercialCloseCustomer();
      await loadCommercial(true);
      notify('Cliente salvo com sucesso.');
    } catch (error) {
      notify(error.message, true);
    }
  };

  function notify(message, error = false) {
    let toast = $('commercialConsolidationToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'commercialConsolidationToast';
      toast.className = 'commercial-consolidation-toast';
      document.body.appendChild(toast);
    }
    setText(toast, message || '');
    toast.classList.toggle('error', error);
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 4200);
  }

  function consolidateSeller() {
    if (!/\/seller\.html$/i.test(location.pathname)) return false;

    removeSubscriptionUi();
    ensureCustomersSection();
    mergeCreditSections();
    renameFinance();
    ensureActivationCustomerSelector();
    wireAutomaticPrices();

    if (window.RonecaPanelAuth?.hasSession?.() && !state.commercial && !state.loading) {
      loadCommercial().catch(error => notify(error.message, true));
    }
    return true;
  }

  function patchSellerRender() {
    if (!/\/seller\.html$/i.test(location.pathname) || state.sellerRenderPatched) return false;
    const original = window.renderPortal;
    if (typeof original !== 'function') return false;

    state.sellerRenderPatched = true;
    window.__commercialSellerRenderPatched = true;
    window.renderPortal = function consolidatedSellerRender() {
      const result = original.apply(this, arguments);
      setTimeout(() => {
        consolidateSeller();
        loadCommercial(true).catch(error => notify(error.message, true));
      }, 0);
      return result;
    };
    return true;
  }

  function install() {
    consolidateAdmin();
    patchSellerRender();
    consolidateSeller();
  }

  function bootstrap() {
    install();
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      install();
      const sellerReady = !/\/seller\.html$/i.test(location.pathname) || state.sellerRenderPatched;
      const adminReady = !/\/dashboard\.html$/i.test(location.pathname) || Boolean($('section-commercial'));
      if ((sellerReady && adminReady && attempts >= 4) || attempts >= 40) clearInterval(timer);
    }, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
