(() => {
  'use strict';
  if (window.__ronecaPlaylistCommercialQualificationInstalled) return;
  window.__ronecaPlaylistCommercialQualificationInstalled = true;

  const state = { playlists: new Map(), validationDevices: [], validationSessions: [], refreshing: null };
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#039;');

  function panelMessage(text, tone = '') {
    const target = $('sellerListsMsg') || $('sellerUxMsg');
    if (target) { target.className = `seller-msg ${tone}`; target.textContent = String(text || ''); return; }
    if (typeof window.show === 'function') window.show(String(text || ''), tone === 'err');
  }

  async function invoke(functionName, payload) {
    const config = window.RONECA_PANEL_CONFIG || {};
    const base = String(config.supabaseUrl || '').replace(/\/$/, '');
    if (!base || !config.anonKey || !window.RonecaPanelAuth) throw new Error('Sessão do painel não encontrada. Entre novamente.');
    const token = await window.RonecaPanelAuth.getAccessToken();
    const response = await fetch(`${base}/functions/v1/${functionName}`, {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', apikey: config.anonKey, Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload || {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || data.message || `Falha HTTP ${response.status}.`);
      error.status = response.status;
      throw error;
    }
    return data.data ?? data;
  }

  async function refreshPlaylists(force = false) {
    if (state.refreshing && !force) return state.refreshing;
    state.refreshing = (async () => {
      const playlists = window.RonecaPlaylistFlowController?.refreshPlaylists
        ? await window.RonecaPlaylistFlowController.refreshPlaylists(force)
        : (await invoke('playlist-registration', { action: 'list' })).playlists || [];
      state.playlists.clear();
      for (const playlist of playlists || []) if (playlist?.id) state.playlists.set(String(playlist.id), playlist);
      await renderQualificationPanel();
      return playlists;
    })().finally(() => { state.refreshing = null; });
    return state.refreshing;
  }

  async function retryPlaylist(playlistId) {
    const result = await invoke('playlist-registration', { action: 'retry', playlistId });
    panelMessage(result.message || 'Nova validação iniciada.', 'ok');
    await refreshPlaylists(true);
  }

  async function loadValidationState() {
    try {
      const result = await invoke('playlist-validation', { action: 'list' });
      state.validationDevices = result.devices || [];
      state.validationSessions = result.sessions || [];
      return true;
    } catch (error) {
      if (error.status === 403) return false;
      throw error;
    }
  }

  async function loadAdminDevices() {
    try {
      const result = await invoke('admin-panel', { action: 'listDevices' });
      return (result.devices || []).filter(device => device.status === 'pending' && !device.customerId && !device.playlistId && !device.planId);
    } catch { return []; }
  }

  function qualificationMount() {
    if (/\/dashboard\.html$/.test(location.pathname)) return $('section-playlists');
    return $('sellerPlaylistForm')?.parentElement || $('sellerListsMsg')?.parentElement || null;
  }

  async function renderQualificationPanel() {
    const mount = qualificationMount();
    if (!mount) return;
    let panel = $('ronecaQualificationPanel');
    if (!panel) {
      panel = document.createElement('section'); panel.id = 'ronecaQualificationPanel'; panel.className = 'roneca-qualification-panel'; mount.appendChild(panel);
    }

    const playlists = [...state.playlists.values()];
    const adminPage = /\/dashboard\.html$/.test(location.pathname);
    let ownerValidation = false;
    let allPendingDevices = [];
    if (adminPage) {
      ownerValidation = await loadValidationState().catch(() => false);
      if (ownerValidation) allPendingDevices = await loadAdminDevices();
    }
    const markedIds = new Set(state.validationDevices.map(device => device.id));
    const deviceOptions = [
      ...state.validationDevices.map(device => ({ ...device, marked: true })),
      ...allPendingDevices.filter(device => !markedIds.has(device.id)).map(device => ({ id: device.id, deviceCode: device.deviceCode, clientName: device.clientName, marked: false })),
    ];
    const activeSessions = state.validationSessions.filter(session => session.status === 'active');

    panel.innerHTML = `
      <h3>Diagnóstico e homologação técnica</h3>
      <p>Esta área serve para investigar provedores que exigem teste no aparelho. Ela não bloqueia nem altera os campos do fluxo comercial; a decisão de ativar é exclusiva do <strong>seller-device-flow</strong>.</p>
      ${ownerValidation ? `<div class="roneca-qualification-toolbar">
        <label><span>Aparelho dedicado ao teste</span><select id="qualificationDeviceSelect"><option value="">Selecione um aparelho pendente</option>${deviceOptions.map(device => `<option value="${esc(device.id)}" data-marked="${device.marked ? '1' : '0'}">${esc(device.deviceCode || device.id)}${device.clientName ? ` — ${esc(device.clientName)}` : ''}${device.marked ? ' — preparado' : ''}</option>`).join('')}</select></label>
        <label><span>Lista para diagnóstico</span><select id="qualificationPlaylistSelect"><option value="">Selecione a lista</option>${playlists.filter(item => item.requiresDeviceTest).map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}</select></label>
        <button type="button" class="primary" id="qualificationStartButton">Iniciar teste</button>
      </div>${activeSessions.length ? `<div class="roneca-qualification-list">${activeSessions.map(session => `<article class="roneca-qualification-item"><div><strong>Teste em andamento: ${esc(session.playlistName || 'Lista')}</strong><small>${esc(session.deviceCode || 'Aparelho')} · expira em ${esc(new Date(session.expiresAt).toLocaleString('pt-BR'))}</small></div><div class="roneca-qualification-actions"><button type="button" data-revoke-session="${esc(session.id)}">Encerrar</button></div></article>`).join('')}</div>` : ''}` : ''}
      <div class="roneca-qualification-list">${playlists.length ? playlists.map(item => `<article class="roneca-qualification-item" data-playlist-id="${esc(item.id)}"><div><strong>${esc(item.name)}</strong><span class="roneca-qualification-badge ${esc(item.qualificationStatus)}">${esc(item.qualificationLabel)}</span><small>${esc(item.qualificationMessage)}</small></div><div class="roneca-qualification-actions">${item.canRetryCache ? `<button type="button" data-retry-playlist="${esc(item.id)}">Gerar cache novamente</button>` : ''}${item.requiresDeviceTest && !ownerValidation ? '<span class="roneca-qualification-badge awaiting_device_test">Admin pode testar</span>' : ''}</div></article>`).join('') : '<div class="roneca-qualification-empty">Nenhuma lista disponível.</div>'}</div>`;

    panel.querySelectorAll('[data-retry-playlist]').forEach(button => button.addEventListener('click', () => retryPlaylist(button.dataset.retryPlaylist).catch(error => panelMessage(error.message, 'err'))));
    panel.querySelectorAll('[data-revoke-session]').forEach(button => button.addEventListener('click', async () => {
      try { await invoke('playlist-validation', { action: 'revoke', sessionId: button.dataset.revokeSession }); panelMessage('Sessão de validação encerrada.', 'ok'); await refreshPlaylists(true); }
      catch (error) { panelMessage(error.message, 'err'); }
    }));
    $('qualificationStartButton')?.addEventListener('click', async () => {
      const deviceSelect = $('qualificationDeviceSelect');
      const playlistId = $('qualificationPlaylistSelect')?.value || '';
      const deviceId = deviceSelect?.value || '';
      if (!deviceId || !playlistId) return panelMessage('Selecione o aparelho e a lista.', 'err');
      try {
        const option = deviceSelect.selectedOptions[0];
        if (option?.dataset.marked !== '1') await invoke('playlist-validation', { action: 'markDevice', deviceId, enabled: true });
        await invoke('playlist-validation', { action: 'start', playlistId, deviceId, durationMinutes: 15 });
        panelMessage('Teste iniciado. Abra ou atualize o aplicativo no aparelho escolhido.', 'ok');
        await refreshPlaylists(true);
      } catch (error) { panelMessage(error.message, 'err'); }
    });
  }

  function initialize() {
    refreshPlaylists().catch(() => {});
    window.addEventListener('roneca:playlist-fingerprint-backfill-complete', () => refreshPlaylists(true).catch(() => {}));
  }

  window.RonecaPlaylistQualification = Object.freeze({ refresh: refreshPlaylists });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true }); else initialize();
})();
