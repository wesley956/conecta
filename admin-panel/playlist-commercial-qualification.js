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
  let installTimer = null;
  let renderTimer = null;

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

  function draft(key, fallback) {
    if (window.RonecaUnifiedPlaylistEntry?.prepare) {
      try { return window.RonecaUnifiedPlaylistEntry.prepare(key); }
      catch (error) {
        if (!fallback) throw error;
      }
    }
    return fallback();
  }

  function qualificationMessage(playlist) {
    if (!playlist) return 'Lista não encontrada no contrato comercial.';
    return playlist.qualificationMessage || 'A lista ainda não está homologada.';
  }

  async function refreshPlaylists(force = false) {
    if (state.refreshing && !force) return state.refreshing;
    state.refreshing = invoke('playlist-registration', { action: 'list' })
      .then(result => {
        state.playlists.clear();
        for (const playlist of result.playlists || []) {
          if (playlist?.id) state.playlists.set(String(playlist.id), playlist);
        }
        decorateKnownSelects();
        scheduleRender();
        return [...state.playlists.values()];
      })
      .finally(() => { state.refreshing = null; });
    return state.refreshing;
  }

  async function createPlaylistRecord(prepared) {
    const result = await invoke('playlist-registration', {
      action: 'create',
      name: prepared.name,
      playlistUrl: prepared.playlistUrl,
      playlistType: prepared.playlistType,
      maxConnections: prepared.maxConnections || 1,
    });
    if (!result.playlistId || !result.playlist) {
      throw new Error('A lista foi salva sem retornar o contrato comercial.');
    }
    state.playlists.set(String(result.playlistId), result.playlist);
    return result;
  }

  function addResolvedOption(select, playlist) {
    if (!select || !playlist?.id) return;
    let option = [...select.options].find(item => item.value === playlist.id);
    if (!option) {
      option = document.createElement('option');
      option.value = playlist.id;
      select.appendChild(option);
    }
    option.textContent = playlist.name || 'Lista salva nesta operação';
    select.value = playlist.id;
    decorateOption(option, playlist);
  }

  function decorateOption(option, playlist) {
    if (!option || !playlist) return;
    const baseName = String(playlist.name || option.textContent || 'Lista').replace(/\s+—\s+.+$/, '');
    option.disabled = playlist.commerciallyUsable !== true;
    option.dataset.qualificationStatus = playlist.qualificationStatus || 'validating';
    option.textContent = playlist.commerciallyUsable
      ? baseName
      : `${baseName} — ${playlist.qualificationLabel || 'validando'}`;
  }

  function qualificationSelectIds() {
    return [
      'sellerActivationPlaylist',
      'sellerActivationBackupPlaylist',
      'sellerRenewPlaylist',
      'sellerRenewBackupPlaylist',
    ];
  }

  function decorateKnownSelects() {
    const selects = qualificationSelectIds()
      .map($)
      .filter(Boolean)
      .concat([...document.querySelectorAll('[id^="pend-playlist-"], [id^="pend-backup-playlist-"]')]);
    for (const select of selects) {
      for (const option of select.options) {
        if (!option.value || option.value === NEW_PLAYLIST) continue;
        const playlist = state.playlists.get(option.value);
        if (playlist) decorateOption(option, playlist);
      }
    }
  }

  async function resolveNewSelection(selectId, key, fallback) {
    const select = $(selectId);
    if (!select || select.value !== NEW_PLAYLIST) return;
    const prepared = draft(key, fallback);
    const result = await createPlaylistRecord(prepared);
    addResolvedOption(select, result.playlist);
    await refreshPlaylists(true);
    if (result.playlist.commerciallyUsable !== true) {
      throw new Error(
        `A lista foi salva, mas ainda não pode ser ativada. ${qualificationMessage(result.playlist)} Não cadastre novamente.`,
      );
    }
  }

  async function requireSelectedUsable(selectId, label) {
    const select = $(selectId);
    if (!select || !select.value || select.value === NEW_PLAYLIST) return;
    let playlist = state.playlists.get(select.value);
    if (!playlist) {
      await refreshPlaylists(true);
      playlist = state.playlists.get(select.value);
    }
    if (playlist && playlist.commerciallyUsable !== true) {
      throw new Error(`${label} ainda não está homologada. ${qualificationMessage(playlist)}`);
    }
  }

  function wrapBefore(name, hook) {
    const current = window[name];
    if (typeof current !== 'function' || current.__commercialQualificationHook) return;
    const wrapped = async function (...args) {
      try {
        await hook(...args);
      } catch (error) {
        panelMessage(error.message || 'A lista ainda não pode ser utilizada.', 'err');
        return;
      }
      return current.apply(this, args);
    };
    wrapped.__commercialQualificationHook = true;
    wrapped.__commercialQualificationOriginal = current;
    window[name] = wrapped;
  }

  function installAdminCreate() {
    const current = window.createPlaylist;
    if (typeof current !== 'function' || current.__commercialQualificationReplacement) return;
    const replacement = async function createQualifiedPlaylist() {
      const button = $('playlistActionModal')?.querySelector('button.primary')
        || $('newPlaylistForm')?.querySelector('button[type="submit"]');
      try {
        if (button) button.disabled = true;
        panelMessage('Salvando a lista. A validação continuará sem prender esta tela.');
        const prepared = draft('admin-base', () => ({
          name: $('uxNewPlaylistName')?.value.trim() || $('newPlaylistName')?.value.trim() || '',
          playlistUrl: $('uxNewPlaylistUrl')?.value.trim() || $('newPlaylistUrl')?.value.trim() || '',
          playlistType: $('uxNewPlaylistType')?.value || $('newPlaylistType')?.value || 'm3u',
        }));
        const result = await createPlaylistRecord(prepared);
        if ($('uxNewPlaylistName')) $('uxNewPlaylistName').value = '';
        if ($('uxNewPlaylistUrl')) $('uxNewPlaylistUrl').value = '';
        if ($('newPlaylistName')) $('newPlaylistName').value = '';
        if ($('newPlaylistUrl')) $('newPlaylistUrl').value = '';
        window.closePlaylistActionModal?.();
        await window.loadAll?.();
        await refreshPlaylists(true);
        panelMessage(result.message || 'Lista salva. Acompanhe a homologação antes de ativar.', '');
      } catch (error) {
        panelMessage(error.message || 'Não foi possível cadastrar a lista.', 'err');
      } finally {
        if (button) button.disabled = false;
      }
    };
    replacement.__commercialQualificationReplacement = true;
    replacement.__commercialQualificationOriginal = current;
    window.createPlaylist = replacement;
  }

  function installSellerCreate() {
    const current = window.sellerListsCreate;
    if (typeof current !== 'function' || current.__commercialQualificationReplacement) return;
    const replacement = async function createQualifiedSellerPlaylist() {
      const button = $('sellerPlaylistForm')?.querySelector('button.primary');
      try {
        if (button) button.disabled = true;
        panelMessage('Salvando a lista. A validação continuará em segundo plano.');
        const prepared = draft('seller-base', () => ({
          name: $('sellerPlaylistName')?.value.trim() || '',
          playlistUrl: $('sellerPlaylistUrl')?.value.trim() || '',
          playlistType: $('sellerPlaylistType')?.value || 'm3u',
        }));
        const result = await createPlaylistRecord(prepared);
        if ($('sellerPlaylistName')) $('sellerPlaylistName').value = '';
        if ($('sellerPlaylistUrl')) $('sellerPlaylistUrl').value = '';
        window.sellerListsToggleForm?.(false);
        await window.sellerListsUxRender?.();
        await window.loadPortal?.();
        await refreshPlaylists(true);
        panelMessage(result.message || 'Lista salva. Não cadastre novamente enquanto ela é validada.', 'ok');
      } catch (error) {
        panelMessage(error.message || 'Não foi possível cadastrar a lista.', 'err');
      } finally {
        if (button) button.disabled = false;
      }
    };
    replacement.__commercialQualificationReplacement = true;
    replacement.__commercialQualificationOriginal = current;
    window.sellerListsCreate = replacement;
  }

  function installCommercialPreflights() {
    wrapBefore('sellerUxActivateDevice', async () => {
      await resolveNewSelection('sellerActivationPlaylist', 'seller-inline-playlist', () => ({
        name: $('seller-inline-playlist-name')?.value.trim() || '',
        playlistUrl: $('seller-inline-playlist-url')?.value.trim() || '',
        playlistType: $('seller-inline-playlist-type')?.value || 'm3u',
      }));
      await resolveNewSelection('sellerActivationBackupPlaylist', 'seller-activation-backup-new', () => ({
        name: $('seller-activation-backup-new-name')?.value.trim() || '',
        playlistUrl: $('seller-activation-backup-new-url')?.value.trim() || '',
        playlistType: $('seller-activation-backup-new-type')?.value || 'm3u',
      }));
      await requireSelectedUsable('sellerActivationPlaylist', 'Lista principal');
      await requireSelectedUsable('sellerActivationBackupPlaylist', 'Lista reserva');
    });

    wrapBefore('sellerUxRenewDevice', async () => {
      await resolveNewSelection('sellerRenewPlaylist', 'seller-renew-main-new', () => ({
        name: $('seller-renew-main-new-name')?.value.trim() || '',
        playlistUrl: $('seller-renew-main-new-url')?.value.trim() || '',
        playlistType: $('seller-renew-main-new-type')?.value || 'm3u',
      }));
      await resolveNewSelection('sellerRenewBackupPlaylist', 'seller-renew-backup-new', () => ({
        name: $('seller-renew-backup-new-name')?.value.trim() || '',
        playlistUrl: $('seller-renew-backup-new-url')?.value.trim() || '',
        playlistType: $('seller-renew-backup-new-type')?.value || 'm3u',
      }));
      await requireSelectedUsable('sellerRenewPlaylist', 'Lista principal');
      await requireSelectedUsable('sellerRenewBackupPlaylist', 'Lista reserva');
    });

    wrapBefore('activatePending', async deviceId => {
      await resolveNewSelection(`pend-playlist-${deviceId}`, `pend-inline-playlist-${deviceId}`, () => ({
        name: $(`pend-inline-playlist-${deviceId}-name`)?.value.trim() || '',
        playlistUrl: $(`pend-inline-playlist-${deviceId}-url`)?.value.trim() || '',
        playlistType: $(`pend-inline-playlist-${deviceId}-type`)?.value || 'm3u',
      }));
      await resolveNewSelection(`pend-backup-playlist-${deviceId}`, `pend-backup-new-${deviceId}`, () => ({
        name: $(`pend-backup-new-${deviceId}-name`)?.value.trim() || '',
        playlistUrl: $(`pend-backup-new-${deviceId}-url`)?.value.trim() || '',
        playlistType: $(`pend-backup-new-${deviceId}-type`)?.value || 'm3u',
      }));
      await requireSelectedUsable(`pend-playlist-${deviceId}`, 'Lista principal');
      await requireSelectedUsable(`pend-backup-playlist-${deviceId}`, 'Lista reserva');
    });
  }

  async function retryPlaylist(playlistId) {
    const result = await invoke('playlist-registration', { action: 'retry', playlistId });
    if (result.playlist) state.playlists.set(String(playlistId), result.playlist);
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
        && !device.sellerId
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
      ...allPendingDevices.filter(device => !markedIds.has(device.id)).map(device => ({
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
              ${deviceOptions.map(device => `<option value="${esc(device.id)}" data-marked="${device.marked ? '1' : '0'}">${esc(device.deviceCode || device.id)}${device.clientName ? ` — ${esc(device.clientName)}` : ''}${device.marked ? ' — preparado' : ''}</option>`).join('')}
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
      button.addEventListener('click', () => retryPlaylist(button.dataset.retryPlaylist).catch(error => panelMessage(error.message, 'err')));
    });
    panel.querySelectorAll('[data-revoke-session]').forEach(button => {
      button.addEventListener('click', async () => {
        try {
          await invoke('playlist-validation', { action: 'revoke', sessionId: button.dataset.revokeSession });
          panelMessage('Sessão de validação encerrada.', 'ok');
          await refreshPlaylists(true);
        } catch (error) { panelMessage(error.message, 'err'); }
      });
    });
    $('qualificationStartButton')?.addEventListener('click', async () => {
      const deviceSelect = $('qualificationDeviceSelect');
      const playlistId = $('qualificationPlaylistSelect')?.value || '';
      const deviceId = deviceSelect?.value || '';
      if (!deviceId || !playlistId) return panelMessage('Selecione o aparelho e a lista.', 'err');
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
      } catch (error) { panelMessage(error.message, 'err'); }
    });
  }

  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => renderQualificationPanel().catch(() => {}), 120);
  }

  function install() {
    installAdminCreate();
    installSellerCreate();
    installCommercialPreflights();
    decorateKnownSelects();
    scheduleRender();
  }

  function initialize() {
    refreshPlaylists().catch(() => {});
    install();
    const observer = new MutationObserver(() => {
      clearTimeout(installTimer);
      installTimer = setTimeout(install, 80);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setInterval(() => {
      install();
      refreshPlaylists().catch(() => {});
    }, 15000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
