(() => {
  'use strict';
  if (window.__ronecaAdminDeviceFlowInstalled) return;
  window.__ronecaAdminDeviceFlowInstalled = true;

  const FLOW_FUNCTION = 'seller-device-flow';
  const ADMIN_FUNCTION = 'admin-panel';
  const attempts = new Map();
  const locks = new Set();
  const $ = key => /^[#.\[]/.test(String(key || '')) ? document.querySelector(key) : document.getElementById(key);
  const esc = value => String(value ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#039;');

  function rows(name) {
    try {
      if (name === 'devices' && typeof devices !== 'undefined') return devices;
      if (name === 'sellers' && typeof sellers !== 'undefined') return sellers;
      if (name === 'plans' && typeof plans !== 'undefined') return plans;
      if (name === 'playlists' && typeof playlists !== 'undefined') return playlists;
      if (name === 'customers' && typeof customers !== 'undefined') return customers;
    } catch { /* página ainda carregando */ }
    return [];
  }

  async function invoke(functionName, payload) {
    const config = window.RONECA_PANEL_CONFIG || {};
    const base = String(config.supabaseUrl || '').replace(/\/$/, '');
    if (!base || !config.anonKey || !window.RonecaPanelAuth) throw new Error('Sessão do painel indisponível.');
    const accessToken = await window.RonecaPanelAuth.getAccessToken();
    const response = await fetch(`${base}/functions/v1/${functionName}`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        apikey: config.anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload || {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || data.message || `Falha HTTP ${response.status}.`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function notify(message, error = false) {
    if (typeof window.show === 'function') window.show(message, error);
    else if (error) alert(message);
  }

  function operationKey(action, deviceId, payload) {
    const mapKey = `${action}:${deviceId}`;
    const fingerprint = JSON.stringify(payload);
    const current = attempts.get(mapKey);
    if (current?.fingerprint === fingerprint) return current.key;
    const key = `admin-${action}:${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
    attempts.set(mapKey, { fingerprint, key });
    return key;
  }

  function clearAttempt(action, deviceId) { attempts.delete(`${action}:${deviceId}`); }

  async function locked(action, deviceId, runner) {
    const key = `${action}:${deviceId}`;
    if (locks.has(key)) return notify('Operação já em andamento. Aguarde finalizar.', true);
    locks.add(key);
    document.querySelectorAll(`button[onclick*="${CSS.escape(deviceId)}"]`).forEach(button => { button.disabled = true; });
    try { return await runner(); }
    finally {
      locks.delete(key);
      document.querySelectorAll(`button[onclick*="${CSS.escape(deviceId)}"]`).forEach(button => { button.disabled = false; });
    }
  }

  function isoFromDate(value) {
    const text = String(value || '').trim();
    if (!text) return null;
    const date = new Date(`${text}T23:59:59.999Z`);
    if (Number.isNaN(date.getTime())) throw new Error('Data de validade inválida.');
    return date.toISOString();
  }

  function planOptions(selectedId = '') {
    return '<option value="">Selecione o plano</option>' + rows('plans')
      .filter(plan => !plan.status || plan.status === 'active')
      .map(plan => `<option value="${esc(plan.id)}" ${plan.id === selectedId ? 'selected' : ''}>${esc(plan.name)} · ${Number(plan.creditCost || 1)} crédito(s)</option>`).join('');
  }

  function playlistOptions(selectedId = '', allowEmpty = false) {
    return (allowEmpty ? '<option value="">Sem reserva</option>' : '<option value="">Selecione a lista</option>') + rows('playlists')
      .filter(playlist => playlist.active !== false)
      .map(playlist => `<option value="${esc(playlist.id)}" ${playlist.id === selectedId ? 'selected' : ''}>${esc(playlist.name)}</option>`).join('');
  }

  function chargeSummary(sellerId, planId) {
    const seller = rows('sellers').find(item => item.id === sellerId);
    const plan = rows('plans').find(item => item.id === planId);
    if (!seller || !plan) throw new Error('Vendedor ou plano não encontrado.');
    const cost = Math.max(1, Number(plan.creditCost || 1));
    const before = Number(seller.creditBalance || 0);
    return { seller, plan, cost, before, after: before - cost };
  }

  function confirmCharge(device, sellerId, planId, label) {
    const info = chargeSummary(sellerId, planId);
    const negative = info.after < 0
      ? (info.seller.canGoNegative ? '\nSaldo ficará negativo conforme permissão do vendedor.' : '\nSaldo insuficiente: o backend bloqueará a operação.')
      : '';
    return confirm(`${label}\n\nAparelho: ${device.deviceCode}\nCliente: ${device.customerName || 'Sem cliente'}\nVendedor: ${info.seller.name}\nPlano: ${info.plan.name}\nCusto: ${info.cost} crédito(s)\nSaldo: ${info.before} → ${info.after}${negative}\n\nDeseja continuar?`);
  }

  function ensureModal() {
    if ($('adminDeviceFlowModal')) return;
    const modal = document.createElement('div');
    modal.id = 'adminDeviceFlowModal';
    modal.className = 'admin-device-flow-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="admin-device-flow-dialog" role="dialog" aria-modal="true" aria-labelledby="adminDeviceFlowTitle">
        <header><div><small id="adminDeviceFlowKicker">Fluxo comercial</small><h2 id="adminDeviceFlowTitle"></h2><p id="adminDeviceFlowSubtitle" class="muted"></p></div><button type="button" class="btn" data-adf-close>Fechar</button></header>
        <div id="adminDeviceFlowBody"></div>
      </div>`;
    modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
    modal.querySelector('[data-adf-close]').addEventListener('click', () => closeModal());
    document.body.appendChild(modal);

    const style = document.createElement('style');
    style.id = 'adminDeviceFlowStyle';
    style.textContent = `
      .admin-device-flow-modal{position:fixed;inset:0;z-index:1200;display:none;place-items:center;padding:20px;background:rgba(0,0,0,.72);backdrop-filter:blur(8px)}
      .admin-device-flow-modal.open{display:grid}.admin-device-flow-dialog{width:min(680px,100%);max-height:90vh;overflow:auto;border:1px solid rgba(255,255,255,.13);border-radius:22px;background:#10131a;padding:20px;box-shadow:0 30px 100px rgba(0,0,0,.55)}
      .admin-device-flow-dialog header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px}.admin-device-flow-dialog h2{margin:4px 0}.admin-device-flow-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.admin-device-flow-grid .wide{grid-column:1/-1}.admin-device-flow-note{margin-top:14px;padding:12px 14px;border:1px solid rgba(74,222,128,.25);border-radius:14px;background:rgba(74,222,128,.06)}.admin-device-flow-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}.admin-commercial-fields-note{grid-column:1/-1;padding:11px 13px;border:1px solid rgba(251,146,60,.25);border-radius:12px;background:rgba(251,146,60,.06)}
      @media(max-width:680px){.admin-device-flow-grid{grid-template-columns:1fr}.admin-device-flow-grid .wide{grid-column:1}}
    `;
    document.head.appendChild(style);
  }

  function openModal(title, subtitle, html, operation = '') {
    ensureModal();
    const modal = $('adminDeviceFlowModal');
    $('adminDeviceFlowTitle').textContent = title;
    $('adminDeviceFlowSubtitle').textContent = subtitle || '';
    $('adminDeviceFlowBody').innerHTML = html;
    modal.dataset.flowOperation = operation;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal(expectedOperation = '') {
    const modal = $('adminDeviceFlowModal');
    if (!modal) return;
    if (expectedOperation && modal.dataset.flowOperation !== expectedOperation) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    delete modal.dataset.flowOperation;
  }

  async function activatePending(deviceId) {
    try {
      const device = rows('devices').find(item => item.id === deviceId);
      if (!device) throw new Error('Aparelho não encontrado.');
      const customerId = $(`pend-customer-${deviceId}`)?.value || null;
      const sellerId = $(`pend-seller-${deviceId}`)?.value || null;
      const planId = $(`pend-plan-${deviceId}`)?.value || null;
      const playlistId = $(`pend-playlist-${deviceId}`)?.value || null;
      const backupPlaylistId = $(`pend-backup-playlist-${deviceId}`)?.value || null;
      const expiresAt = isoFromDate($(`pend-exp-${deviceId}`)?.value || '');
      if (!customerId) throw new Error('Escolha o cliente antes de ativar.');
      if (!sellerId) throw new Error('Escolha o vendedor antes de ativar.');
      if (!planId) throw new Error('Escolha o plano antes de ativar.');
      if (!playlistId) throw new Error('Escolha a lista principal antes de ativar.');
      if (backupPlaylistId && backupPlaylistId === playlistId) throw new Error('A reserva precisa ser diferente da principal.');
      if (!confirmCharge(device, sellerId, planId, 'Ativar aparelho')) return;

      const payload = { sellerId, deviceId, customerId, planId, playlistId, backupPlaylistId, expiresAt };
      await locked('activate', deviceId, async () => {
        const result = await invoke(FLOW_FUNCTION, { action: 'activate', ...payload, idempotencyKey: operationKey('activate', deviceId, payload) });
        clearAttempt('activate', deviceId);
        if (typeof window.loadAll === 'function') await window.loadAll();
        notify(result.message || 'Aparelho ativado.');
      });
    } catch (error) { notify(error.message || 'Não foi possível ativar o aparelho.', true); }
  }

  function openRenewal(deviceId) {
    try {
      const device = rows('devices').find(item => item.id === deviceId);
      if (!device) throw new Error('Aparelho não encontrado.');
      if (device.status !== 'active') throw new Error('Somente aparelhos ativos podem ser renovados.');
      if (!device.sellerId) throw new Error('O aparelho não possui vendedor.');
      const modalOperation = `renew:${deviceId}`;
      openModal('Renovar aparelho', `${device.deviceCode} · cliente e listas serão preservados`, `
        <div class="admin-device-flow-grid">
          <label class="wide">Plano<select class="table-select" id="adfRenewPlan">${planOptions(device.planId || '')}</select></label>
          <label class="wide">Nova validade <span class="muted">(opcional)</span><input class="table-input" id="adfRenewExpiry" type="date"><small class="muted">Em branco: o backend soma a duração do plano à validade atual.</small></label>
        </div>
        <div class="admin-device-flow-note"><strong>Preservado:</strong> cliente ${esc(device.customerName || 'atual')}, principal ${esc(device.playlistName || 'atual')} e reserva ${esc(device.backupPlaylistName || 'não configurada')}.</div>
        <div class="admin-device-flow-actions"><button type="button" class="btn" data-adf-cancel>Cancelar</button><button type="button" class="btn primary" data-adf-renew>Confirmar renovação</button></div>`, modalOperation);
      $('[data-adf-cancel]').addEventListener('click', () => closeModal(modalOperation));
      $('[data-adf-renew]').addEventListener('click', () => submitRenewal(deviceId, modalOperation));
    } catch (error) { notify(error.message, true); }
  }

  async function submitRenewal(deviceId, modalOperation = `renew:${deviceId}`) {
    try {
      const device = rows('devices').find(item => item.id === deviceId);
      if (!device) throw new Error('Aparelho não encontrado.');
      const sellerId = device.sellerId;
      const planId = $('adfRenewPlan')?.value || null;
      const expiresAt = isoFromDate($('adfRenewExpiry')?.value || '');
      if (!planId) throw new Error('Escolha o plano.');
      if (!confirmCharge(device, sellerId, planId, 'Renovar aparelho')) return;
      const payload = { sellerId, deviceId, planId, expiresAt };
      await locked('renew', deviceId, async () => {
        const button = $('[data-adf-renew]'); if (button) button.disabled = true;
        try {
          const result = await invoke(FLOW_FUNCTION, { action: 'renew', ...payload, idempotencyKey: operationKey('renew', deviceId, payload) });
          clearAttempt('renew', deviceId); closeModal(modalOperation);
          if (typeof window.loadAll === 'function') await window.loadAll();
          notify(result.message || 'Aparelho renovado.');
        } finally { if (button) button.disabled = false; }
      });
    } catch (error) { notify(error.message || 'Não foi possível renovar.', true); }
  }

  function openPlaylistChange(deviceId) {
    try {
      const device = rows('devices').find(item => item.id === deviceId);
      if (!device) throw new Error('Aparelho não encontrado.');
      if (device.status !== 'active') throw new Error('Somente aparelhos ativos podem trocar listas comercialmente.');
      if (!device.sellerId) throw new Error('O aparelho não possui vendedor.');
      const modalOperation = `changePlaylists:${deviceId}`;
      openModal('Alterar listas', `${device.deviceCode} · sem crédito, plano ou validade`, `
        <div class="admin-device-flow-grid">
          <label class="wide">Lista principal<select class="table-select" id="adfChangePrimary">${playlistOptions(device.playlistId || '', false)}</select></label>
          <label class="wide">Lista reserva<select class="table-select" id="adfChangeBackup">${playlistOptions(device.backupPlaylistId || '', true)}</select></label>
        </div>
        <div class="admin-device-flow-note"><strong>Sem cobrança:</strong> cliente, vendedor, plano e validade permanecem exatamente como estão.</div>
        <div class="admin-device-flow-actions"><button type="button" class="btn" data-adf-cancel>Cancelar</button><button type="button" class="btn primary" data-adf-change>Salvar listas</button></div>`, modalOperation);
      $('[data-adf-cancel]').addEventListener('click', () => closeModal(modalOperation));
      $('[data-adf-change]').addEventListener('click', () => submitPlaylistChange(deviceId, modalOperation));
    } catch (error) { notify(error.message, true); }
  }

  async function submitPlaylistChange(deviceId, modalOperation = `changePlaylists:${deviceId}`) {
    try {
      const device = rows('devices').find(item => item.id === deviceId);
      if (!device) throw new Error('Aparelho não encontrado.');
      const playlistId = $('adfChangePrimary')?.value || null;
      const backupPlaylistId = $('adfChangeBackup')?.value || null;
      if (!playlistId) throw new Error('Escolha a lista principal.');
      if (backupPlaylistId && backupPlaylistId === playlistId) throw new Error('A reserva precisa ser diferente da principal.');
      const payload = { sellerId: device.sellerId, deviceId, playlistId, backupPlaylistId, reason: 'Alteração pelo ADM' };
      await locked('changePlaylists', deviceId, async () => {
        const button = $('[data-adf-change]'); if (button) button.disabled = true;
        try {
          const result = await invoke(FLOW_FUNCTION, { action: 'changePlaylists', ...payload, idempotencyKey: operationKey('changePlaylists', deviceId, payload) });
          clearAttempt('changePlaylists', deviceId); closeModal(modalOperation);
          if (typeof window.loadAll === 'function') await window.loadAll();
          notify(result.message || 'Listas alteradas.');
        } finally { if (button) button.disabled = false; }
      });
    } catch (error) { notify(error.message || 'Não foi possível alterar as listas.', true); }
  }

  async function saveAdministrativeDevice(deviceId) {
    try {
      const device = rows('devices').find(item => item.id === deviceId);
      if (!device) throw new Error('Aparelho não encontrado.');
      const customerId = $(`dev-customer-${deviceId}`)?.value || null;
      const sellerId = $(`dev-seller-${deviceId}`)?.value || null;
      const status = $(`dev-status-${deviceId}`)?.value || device.status;

      const protectedValues = {
        planId: $(`dev-plan-${deviceId}`)?.value || null,
        playlistId: $(`dev-playlist-${deviceId}`)?.value || null,
        backupPlaylistId: $(`dev-backup-playlist-${deviceId}`)?.value || null,
        expiry: $(`dev-exp-${deviceId}`)?.value || '',
      };
      const currentExpiry = device.expiresAt ? new Date(device.expiresAt).toISOString().slice(0, 10) : '';
      if (protectedValues.planId !== (device.planId || null)
          || protectedValues.playlistId !== (device.playlistId || null)
          || protectedValues.backupPlaylistId !== (device.backupPlaylistId || null)
          || protectedValues.expiry !== currentExpiry) {
        throw new Error('Plano, validade e listas não são editados aqui. Use Renovar ou Alterar listas.');
      }
      if (device.status !== 'active' && status === 'active') {
        throw new Error('Para ativar um aparelho use a ação Ativar, que executa crédito e validade em uma única transação.');
      }

      await invoke(ADMIN_FUNCTION, { action: 'updateDevice', id: deviceId, customerId, sellerId, status });
      if (typeof window.loadAll === 'function') await window.loadAll();
      notify('Dados administrativos salvos. Plano, validade e listas não foram alterados.');
    } catch (error) { notify(error.message || 'Não foi possível salvar o aparelho.', true); }
  }

  function hideProtectedGenericFields(card, device) {
    const editor = card.querySelector('.admin-device-editor-grid');
    if (!editor) return;
    ['dev-plan-', 'dev-playlist-', 'dev-backup-playlist-', 'dev-exp-'].forEach(prefix => {
      const input = $(`${prefix}${device.id}`);
      input?.closest('label')?.setAttribute('hidden', '');
    });
    if (!editor.querySelector('.admin-commercial-fields-note')) {
      const note = document.createElement('div');
      note.className = 'admin-commercial-fields-note';
      note.innerHTML = '<strong>Campos comerciais separados</strong><div class="small">Plano e validade ficam em <b>Renovar</b>. Principal e reserva ficam em <b>Alterar listas</b>.</div>';
      editor.appendChild(note);
    }
    const status = $(`dev-status-${device.id}`);
    if (status && device.status !== 'active') {
      const active = [...status.options].find(option => option.value === 'active');
      if (active) active.disabled = true;
    }
  }

  function patchDeviceCards() {
    for (const device of rows('devices')) {
      const cards = [...document.querySelectorAll('.admin-device-card')].filter(card => card.querySelector('.admin-device-code')?.textContent.trim() === device.deviceCode);
      cards.forEach(card => {
        const actions = card.querySelector('.admin-device-actions');
        const renew = [...(actions?.querySelectorAll('button') || [])].find(button => (button.getAttribute('onclick') || '').includes('renewDevice'));
        if (renew) {
          renew.textContent = 'Renovar';
          renew.hidden = device.status !== 'active';
        }
        if (actions && device.status === 'active' && !actions.querySelector('[data-admin-change-playlists]')) {
          const button = document.createElement('button');
          button.type = 'button'; button.className = 'btn'; button.dataset.adminChangePlaylists = device.id; button.textContent = 'Alterar listas';
          button.addEventListener('click', () => openPlaylistChange(device.id)); actions.appendChild(button);
        }
        hideProtectedGenericFields(card, device);
      });
    }
  }

  function installOverrides() {
    window.activatePending = activatePending;
    window.renewDevice = openRenewal;
    window.saveDevice = saveAdministrativeDevice;
    window.adminChangeDevicePlaylists = openPlaylistChange;

    const originalRenderDevices = window.renderDevices;
    if (typeof originalRenderDevices === 'function' && !originalRenderDevices.__canonicalDeviceFlow) {
      const wrapped = function canonicalRenderDevices(...args) {
        const result = originalRenderDevices.apply(this, args);
        patchDeviceCards();
        return result;
      };
      wrapped.__canonicalDeviceFlow = true;
      window.renderDevices = wrapped;
    }

    const originalRenderAll = window.renderAll;
    if (typeof originalRenderAll === 'function' && !originalRenderAll.__canonicalDeviceFlow) {
      const wrapped = function canonicalRenderAll(...args) {
        const result = originalRenderAll.apply(this, args);
        patchDeviceCards();
        return result;
      };
      wrapped.__canonicalDeviceFlow = true;
      window.renderAll = wrapped;
    }
    patchDeviceCards();
  }

  function init() { ensureModal(); installOverrides(); }
  window.RonecaAdminDeviceFlow = Object.freeze({ activatePending, openRenewal, openPlaylistChange, saveAdministrativeDevice });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();