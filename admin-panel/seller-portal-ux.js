(() => {
  'use strict';
  if (window.__ronecaSellerPortalUxV3Installed) return;
  window.__ronecaSellerPortalUxV3Installed = true;

  const $ = id => document.getElementById(id);
  const state = { data: null, lookup: null, loading: false };
  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

  async function api(action, payload = {}) {
    const config = window.RONECA_PANEL_CONFIG || {};
    if (!window.RonecaPanelAuth || !config.supabaseUrl || !config.anonKey) throw new Error('Sessão do painel indisponível.');
    const token = await window.RonecaPanelAuth.getAccessToken();
    const response = await fetch(`${String(config.supabaseUrl).replace(/\/$/, '')}/functions/v1/seller-panel`, {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', apikey: config.anonKey, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || 'Falha no portal do vendedor.');
    return data;
  }

  function notify(text, tone = '') {
    const target = $('sellerUxMsg') || $('msg');
    if (!target) return;
    target.textContent = text || '';
    target.className = target.id === 'msg' ? `msg ${tone === 'err' ? 'err' : ''} visible` : `seller-msg ${tone}`;
  }

  function fmtDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }
  function daysLeft(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return Math.ceil((date.getTime() - Date.now()) / 86400000);
  }
  function validityText(device) {
    const days = device.daysLeft ?? daysLeft(device.expiresAt);
    if (days === null || days === undefined) return '—';
    if (days < 0) return `<span class="negative">${Math.abs(days)} dia(s) vencido</span>`;
    if (days <= 7) return `<span class="warn">${days} dia(s)</span>`;
    return `${days} dia(s)`;
  }
  function badge(status) {
    const labels = { pending: 'Pendente', active: 'Ativo', blocked: 'Bloqueado', expired: 'Vencido', inactive: 'Inativo' };
    return `<span class="badge ${esc(status)}">${esc(labels[status] || status)}</span>`;
  }
  function whatsappUrl(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    return `https://wa.me/${digits.startsWith('55') ? digits : `55${digits}`}`;
  }
  function formatWhatsapp(value) { return String(value || '').trim(); }

  function ensureFlowEntry() {
    if ($('sellerDeviceFlowEntry')) return;
    const dashboard = $('dashboardView');
    if (!dashboard) return;
    const card = document.createElement('div');
    card.id = 'sellerDeviceFlowEntry';
    card.className = 'card seller-portal-section seller-activation-card';
    card.dataset.sellerSection = 'activation';
    card.hidden = true;
    card.setAttribute('aria-hidden', 'true');
    card.innerHTML = `
      <div class="seller-activation-head">
        <div><small>Ativação</small><h2>Ativar aparelho</h2><p>Busque o código e siga o fluxo único. Não existe formulário comercial alternativo nesta tela.</p></div>
      </div>
      <div class="seller-device-lookup">
        <input id="sellerFlowDeviceCode" class="mono" autocomplete="off" placeholder="RPTV-XXXXXX" maxlength="40">
        <button class="btn primary" type="button" data-sp-action="lookup">Buscar aparelho</button>
      </div>
      <div id="sellerFlowLookupResult"></div>
      <div id="sellerUxMsg" class="seller-msg"></div>`;
    const devices = $('sellerDevicesCard');
    if (devices) dashboard.insertBefore(card, devices);
    else dashboard.appendChild(card);
  }

  function ensureModal() {
    if ($('sellerUxModal')) return;
    const modal = document.createElement('div');
    modal.id = 'sellerUxModal';
    modal.className = 'seller-ux-modal';
    modal.innerHTML = `<div class="seller-ux-modal-card"><div class="seller-ux-modal-head"><div><small id="sellerUxModalKicker"></small><h2 id="sellerUxModalTitle"></h2></div><button type="button" class="btn" data-sp-action="close-modal">Fechar</button></div><div id="sellerUxModalBody"></div></div>`;
    modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
    document.body.appendChild(modal);
  }
  function openModal(kicker, title, html) {
    ensureModal();
    $('sellerUxModalKicker').textContent = kicker || '';
    $('sellerUxModalTitle').textContent = title || '';
    $('sellerUxModalBody').innerHTML = html;
    $('sellerUxModal').classList.add('open');
  }
  function closeModal() { $('sellerUxModal')?.classList.remove('open'); }

  function filteredDevices() {
    const rows = state.data?.devices || [];
    const term = String($('deviceSearch')?.value || '').trim().toLowerCase();
    const status = $('statusFilter')?.value || '';
    const expiry = $('expiryFilter')?.value || '';
    return rows.filter(device => {
      const text = `${device.deviceCode || ''} ${device.customerName || ''} ${device.customerWhatsapp || ''} ${device.planName || ''}`.toLowerCase();
      const days = device.daysLeft ?? daysLeft(device.expiresAt);
      let matchExpiry = true;
      if (expiry === 'expired') matchExpiry = Number.isFinite(days) && days < 0;
      if (expiry === 'today') matchExpiry = Number.isFinite(days) && days === 0;
      if (expiry === '7') matchExpiry = Number.isFinite(days) && days >= 0 && days <= 7;
      if (expiry === '30') matchExpiry = Number.isFinite(days) && days >= 0 && days <= 30;
      if (expiry === 'ok') matchExpiry = Number.isFinite(days) && days > 30;
      return (!term || text.includes(term)) && (!status || device.status === status) && matchExpiry;
    });
  }

  function renderToday() {
    const host = $('sellerTodayActions');
    if (!host || !state.data) return;
    const stats = state.data.stats || {};
    const balance = Number(state.data.seller?.creditBalance || 0);
    const pending = Number(stats.pendingDevices || 0);
    const expiring = Number(stats.expiringSoon || 0);
    host.innerHTML = `
      <article class="seller-today-action ${pending ? 'warn' : 'ok'}"><div><strong>${pending ? `${pending} aparelho(s) aguardando ativação` : 'Nenhuma ativação pendente'}</strong><p>${pending ? 'Use o fluxo único para concluir as ativações.' : 'A fila de ativação está em dia.'}</p></div><button class="btn" data-sp-action="nav" data-section="activation">${pending ? 'Ativar' : 'Nova ativação'}</button></article>
      <article class="seller-today-action ${expiring ? 'warn' : 'ok'}"><div><strong>${expiring ? `${expiring} vencimento(s) próximo(s)` : 'Nenhum vencimento próximo'}</strong><p>A renovação preserva cliente e listas.</p></div><button class="btn" data-sp-action="nav" data-section="devices">Ver aparelhos</button></article>
      <article class="seller-today-action ${balance <= 3 ? 'warn' : 'neutral'}"><div><strong>${balance.toLocaleString('pt-BR')} crédito(s)</strong><p>Ativações e renovações debitam somente pelo fluxo canônico.</p></div><button class="btn" data-sp-action="nav" data-section="credit-purchases">Meus créditos</button></article>`;
  }

  function deviceCard(device) {
    const wa = whatsappUrl(device.customerWhatsapp);
    return `<article class="seller-device-card" data-status="${esc(device.status)}" data-device-id="${esc(device.id)}">
      <div class="seller-device-head"><div><div class="mono seller-device-code">${esc(device.deviceCode)}</div><strong>${esc(device.customerName || 'Sem cliente')}</strong><div class="small muted">${esc(formatWhatsapp(device.customerWhatsapp) || 'Contato não informado')}</div></div>${badge(device.status)}</div>
      <div class="seller-device-meta">
        <div><small>Plano</small><span>${esc(device.planName || 'Sem plano')}</span></div>
        <div><small>Validade</small><span>${fmtDate(device.expiresAt)}</span>${validityText(device)}</div>
        <div><small>Lista principal</small><span>${esc(device.playlistName || 'Sem lista')}</span></div>
        <div><small>Lista reserva</small><span>${esc(device.backupPlaylistName || 'Não configurada')}</span></div>
        <div><small>Último acesso</small><span>${fmtDate(device.lastSeenAt)}</span></div>
      </div>
      <div class="seller-device-actions">
        <button class="btn primary" data-sp-action="details" data-device-id="${esc(device.id)}">Abrir</button>
        ${wa ? `<a class="btn" href="${esc(wa)}" target="_blank" rel="noreferrer">WhatsApp</a>` : ''}
        ${device.status === 'active' ? `<button class="btn" data-sp-action="renew" data-device-id="${esc(device.id)}">Renovar</button><button class="btn" data-sp-action="change" data-device-id="${esc(device.id)}">Alterar listas</button>` : `<button class="btn" data-sp-action="prepare-activation" data-device-code="${esc(device.deviceCode)}">Ativar</button>`}
        <details class="seller-more-actions"><summary class="btn">Administrar</summary><div class="seller-more-actions-menu"><button class="btn red" data-sp-action="block" data-device-id="${esc(device.id)}">Bloquear</button><button class="btn red" data-sp-action="delete" data-device-id="${esc(device.id)}">Excluir</button></div></details>
      </div>
    </article>`;
  }

  function renderDevices() {
    const host = $('devicesBody');
    if (!host || !state.data) return;
    const list = filteredDevices();
    const total = (state.data.devices || []).length;
    if ($('resultCount')) $('resultCount').textContent = `${list.length} de ${total} aparelho(s) exibido(s).`;
    host.innerHTML = list.length ? list.map(deviceCard).join('') : '<div class="seller-device-empty muted">Nenhum aparelho encontrado com esses filtros.</div>';
  }

  async function refresh({ renderTable = true } = {}) {
    if (state.loading) return state.data;
    state.loading = true;
    try {
      state.data = await api('dashboard');
      renderToday();
      if (renderTable) renderDevices();
      return state.data;
    } finally { state.loading = false; }
  }

  async function lookup(code = null) {
    const input = $('sellerFlowDeviceCode');
    const deviceCode = String(code || input?.value || '').trim().toUpperCase();
    if (!deviceCode) throw new Error('Digite o código do aparelho.');
    if (input) input.value = deviceCode;
    notify('Buscando aparelho...');
    const data = await api('lookupDeviceCode', { deviceCode });
    state.lookup = data.device;
    const target = $('sellerFlowLookupResult');
    const cls = state.lookup?.belongsToAnotherSeller ? 'err' : (state.lookup?.canClaim || state.lookup?.canActivate ? 'ok' : 'warn');
    target.innerHTML = `<div class="seller-device-result ${cls}"><strong>${esc(data.message || 'Código encontrado.')}</strong><div style="margin-top:8px">Código: <span class="mono">${esc(state.lookup?.deviceCode || deviceCode)}</span> · ${badge(state.lookup?.status || 'pending')}</div><div class="muted" style="margin-top:6px">Cliente: ${esc(state.lookup?.customerName || 'Sem cliente')} · Plano: ${esc(state.lookup?.planName || 'Sem plano')} · Lista: ${esc(state.lookup?.playlistName || 'Sem lista')}</div><div class="actions">${state.lookup?.canClaim ? '<button class="btn primary" data-sp-action="claim">Puxar para mim</button>' : ''}${state.lookup?.canActivate ? '<button class="btn primary" data-sp-action="activate-found">Ativar este aparelho</button>' : ''}</div></div>`;
    notify('');
    return data;
  }

  async function claim() {
    if (!state.lookup?.deviceCode) throw new Error('Busque um aparelho primeiro.');
    await api('claimPendingDevice', { deviceCode: state.lookup.deviceCode });
    notify('Aparelho vinculado. Agora conclua a ativação.', 'ok');
    await lookup(state.lookup.deviceCode);
  }

  async function prepareActivation(deviceCode) {
    window.sellerPortalNavigate?.('activation');
    await lookup(deviceCode);
    if (!state.lookup?.canActivate) throw new Error('Este aparelho não está disponível para ativação.');
    await window.RonecaSellerDeviceFlowUI?.openActivation(state.lookup.deviceCode);
  }

  function showDetails(deviceId) {
    const device = (state.data?.devices || []).find(item => item.id === deviceId);
    if (!device) return;
    openModal('Aparelho', device.deviceCode, `<div class="seller-detail-grid"><div class="seller-detail-box"><small>Status</small>${badge(device.status)}</div><div class="seller-detail-box"><small>Cliente</small><strong>${esc(device.customerName || 'Sem cliente')}</strong><br><span class="muted">${esc(formatWhatsapp(device.customerWhatsapp))}</span></div><div class="seller-detail-box"><small>Plano</small><strong>${esc(device.planName || 'Sem plano')}</strong></div><div class="seller-detail-box"><small>Validade</small><strong>${fmtDate(device.expiresAt)}</strong></div><div class="seller-detail-box"><small>Lista principal</small><strong>${esc(device.playlistName || 'Sem lista')}</strong></div><div class="seller-detail-box"><small>Lista reserva</small><strong>${esc(device.backupPlaylistName || 'Não configurada')}</strong></div><div class="seller-detail-box wide"><small>UUID</small><strong class="mono">${esc(device.deviceUuid || '—')}</strong></div></div>`);
  }

  async function blockDevice(deviceId) {
    const device = (state.data?.devices || []).find(item => item.id === deviceId);
    if (!device || !confirm(`Bloquear o aparelho ${device.deviceCode}?`)) return;
    await api('blockDevice', { deviceId, status: 'blocked' });
    await window.loadPortal?.(); await refresh(); notify('Aparelho bloqueado.', 'ok');
  }
  async function deleteDevice(deviceId) {
    const device = (state.data?.devices || []).find(item => item.id === deviceId);
    if (!device) return;
    if (!confirm(`Excluir o aparelho ${device.deviceCode}?`)) return;
    if (!confirm('Confirma a exclusão definitiva?')) return;
    await api('deleteDevice', { deviceId });
    await window.loadPortal?.(); await refresh(); notify('Aparelho excluído.', 'ok');
  }

  async function handleAction(button) {
    const action = button.dataset.spAction;
    try {
      if (action === 'lookup') await lookup();
      else if (action === 'claim') await claim();
      else if (action === 'activate-found') await window.RonecaSellerDeviceFlowUI?.openActivation(state.lookup?.deviceCode);
      else if (action === 'prepare-activation') await prepareActivation(button.dataset.deviceCode);
      else if (action === 'renew') await window.RonecaSellerDeviceFlowUI?.openRenewal(button.dataset.deviceId);
      else if (action === 'change') await window.RonecaSellerDeviceFlowUI?.openChange(button.dataset.deviceId);
      else if (action === 'details') showDetails(button.dataset.deviceId);
      else if (action === 'block') await blockDevice(button.dataset.deviceId);
      else if (action === 'delete') await deleteDevice(button.dataset.deviceId);
      else if (action === 'close-modal') closeModal();
      else if (action === 'nav') window.sellerPortalNavigate?.(button.dataset.section);
    } catch (error) { notify(error.message || 'Não foi possível concluir a ação.', 'err'); }
  }

  function wireFilters() {
    ['deviceSearch', 'statusFilter', 'expiryFilter'].forEach(id => {
      const input = $(id);
      if (!input || input.dataset.sellerFlowFilter) return;
      input.dataset.sellerFlowFilter = 'true';
      input.addEventListener('input', renderDevices);
      input.addEventListener('change', renderDevices);
    });
  }

  function installDelegation() {
    if (document.documentElement.dataset.sellerFlowDelegation) return;
    document.documentElement.dataset.sellerFlowDelegation = 'true';
    document.addEventListener('click', event => {
      const button = event.target.closest('[data-sp-action]');
      if (button) handleAction(button);
    });
    $('sellerFlowDeviceCode')?.addEventListener('keydown', event => { if (event.key === 'Enter') lookup().catch(error => notify(error.message, 'err')); });
  }

  async function boot() {
    ensureFlowEntry(); ensureModal(); wireFilters(); installDelegation();
    const originalRender = window.renderPortal;
    if (typeof originalRender === 'function' && !window.__sellerPortalCanonicalRenderPatch) {
      window.__sellerPortalCanonicalRenderPatch = true;
      window.renderPortal = function canonicalSellerRender(data) {
        const result = originalRender(data);
        state.data = data;
        ensureFlowEntry(); renderToday(); renderDevices(); wireFilters();
        window.sellerPortalRefreshNavigation?.();
        return result;
      };
    }
    if (window.RonecaPanelAuth?.hasSession?.()) await refresh().catch(() => {});
  }

  window.RonecaSellerPortal = Object.freeze({ refresh, lookup, prepareActivation });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
