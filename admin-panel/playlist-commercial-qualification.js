(() => {
  'use strict';

  if (window.__ronecaPlaylistCommercialQualificationInstalled) return;
  window.__ronecaPlaylistCommercialQualificationInstalled = true;

  const NEW_PLAYLIST = '__roneca_new_playlist__';
  const state = {
    playlists: new Map(),
    validationDevices: [],
    validationSessions: [],
    refreshing: null,
  };
  let renderTimer = null;
  let scanTimer = null;

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function panelMessage(text, tone = '') {
    const target = $('sellerListsMsg') || $('sellerUxMsg');
    if (target) {
      target.className = `seller-msg ${tone}`;
      target.textContent = String(text || '');
      return;
    }
    if (typeof window.show === 'function') window.show(String(text || ''), tone === 'err');
  }

  async function invoke(functionName, payload) {
    const config = window.RONECA_PANEL_CONFIG || {};
    const supabaseUrl = String(config.supabaseUrl || '').replace(/\/$/, '');
    const anonKey = String(config.anonKey || '').trim();
    if (!supabaseUrl || !anonKey || !window.RonecaPanelAuth) {
      throw new Error('Sessão do painel não encontrada. Entre novamente.');
    }

    const accessToken = await window.RonecaPanelAuth.getAccessToken();
    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        apikey: anonKey,
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
    return data.data ?? data;
  }

  function decorateOption(option, playlist) {
    if (!option || !playlist) return;
    const baseName = String(playlist.name || option.textContent || 'Lista')
      .replace(/\s+—\s+.+$/, '');
    option.disabled = playlist.commerciallyUsable !== true;
    option.dataset.qualificationStatus = playlist.qualificationStatus || 'validating';
    option.textContent = playlist.commerciallyUsable
      ? baseName
      : `${baseName} — ${playlist.qualificationLabel || 'validando'}`;
  }

  function decorateKnownSelects() {
    const fixedIds = [
      'sellerActivationPlaylist',
      'sellerActivationBackupPlaylist',
      'sellerRenewPlaylist',
      'sellerRenewBackupPlaylist',
    ];
    const selects = fixedIds.map($).filter(Boolean).concat([
      ...document.querySelectorAll('[id^="pend-playlist-"], [id^="pend-backup-playlist-"]'),
    ]);

    for (const select of selects) {
      for (const option of select.options || []) {
        if (!option.value || option.value === NEW_PLAYLIST) continue;
        const playlist = state.playlists.get(String(option.value));
        if (playlist) decorateOption(option, playlist);
      }
    }
  }

  async function refreshPlaylists(force = false) {
    if (state.refreshing && !force) return state.refreshing;
    state.refreshing = (async () => {
      const playlists = window.RonecaPlaylistFlowController?.refreshPlaylists
        ? await window.RonecaPlaylistFlowController.refreshPlaylists(force)
        : (await invoke('playlist-registration', { action: 'list' })).playlists || [];

      state.playlists.clear();
      for (const playlist of playlists || []) {
        if (playlist?.id) state.playlists.set(String(playlist.id), playlist);
      }
      decorateKnownSelects();
      scheduleRender();
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
      return (result.devices || []).filter(device =>
        device.status === 'pending'
        && !device.customerId
        && !device.playlistId
        && !device.planId
      );
    } catch {
      return [];
    }
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
      panel = document.createElement('section');
      panel.id = 'ronecaQualificationPanel';
      panel.className = 'roneca-qualification-panel';
      mount.appendChild(panel);
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
      ...allPendingDevices
        .filter(device => !markedIds.has(device.id))
        .map(device => ({
          id: device.id,
          deviceCode: device.deviceCode,
          clientName: device.clientName,
          marked: false,
        })),
    ];
    const activeSessions = state.validationSessions.filter(session => session.status === 'active');

    panel.innerHTML = `
      <h3>Homologação das listas</h3>
      <p>Somente listas com cache pronto ou acesso direto confirmado podem consumir crédito. O modo técnico “direto” sozinho não libera uma venda.</p>
      ${ownerValidation ? `
        <div class="roneca-qualification-toolbar">
          <label><span>Aparelho dedicado ao teste</span>
            <select id="qualificationDeviceSelect">
              <option value="">Selecione um aparelho pendente</option>
              ${deviceOptions.map(device => `<option value="${esc(device.id)}" data-marked="${device.marked ? '1' : '0'}">${esc(device.deviceCode || device.id)}${device.clientName ? ` — ${esc(device.clientName)}` : ''}${device.sellerId ? ' — vendedor vinculado' : ''}${device.marked ? ' — preparado' : ''}</option>`).join('')}
            </select>
          </label>
          <label><span>Lista aguardando aparelho</span>
            <select id="qualificationPlaylistSelect">
              <option value="">Selecione a lista</option>
              ${playlists.filter(item => item.requiresDeviceTest).map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}
            </select>
          </label>
          <button type="button" class="primary" id="qualificationStartButton">Iniciar teste</button>
        </div>
        ${activeSessions.length ? `<div class="roneca-qualification-list">${activeSessions.map(session => `
          <article class="roneca-qualification-item">
            <div><strong>Teste em andamento: ${esc(session.playlistName || 'Lista')}</strong><small>${esc(session.deviceCode || 'Aparelho')} · expira em ${esc(new Date(session.expiresAt).toLocaleString('pt-BR'))}</small></div>
            <div class="roneca-qualification-actions"><button type="button" data-revoke-session="${esc(session.id)}">Encerrar</button></div>
          </article>`).join('')}</div>` : ''}
      ` : ''}
      <div class="roneca-qualification-list">
        ${playlists.length ? playlists.map(item => `
          <article class="roneca-qualification-item" data-playlist-id="${esc(item.id)}">
            <div>
              <strong>${esc(item.name)}</strong>
              <span class="roneca-qualification-badge ${esc(item.qualificationStatus)}">${esc(item.qualificationLabel)}</span>
              <small>${esc(item.qualificationMessage)}</small>
            </div>
            <div class="roneca-qualification-actions">
              ${item.canRetryCache ? `<button type="button" data-retry-playlist="${esc(item.id)}">Gerar cache novamente</button>` : ''}
              ${item.requiresDeviceTest && !ownerValidation ? '<span class="roneca-qualification-badge awaiting_device_test">Admin precisa testar</span>' : ''}
            </div>
          </article>`).join('') : '<div class="roneca-qualification-empty">Nenhuma lista disponível.</div>'}
      </div>`;

    panel.querySelectorAll('[data-retry-playlist]').forEach(button => {
      button.addEventListener('click', () => {
        retryPlaylist(button.dataset.retryPlaylist).catch(error => panelMessage(error.message, 'err'));
      });
    });
    panel.querySelectorAll('[data-revoke-session]').forEach(button => {
      button.addEventListener('click', async () => {
        try {
          await invoke('playlist-validation', {
            action: 'revoke',
            sessionId: button.dataset.revokeSession,
          });
          panelMessage('Sessão de validação encerrada.', 'ok');
          await refreshPlaylists(true);
        } catch (error) {
          panelMessage(error.message, 'err');
        }
      });
    });
    $('qualificationStartButton')?.addEventListener('click', async () => {
      const deviceSelect = $('qualificationDeviceSelect');
      const playlistId = $('qualificationPlaylistSelect')?.value || '';
      const deviceId = deviceSelect?.value || '';
      if (!deviceId || !playlistId) {
        panelMessage('Selecione o aparelho e a lista.', 'err');
        return;
      }
      try {
        const option = deviceSelect.selectedOptions[0];
        if (option?.dataset.marked !== '1') {
          await invoke('playlist-validation', { action: 'markDevice', deviceId, enabled: true });
        }
        await invoke('playlist-validation', {
          action: 'start',
          playlistId,
          deviceId,
          durationMinutes: 15,
        });
        panelMessage('Teste iniciado. Abra ou atualize o aplicativo no aparelho escolhido.', 'ok');
        await refreshPlaylists(true);
      } catch (error) {
        panelMessage(error.message, 'err');
      }
    });
  }

  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => renderQualificationPanel().catch(() => {}), 100);
  }

  function scan() {
    decorateKnownSelects();
    if (!$('ronecaQualificationPanel') && qualificationMount()) scheduleRender();
  }

  function initialize() {
    refreshPlaylists().catch(() => {});
    scan();
    const observer = new MutationObserver(() => {
      clearTimeout(scanTimer);
      scanTimer = setTimeout(scan, 60);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('roneca:playlist-fingerprint-backfill-complete', () => {
      refreshPlaylists(true).catch(() => {});
    });
  }

  window.RonecaPlaylistQualification = Object.freeze({
    refresh: refreshPlaylists,
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
