(() => {
  'use strict';
  const FUNCTION_NAME = 'seller-commercial-panel';
  const $ = id => document.getElementById(id);
  const state = { commercial: null, loading: false, customerEditingId: null, sellerRenderPatched: false };
  const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const setText = (element, text) => { if (element && element.textContent !== text) element.textContent = text; };

  async function api(payload) {
    const config = window.RONECA_PANEL_CONFIG || {};
    const token = await window.RonecaPanelAuth?.getAccessToken?.();
    if (!config.supabaseUrl || !config.anonKey || !token) throw new Error('Sessão do painel indisponível.');
    const response = await fetch(`${String(config.supabaseUrl).replace(/\/$/, '')}/functions/v1/${FUNCTION_NAME}`, {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', apikey: config.anonKey, Authorization: `Bearer ${token}` },
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
      host.innerHTML = '<div class="commercial-consolidated-heading"><div><span>Venda de pacotes</span><h2>Créditos dos vendedores</h2><p>Pacotes e cobranças ficam na área comercial.</p></div></div>';
      while (creditSection.firstChild) host.appendChild(creditSection.firstChild);
      commercial.querySelector('.grid')?.appendChild(host);
      creditSection.remove();
    }
    const oldCreditForm = Array.from(commercial.querySelectorAll('.card')).find(card => /Adicionar Créditos|Ajuste manual de créditos/i.test(card.querySelector('h2')?.textContent || ''));
    if (oldCreditForm) {
      setText(oldCreditForm.querySelector('h2'), 'Ajuste manual de créditos');
      setText(oldCreditForm.querySelector('.sub'), 'Use apenas para cortesia, bônus, estorno ou correção.');
      setText(oldCreditForm.querySelector('button'), 'Registrar ajuste');
    }
    return true;
  }

  function ensureCustomersSection() {
    const nav = document.querySelector('.seller-v2-nav');
    const dashboard = $('dashboardView');
    if (!nav || !dashboard) return false;
    if (!nav.querySelector('[data-seller-nav="customers"]')) {
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.sellerNav = 'customers'; button.textContent = 'Clientes';
      button.onclick = () => window.sellerPortalNavigate?.('customers');
      nav.insertBefore(button, nav.querySelector('[data-seller-nav="lists"]') || null);
      window.dispatchEvent(new CustomEvent('roneca:seller-navigation-changed'));
    }
    if (!$('sellerCustomersCard')) {
      const card = document.createElement('div');
      card.id = 'sellerCustomersCard'; card.className = 'card seller-portal-section seller-customers-card';
      card.dataset.sellerSection = 'customers'; card.hidden = true; card.setAttribute('aria-hidden', 'true');
      card.innerHTML = '<div class="seller-commercial-head"><div><small>Minha carteira</small><h2>Clientes</h2><p>Organize nome e WhatsApp dos clientes sem misturar essa edição com renovação ou troca de listas.</p></div><button class="primary" type="button" onclick="sellerCommercialOpenCustomer()">Novo cliente</button></div><div class="seller-customer-toolbar"><input id="sellerCustomerSearch" placeholder="Buscar por nome ou WhatsApp" oninput="sellerCommercialRenderCustomers()"></div><div id="sellerCustomerList" class="seller-customer-grid"><div class="commercial-empty">Carregando clientes...</div></div>';
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
      ledger.id = 'sellerUnifiedCreditLedger'; ledger.className = 'credit-package-card seller-unified-ledger';
      ledger.innerHTML = '<div class="credit-package-card-head"><div><h3>Movimentações</h3><p>Entradas, ativações, renovações, estornos e expirações.</p></div></div>';
      const list = $('ledgerList'); if (list) ledger.appendChild(list);
      newCard.querySelector('.credit-packages-shell')?.appendChild(ledger); oldCard.remove();
    }
    oldNav?.remove();
  }

  function ensurePriceSettings() {
    const card = $('sellerFinanceCard');
    if (!card || $('sellerPlanPrices')) return;
    const block = document.createElement('section');
    block.id = 'sellerPlanPrices'; block.className = 'seller-plan-prices';
    block.innerHTML = '<div class="seller-plan-prices-head"><div><small>Automação</small><h3>Meus preços por plano</h3><p>O seller-device-flow registra automaticamente a venda quando houver preço configurado.</p></div></div><div id="sellerPlanPriceGrid" class="seller-plan-price-grid"><div class="commercial-empty">Carregando planos...</div></div>';
    card.querySelector('.finance-card-head')?.insertAdjacentElement('afterend', block);
  }

  function renameFinance() {
    setText(document.querySelector('[data-seller-nav="finance"]'), 'Minhas vendas');
    const card = $('sellerFinanceCard'); if (!card) return;
    setText(card.querySelector('.finance-card-head h2'), 'Minhas vendas');
    setText(card.querySelector('.finance-card-head p'), 'Recebimentos dos clientes. A operação do aparelho acontece somente pelo fluxo comercial único.');
    ensurePriceSettings();
  }

  async function loadCommercial(force = false) {
    if (!/\/seller\.html$/i.test(location.pathname) || !window.RonecaPanelAuth?.hasSession?.()) return;
    if (state.loading) return;
    if (state.commercial && !force) return renderCommercial();
    state.loading = true;
    try { state.commercial = await api({ action: 'dashboard' }); renderCommercial(); }
    finally { state.loading = false; }
  }

  function renderCommercial() {
    ensureCustomersSection(); ensurePriceSettings();
    const grid = $('sellerPlanPriceGrid');
    if (grid) grid.innerHTML = (state.commercial?.plans || []).length ? state.commercial.plans.map(plan => `<article class="seller-plan-price-card"><div><small>${esc(plan.durationDays)} dias · custo ${esc(plan.creditCost)} crédito(s)</small><strong>${esc(plan.name)}</strong></div><label>Meu preço de venda (R$)<input id="sellerPlanPrice-${esc(plan.id)}" type="number" min="0.01" step="0.01" value="${plan.defaultSalePriceCents ? (plan.defaultSalePriceCents / 100).toFixed(2) : ''}" placeholder="0,00"></label><button type="button" onclick="sellerCommercialSavePrice('${esc(plan.id)}')">Salvar preço</button></article>`).join('') : '<div class="commercial-empty">Nenhum plano ativo disponível.</div>';
    window.sellerCommercialRenderCustomers?.();
  }

  window.sellerCommercialSavePrice = async planId => {
    try {
      const value = Number(String($(`sellerPlanPrice-${planId}`)?.value || '').replace(',', '.'));
      if (!Number.isFinite(value) || value <= 0) throw new Error('Informe um preço válido.');
      await api({ action: 'savePlanPrice', planId, defaultSalePriceCents: Math.round(value * 100) });
      await loadCommercial(true); notify('Preço salvo. O fluxo único usará esse valor nas próximas ativações e renovações.');
    } catch (error) { notify(error.message, true); }
  };

  window.sellerCommercialRenderCustomers = () => {
    const target = $('sellerCustomerList'); if (!target) return;
    const raw = String($('sellerCustomerSearch')?.value || '');
    const term = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const digits = raw.replace(/\D/g, '');
    const customers = (state.commercial?.customers || []).filter(customer => {
      const text = `${customer.name} ${customer.whatsapp}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return !term || text.includes(term) || (digits && customer.whatsapp.includes(digits));
    });
    target.innerHTML = customers.length ? customers.map(customer => `<article class="seller-customer-card"><div><strong>${esc(customer.name)}</strong><span>${esc(customer.whatsapp)}</span></div><div class="seller-customer-actions"><a href="https://wa.me/${esc(customer.whatsapp.startsWith('55') ? customer.whatsapp : `55${customer.whatsapp}`)}" target="_blank" rel="noreferrer">WhatsApp</a><button type="button" onclick="sellerCommercialOpenCustomer('${esc(customer.id)}')">Editar</button></div></article>`).join('') : '<div class="commercial-empty">Nenhum cliente encontrado.</div>';
  };

  function ensureCustomerModal() {
    if ($('sellerCustomerModal')) return;
    const modal = document.createElement('div'); modal.id = 'sellerCustomerModal'; modal.className = 'seller-commercial-modal';
    modal.innerHTML = '<div class="seller-commercial-modal-card"><div class="seller-commercial-modal-head"><div><h2 id="sellerCustomerModalTitle">Novo cliente</h2><p>Cadastro independente das operações do aparelho.</p></div><button type="button" onclick="sellerCommercialCloseCustomer()">×</button></div><label>Nome<input id="sellerCustomerName" maxlength="160"></label><label>WhatsApp<input id="sellerCustomerWhatsapp" inputmode="numeric"></label><div class="actions"><button class="primary" type="button" onclick="sellerCommercialSaveCustomer()">Salvar cliente</button><button type="button" onclick="sellerCommercialCloseCustomer()">Cancelar</button></div></div>';
    modal.addEventListener('click', event => { if (event.target === modal) window.sellerCommercialCloseCustomer(); }); document.body.appendChild(modal);
  }
  window.sellerCommercialOpenCustomer = customerId => {
    ensureCustomerModal(); const customer = (state.commercial?.customers || []).find(item => item.id === customerId) || null;
    state.customerEditingId = customer?.id || null; setText($('sellerCustomerModalTitle'), customer ? 'Editar cliente' : 'Novo cliente');
    $('sellerCustomerName').value = customer?.name || ''; $('sellerCustomerWhatsapp').value = customer?.whatsapp || ''; $('sellerCustomerModal').classList.add('open');
  };
  window.sellerCommercialCloseCustomer = () => { $('sellerCustomerModal')?.classList.remove('open'); state.customerEditingId = null; };
  window.sellerCommercialSaveCustomer = async () => {
    try {
      await api({ action: state.customerEditingId ? 'updateCustomer' : 'createCustomer', customerId: state.customerEditingId, name: $('sellerCustomerName')?.value, whatsapp: $('sellerCustomerWhatsapp')?.value });
      window.sellerCommercialCloseCustomer(); await loadCommercial(true); notify('Cliente salvo com sucesso.');
    } catch (error) { notify(error.message, true); }
  };

  function notify(message, error = false) {
    let toast = $('commercialConsolidationToast');
    if (!toast) { toast = document.createElement('div'); toast.id = 'commercialConsolidationToast'; toast.className = 'commercial-consolidation-toast'; document.body.appendChild(toast); }
    setText(toast, message || ''); toast.classList.toggle('error', error); toast.classList.add('show'); clearTimeout(toast._timer); toast._timer = setTimeout(() => toast.classList.remove('show'), 4200);
  }

  function consolidateSeller() {
    if (!/\/seller\.html$/i.test(location.pathname)) return false;
    removeSubscriptionUi(); ensureCustomersSection(); mergeCreditSections(); renameFinance();
    if (window.RonecaPanelAuth?.hasSession?.() && !state.commercial && !state.loading) loadCommercial().catch(error => notify(error.message, true));
    return true;
  }

  function patchSellerRender() {
    if (!/\/seller\.html$/i.test(location.pathname) || state.sellerRenderPatched) return;
    const original = window.renderPortal; if (typeof original !== 'function') return;
    state.sellerRenderPatched = true;
    window.renderPortal = function consolidatedSellerRender() {
      const result = original.apply(this, arguments);
      consolidateSeller(); loadCommercial(true).catch(error => notify(error.message, true)); return result;
    };
  }

  function install() { consolidateAdmin(); patchSellerRender(); consolidateSeller(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true }); else install();
  setTimeout(install, 300);
})();
