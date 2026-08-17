(() => {
  'use strict';
  if (window.__ronecaWebAccessManagementInstalled) return;
  window.__ronecaWebAccessManagementInstalled = true;

  const FUNCTION = 'web-access-panel';
  const isSellerPage = /seller/i.test(location.pathname);
  const esc = value => String(value ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#039;');

  function allDevices() {
    try {
      if (typeof devices !== 'undefined' && Array.isArray(devices)) return devices;
      if (typeof currentPortalData !== 'undefined' && Array.isArray(currentPortalData?.devices)) return currentPortalData.devices;
    } catch { /* page still booting */ }
    return [];
  }

  async function invoke(payload) {
    const config = window.RONECA_PANEL_CONFIG || {};
    const base = String(config.supabaseUrl || '').replace(/\/$/, '');
    if (!base || !config.anonKey || !window.RonecaPanelAuth) throw new Error('Sessão do painel indisponível.');
    const accessToken = await window.RonecaPanelAuth.getAccessToken();
    const response = await fetch(`${base}/functions/v1/${FUNCTION}`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        apikey: config.anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.message || data.error || data.code || `Falha HTTP ${response.status}.`);
    return data;
  }

  function notify(message, error = false) {
    if (typeof window.show === 'function') window.show(message, error);
    else if (error) alert(message);
  }

  function ensureModal() {
    let modal = document.getElementById('webAccessModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'webAccessModal';
    modal.className = 'wam-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="wam-dialog" role="dialog" aria-modal="true" aria-labelledby="wamTitle">
        <header><div><small>Acesso pelo navegador</small><h2 id="wamTitle">Acesso Web</h2><p id="wamSubtitle" class="muted"></p></div><button type="button" class="btn" data-wam-close>Fechar</button></header>
        <div id="wamBody"><div class="wam-loading">Carregando…</div></div>
      </div>`;
    modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
    modal.querySelector('[data-wam-close]')?.addEventListener('click', closeModal);
    document.body.appendChild(modal);
    return modal;
  }

  function closeModal() {
    const modal = document.getElementById('webAccessModal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }

  async function open(device) {
    const modal = ensureModal();
    modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false');
    modal.querySelector('#wamSubtitle').textContent = `${device.clientName || device.customerName || 'Cliente'} · ${device.deviceCode || ''}`;
    const body = modal.querySelector('#wamBody');
    body.innerHTML = '<div class="wam-loading">Carregando estado Web…</div>';
    try {
      const state = await invoke({ action: 'status', deviceId: device.id });
      render(device, state);
    } catch (error) {
      body.innerHTML = `<div class="wam-error">${esc(error.message || 'Falha ao carregar o acesso Web.')}</div>`;
    }
  }

  function render(device, state) {
    const modal = ensureModal();
    const body = modal.querySelector('#wamBody');
    const info = state.device || {};
    const sessions = Array.isArray(state.sessions) ? state.sessions : [];
    const statusLabel = info.webAccessEnabled ? 'Ativo' : info.pinConfigured ? 'Configurado' : 'Desativado';
    body.innerHTML = `
      <div class="wam-status-grid">
        <div><small>Status Web</small><strong class="${info.webAccessEnabled ? 'ok' : ''}">${esc(statusLabel)}</strong></div>
        <div><small>Sessões ativas</small><strong>${Number(info.activeSessions || 0)} / ${Number(info.sessionLimit || 2)}</strong></div>
        <div><small>PIN</small><strong>${info.pinConfigured ? 'Configurado' : 'Não configurado'}</strong></div>
      </div>
      <section class="wam-section">
        <h3>${info.pinConfigured ? 'Redefinir PIN Web' : 'Ativar acesso Web'}</h3>
        <p>Defina um novo PIN de 6 dígitos. O PIN atual nunca pode ser recuperado pelo painel.</p>
        <div class="wam-row">
          <input id="wamPin" type="password" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" autocomplete="new-password" placeholder="••••••" aria-label="Novo PIN Web" />
          <button type="button" class="btn primary" data-wam-pin>${info.pinConfigured ? 'Redefinir PIN' : 'Definir PIN'}</button>
        </div>
      </section>
      ${!isSellerPage ? `
      <section class="wam-section">
        <h3>Limite de sessões</h3>
        <div class="wam-row"><input id="wamLimit" type="number" min="1" max="8" value="${Number(info.sessionLimit || 2)}" /><button type="button" class="btn" data-wam-limit>Salvar limite</button></div>
      </section>` : ''}
      <section class="wam-section">
        <div class="wam-heading"><div><h3>Sessões Web</h3><p>Revogar uma sessão não desvincula o APK/IPK.</p></div><button type="button" class="btn danger" data-wam-revoke-all ${sessions.some(item => item.active) ? '' : 'disabled'}>Revogar todas</button></div>
        <div class="wam-sessions">
          ${sessions.length ? sessions.map(session => `
            <article class="wam-session ${session.active ? 'active' : ''}">
              <div><strong>${esc(session.browserFamily || 'Browser')} · ${esc(session.idShort || '')}</strong><small>${session.active ? 'Ativa' : session.revokedAt ? 'Revogada' : 'Expirada'} · último uso ${esc(formatDate(session.lastUsedAt))}</small></div>
              ${session.active ? `<button type="button" class="btn" data-wam-revoke="${esc(session.id)}">Revogar</button>` : ''}
            </article>`).join('') : '<p class="muted">Nenhuma sessão Web registrada.</p>'}
        </div>
      </section>
      <section class="wam-danger-zone">
        <div><strong>Desativar acesso Web</strong><p>Remove o PIN e revoga todas as sessões Web. O aparelho instalado continua vinculado.</p></div>
        <button type="button" class="btn danger" data-wam-disable ${info.webAccessEnabled || info.pinConfigured ? '' : 'disabled'}>Desativar</button>
      </section>`;

    body.querySelector('[data-wam-pin]')?.addEventListener('click', async () => {
      const pin = String(body.querySelector('#wamPin')?.value || '').replace(/\D/g, '');
      if (!/^\d{6}$/.test(pin)) return notify('Use exatamente 6 dígitos para o PIN Web.', true);
      await mutate(device, { action: info.pinConfigured ? 'reset-pin' : 'set-pin', deviceId: device.id, pin }, 'PIN Web atualizado.');
    });
    body.querySelector('[data-wam-limit]')?.addEventListener('click', async () => {
      const sessionLimit = Number(body.querySelector('#wamLimit')?.value);
      if (!Number.isInteger(sessionLimit) || sessionLimit < 1 || sessionLimit > 8) return notify('O limite deve ficar entre 1 e 8.', true);
      await mutate(device, { action: 'set-limit', deviceId: device.id, sessionLimit }, 'Limite Web atualizado.');
    });
    body.querySelectorAll('[data-wam-revoke]').forEach(button => button.addEventListener('click', async () => {
      await mutate(device, { action: 'revoke-session', deviceId: device.id, sessionId: button.dataset.wamRevoke }, 'Sessão revogada.');
    }));
    body.querySelector('[data-wam-revoke-all]')?.addEventListener('click', async () => {
      if (!confirm('Revogar todas as sessões Web deste aparelho?')) return;
      await mutate(device, { action: 'revoke-all', deviceId: device.id }, 'Sessões Web revogadas.');
    });
    body.querySelector('[data-wam-disable]')?.addEventListener('click', async () => {
      if (!confirm('Desativar o acesso Web e remover o PIN deste aparelho?')) return;
      await mutate(device, { action: 'disable', deviceId: device.id }, 'Acesso Web desativado.');
    });
  }

  async function mutate(device, payload, successMessage) {
    const body = ensureModal().querySelector('#wamBody');
    body.querySelectorAll('button,input').forEach(element => { element.disabled = true; });
    try {
      await invoke(payload); notify(successMessage); const next = await invoke({ action: 'status', deviceId: device.id }); render(device, next); patchCards();
    } catch (error) {
      notify(error.message || 'Falha na gestão do acesso Web.', true);
      body.querySelectorAll('button,input').forEach(element => { element.disabled = false; });
    }
  }

  function formatDate(value) {
    const date = new Date(value || 0);
    return Number.isFinite(date.getTime()) ? date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  }

  function patchCards() {
    const devicesList = allDevices();
    if (!devicesList.length) return;
    document.querySelectorAll('.admin-device-card,.seller-device-card').forEach(card => {
      if (card.querySelector('[data-web-access-button]')) return;
      const codeText = String(card.querySelector('.admin-device-code,.seller-device-code,code')?.textContent || '').trim();
      const device = devicesList.find(item => String(item.deviceCode || item.device_code || '').trim() === codeText)
        || (card.dataset.deviceId ? devicesList.find(item => item.id === card.dataset.deviceId) : null);
      if (!device?.id) return;
      const actions = card.querySelector('.admin-device-actions,.seller-device-actions') || card;
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'btn wam-card-button'; button.dataset.webAccessButton = '1';
      button.textContent = 'Acesso Web'; button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); void open(device); });
      actions.appendChild(button);
    });
  }

  const observer = new MutationObserver(() => patchCards());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('load', patchCards);
  window.setTimeout(patchCards, 500);
  window.setTimeout(patchCards, 1800);
})();
