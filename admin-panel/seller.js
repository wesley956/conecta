(() => {
  'use strict';

  const API_URL = 'https://awauvkjkucjqulkklmuo.supabase.co/functions/v1/seller-panel';
  const TOKEN_KEY = 'roneca_seller_token';

  const state = {
    data: null,
    lookupDevice: null,
    renewDevice: null,
    loading: false,
  };

  const byId = id => document.getElementById(id);

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function normalizeText(value) {
    return String(value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR');
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString('pt-BR');
  }

  function whatsappUrl(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    return `https://wa.me/${digits.startsWith('55') ? digits : `55${digits}`}`;
  }

  function badge(status) {
    const safe = escapeHtml(status || '—');
    return `<span class="seller-badge ${safe}">${safe}</span>`;
  }

  function cacheStatusText(status) {
    if (status === 'ready') return 'Cache pronto';
    if (status === 'processing') return 'Processando cache';
    if (status === 'error') return 'Erro no cache';
    return 'Aguardando cache';
  }

  function ledgerTypeText(type) {
    return ({
      purchase: 'Compra',
      activation: 'Ativação',
      renewal: 'Renovação',
      refund: 'Estorno',
      manual_add: 'Crédito manual',
      manual_remove: 'Remoção manual',
    })[type] || type || 'Movimento';
  }

  function token() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function setMessage(elementId, text, type = '') {
    const element = byId(elementId);
    if (!element) return;
    element.className = `seller-message${type ? ` is-${type}` : ''}`;
    element.textContent = text || '';
  }

  function setLoading(loading) {
    state.loading = loading;
    document.querySelectorAll('button').forEach(button => {
      if (button.dataset.keepEnabled === 'true') return;
      button.disabled = loading;
    });
  }

  async function api(action, payload = {}, customToken = token()) {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-seller-token': customToken,
      },
      body: JSON.stringify({ action, ...payload }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || data.message || 'Erro no portal do vendedor.');
    }
    return data;
  }

  function planOptions(selected = '') {
    const plans = state.data?.plans || [];
    return '<option value="">Escolha um plano</option>' + plans.map(plan => (
      `<option value="${escapeHtml(plan.id)}" ${plan.id === selected ? 'selected' : ''}>${escapeHtml(plan.name)} — ${formatNumber(plan.creditCost || 1)} crédito(s)</option>`
    )).join('');
  }

  function playlistOptions(selected = '') {
    const playlists = state.data?.playlists || [];
    return '<option value="">Escolha uma lista liberada</option>' + playlists.map(playlist => (
      `<option value="${escapeHtml(playlist.id)}" ${playlist.id === selected ? 'selected' : ''}>${escapeHtml(playlist.name)}</option>`
    )).join('');
  }

  function validityHtml(device) {
    const days = device.daysLeft;
    if (days === null || days === undefined || !Number.isFinite(Number(days))) return '—';
    if (Number(days) < 0) return `<span class="is-negative">${Math.abs(Number(days))} dia(s) vencido</span>`;
    if (Number(days) <= 7) return `<span class="is-warning">${Number(days)} dia(s)</span>`;
    return `${Number(days)} dia(s)`;
  }

  function filteredDevices() {
    const devices = state.data?.devices || [];
    const term = normalizeText(byId('deviceSearch')?.value);
    const status = byId('statusFilter')?.value || '';
    const expiry = byId('expiryFilter')?.value || '';

    return devices.filter(device => {
      const searchable = normalizeText([
        device.deviceCode,
        device.deviceUuid,
        device.customerName,
        device.customerWhatsapp,
        device.planName,
        device.playlistName,
      ].join(' '));

      const matchTerm = !term || searchable.includes(term);
      const matchStatus = !status || device.status === status;
      const days = Number(device.daysLeft);
      let matchExpiry = true;

      if (expiry === 'expired') matchExpiry = Number.isFinite(days) && days < 0;
      if (expiry === 'today') matchExpiry = Number.isFinite(days) && days === 0;
      if (expiry === '7') matchExpiry = Number.isFinite(days) && days >= 0 && days <= 7;
      if (expiry === '30') matchExpiry = Number.isFinite(days) && days >= 0 && days <= 30;
      if (expiry === 'ok') matchExpiry = Number.isFinite(days) && days > 30;

      return matchTerm && matchStatus && matchExpiry;
    });
  }

  function renderStats() {
    const seller = state.data?.seller || {};
    const stats = state.data?.stats || {};
    const balance = Number(seller.creditBalance || 0);
    const entries = [
      ['Saldo atual', formatNumber(balance), balance < 0 ? 'is-negative' : 'is-positive'],
      ['Aparelhos ativos', formatNumber(stats.activeDevices), ''],
      ['Vencendo 7 dias', formatNumber(stats.expiringSoon), 'is-warning'],
      ['Vencidos', formatNumber(stats.expiredDevices), 'is-negative'],
      ['Pendentes', formatNumber(stats.pendingDevices), ''],
      ['Bloqueados', formatNumber(stats.blockedDevices), ''],
      ['Créditos adicionados', formatNumber(stats.creditsAdded), 'is-positive'],
      ['Créditos consumidos', formatNumber(stats.creditsConsumed), 'is-negative'],
    ];

    byId('statsGrid').innerHTML = entries.map(([label, value, className]) => (
      `<div class="seller-stat"><small>${escapeHtml(label)}</small><strong class="${className}">${escapeHtml(value)}</strong></div>`
    )).join('');
  }

  function renderDevices() {
    const devices = filteredDevices();
    const total = state.data?.devices?.length || 0;
    byId('resultCount').textContent = `${devices.length} de ${total} aparelho(s) exibido(s).`;

    byId('devicesBody').innerHTML = devices.length ? devices.map(device => {
      const wa = whatsappUrl(device.customerWhatsapp);
      return `
        <tr>
          <td><span class="seller-mono">${escapeHtml(device.deviceCode)}</span><br><span class="seller-muted">${escapeHtml(device.deviceUuid || '')}</span></td>
          <td>${escapeHtml(device.customerName || 'Sem cliente')}${wa ? `<br><a class="seller-button" href="${escapeHtml(wa)}" target="_blank" rel="noreferrer">WhatsApp</a>` : ''}</td>
          <td>${badge(device.status)}</td>
          <td>${escapeHtml(device.planName || 'Sem plano')}<br><span class="seller-muted">${device.planCreditCost ? `${formatNumber(device.planCreditCost)} crédito(s)` : ''}</span></td>
          <td>${escapeHtml(device.playlistName || 'Sem lista')}</td>
          <td>${formatDate(device.expiresAt)}<br>${validityHtml(device)}</td>
          <td>${formatDate(device.lastSeenAt)}</td>
          <td>
            <div class="seller-row-actions">
              <button class="seller-button is-icon" type="button" data-device-action="details" data-device-id="${escapeHtml(device.id)}" title="Detalhes">👁️</button>
              <button class="seller-button is-icon" type="button" data-device-action="renew" data-device-id="${escapeHtml(device.id)}" title="Renovar">🔄</button>
              <button class="seller-button is-icon is-danger" type="button" data-device-action="block" data-device-id="${escapeHtml(device.id)}" title="Bloquear">🚫</button>
              ${device.status !== 'active' ? `<button class="seller-button is-icon is-success" type="button" data-device-action="activate" data-device-code="${escapeHtml(device.deviceCode)}" title="Ativar">✅</button>` : ''}
            </div>
          </td>
        </tr>`;
    }).join('') : '<tr><td colspan="8" class="seller-muted">Nenhum aparelho encontrado com esses filtros.</td></tr>';
  }

  function renderLedger() {
    const ledger = state.data?.creditLedger || [];
    byId('ledgerList').innerHTML = ledger.length ? ledger.map(entry => {
      const amount = Number(entry.amount || 0);
      return `
        <article class="seller-ledger-item">
          <div>
            <strong>${escapeHtml(ledgerTypeText(entry.type))}</strong>
            <div class="seller-ledger-meta">${escapeHtml(entry.description || 'Sem descrição')}</div>
            <div class="seller-ledger-meta">${formatDate(entry.createdAt)} · saldo após: ${formatNumber(entry.balanceAfter)}</div>
          </div>
          <strong class="${amount >= 0 ? 'is-positive' : 'is-negative'}">${amount > 0 ? '+' : ''}${formatNumber(amount)}</strong>
        </article>`;
    }).join('') : '<div class="seller-muted">Nenhuma movimentação ainda.</div>';
  }

  function renderPlaylists() {
    const playlists = state.data?.playlists || [];
    byId('playlistsList').innerHTML = playlists.length ? playlists.map(playlist => {
      const cacheStatus = String(playlist.cacheStatus || 'pending');
      return `
        <article class="seller-playlist">
          <div>
            <strong>${escapeHtml(playlist.name)}</strong>
            <div class="seller-playlist-meta">Tipo: ${escapeHtml(playlist.playlistType || 'm3u')} · Itens: ${formatNumber(playlist.cacheItemCount)}</div>
            <div class="seller-playlist-meta">Atualizado: ${formatDate(playlist.cacheUpdatedAt || playlist.playlistUpdatedAt)}</div>
            <span class="seller-cache-pill ${escapeHtml(cacheStatus)}">${escapeHtml(cacheStatusText(cacheStatus))}</span>
            ${playlist.cacheError ? `<p class="seller-message is-error">${escapeHtml(playlist.cacheError)}</p>` : ''}
          </div>
          <div class="seller-actions">
            <button class="seller-button" type="button" data-playlist-action="refresh" data-playlist-id="${escapeHtml(playlist.id)}">Gerar cache</button>
          </div>
        </article>`;
    }).join('') : '<div class="seller-muted">Nenhuma lista cadastrada ou liberada ainda.</div>';
  }

  function renderPortal(data) {
    state.data = data;
    const seller = data.seller || {};
    byId('sellerName').textContent = seller.name || 'Portal do Vendedor';
    byId('sellerSub').textContent = [seller.whatsapp, seller.email].filter(Boolean).join(' · ') || 'Resumo comercial';
    byId('activationPlan').innerHTML = planOptions(byId('activationPlan').value);
    byId('activationPlaylist').innerHTML = playlistOptions(byId('activationPlaylist').value);
    renderStats();
    renderDevices();
    renderLedger();
    renderPlaylists();
    byId('loginView').hidden = true;
    byId('dashboardView').hidden = false;
  }

  async function loadPortal({ showFeedback = false } = {}) {
    if (!token()) {
      byId('loginView').hidden = false;
      byId('dashboardView').hidden = true;
      return;
    }

    try {
      if (showFeedback) setMessage('activationMsg', 'Atualizando dados...');
      setLoading(true);
      renderPortal(await api('dashboard'));
      if (showFeedback) setMessage('activationMsg', 'Painel atualizado.', 'success');
    } catch (error) {
      localStorage.removeItem(TOKEN_KEY);
      byId('loginView').hidden = false;
      byId('dashboardView').hidden = true;
      setMessage('loginMsg', error.message || 'Faça login novamente.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function login(event) {
    event.preventDefault();
    const enteredToken = byId('sellerToken').value.trim();
    if (!enteredToken) {
      setMessage('loginMsg', 'Digite o token do vendedor.', 'error');
      return;
    }

    try {
      setLoading(true);
      setMessage('loginMsg', 'Verificando acesso...');
      const data = await api('dashboard', {}, enteredToken);
      localStorage.setItem(TOKEN_KEY, enteredToken);
      renderPortal(data);
      setMessage('loginMsg', '');
    } catch (error) {
      setMessage('loginMsg', error.message || 'Token inválido.', 'error');
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    state.data = null;
    state.lookupDevice = null;
    state.renewDevice = null;
    byId('sellerToken').value = '';
    byId('dashboardView').hidden = true;
    byId('loginView').hidden = false;
    setMessage('loginMsg', 'Acesso encerrado.');
    byId('sellerToken').focus();
  }

  function showLookupResult(device, message) {
    const result = byId('deviceLookupResult');
    const canContinue = device.canClaim || device.canActivate;
    result.hidden = false;
    result.className = `seller-result ${device.belongsToAnotherSeller ? 'is-error' : canContinue ? 'is-success' : ''}`;
    result.innerHTML = `
      <strong>${escapeHtml(message || 'Código encontrado.')}</strong>
      <p>Código: <span class="seller-mono">${escapeHtml(device.deviceCode)}</span> · Status: ${badge(device.status)}</p>
      <p class="seller-muted">Cliente: ${escapeHtml(device.customerName || 'Sem cliente')} · Plano: ${escapeHtml(device.planName || 'Sem plano')} · Lista: ${escapeHtml(device.playlistName || 'Sem lista')}</p>
      <div class="seller-actions">
        ${device.canClaim ? '<button id="claimDeviceButton" class="seller-button is-primary" type="button">Puxar para mim</button>' : ''}
        ${device.canActivate ? '<button id="openActivationButton" class="seller-button is-primary" type="button">Ativar este aparelho</button>' : ''}
      </div>`;
    byId('claimDeviceButton')?.addEventListener('click', claimDevice);
    byId('openActivationButton')?.addEventListener('click', openActivationForm);
  }

  async function lookupDevice() {
    const deviceCode = byId('deviceCodeLookup').value.trim().toUpperCase();
    if (!deviceCode) {
      setMessage('activationMsg', 'Digite o código do aparelho.', 'error');
      return;
    }

    try {
      setLoading(true);
      setMessage('activationMsg', 'Buscando aparelho...');
      const data = await api('lookupDeviceCode', { deviceCode });
      state.lookupDevice = data.device;
      showLookupResult(data.device, data.message);
      setMessage('activationMsg', '');
    } catch (error) {
      state.lookupDevice = null;
      byId('deviceLookupResult').hidden = false;
      byId('deviceLookupResult').className = 'seller-result is-error';
      byId('deviceLookupResult').textContent = error.message || 'Erro ao buscar aparelho.';
      setMessage('activationMsg', '', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function claimDevice() {
    if (!state.lookupDevice?.deviceCode) return;
    try {
      setLoading(true);
      setMessage('activationMsg', 'Vinculando aparelho...');
      await api('claimPendingDevice', { deviceCode: state.lookupDevice.deviceCode });
      const data = await api('lookupDeviceCode', { deviceCode: state.lookupDevice.deviceCode });
      state.lookupDevice = data.device;
      showLookupResult(data.device, data.message);
      openActivationForm();
      setMessage('activationMsg', 'Aparelho vinculado. Complete os dados para ativar.', 'success');
    } catch (error) {
      setMessage('activationMsg', error.message || 'Erro ao puxar aparelho.', 'error');
    } finally {
      setLoading(false);
    }
  }

  function openActivationForm() {
    const device = state.lookupDevice;
    if (!device) {
      setMessage('activationMsg', 'Busque um aparelho primeiro.', 'error');
      return;
    }
    byId('activationCustomerName').value = device.customerName || '';
    byId('activationCustomerWhatsapp').value = device.customerWhatsapp || '';
    byId('activationPlan').innerHTML = planOptions(device.planId || '');
    byId('activationPlaylist').innerHTML = playlistOptions(device.playlistId || '');
    byId('activationForm').hidden = false;
  }

  function closeActivationForm() {
    byId('activationForm').hidden = true;
  }

  async function activateDevice(event) {
    event.preventDefault();
    if (!state.lookupDevice?.deviceCode) {
      setMessage('activationMsg', 'Busque um aparelho primeiro.', 'error');
      return;
    }

    try {
      setLoading(true);
      setMessage('activationMsg', 'Ativando aparelho e consumindo créditos...');
      await api('activateDeviceByCode', {
        deviceCode: state.lookupDevice.deviceCode,
        customerName: byId('activationCustomerName').value.trim(),
        customerWhatsapp: byId('activationCustomerWhatsapp').value.trim(),
        planId: byId('activationPlan').value,
        playlistId: byId('activationPlaylist').value,
        expiresAt: byId('activationExpiresAt').value || null,
      });
      state.lookupDevice = null;
      byId('deviceLookupResult').hidden = true;
      byId('deviceCodeLookup').value = '';
      closeActivationForm();
      await loadPortal();
      setMessage('activationMsg', 'Aparelho ativado com sucesso.', 'success');
    } catch (error) {
      setMessage('activationMsg', error.message || 'Erro ao ativar aparelho.', 'error');
    } finally {
      setLoading(false);
    }
  }

  function togglePlaylistForm(force) {
    const form = byId('playlistForm');
    form.hidden = typeof force === 'boolean' ? !force : !form.hidden;
    if (!form.hidden) setTimeout(() => byId('playlistName').focus(), 0);
  }

  async function createPlaylist(event) {
    event.preventDefault();
    const name = byId('playlistName').value.trim();
    const playlistUrl = byId('playlistUrl').value.trim();
    const playlistType = byId('playlistType').value;

    if (!name || !playlistUrl) {
      setMessage('playlistsMsg', 'Informe o nome e a URL da lista.', 'error');
      return;
    }

    try {
      setLoading(true);
      setMessage('playlistsMsg', 'Salvando lista e gerando cache...');
      const result = await api('createSellerPlaylist', { name, playlistUrl, playlistType });
      byId('playlistName').value = '';
      byId('playlistUrl').value = '';
      togglePlaylistForm(false);
      await loadPortal();
      setMessage('playlistsMsg', result.message || 'Lista salva.', result.cache?.ok ? 'success' : '');
    } catch (error) {
      setMessage('playlistsMsg', error.message || 'Erro ao cadastrar lista.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function refreshPlaylistCache(playlistId) {
    try {
      setLoading(true);
      setMessage('playlistsMsg', 'Gerando cache da lista...');
      const result = await api('refreshSellerPlaylistCache', { playlistId });
      await loadPortal();
      setMessage('playlistsMsg', result.ok ? 'Cache atualizado com sucesso.' : 'Cache solicitado, mas ainda não ficou pronto.', result.ok ? 'success' : '');
    } catch (error) {
      setMessage('playlistsMsg', error.message || 'Erro ao gerar cache.', 'error');
    } finally {
      setLoading(false);
    }
  }

  function openModal(title, subtitle, body) {
    byId('modalTitle').textContent = title;
    byId('modalSubtitle').textContent = subtitle || '';
    byId('modalBody').innerHTML = body;
    byId('sellerModal').hidden = false;
  }

  function closeModal() {
    byId('sellerModal').hidden = true;
    byId('modalBody').innerHTML = '';
    state.renewDevice = null;
  }

  function showDeviceDetails(deviceId) {
    const device = state.data?.devices?.find(item => item.id === deviceId);
    if (!device) return;
    openModal('Aparelho', device.deviceCode, `
      <div class="seller-detail-grid">
        <div class="seller-detail-box"><small>Código</small><strong class="seller-mono">${escapeHtml(device.deviceCode)}</strong></div>
        <div class="seller-detail-box"><small>Status</small>${badge(device.status)}</div>
        <div class="seller-detail-box"><small>Cliente</small><strong>${escapeHtml(device.customerName || 'Sem cliente')}</strong><br><span class="seller-muted">${escapeHtml(device.customerWhatsapp || '')}</span></div>
        <div class="seller-detail-box"><small>Plano</small><strong>${escapeHtml(device.planName || 'Sem plano')}</strong></div>
        <div class="seller-detail-box"><small>Lista</small><strong>${escapeHtml(device.playlistName || 'Sem lista')}</strong></div>
        <div class="seller-detail-box"><small>Validade</small><strong>${formatDate(device.expiresAt)}</strong><br>${validityHtml(device)}</div>
        <div class="seller-detail-box"><small>UUID</small><strong class="seller-mono">${escapeHtml(device.deviceUuid || '—')}</strong></div>
        <div class="seller-detail-box"><small>Último acesso</small><strong>${formatDate(device.lastSeenAt)}</strong></div>
      </div>`);
  }

  function openRenewModal(deviceId) {
    const device = state.data?.devices?.find(item => item.id === deviceId);
    if (!device) return;
    state.renewDevice = device;
    openModal('Renovar aparelho', device.deviceCode, `
      <form id="renewForm" class="seller-form-panel">
        <div class="seller-form-grid">
          <div><label for="renewPlan">Plano</label><select id="renewPlan">${planOptions(device.planId || '')}</select></div>
          <div><label for="renewPlaylist">Lista</label><select id="renewPlaylist">${playlistOptions(device.playlistId || '')}</select></div>
          <div class="is-wide"><label for="renewExpiresAt">Validade opcional</label><input id="renewExpiresAt" type="date" /></div>
        </div>
        <div class="seller-actions">
          <button class="seller-button is-primary" type="submit">Renovar usando meus créditos</button>
          <button id="cancelRenewButton" class="seller-button" type="button">Cancelar</button>
        </div>
        <p id="renewMsg" class="seller-message"></p>
      </form>`);
    byId('renewForm').addEventListener('submit', renewDevice);
    byId('cancelRenewButton').addEventListener('click', closeModal);
  }

  async function renewDevice(event) {
    event.preventDefault();
    if (!state.renewDevice) return;
    try {
      setLoading(true);
      setMessage('renewMsg', 'Renovando aparelho...');
      await api('renewDevice', {
        deviceId: state.renewDevice.id,
        planId: byId('renewPlan').value,
        playlistId: byId('renewPlaylist').value,
        expiresAt: byId('renewExpiresAt').value || null,
      });
      closeModal();
      await loadPortal();
      setMessage('activationMsg', 'Aparelho renovado com sucesso.', 'success');
    } catch (error) {
      setMessage('renewMsg', error.message || 'Erro ao renovar aparelho.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function blockDevice(deviceId) {
    const device = state.data?.devices?.find(item => item.id === deviceId);
    if (!device || !window.confirm(`Bloquear o aparelho ${device.deviceCode}?`)) return;
    try {
      setLoading(true);
      await api('blockDevice', { deviceId, status: 'blocked' });
      await loadPortal();
      setMessage('activationMsg', 'Aparelho bloqueado.', 'success');
    } catch (error) {
      setMessage('activationMsg', error.message || 'Erro ao bloquear aparelho.', 'error');
    } finally {
      setLoading(false);
    }
  }

  function prepareActivation(deviceCode) {
    byId('deviceCodeLookup').value = deviceCode;
    lookupDevice();
    byId('activationTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function clearFilters() {
    byId('deviceSearch').value = '';
    byId('statusFilter').value = '';
    byId('expiryFilter').value = '';
    renderDevices();
  }

  function installEvents() {
    byId('loginForm').addEventListener('submit', login);
    byId('refreshPortalButton').addEventListener('click', () => loadPortal({ showFeedback: true }));
    byId('logoutButton').addEventListener('click', logout);
    byId('lookupDeviceButton').addEventListener('click', lookupDevice);
    byId('deviceCodeLookup').addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        lookupDevice();
      }
    });
    byId('activationForm').addEventListener('submit', activateDevice);
    byId('cancelActivationButton').addEventListener('click', closeActivationForm);
    byId('togglePlaylistFormButton').addEventListener('click', () => togglePlaylistForm());
    byId('cancelPlaylistButton').addEventListener('click', () => togglePlaylistForm(false));
    byId('playlistForm').addEventListener('submit', createPlaylist);
    byId('refreshPlaylistsButton').addEventListener('click', () => loadPortal({ showFeedback: true }));
    byId('deviceSearch').addEventListener('input', renderDevices);
    byId('statusFilter').addEventListener('change', renderDevices);
    byId('expiryFilter').addEventListener('change', renderDevices);
    byId('clearFiltersButton').addEventListener('click', clearFilters);
    byId('closeModalButton').addEventListener('click', closeModal);
    byId('sellerModal').addEventListener('click', event => {
      if (event.target === byId('sellerModal')) closeModal();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !byId('sellerModal').hidden) closeModal();
    });
    byId('devicesBody').addEventListener('click', event => {
      const button = event.target.closest('[data-device-action]');
      if (!button) return;
      const action = button.dataset.deviceAction;
      if (action === 'details') showDeviceDetails(button.dataset.deviceId);
      if (action === 'renew') openRenewModal(button.dataset.deviceId);
      if (action === 'block') blockDevice(button.dataset.deviceId);
      if (action === 'activate') prepareActivation(button.dataset.deviceCode);
    });
    byId('playlistsList').addEventListener('click', event => {
      const button = event.target.closest('[data-playlist-action="refresh"]');
      if (button) refreshPlaylistCache(button.dataset.playlistId);
    });
  }

  installEvents();
  loadPortal();
})();
