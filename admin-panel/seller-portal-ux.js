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
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
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

  function formatWhatsapp(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    const local = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
    if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
    if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
    return String(value);
  }

  function showMsg(text, type = '') {
    const msg = $('sellerUxMsg');
    if (!msg) return;
    msg.className = `seller-msg ${type}`;
    msg.textContent = text || '';
  }

  function ensureToast() {
    if ($('sellerToast')) return;
    const toast = document.createElement('div');
    toast.id = 'sellerToast';
    toast.className = 'seller-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }

  function notify(text, type = 'ok') {
    ensureToast();
    const toast = $('sellerToast');
    toast.textContent = text;
    toast.className = `seller-toast ${type} visible`;
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => {
      toast.classList.remove('visible');
    }, 4200);
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
            <label for="sellerActivationPlaylist">Lista principal</label>
            <select id="sellerActivationPlaylist"></select>
          </div>
          <div>
            <label for="sellerActivationBackupPlaylist">Lista reserva (opcional)</label>
            <select id="sellerActivationBackupPlaylist"></select>
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
          <button class="btn" type="button" aria-label="Fechar janela" onclick="closeSellerUxModal()">×</button>
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
    const backupPlaylistSelect = $('sellerActivationBackupPlaylist');
    if (planSelect) planSelect.innerHTML = planOptions(planSelect.value);
    if (playlistSelect) playlistSelect.innerHTML = playlistOptions(playlistSelect.value);
    if (backupPlaylistSelect) backupPlaylistSelect.innerHTML = playlistOptions(backupPlaylistSelect.value).replace('Escolha uma lista liberada', 'Sem lista reserva');

    renderTodayActions();
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
    const amount = Math.abs(days);
    const unit = amount === 1 ? 'dia' : 'dias';
    if (days < 0) return `<span class="negative">${amount} ${unit} vencido</span>`;
    if (days <= 7) return `<span class="warn">${days} ${unit}</span>`;
    return `${days} ${unit}`;
  }

  function renderTodayActions() {
    const host = $('sellerTodayActions');
    if (!host || !sellerUxData) return;

    const stats = sellerUxData.stats || {};
    const balance = Number(sellerUxData.seller?.creditBalance || 0);
    const pending = Number(stats.pendingDevices || 0);
    const expiring = Number(stats.expiringSoon || 0);
    const pendingDeviceLabel = pending === 1 ? 'aparelho' : 'aparelhos';
    const expiringDeviceLabel = expiring === 1 ? 'aparelho vence' : 'aparelhos vencem';
    const creditLabel = balance === 1 ? 'crédito disponível' : 'créditos disponíveis';
    const priorities = [
      {
        tone: pending > 0 ? 'warn' : 'ok',
        title: pending > 0 ? `${pending} ${pendingDeviceLabel} aguardando ativação` : 'Nenhuma ativação pendente',
        text: pending > 0 ? 'Conclua os cadastros para liberar o acesso dos clientes.' : 'A fila de ativação está em dia.',
        label: pending > 0 ? 'Ver pendentes' : 'Ativar aparelho',
        action: pending > 0 ? "sellerUxOpenToday('devices','pending','')" : "sellerUxOpenToday('activation','','')",
      },
      {
        tone: expiring > 0 ? 'warn' : 'ok',
        title: expiring > 0 ? `${expiring} ${expiringDeviceLabel} em até 7 dias` : 'Nenhum vencimento próximo',
        text: expiring > 0 ? 'Antecipe as renovações para evitar interrupções.' : 'Não há renovação urgente para hoje.',
        label: expiring > 0 ? 'Ver renovações' : 'Ver aparelhos',
        action: expiring > 0 ? "sellerUxOpenToday('devices','','7')" : "sellerUxOpenToday('devices','','')",
      },
      {
        tone: balance <= 3 ? 'warn' : 'neutral',
        title: `${balance.toLocaleString('pt-BR')} ${creditLabel}`,
        text: balance <= 3 ? 'Seu saldo está baixo para novas ativações e renovações.' : 'Saldo disponível para manter a operação.',
        label: 'Ver créditos',
        action: "sellerUxOpenToday('credits','','')",
      },
    ];

    host.innerHTML = priorities.map(item => `
      <article class="seller-today-action ${item.tone}">
        <div><strong>${esc(item.title)}</strong><p>${esc(item.text)}</p></div>
        <button class="btn" type="button" onclick="${item.action}">${esc(item.label)}</button>
      </article>
    `).join('');
  }

  window.sellerUxOpenToday = function sellerUxOpenToday(section, status = '', expiry = '') {
    window.sellerPortalNavigate?.(section);
    if ($('statusFilter')) $('statusFilter').value = status;
    if ($('expiryFilter')) $('expiryFilter').value = expiry;
    if (section === 'devices') renderSellerUxDevicesTable();
  };

  function renderSellerUxDevicesTable() {
    if (!sellerUxData || !$('devicesBody')) return;

    const devices = filteredDevices();
    const total = (sellerUxData.devices || []).length;
    if ($('resultCount')) {
      const unit = total === 1 ? 'aparelho' : 'aparelhos';
      const state = total === 1 ? 'exibido' : 'exibidos';
      $('resultCount').textContent = `${devices.length} de ${total} ${unit} ${state}.`;
    }

    $('devicesBody').innerHTML = devices.length
      ? devices.map(device => {
        const wa = whatsappUrl(device.customerWhatsapp);
        return `
          <article class="seller-device-card" data-status="${esc(device.status)}">
            <div class="seller-device-head">
              <div>
                <div class="mono seller-device-code">${esc(device.deviceCode)}</div>
                <strong>${esc(device.customerName || 'Sem cliente')}</strong>
                <div class="small muted">${esc(formatWhatsapp(device.customerWhatsapp) || 'Contato não informado')}</div>
              </div>
              ${badge(device.status)}
            </div>
            <div class="seller-device-meta">
              <div><small>Plano</small><span>${esc(device.planName || 'Sem plano')}</span></div>
              <div><small>Validade</small><span>${fmtDate(device.expiresAt)}</span>${validityText(device)}</div>
              <div><small>Listas</small><span>${esc(device.playlistName || 'Sem lista')}</span><span class="small muted">Reserva: ${esc(device.backupPlaylistName || 'Não configurada')}</span></div>
              <div><small>Último acesso</small><span>${fmtDate(device.lastSeenAt)}</span></div>
            </div>
            <div class="seller-device-actions">
              <button class="btn primary" onclick="sellerUxShowDeviceDetails('${esc(device.id)}')">Abrir</button>
              <details class="seller-more-actions">
                <summary class="btn">Mais ações</summary>
                <div class="seller-more-actions-menu">
                  ${wa ? `<a class="btn" href="${esc(wa)}" target="_blank" rel="noreferrer">Conversar no WhatsApp</a>` : ''}
                  <button class="btn" onclick="sellerUxOpenRenewModal('${esc(device.id)}')">Renovar aparelho</button>
                  ${device.status !== 'active' ? `<button class="btn" onclick="sellerUxPrepareActivation('${esc(device.deviceCode)}')">Ativar aparelho</button>` : ''}
                  <div class="seller-destructive-actions">
                    <button class="btn red" onclick="sellerUxBlockDevice('${esc(device.id)}')">Bloquear</button>
                    <button class="btn red" onclick="sellerUxDeleteDevice('${esc(device.id)}')">Excluir</button>
                  </div>
                </div>
              </details>
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
    $('sellerActivationBackupPlaylist').innerHTML = playlistOptions(lookupDevice.backupPlaylistId || '').replace('Escolha uma lista liberada', 'Sem lista reserva');
  };

  window.sellerUxCloseActivationForm = function sellerUxCloseActivationForm() {
    activationAttempt = null;
    $('sellerActivationForm')?.classList.remove('open');
  };

  window.sellerUxPrepareActivation = async function sellerUxPrepareActivation(deviceCode) {
    window.sellerPortalNavigate?.('activation');
    $('sellerDeviceCodeLookup').value = deviceCode;
    await window.sellerUxLookupDevice();
    if (lookupDevice?.canActivate) window.sellerUxOpenActivationForm();
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
        backupPlaylistId: $('sellerActivationBackupPlaylist').value,
        expiresAtInput: $('sellerActivationExpiresAt').value || '',
      };
      if (input.playlistId && input.playlistId === input.backupPlaylistId) throw new Error('Escolha listas principal e reserva diferentes.');

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
        backupPlaylistId: input.backupPlaylistId,
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
          <div class="seller-detail-box"><small>Cliente</small><strong>${esc(device.customerName || 'Sem cliente')}</strong><br><span class="muted">${esc(formatWhatsapp(device.customerWhatsapp))}</span></div>
          <div class="seller-detail-box"><small>Plano</small><strong>${esc(device.planName || 'Sem plano')}</strong><br><span class="muted">${esc(device.planCreditCost ? device.planCreditCost + ' crédito(s)' : '')}</span></div>
          <div class="seller-detail-box"><small>Lista principal</small><strong>${esc(device.playlistName || 'Sem lista')}</strong></div>
          <div class="seller-detail-box"><small>Lista reserva</small><strong>${esc(device.backupPlaylistName || 'Não configurada')}</strong></div>
          <div class="seller-detail-box"><small>Validade</small><strong>${fmtDate(device.expiresAt)}</strong><br>${validityText(device)}</div>
          <div class="seller-detail-box"><small>Último acesso</small><strong>${fmtDate(device.lastSeenAt)}</strong></div>
        </div>
        <details class="seller-technical-details">
          <summary>Detalhes técnicos</summary>
          <div><small>UUID do aparelho</small><strong class="mono">${esc(device.deviceUuid || '—')}</strong></div>
        </details>
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
            <label for="sellerRenewPlaylist">Lista principal</label>
            <select id="sellerRenewPlaylist">${playlistOptions(device.playlistId || '')}</select>
          </div>
          <div>
            <label for="sellerRenewBackupPlaylist">Lista reserva (opcional)</label>
            <select id="sellerRenewBackupPlaylist">${playlistOptions(device.backupPlaylistId || '').replace('Escolha uma lista liberada', 'Sem lista reserva')}</select>
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
        backupPlaylistId: $('sellerRenewBackupPlaylist').value,
        expiresAtInput: $('sellerRenewExpiresAt').value || '',
      };
      if (input.playlistId && input.playlistId === input.backupPlaylistId) throw new Error('Escolha listas principal e reserva diferentes.');

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
        backupPlaylistId: input.backupPlaylistId,
        expiresAt: renewalAttempt.expiresAt,
        idempotencyKey: renewalAttempt.key,
      });

      renewalAttempt = null;
      renewDeviceTarget = null;
      closeSellerUxModal();
      await window.loadPortal?.();
      await refreshSellerUxData();
      notify('Aparelho renovado com sucesso.');
    } catch (err) {
      notify(err.message || 'Erro ao renovar aparelho.', 'err');
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
      notify('Aparelho bloqueado.');
    } catch (err) {
      notify(err.message || 'Erro ao bloquear aparelho.', 'err');
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
      notify('Aparelho excluído do painel.');
    } catch (err) {
      notify(err.message || 'Erro ao excluir aparelho.', 'err');
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
    ensureToast();
    patchFilters();

    const originalRenderPortal = window.renderPortal;
    if (typeof originalRenderPortal === 'function' && !window.__sellerUxRenderPortalPatched) {
      window.__sellerUxRenderPortalPatched = true;
      window.renderPortal = function patchedRenderPortal(data) {
        originalRenderPortal(data);
        sellerUxData = data;
        ensureActivationCard();
        renderTodayActions();
        window.sellerPortalRefreshNavigation?.();
        patchFilters();
        const planSelect = $('sellerActivationPlan');
        const playlistSelect = $('sellerActivationPlaylist');
        const backupPlaylistSelect = $('sellerActivationBackupPlaylist');
        if (planSelect) planSelect.innerHTML = planOptions(planSelect.value);
        if (playlistSelect) playlistSelect.innerHTML = playlistOptions(playlistSelect.value);
        if (backupPlaylistSelect) backupPlaylistSelect.innerHTML = playlistOptions(backupPlaylistSelect.value).replace('Escolha uma lista liberada', 'Sem lista reserva');
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
