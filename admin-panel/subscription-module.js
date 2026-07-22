(() => {
  'use strict';

  const FUNCTION_NAME = 'subscription-panel';
  const state = {
    page: document.body.classList.contains('seller-v2') ? 'seller' : 'admin',
    loaded: false,
    loading: false,
    principal: null,
    subscriptions: [],
    options: { customers: [], devices: [], playlists: [], plans: [], sellers: [] },
    conflicts: [],
    labSessions: [],
    search: '',
    status: '',
    toastTimer: null,
  };

  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const byId = id => document.getElementById(id);

  function installStyles() {
    if (document.querySelector('link[data-subscription-module]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './subscription-module.css?v=3.0';
    link.dataset.subscriptionModule = 'true';
    document.head.appendChild(link);
  }

  function newOperationKey(prefix) {
    const random = globalThis.crypto?.randomUUID?.()
      || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}:${random}`;
  }

  function formatDate(value, withTime = false) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return withTime ? date.toLocaleString('pt-BR') : date.toLocaleDateString('pt-BR');
  }

  function formatBytes(value) {
    const bytes = Number(value || 0);
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
  }

  function statusLabel(status) {
    const labels = {
      active: 'Ativa',
      pending: 'Preparando',
      suspended: 'Suspensa',
      expired: 'Vencida',
      cancelled: 'Cancelada',
      needs_review: 'Precisa revisão',
    };
    return labels[status] || status || '—';
  }

  function cycleLabel(cycle) {
    const labels = {
      monthly: 'Mensal',
      quarterly: 'Trimestral',
      semiannual: 'Semestral',
      annual: 'Anual',
      custom: 'Personalizado',
    };
    return labels[cycle] || cycle || 'Personalizado';
  }

  function showToast(message, error = false) {
    let toast = byId('subscriptionToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'subscriptionToast';
      toast.className = 'subscription-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = String(message || 'Operação concluída.');
    toast.classList.toggle('error', error);
    toast.classList.add('show');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toast.classList.remove('show'), 4200);
  }

  async function api(payload = {}) {
    const config = window.RONECA_PANEL_CONFIG || {};
    const supabaseUrl = String(config.supabaseUrl || '').replace(/\/$/, '');
    const anonKey = String(config.anonKey || '').trim();
    if (!supabaseUrl || !anonKey) throw new Error('Configuração pública do Supabase não encontrada.');
    if (!window.RonecaPanelAuth) throw new Error('Sessão do painel não encontrada.');
    const accessToken = await window.RonecaPanelAuth.getAccessToken();
    const response = await fetch(`${supabaseUrl}/functions/v1/${FUNCTION_NAME}`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || result.message || `Falha HTTP ${response.status}.`);
    return result.data ?? result;
  }

  function injectAdminSection() {
    if (byId('section-subscriptions')) return;
    const tabs = document.querySelector('.tabs');
    const main = document.querySelector('main.app') || document.querySelector('.app');
    if (!tabs || !main) return;

    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'tab';
    tab.dataset.subscriptionTab = 'true';
    tab.textContent = 'Assinaturas';
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(item => item.classList.remove('active'));
      document.querySelectorAll('.section').forEach(section => section.classList.remove('active'));
      tab.classList.add('active');
      byId('section-subscriptions')?.classList.add('active');
      loadData();
    });
    tabs.appendChild(tab);

    const section = document.createElement('section');
    section.id = 'section-subscriptions';
    section.className = 'section';
    section.innerHTML = '<div class="card"><div id="subscriptionModuleAdmin" class="subscription-module-root"><div class="subscription-module-empty">Carregando assinaturas...</div></div></div>';
    const firstModal = main.querySelector('.panel-ux-modal, .modal');
    if (firstModal) main.insertBefore(section, firstModal);
    else main.appendChild(section);
  }

  function injectSellerSection() {
    if (byId('sellerSubscriptionsCard')) return;
    const nav = document.querySelector('.seller-v2-nav');
    const dashboard = byId('dashboardView');
    if (!nav || !dashboard) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.sellerNav = 'subscriptions';
    button.textContent = 'Assinaturas';
    button.addEventListener('click', () => showSellerSubscriptions());
    nav.insertBefore(button, nav.querySelector('[data-seller-nav="credits"]') || null);

    const section = document.createElement('div');
    section.id = 'sellerSubscriptionsCard';
    section.className = 'card seller-portal-section';
    section.dataset.sellerSection = 'subscriptions';
    section.hidden = true;
    section.innerHTML = '<div id="subscriptionModuleSeller" class="subscription-module-root"><div class="subscription-module-empty">Carregando assinaturas...</div></div>';
    const credits = byId('sellerCreditsCard');
    if (credits) dashboard.insertBefore(section, credits);
    else dashboard.appendChild(section);

    const previousNavigate = window.sellerPortalNavigate;
    window.sellerPortalNavigate = function sellerPortalNavigateWithSubscriptions(target) {
      if (target === 'subscriptions') {
        showSellerSubscriptions();
        return;
      }
      section.hidden = true;
      section.setAttribute('aria-hidden', 'true');
      if (typeof previousNavigate === 'function') previousNavigate(target);
    };
  }

  function showSellerSubscriptions() {
    document.querySelectorAll('.seller-portal-section').forEach(section => {
      const active = section.dataset.sellerSection === 'subscriptions';
      section.hidden = !active;
      section.setAttribute('aria-hidden', String(!active));
    });
    document.querySelectorAll('.seller-v2-nav button').forEach(button => {
      const active = button.dataset.sellerNav === 'subscriptions';
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    byId('dashboardView')?.setAttribute('data-active-section', 'subscriptions');
    loadData();
  }

  function injectModal() {
    if (byId('subscriptionModal')) return;
    const modal = document.createElement('div');
    modal.id = 'subscriptionModal';
    modal.className = 'subscription-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = '<div class="subscription-modal-card" role="dialog" aria-modal="true"><div id="subscriptionModalContent"></div></div>';
    modal.addEventListener('click', event => {
      if (event.target === modal) closeModal();
    });
    document.body.appendChild(modal);
  }

  function closeModal() {
    const modal = byId('subscriptionModal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    byId('subscriptionModalContent').innerHTML = '';
  }

  function openModal(title, subtitle, bodyHtml, submitLabel, onSubmit) {
    injectModal();
    const content = byId('subscriptionModalContent');
    content.innerHTML = `
      <div class="subscription-modal-head">
        <div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div>
        <button class="btn" type="button" data-subscription-close>×</button>
      </div>
      <form id="subscriptionModalForm">
        ${bodyHtml}
        <div class="subscription-module-actions" style="margin-top:16px;justify-content:flex-end">
          <button class="btn" type="button" data-subscription-close>Cancelar</button>
          <button class="btn primary" type="submit">${esc(submitLabel)}</button>
        </div>
      </form>`;
    content.querySelectorAll('[data-subscription-close]').forEach(button => button.addEventListener('click', closeModal));
    const form = byId('subscriptionModalForm');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const submitButton = form.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      try {
        await onSubmit(new FormData(form), form);
        closeModal();
        await loadData(true);
      } catch (error) {
        showToast(error.message || 'Falha na operação.', true);
        submitButton.disabled = false;
      }
    });
    const modal = byId('subscriptionModal');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function options(items, valueKey, labelBuilder, selected = '', includeEmpty = false, emptyLabel = 'Selecione') {
    const rows = includeEmpty ? [`<option value="">${esc(emptyLabel)}</option>`] : [];
    for (const item of items || []) {
      const value = String(item[valueKey] || '');
      rows.push(`<option value="${esc(value)}" ${value === String(selected || '') ? 'selected' : ''}>${esc(labelBuilder(item))}</option>`);
    }
    return rows.join('');
  }

  function currentSellerId() {
    return state.principal?.role === 'seller' ? state.principal.sellerId : null;
  }

  function availableDevices(sellerId = null, includeLab = true) {
    return (state.options.devices || []).filter(device => {
      if (device.subscriptionId) return false;
      if (!includeLab && device.isLabDevice) return false;
      if (!sellerId) return true;
      return !device.sellerId || device.sellerId === sellerId;
    });
  }

  function customersForSeller(sellerId) {
    return (state.options.customers || []).filter(customer => !sellerId || customer.seller_id === sellerId);
  }

  function playlistsForSeller(sellerId) {
    if (state.principal?.role === 'seller') return state.options.playlists || [];
    return state.options.playlists || [];
  }

  function subscriptionById(id) {
    return state.subscriptions.find(subscription => subscription.id === id) || null;
  }

  function filteredSubscriptions() {
    const term = state.search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return state.subscriptions.filter(subscription => {
      if (state.status && subscription.status !== state.status) return false;
      if (!term) return true;
      const haystack = [
        subscription.customer?.name,
        subscription.customer?.whatsapp,
        subscription.seller?.name,
        subscription.planName,
        ...subscription.devices.map(item => item.device?.deviceCode),
        ...subscription.playlists.map(item => item.playlist?.name),
      ].join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return haystack.includes(term);
    });
  }

  function metricsHtml() {
    const now = Date.now();
    const active = state.subscriptions.filter(item => item.status === 'active').length;
    const expiring = state.subscriptions.filter(item => {
      const expiry = new Date(item.expiresAt).getTime();
      return item.status === 'active' && expiry >= now && expiry <= now + 7 * 86400000;
    }).length;
    const review = state.subscriptions.filter(item => item.status === 'needs_review').length;
    const occupied = state.subscriptions.reduce((sum, item) => sum + item.activeDeviceCount, 0);
    return `
      <div class="subscription-module-metrics">
        <div class="subscription-module-metric"><small>Assinaturas ativas</small><strong>${active}</strong></div>
        <div class="subscription-module-metric"><small>Vencem em 7 dias</small><strong>${expiring}</strong></div>
        <div class="subscription-module-metric"><small>Aparelhos autorizados</small><strong>${occupied}</strong></div>
        ${state.page === 'admin' ? `<div class="subscription-module-metric"><small>Precisam revisão</small><strong>${review}</strong></div>` : ''}
      </div>`;
  }

  function subscriptionCardHtml(subscription) {
    const activeDevices = subscription.devices.filter(item => item.status === 'active');
    const primary = subscription.playlists.find(item => item.priority === 1 && item.active);
    const backup = subscription.playlists.find(item => item.priority === 2 && item.active);
    const canOperate = subscription.status === 'active';
    const sellerText = state.page === 'admin' ? `<div><small>Vendedor</small><span>${esc(subscription.seller?.name || '—')}</span></div>` : '';
    return `
      <article class="subscription-card" data-status="${esc(subscription.status)}">
        <div class="subscription-card-title">
          <div>
            <h3>${esc(subscription.customer?.name || 'Cliente sem nome')}</h3>
            <div class="subscription-card-subtitle">${esc(subscription.customer?.whatsapp || 'Contato não informado')}</div>
          </div>
          <span class="subscription-status ${esc(subscription.status)}">${esc(statusLabel(subscription.status))}</span>
        </div>
        <div class="subscription-card-meta">
          <div><small>Plano</small><span>${esc(subscription.planName)} · ${subscription.maxDevices} aparelho(s)</span></div>
          <div><small>Validade única</small><span>${esc(formatDate(subscription.expiresAt))}</span></div>
          <div><small>Vagas usadas</small><span>${subscription.activeDeviceCount} de ${subscription.maxDevices} · ${subscription.availableDeviceSlots} livre(s)</span></div>
          <div><small>Conexões simultâneas</small><span>${subscription.simultaneousConnections}</span></div>
          ${sellerText}
          <div><small>Próxima renovação</small><span>${esc(subscription.scheduledPlan?.name || 'Mantém o plano atual')}</span></div>
        </div>
        <div>
          <strong>Aparelhos</strong>
          <div class="subscription-device-list" style="margin-top:7px">
            ${activeDevices.length ? activeDevices.map(item => `
              <div class="subscription-device-row">
                <div><code>${esc(item.device?.deviceCode || '—')}</code><div class="subscription-card-subtitle">${esc(item.device?.clientName || 'Sem identificação')}</div></div>
                <span class="subscription-status active">ativo</span>
              </div>`).join('') : '<div class="subscription-module-empty">Nenhum aparelho ativo.</div>'}
          </div>
        </div>
        <div>
          <strong>Listas exclusivas</strong>
          <div class="subscription-playlist-list" style="margin-top:7px">
            ${[primary, backup].filter(Boolean).map(item => `
              <div class="subscription-playlist-row">
                <div><strong>${item.priority === 1 ? 'Principal' : 'Reserva'} · ${esc(item.playlist?.name || '—')}</strong><div class="subscription-card-subtitle">${esc(item.playlist?.host || 'host oculto')} · cache ${esc(item.playlist?.cacheStatus || 'ausente')}</div></div>
                <span>${item.playlist?.maxConnections || 1} conexão(ões)</span>
              </div>`).join('') || '<div class="subscription-module-empty">Lista em migração ou aguardando revisão.</div>'}
          </div>
        </div>
        <div class="subscription-module-actions">
          ${canOperate && subscription.availableDeviceSlots > 0 ? `<button class="btn" type="button" data-subscription-action="add-device" data-id="${subscription.id}">Adicionar aparelho</button>` : ''}
          ${canOperate && activeDevices.length ? `<button class="btn" type="button" data-subscription-action="replace-device" data-id="${subscription.id}">Substituir aparelho</button>` : ''}
          ${canOperate ? `<button class="btn" type="button" data-subscription-action="change-plan" data-id="${subscription.id}">Alterar plano</button>` : ''}
          ${subscription.status !== 'cancelled' && subscription.status !== 'needs_review' ? `<button class="btn green" type="button" data-subscription-action="renew" data-id="${subscription.id}">Renovar assinatura</button>` : ''}
          ${state.principal?.isOwner ? `<button class="btn" type="button" data-subscription-action="diagnose" data-id="${subscription.id}">Diagnosticar cache</button>` : ''}
        </div>
      </article>`;
  }

  function conflictsHtml() {
    if (state.page !== 'admin' || !state.conflicts.length) return '';
    return `
      <div class="card">
        <div class="subscription-module-head"><div><h2>Conflitos da migração</h2><p class="sub muted">Listas antigas compartilhadas continuam funcionando, mas não entram na exclusividade até revisão.</p></div></div>
        <div class="subscription-module-grid">
          ${state.conflicts.map(conflict => `
            <article class="subscription-conflict-card">
              <strong>${esc(conflict.playlistName || 'Lista antiga')} · ${esc(conflict.deviceCode || 'aparelho')}</strong>
              <span class="subscription-card-subtitle">${esc(conflict.playlistHost || 'host oculto')}</span>
              <p>${esc(conflict.details?.message || 'Vínculo antigo precisa de revisão manual.')}</p>
              <div class="subscription-module-actions">
                <button class="btn" type="button" data-subscription-action="resolve-conflict" data-id="${conflict.id}">Marcar como revisado</button>
              </div>
            </article>`).join('')}
        </div>
      </div>`;
  }

  function labHtml() {
    if (!state.principal?.isOwner) return '';
    const labDevices = state.options.devices.filter(device => device.isLabDevice);
    return `
      <div class="card">
        <div class="subscription-module-head">
          <div><h2>Modo Laboratório do proprietário</h2><p class="sub muted">Acesso temporário para testar caches sem transferir cliente, vendedor ou assinatura.</p></div>
          <div class="subscription-module-actions">
            <button class="btn" type="button" data-subscription-action="mark-lab">Definir aparelho de laboratório</button>
            <button class="btn primary" type="button" data-subscription-action="create-lab" ${labDevices.length ? '' : 'disabled'}>Nova sessão temporária</button>
          </div>
        </div>
        <div class="subscription-lab-banner">A duração é escolhida por você. A sessão expira automaticamente, nunca mostra usuário ou senha da lista e desativa o acesso direto à URL original.</div>
        <div class="subscription-module-grid" style="margin-top:13px">
          ${state.labSessions.length ? state.labSessions.map(session => `
            <article class="subscription-lab-card">
              <div class="subscription-card-title"><div><h3>${esc(session.labDeviceCode || 'Dispositivo de laboratório')}</h3><div class="subscription-card-subtitle">Origem: ${esc(session.customerName || session.sourceDeviceCode || 'assinatura')}</div></div><span class="subscription-status ${session.status === 'active' ? 'active' : 'expired'}">${esc(session.status)}</span></div>
              <div class="subscription-card-meta"><div><small>Duração</small><span>${session.durationMinutes} minuto(s)</span></div><div><small>Expira</small><span>${esc(formatDate(session.expiresAt, true))}</span></div></div>
              <p>${esc(session.reason)}</p>
              ${session.status === 'active' ? `<button class="btn red" type="button" data-subscription-action="revoke-lab" data-id="${session.id}">Revogar agora</button>` : ''}
            </article>`).join('') : '<div class="subscription-module-empty">Nenhuma sessão de laboratório criada.</div>'}
        </div>
      </div>`;
  }

  function render() {
    const root = byId(state.page === 'seller' ? 'subscriptionModuleSeller' : 'subscriptionModuleAdmin');
    if (!root) return;
    const rows = filteredSubscriptions();
    root.innerHTML = `
      <div class="subscription-module-head">
        <div><h2>${state.page === 'seller' ? 'Minhas assinaturas' : 'Assinaturas dos clientes'}</h2><p class="sub muted">Plano, validade, listas exclusivas e aparelhos autorizados em um único lugar.</p></div>
        <div class="subscription-module-actions">
          <button class="btn" type="button" data-subscription-action="refresh">Atualizar</button>
          ${state.page === 'admin' ? '<button class="btn" type="button" data-subscription-action="new-plan">Novo plano</button>' : ''}
          <button class="btn primary" type="button" data-subscription-action="new-subscription">Nova assinatura</button>
        </div>
      </div>
      ${metricsHtml()}
      <div class="subscription-module-toolbar">
        <input id="subscriptionSearch" value="${esc(state.search)}" placeholder="Cliente, WhatsApp, vendedor, aparelho ou lista" />
        <select id="subscriptionStatusFilter">
          <option value="">Todos os status</option>
          ${['active', 'pending', 'needs_review', 'suspended', 'expired', 'cancelled'].map(status => `<option value="${status}" ${state.status === status ? 'selected' : ''}>${esc(statusLabel(status))}</option>`).join('')}
        </select>
      </div>
      <div class="subscription-module-grid">
        ${rows.length ? rows.map(subscriptionCardHtml).join('') : '<div class="subscription-module-empty">Nenhuma assinatura encontrada.</div>'}
      </div>
      ${conflictsHtml()}
      ${labHtml()}`;

    byId('subscriptionSearch')?.addEventListener('input', event => {
      state.search = event.target.value;
      render();
      requestAnimationFrame(() => byId('subscriptionSearch')?.focus());
    });
    byId('subscriptionStatusFilter')?.addEventListener('change', event => {
      state.status = event.target.value;
      render();
    });
    root.querySelectorAll('[data-subscription-action]').forEach(button => {
      button.addEventListener('click', () => handleAction(button.dataset.subscriptionAction, button.dataset.id));
    });
  }

  async function loadData(force = false) {
    if (state.loading) return;
    if (state.loaded && !force) {
      render();
      return;
    }
    if (!window.RonecaPanelAuth?.hasSession?.()) return;
    state.loading = true;
    try {
      const data = await api({ action: 'bootstrap' });
      state.principal = data.principal;
      state.subscriptions = data.subscriptions || [];
      state.options = data.options || state.options;
      state.conflicts = data.conflicts || [];
      state.labSessions = data.labSessions || [];
      state.loaded = true;
      render();
    } catch (error) {
      const root = byId(state.page === 'seller' ? 'subscriptionModuleSeller' : 'subscriptionModuleAdmin');
      if (root) root.innerHTML = `<div class="subscription-module-empty">${esc(error.message || 'Falha ao carregar assinaturas.')}</div>`;
    } finally {
      state.loading = false;
    }
  }

  function financeFields(prefix = '') {
    return `
      <label class="wide"><span>Registrar recebimento nesta operação?</span><select name="financeEnabled"><option value="no">Não</option><option value="yes">Sim</option></select></label>
      <label><span>Valor em reais</span><input name="financeAmount" inputmode="decimal" placeholder="Ex: 49,90" /></label>
      <label><span>Status financeiro</span><select name="financeStatus"><option value="paid">Pago</option><option value="pending">Pendente</option><option value="overdue">Atrasado</option></select></label>
      <label><span>Forma de pagamento</span><select name="paymentMethod"><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="card">Cartão</option><option value="bank_transfer">Transferência</option><option value="boleto">Boleto</option><option value="other">Outro</option></select></label>
      <label><span>Vencimento financeiro</span><input name="dueDate" type="date" /></label>
      <label class="wide"><span>Observação financeira</span><input name="financeNotes" maxlength="1000" placeholder="Opcional" /></label>`;
  }

  function financePayload(formData) {
    if (formData.get('financeEnabled') !== 'yes') return {};
    const raw = String(formData.get('financeAmount') || '').trim().replace(',', '.');
    const number = Number(raw);
    if (!Number.isFinite(number) || number <= 0) throw new Error('Informe o valor financeiro.');
    return {
      financeAmountCents: Math.round(number * 100),
      financeStatus: formData.get('financeStatus') || 'paid',
      paymentMethod: formData.get('paymentMethod') || 'pix',
      dueDate: formData.get('dueDate') || null,
      paidAt: formData.get('financeStatus') === 'paid' ? new Date().toISOString() : null,
      financeNotes: formData.get('financeNotes') || null,
    };
  }

  function openNewSubscription() {
    const fixedSellerId = currentSellerId();
    const initialSellerId = fixedSellerId || state.options.sellers?.[0]?.id || '';
    const customers = customersForSeller(initialSellerId);
    const devices = availableDevices(initialSellerId, false);
    const playlists = playlistsForSeller(initialSellerId);
    const sellerField = state.page === 'admin' ? `
      <label><span>Vendedor</span><select name="sellerId" id="subscriptionSellerSelect">${options(state.options.sellers, 'id', item => `${item.name} · ${item.creditBalance} créditos`, initialSellerId)}</select></label>` : '';
    openModal(
      'Nova assinatura',
      'Cobra o plano uma vez, vincula a lista exclusiva e libera o primeiro aparelho.',
      `<div class="subscription-form-grid">
        ${sellerField}
        <label><span>Cliente</span><select name="customerId" id="subscriptionCustomerSelect">${options(customers, 'id', item => `${item.name} · ${item.whatsapp}`)}</select></label>
        <label><span>Plano</span><select name="planId">${options(state.options.plans, 'id', item => `${item.name} · ${item.maxDevices} aparelho(s) · ${item.simultaneousConnections} simultânea(s)`)}</select></label>
        <label><span>Primeiro aparelho</span><select name="deviceId" id="subscriptionDeviceSelect">${options(devices, 'id', item => `${item.deviceCode} · ${item.clientName || 'pendente'}`)}</select></label>
        <label><span>Lista principal exclusiva</span><select name="primaryPlaylistId">${options(playlists, 'id', item => `${item.name} · ${item.host || 'host oculto'} · ${item.maxConnections} conexão(ões)`)}</select></label>
        <label><span>Lista reserva exclusiva</span><select name="backupPlaylistId">${options(playlists, 'id', item => `${item.name} · ${item.host || 'host oculto'}`, '', true, 'Sem lista reserva')}</select></label>
        <label><span>Validade manual opcional</span><input name="expiresAt" type="datetime-local" /></label>
        <div class="subscription-form-note wide">A lista precisa suportar as conexões simultâneas do plano. Outro cliente não poderá usar a mesma lista.</div>
        ${financeFields()}
      </div>`,
      'Criar assinatura',
      async formData => {
        const expiresRaw = formData.get('expiresAt');
        const payload = {
          action: 'create',
          sellerId: fixedSellerId || formData.get('sellerId'),
          customerId: formData.get('customerId'),
          planId: formData.get('planId'),
          deviceId: formData.get('deviceId'),
          primaryPlaylistId: formData.get('primaryPlaylistId'),
          backupPlaylistId: formData.get('backupPlaylistId') || null,
          expiresAt: expiresRaw ? new Date(String(expiresRaw)).toISOString() : null,
          idempotencyKey: newOperationKey('subscription-create'),
          ...financePayload(formData),
        };
        await api(payload);
        showToast('Assinatura criada e primeiro aparelho vinculado.');
      },
    );

    const sellerSelect = byId('subscriptionSellerSelect');
    sellerSelect?.addEventListener('change', () => {
      const sellerId = sellerSelect.value;
      const customerSelect = byId('subscriptionCustomerSelect');
      const deviceSelect = byId('subscriptionDeviceSelect');
      if (customerSelect) customerSelect.innerHTML = options(customersForSeller(sellerId), 'id', item => `${item.name} · ${item.whatsapp}`);
      if (deviceSelect) deviceSelect.innerHTML = options(availableDevices(sellerId, false), 'id', item => `${item.deviceCode} · ${item.clientName || 'pendente'}`);
    });
  }

  function openAddDevice(subscription) {
    const devices = availableDevices(subscription.sellerId, false);
    openModal(
      'Adicionar aparelho',
      `${subscription.activeDeviceCount} de ${subscription.maxDevices} vagas usadas. Não haverá nova cobrança.`,
      `<div class="subscription-form-grid"><label class="wide"><span>Novo aparelho</span><select name="deviceId">${options(devices, 'id', item => `${item.deviceCode} · ${item.clientName || 'pendente'}`)}</select></label></div>`,
      'Adicionar sem cobrar',
      async formData => {
        await api({ action: 'addDevice', subscriptionId: subscription.id, deviceId: formData.get('deviceId'), idempotencyKey: newOperationKey('subscription-add-device') });
        showToast('Aparelho adicionado à assinatura sem nova cobrança.');
      },
    );
  }

  function openReplaceDevice(subscription) {
    const activeDevices = subscription.devices.filter(item => item.status === 'active');
    const replacements = availableDevices(subscription.sellerId, false);
    openModal(
      'Substituir aparelho',
      'O aparelho antigo será revogado e o novo ocupará a mesma vaga, sem cobrança.',
      `<div class="subscription-form-grid">
        <label><span>Aparelho antigo</span><select name="oldDeviceId">${options(activeDevices, 'deviceId', item => item.device?.deviceCode || item.deviceId)}</select></label>
        <label><span>Aparelho novo</span><select name="newDeviceId">${options(replacements, 'id', item => `${item.deviceCode} · ${item.clientName || 'pendente'}`)}</select></label>
        <label class="wide"><span>Motivo</span><input name="reason" required minlength="3" maxlength="500" placeholder="Ex: TV substituída" /></label>
      </div>`,
      'Confirmar substituição',
      async formData => {
        await api({
          action: 'replaceDevice',
          subscriptionId: subscription.id,
          oldDeviceId: formData.get('oldDeviceId'),
          newDeviceId: formData.get('newDeviceId'),
          reason: formData.get('reason'),
          idempotencyKey: newOperationKey('subscription-replace-device'),
        });
        showToast('Aparelho substituído sem cobrança adicional.');
      },
    );
  }

  function openChangePlan(subscription) {
    openModal(
      'Alterar plano',
      'Upgrade é imediato e cobra somente a diferença. Downgrade entra na próxima renovação.',
      `<div class="subscription-form-grid">
        <label class="wide"><span>Novo plano</span><select name="planId">${options(state.options.plans, 'id', item => `${item.name} · ${item.maxDevices} aparelho(s) · ${item.creditCost} crédito(s)`, subscription.planId)}</select></label>
        <label class="wide"><span>Aplicação</span><select name="mode"><option value="upgrade">Aplicar agora como upgrade</option><option value="schedule_downgrade">Agendar para a próxima renovação</option></select></label>
      </div>`,
      'Alterar plano',
      async formData => {
        const mode = formData.get('mode');
        await api({ action: 'changePlan', subscriptionId: subscription.id, planId: formData.get('planId'), mode, idempotencyKey: newOperationKey('subscription-change-plan') });
        showToast(mode === 'upgrade' ? 'Upgrade aplicado.' : 'Downgrade agendado para a renovação.');
      },
    );
  }

  function openRenew(subscription) {
    openModal(
      'Renovar assinatura',
      'A cobrança acontece uma vez e todos os aparelhos recebem a mesma nova validade.',
      `<div class="subscription-form-grid"><div class="subscription-form-note wide">Plano da renovação: ${esc(subscription.scheduledPlan?.name || subscription.planName)} · custo comercial configurado no plano.</div>${financeFields()}</div>`,
      'Renovar todos os aparelhos',
      async formData => {
        await api({ action: 'renew', subscriptionId: subscription.id, idempotencyKey: newOperationKey('subscription-renew'), ...financePayload(formData) });
        showToast('Assinatura renovada e validade atualizada em todos os aparelhos.');
      },
    );
  }

  function openNewPlan() {
    openModal(
      'Novo plano comercial',
      'Aparelhos cadastrados e conexões simultâneas são limites diferentes.',
      `<div class="subscription-form-grid">
        <label class="wide"><span>Nome</span><input name="name" required maxlength="150" placeholder="Ex: Trimestral · 3 aparelhos" /></label>
        <label><span>Ciclo</span><select name="billingCycle"><option value="monthly">Mensal</option><option value="quarterly">Trimestral</option><option value="semiannual">Semestral</option><option value="annual">Anual</option><option value="custom">Personalizado</option></select></label>
        <label><span>Duração em dias</span><input name="durationDays" type="number" min="1" max="3660" value="30" required /></label>
        <label><span>Custo em créditos</span><input name="creditCost" type="number" min="1" value="1" required /></label>
        <label><span>Máximo de aparelhos</span><input name="maxDevices" type="number" min="1" max="5" value="1" required /></label>
        <label><span>Conexões simultâneas</span><input name="simultaneousConnections" type="number" min="1" max="5" value="1" required /></label>
      </div>`,
      'Salvar plano',
      async formData => {
        await api({
          action: 'savePlan',
          name: formData.get('name'),
          billingCycle: formData.get('billingCycle'),
          durationDays: Number(formData.get('durationDays')),
          creditCost: Number(formData.get('creditCost')),
          maxDevices: Number(formData.get('maxDevices')),
          simultaneousConnections: Number(formData.get('simultaneousConnections')),
        });
        showToast('Plano salvo.');
      },
    );
  }

  function openMarkLab() {
    const devices = state.options.devices || [];
    openModal(
      'Definir aparelho de laboratório',
      'Somente aparelhos marcados aqui poderão receber sessões temporárias.',
      `<div class="subscription-form-grid">
        <label class="wide"><span>Aparelho</span><select name="deviceId">${options(devices, 'id', item => `${item.deviceCode} · ${item.clientName || 'sem nome'}${item.isLabDevice ? ' · LAB ativo' : ''}`)}</select></label>
        <label class="wide"><span>Estado</span><select name="enabled"><option value="yes">Marcar como laboratório</option><option value="no">Remover marcação e revogar sessão</option></select></label>
      </div>`,
      'Aplicar',
      async formData => {
        await api({ action: 'markLabDevice', deviceId: formData.get('deviceId'), enabled: formData.get('enabled') === 'yes' });
        showToast('Configuração do aparelho de laboratório atualizada.');
      },
    );
  }

  function openCreateLab() {
    const labDevices = state.options.devices.filter(device => device.isLabDevice);
    openModal(
      'Nova sessão de laboratório',
      'Escolha a duração. O acesso expira automaticamente e usa somente caches assinados.',
      `<div class="subscription-form-grid">
        <label class="wide"><span>Assinatura ou aparelho de origem</span><select name="sourceSubscriptionId" id="labSourceSubscription">${options(state.subscriptions, 'id', item => `${item.customer?.name || 'Cliente'} · ${item.planName}`)}</select></label>
        <label><span>Aparelho de origem opcional</span><select name="sourceDeviceId" id="labSourceDevice"><option value="">Automático</option></select></label>
        <label><span>Aparelho de laboratório</span><select name="labDeviceId">${options(labDevices, 'id', item => `${item.deviceCode} · ${item.clientName || 'LAB'}`)}</select></label>
        <label><span>Duração</span><input name="duration" type="number" min="1" value="30" required /></label>
        <label><span>Unidade</span><select name="durationUnit"><option value="minutes">Minutos</option><option value="hours">Horas</option><option value="days">Dias</option></select></label>
        <label class="wide"><span>Motivo obrigatório</span><textarea name="reason" required minlength="3" maxlength="500" rows="3" placeholder="Ex: validar regeneração do cache de séries"></textarea></label>
      </div>`,
      'Iniciar sessão temporária',
      async formData => {
        const duration = Number(formData.get('duration'));
        const multiplier = formData.get('durationUnit') === 'days' ? 1440 : formData.get('durationUnit') === 'hours' ? 60 : 1;
        const durationMinutes = Math.round(duration * multiplier);
        if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 43200) {
          throw new Error('A duração deve ficar entre 1 minuto e 30 dias.');
        }
        await api({
          action: 'createLabSession',
          sourceSubscriptionId: formData.get('sourceSubscriptionId'),
          sourceDeviceId: formData.get('sourceDeviceId') || null,
          labDeviceId: formData.get('labDeviceId'),
          durationMinutes,
          reason: formData.get('reason'),
        });
        showToast('Sessão de laboratório iniciada.');
      },
    );

    const sourceSelect = byId('labSourceSubscription');
    const deviceSelect = byId('labSourceDevice');
    const updateDevices = () => {
      const subscription = subscriptionById(sourceSelect.value);
      const rows = subscription?.devices.filter(item => item.status === 'active') || [];
      deviceSelect.innerHTML = `<option value="">Automático</option>${options(rows, 'deviceId', item => item.device?.deviceCode || item.deviceId)}`;
    };
    sourceSelect?.addEventListener('change', updateDevices);
    updateDevices();
  }

  async function diagnose(subscription) {
    const sourceDevice = subscription.devices.find(item => item.status === 'active')?.deviceId || null;
    const result = await api({ action: 'diagnoseCache', subscriptionId: subscription.id, sourceDeviceId: sourceDevice });
    const rows = Array.isArray(result) ? result : [];
    openModal(
      'Diagnóstico de cache',
      `${subscription.customer?.name || 'Cliente'} · nenhuma credencial é exibida.`,
      `<div class="subscription-cache-result">
        ${rows.length ? rows.map(item => `
          <div class="subscription-cache-item">
            <strong>${item.priority === 1 ? 'Principal' : 'Reserva'} · ${esc(item.name || 'Lista')}</strong>
            <div class="subscription-card-subtitle">${esc(item.host || 'host oculto')} · ${esc(item.type || 'tipo')}</div>
            <div class="subscription-card-meta" style="margin-top:8px"><div><small>Status</small><span>${esc(item.cacheStatus)}</span></div><div><small>Itens</small><span>${item.cacheItemCount}</span></div><div><small>Tamanho</small><span>${formatBytes(item.cacheSizeBytes)}</span></div><div><small>Partes prontas</small><span>${item.partsPresent}/4</span></div></div>
            ${item.cacheError ? `<p style="color:#fecdd3">${esc(item.cacheError)}</p>` : ''}
          </div>`).join('') : '<div class="subscription-module-empty">Nenhuma lista exclusiva ou vínculo antigo foi encontrado.</div>'}
      </div>`,
      'Fechar',
      async () => closeModal(),
    );
    const form = byId('subscriptionModalForm');
    const submit = form?.querySelector('button[type="submit"]');
    if (submit) submit.textContent = 'Fechar';
  }

  async function handleAction(action, id) {
    try {
      if (action === 'refresh') return loadData(true);
      if (action === 'new-subscription') return openNewSubscription();
      if (action === 'new-plan') return openNewPlan();
      if (action === 'mark-lab') return openMarkLab();
      if (action === 'create-lab') return openCreateLab();
      const subscription = id ? subscriptionById(id) : null;
      if (action === 'add-device' && subscription) return openAddDevice(subscription);
      if (action === 'replace-device' && subscription) return openReplaceDevice(subscription);
      if (action === 'change-plan' && subscription) return openChangePlan(subscription);
      if (action === 'renew' && subscription) return openRenew(subscription);
      if (action === 'diagnose' && subscription) return diagnose(subscription);
      if (action === 'revoke-lab') {
        await api({ action: 'revokeLabSession', sessionId: id });
        showToast('Sessão de laboratório revogada.');
        return loadData(true);
      }
      if (action === 'resolve-conflict') {
        await api({ action: 'resolveConflict', conflictId: id, status: 'resolved' });
        showToast('Conflito marcado como revisado.');
        return loadData(true);
      }
    } catch (error) {
      showToast(error.message || 'Falha na operação.', true);
    }
  }

  function initialize() {
    installStyles();
    injectModal();
    if (state.page === 'seller') injectSellerSection();
    else injectAdminSection();

    const observer = new MutationObserver(() => {
      if (state.page === 'seller') injectSellerSection();
      else injectAdminSection();
      if (window.RonecaPanelAuth?.hasSession?.() && !state.loaded && !state.loading) loadData();
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });

    if (window.RonecaPanelAuth?.hasSession?.()) loadData();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
