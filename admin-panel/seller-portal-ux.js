(() => {
  const API = 'https://awauvkjkucjqulkklmuo.supabase.co/functions/v1/seller-panel';
  const TOKEN_KEY = 'roneca_seller_token';
  let sellerUxData = null;
  let lookupDevice = null;
  let renewDeviceTarget = null;
  let activationAttempt = null;
  let renewalAttempt = null;

  function newOperationKey(prefix) {
    const random = globalThis.crypto?.randomUUID?.()
      || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}:${random}`;
  }

  function selectedPlan(planId) {
    return (sellerUxData?.plans || []).find(plan => plan.id === planId) || null;
  }

  function resolveExpiry(dateValue, planId, currentExpiresAt = null) {
    if (dateValue) {
      const explicit = new Date(`${dateValue}T23:59:59.999Z`);
      if (Number.isNaN(explicit.getTime())) throw new Error('Data de validade inválida.');
      return explicit.toISOString();
    }

    const plan = selectedPlan(planId);
    const durationDays = Math.max(1, Number(plan?.durationDays || 30));
    const now = new Date();
    const current = currentExpiresAt ? new Date(currentExpiresAt) : null;
    const base = current && !Number.isNaN(current.getTime()) && current > now
      ? new Date(current)
      : now;

    base.setUTCDate(base.getUTCDate() + durationDays);
    base.setUTCHours(23, 59, 59, 999);
    return base.toISOString();
  }

  function ensureAttempt(current, prefix, input, expiryFactory) {
    const fingerprint = JSON.stringify(input);
    if (!current || current.fingerprint !== fingerprint) {
      return {
        fingerprint,
        key: newOperationKey(prefix),
        expiresAt: expiryFactory(),
      };
    }
    return current;
  }

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function normalizeText(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function token() {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  }

  async function api(action, payload = {}) {
    const res = await fetch(API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-seller-token': token(),
      },
      body: JSON.stringify({ action, ...payload }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.message || 'Erro no portal do vendedor.');
    return data;
  }

  function fmtDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR');
  }

  function badge(status) {
    const safe = esc(status || '—');
    const labels = { active: 'Ativo', pending: 'Pendente', expired: 'Vencido', blocked: 'Bloqueado', inactive: 'Inativo' };
    return `<span class="badge ${safe}">${esc(labels[status] || status || '—')}</span>`;
  }

  function whatsappUrl(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    const phone = digits.startsWith('55') ? digits : '55' + digits;
    return 'https://wa.me/' + phone;
  }

  function showMsg(text, type = '') {
    const msg = $('sellerUxMsg');
    if (!msg) return;
    msg.className = `seller-msg ${type}`;
    msg.textContent = text || '';
  }

  function planOptions(selected = '') {
    const plans = sellerUxData?.plans || [];
    return '<option value="">Escolha um plano</option>' + plans.map(plan => (
      `<option value="${esc(plan.id)}" ${plan.id === selected ? 'selected' : ''}>${esc(plan.name)} — ${Number(plan.creditCost || 1)} crédito(s)</option>`
    )).join('');
  }

  function playlistOptions(selected = '') {
    const playlists = sellerUxData?.playlists || [];
    return '<option value="">Escolha uma lista liberada</option>' + playlists.map(playlist => (
      `<option value="${esc(playlist.id)}" ${playlist.id === selected ? 'selected' : ''}>${esc(playlist.name)}</option>`
    )).join('');
  }

  function ensureActivationCard() {
    if ($('sellerActivationCard')) return;

    const dashboard = $('dashboardView');
    if (!dashboard) return;

    const statsCard = dashboard.querySelector('.card');
    if (!statsCard) return;

    const card = document.createElement('div');
    card.id = 'sellerActivationCard';
    card.className = 'card seller-activation-card seller-portal-section';
    card.dataset.sellerSection = 'activation';
    card.hidden = true;
    card.innerHTML = `
      <div class="seller-activation-head">
        <div>
          <h2>Ativar aparelho por código</h2>
          <p class="muted">Digite o código que aparece no APK do cliente. O aparelho pendente será vinculado a você e ativado com seus créditos.</p>
        </div>
      </div>

      <div class="seller-code-search">
        <div>
          <label for="sellerDeviceCodeLookup">Código do aparelho</label>
          <input id="sellerDeviceCodeLookup" placeholder="Ex: ABC123" autocomplete="off" />
        </div>
        <button class="primary" type="button" onclick="sellerUxLookupDevice()">Buscar código</button>
      </div>

      <div id="sellerDeviceLookupResult"></div>

      <div id="sellerActivationForm" class="seller-activation-form">
        <div class="seller-form-grid">
          <div>
            <label for="sellerActivationCustomerName">Nome do cliente</label>
            <input id="sellerActivationCustomerName" placeholder="Ex: João Silva" />
          </div>
          <div>
            <label for="sellerActivationCustomerWhatsapp">WhatsApp do cliente</label>
            <input id="sellerActivationCustomerWhatsapp" placeholder="Ex: 19999999999" />
          </div>
          <div>
            <label for="sellerActivationPlan">Plano</label>
            <select id="sellerActivationPlan"></select>
          </div>
          <div>
            <label for="sellerActivationPlaylist">Lista liberada</label>
            <select id="sellerActivationPlaylist"></select>
          </div>
          <div class="wide">
            <label for="sellerActivationExpiresAt">Validade opcional</label>
            <input id="sellerActivationExpiresAt" type="date" />
          </div>
        </div>
        <div class="actions">
          <button class="primary" type="button" onclick="sellerUxActivateDevice()">Ativar usando meus créditos</button>
          <button type="button" onclick="sellerUxCloseActivationForm()">Cancelar</button>
        </div>
      </div>

      <div id="sellerUxMsg" class="seller-msg"></div>
    `;

    statsCard.insertAdjacentElement('beforebegin', card);
    window.sellerPortalRefreshNavigation?.();

    $('sellerDeviceCodeLookup')?.addEventListener('keydown', event => {
      if (event.key === 'Enter') window.sellerUxLookupDevice();
    });
  }

  function ensureModal() {
    if ($('sellerUxModal')) return;

    const modal = document.createElement('div');
    modal.id = 'sellerUxModal';
    modal.className = 'seller-ux-modal';
    modal.addEventListener('click', event => {
      if (event.target === modal) closeSellerUxModal();
    });
    modal.innerHTML = `
      <div class="seller-ux-card" onclick="event.stopPropagation()">
        <div class="seller-ux-head">
          <div>
            <h2 id="sellerUxModalTitle">Detalhes</h2>
            <p class="muted" id="sellerUxModalSubtitle"></p>
          </div>
          <button class="btn" type="button" onclick="closeSellerUxModal()">×</button>
        </div>
        <div id="sellerUxModalBody" class="seller-ux-body"></div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  function openSellerUxModal(title, subtitle, body) {
    ensureModal();
    $('sellerUxModalTitle').textContent = title;
    $('sellerUxModalSubtitle').textContent = subtitle || '';
    $('sellerUxModalBody').innerHTML = body;
    $('sellerUxModal').classList.add('open');
  }

  window.closeSellerUxModal = function closeSellerUxModal() {
    $('sellerUxModal')?.classList.remove('open');
  };

  async function refreshSellerUxData({ renderTable = true } = {}) {
    if (!token()) return;
    const data = await api('dashboard');
    sellerUxData = data;

    const planSelect = $('sellerActivationPlan');
    const playlistSelect = $('sellerActivationPlaylist');
    if (planSelect) planSelect.innerHTML = planOptions(planSelect.value);
    if (playlistSelect) playlistSelect.innerHTML = playlistOptions(playlistSelect.value);

    if (renderTable) renderSellerUxDevicesTable();
    return data;
  }

  function filteredDevices() {
    const devices = sellerUxData?.devices || [];
    const term = normalizeText($('deviceSearch')?.value || '');
    const status = $('statusFilter')?.value || '';
    const expiry = $('expiryFilter')?.value || '';

    return devices.filter(device => {
      const matchTerm = !term ||
        normalizeText(device.deviceCode).includes(term) ||
        normalizeText(device.deviceUuid).includes(term) ||
        normalizeText(device.customerName).includes(term) ||
        normalizeText(device.customerWhatsapp).includes(term) ||
        normalizeText(device.planName).includes(term) ||
        normalizeText(device.playlistName).includes(term);

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

  function validityText(device) {
    const days = device.daysLeft;
    if (days === null || days === undefined) return '—';
    if (days < 0) return `<span class="negative">${Math.abs(days)} dia(s) vencido</span>`;
    if (days <= 7) return `<span class="warn">${days} dia(s)</span>`;
    return `${days} dia(s)`;
  }

  function renderSellerUxDevicesTable() {
    if (!sellerUxData || !$('devicesBody')) return;

    const devices = filteredDevices();
    const total = (sellerUxData.devices || []).length;
    if ($('resultCount')) $('resultCount').textContent = `${devices.length} de ${total} aparelho(s) exibido(s).`;

    $('devicesBody').innerHTML = devices.length
      ? devices.map(device => {
        const wa = whatsappUrl(device.customerWhatsapp);
        return `
          <article class="seller-device-card" data-status="${esc(device.status)}">
            <div class="seller-device-head">
              <div>
                <div class="mono seller-device-code">${esc(device.deviceCode)}</div>
                <strong>${esc(device.customerName || 'Sem cliente')}</strong>
                <div class="small muted">${esc(device.customerWhatsapp || device.deviceUuid || 'Contato não informado')}</div>
              </div>
              ${badge(device.status)}
            </div>
            <div class="seller-device-meta">
              <div><small>Plano</small><span>${esc(device.planName || 'Sem plano')}</span></div>
              <div><small>Validade</small><span>${fmtDate(device.expiresAt)}</span>${validityText(device)}</div>
              <div><small>Lista</small><span>${esc(device.playlistName || 'Sem lista')}</span></div>
              <div><small>Último acesso</small><span>${fmtDate(device.lastSeenAt)}</span></div>
            </div>
            <div class="seller-device-actions">
              <button class="btn primary" onclick="sellerUxShowDeviceDetails('${esc(device.id)}')">Abrir</button>
              ${wa ? `<a class="btn" href="${esc(wa)}" target="_blank" rel="noreferrer">WhatsApp</a>` : ''}
              <button class="btn" onclick="sellerUxOpenRenewModal('${esc(device.id)}')">Renovar</button>
              ${device.status !== 'active' ? `<button class="btn primary" onclick="sellerUxPrepareActivation('${esc(device.deviceCode)}')">Ativar</button>` : ''}
              <button class="btn red" onclick="sellerUxBlockDevice('${esc(device.id)}')">Bloquear</button>
              <button class="btn red" onclick="sellerUxDeleteDevice('${esc(device.id)}')">Excluir</button>
            </div>
          </article>
        `;
      }).join('')
      : '<div class="seller-device-empty muted">Nenhum aparelho encontrado com esses filtros.</div>';
  }

  window.sellerUxLookupDevice = async function sellerUxLookupDevice() {
    try {
      showMsg('Buscando aparelho...');
      await refreshSellerUxData({ renderTable: false });

      const deviceCode = $('sellerDeviceCodeLookup').value.trim().toUpperCase();
      if (!deviceCode) throw new Error('Digite o código do aparelho.');

      const data = await api('lookupDeviceCode', { deviceCode });
      lookupDevice = data.device;
      const result = $('sellerDeviceLookupResult');
      const cls = lookupDevice.belongsToAnotherSeller ? 'err' : (lookupDevice.canClaim || lookupDevice.canActivate ? 'ok' : 'warn');

      result.innerHTML = `
        <div class="seller-device-result ${cls}">
          <strong>${esc(data.message || 'Código encontrado.')}</strong>
          <div style="margin-top:8px;">Código: <span class="mono">${esc(lookupDevice.deviceCode)}</span> · Status: ${badge(lookupDevice.status)}</div>
          <div class="muted" style="margin-top:6px;">Cliente: ${esc(lookupDevice.customerName || 'Sem cliente')} · Plano: ${esc(lookupDevice.planName || 'Sem plano')} · Lista: ${esc(lookupDevice.playlistName || 'Sem lista')}</div>
          <div class="actions">
            ${lookupDevice.canClaim ? `<button class="primary" onclick="sellerUxClaimDevice()">Puxar para mim</button>` : ''}
            ${lookupDevice.canActivate ? `<button class="primary" onclick="sellerUxOpenActivationForm()">Ativar este aparelho</button>` : ''}
          </div>
        </div>
      `;

      showMsg('');
    } catch (err) {
      lookupDevice = null;
      $('sellerDeviceLookupResult').innerHTML = `<div class="seller-device-result err">${esc(err.message || 'Erro ao buscar aparelho.')}</div>`;
      showMsg('', 'err');
    }
  };

  window.sellerUxClaimDevice = async function sellerUxClaimDevice() {
    try {
      if (!lookupDevice?.deviceCode) throw new Error('Busque um aparelho primeiro.');
      showMsg('Vinculando aparelho ao vendedor...');
      await api('claimPendingDevice', { deviceCode: lookupDevice.deviceCode });
      showMsg('Aparelho vinculado. Complete os dados para ativar.', 'ok');
      await window.sellerUxLookupDevice();
      window.sellerUxOpenActivationForm();
    } catch (err) {
      showMsg(err.message || 'Erro ao puxar aparelho.', 'err');
    }
  };

  window.sellerUxOpenActivationForm = function sellerUxOpenActivationForm() {
    if (!lookupDevice) {
      showMsg('Busque um aparelho primeiro.', 'err');
      return;
    }
    activationAttempt = null;
    $('sellerActivationForm').classList.add('open');
    $('sellerActivationCustomerName').value = lookupDevice.customerName || '';
    $('sellerActivationCustomerWhatsapp').value = lookupDevice.customerWhatsapp || '';
    $('sellerActivationPlan').innerHTML = planOptions(lookupDevice.planId || '');
    $('sellerActivationPlaylist').innerHTML = playlistOptions(lookupDevice.playlistId || '');
  };

  window.sellerUxCloseActivationForm = function sellerUxCloseActivationForm() {
    activationAttempt = null;
    $('sellerActivationForm')?.classList.remove('open');
  };

  window.sellerUxPrepareActivation = function sellerUxPrepareActivation(deviceCode) {
    $('sellerDeviceCodeLookup').value = deviceCode;
    window.sellerUxLookupDevice();
    document.getElementById('sellerActivationCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  window.sellerUxActivateDevice = async function sellerUxActivateDevice() {
    try {
      if (!lookupDevice?.deviceCode) throw new Error('Busque um aparelho primeiro.');
      showMsg('Ativando aparelho e consumindo créditos...');

      const input = {
        deviceCode: lookupDevice.deviceCode,
        customerName: $('sellerActivationCustomerName').value.trim(),
        customerWhatsapp: $('sellerActivationCustomerWhatsapp').value.trim(),
        planId: $('sellerActivationPlan').value,
        playlistId: $('sellerActivationPlaylist').value,
        expiresAtInput: $('sellerActivationExpiresAt').value || '',
      };

      activationAttempt = ensureAttempt(
        activationAttempt,
        'seller-activation',
        input,
        () => resolveExpiry(input.expiresAtInput, input.planId),
      );

      await api('activateDeviceByCode', {
        deviceCode: input.deviceCode,
        customerName: input.customerName,
        customerWhatsapp: input.customerWhatsapp,
        planId: input.planId,
        playlistId: input.playlistId,
        expiresAt: activationAttempt.expiresAt,
        idempotencyKey: activationAttempt.key,
      });

      activationAttempt = null;
      showMsg('Aparelho ativado com sucesso.', 'ok');
      $('sellerActivationForm').classList.remove('open');
      $('sellerDeviceLookupResult').innerHTML = '';
      lookupDevice = null;
      await window.loadPortal?.();
      await refreshSellerUxData();
    } catch (err) {
      showMsg(err.message || 'Erro ao ativar aparelho.', 'err');
    }
  };


  window.sellerUxShowDeviceDetails = function sellerUxShowDeviceDetails(deviceId) {
    const device = (sellerUxData?.devices || []).find(item => item.id === deviceId);
    if (!device) return;

    openSellerUxModal(
      'Aparelho',
      device.deviceCode,
      `
        <div class="seller-detail-grid">
          <div class="seller-detail-box"><small>Código</small><strong class="mono">${esc(device.deviceCode)}</strong></div>
          <div class="seller-detail-box"><small>Status</small>${badge(device.status)}</div>
          <div class="seller-detail-box"><small>Cliente</small><strong>${esc(device.customerName || 'Sem cliente')}</strong><br><span class="muted">${esc(device.customerWhatsapp || '')}</span></div>
          <div class="seller-detail-box"><small>Plano</small><strong>${esc(device.planName || 'Sem plano')}</strong><br><span class="muted">${esc(device.planCreditCost ? device.planCreditCost + ' crédito(s)' : '')}</span></div>
          <div class="seller-detail-box"><small>Lista</small><strong>${esc(device.playlistName || 'Sem lista')}</strong></div>
          <div class="seller-detail-box"><small>Validade</small><strong>${fmtDate(device.expiresAt)}</strong><br>${validityText(device)}</div>
          <div class="seller-detail-box"><small>UUID</small><strong class="mono">${esc(device.deviceUuid || '—')}</strong></div>
          <div class="seller-detail-box"><small>Último acesso</small><strong>${fmtDate(device.lastSeenAt)}</strong></div>
        </div>
      `
    );
  };

  window.sellerUxOpenRenewModal = function sellerUxOpenRenewModal(deviceId) {
    const device = (sellerUxData?.devices || []).find(item => item.id === deviceId);
    if (!device) return;
    renewDeviceTarget = device;
    renewalAttempt = null;

    openSellerUxModal(
      'Renovar aparelho',
      device.deviceCode,
      `
        <div class="seller-form-grid">
          <div>
            <label for="sellerRenewPlan">Plano</label>
            <select id="sellerRenewPlan">${planOptions(device.planId || '')}</select>
          </div>
          <div>
            <label for="sellerRenewPlaylist">Lista</label>
            <select id="sellerRenewPlaylist">${playlistOptions(device.playlistId || '')}</select>
          </div>
          <div class="wide">
            <label for="sellerRenewExpiresAt">Validade opcional</label>
            <input id="sellerRenewExpiresAt" type="date" />
          </div>
        </div>
        <div class="actions">
          <button class="primary" onclick="sellerUxRenewDevice()">Renovar usando meus créditos</button>
          <button onclick="closeSellerUxModal()">Cancelar</button>
        </div>
      `
    );
  };

  window.sellerUxRenewDevice = async function sellerUxRenewDevice() {
    try {
      if (!renewDeviceTarget) throw new Error('Aparelho não selecionado.');

      const input = {
        deviceId: renewDeviceTarget.id,
        planId: $('sellerRenewPlan').value,
        playlistId: $('sellerRenewPlaylist').value,
        expiresAtInput: $('sellerRenewExpiresAt').value || '',
      };

      renewalAttempt = ensureAttempt(
        renewalAttempt,
        'seller-renewal',
        input,
        () => resolveExpiry(input.expiresAtInput, input.planId, renewDeviceTarget.expiresAt),
      );

      await api('renewDevice', {
        deviceId: input.deviceId,
        planId: input.planId,
        playlistId: input.playlistId,
        expiresAt: renewalAttempt.expiresAt,
        idempotencyKey: renewalAttempt.key,
      });

      renewalAttempt = null;
      renewDeviceTarget = null;
      closeSellerUxModal();
      await window.loadPortal?.();
      await refreshSellerUxData();
    } catch (err) {
      alert(err.message || 'Erro ao renovar aparelho.');
    }
  };


  window.sellerUxBlockDevice = async function sellerUxBlockDevice(deviceId) {
    try {
      const device = (sellerUxData?.devices || []).find(item => item.id === deviceId);
      if (!device) return;
      if (!confirm(`Bloquear o aparelho ${device.deviceCode}?`)) return;
      await api('blockDevice', { deviceId, status: 'blocked' });
      await window.loadPortal?.();
      await refreshSellerUxData();
    } catch (err) {
      alert(err.message || 'Erro ao bloquear aparelho.');
    }
  };

  window.sellerUxDeleteDevice = async function sellerUxDeleteDevice(deviceId) {
    try {
      const device = (sellerUxData?.devices || []).find(item => item.id === deviceId);
      const code = device?.deviceCode || deviceId;
      const customer = device?.customerName || 'Sem cliente';

      if (!confirm(`Excluir o aparelho ${code}, vinculado a ${customer}?`)) return;
      if (!confirm('Confirma a exclusão definitiva? Esta ação remove o aparelho do painel e não pode ser desfeita.')) return;

      await api('deleteDevice', { deviceId });
      await window.loadPortal?.();
      await refreshSellerUxData();
    } catch (err) {
      alert(err.message || 'Erro ao excluir aparelho.');
    }
  };

  function patchFilters() {
    ['deviceSearch', 'statusFilter', 'expiryFilter'].forEach(id => {
      const el = $(id);
      if (!el || el.dataset.sellerUxPatched) return;
      el.dataset.sellerUxPatched = 'true';
      el.addEventListener('input', renderSellerUxDevicesTable);
      el.addEventListener('change', renderSellerUxDevicesTable);
    });
  }

  async function boot() {
    ensureActivationCard();
    ensureModal();
    patchFilters();

    const originalRenderPortal = window.renderPortal;
    if (typeof originalRenderPortal === 'function' && !window.__sellerUxRenderPortalPatched) {
      window.__sellerUxRenderPortalPatched = true;
      window.renderPortal = function patchedRenderPortal(data) {
        originalRenderPortal(data);
        sellerUxData = data;
        ensureActivationCard();
        window.sellerPortalRefreshNavigation?.();
        patchFilters();
        const planSelect = $('sellerActivationPlan');
        const playlistSelect = $('sellerActivationPlaylist');
        if (planSelect) planSelect.innerHTML = planOptions(planSelect.value);
        if (playlistSelect) playlistSelect.innerHTML = playlistOptions(playlistSelect.value);
        setTimeout(renderSellerUxDevicesTable, 0);
      };
    }

    if (token()) {
      try {
        await refreshSellerUxData();
      } catch {
        // o fluxo de login original cuida da mensagem quando o token estiver inválido
      }
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
  setTimeout(boot, 250);
})();
