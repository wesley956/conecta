(() => {
  'use strict';

  if (window.__ronecaPlaylistFlowControllerInstalled) return;
  window.__ronecaPlaylistFlowControllerInstalled = true;

  const NEW_PLAYLIST = '__roneca_new_playlist__';
  const state = {
    playlists: new Map(),
    refreshPromise: null,
    createPromises: new Map(),
    operationLocks: new Set(),
  };

  const $ = id => document.getElementById(id);

  class PlaylistSavedPendingError extends Error {
    constructor(message, playlist = null) {
      super(message);
      this.name = 'PlaylistSavedPendingError';
      this.playlist = playlist;
    }
  }

  function panelMessage(text, tone = '') {
    const target = $('sellerListsMsg') || $('sellerUxMsg') || $('msg');
    if (target) {
      if (target.id === 'msg') {
        if (typeof window.show === 'function') {
          window.show(String(text || ''), tone === 'err');
          return;
        }
      }
      target.className = `seller-msg ${tone}`;
      target.textContent = String(text || '');
      return;
    }
    if (typeof window.show === 'function') window.show(String(text || ''), tone === 'err');
  }

  async function panelInvoke(functionName, payload) {
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

  async function legacySellerInvoke(payload) {
    const token = sessionStorage.getItem('roneca_seller_token') || '';
    if (!token) throw new Error('Sessão do vendedor não encontrada. Entre novamente.');
    const response = await fetch('https://awauvkjkucjqulkklmuo.supabase.co/functions/v1/seller-panel', {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-seller-token': token,
      },
      body: JSON.stringify(payload || {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || `Falha HTTP ${response.status}.`);
    return data.data ?? data;
  }

  function hasPanelSession() {
    try {
      return Boolean(window.RonecaPanelAuth?.hasSession?.());
    } catch {
      return false;
    }
  }

  async function registrationInvoke(payload) {
    if (hasPanelSession()) return panelInvoke('playlist-registration', payload);
    if (/\/seller\.html$/.test(location.pathname)) {
      if (payload.action === 'list') return { playlists: [] };
      if (payload.action !== 'create') throw new Error('Esta ação exige o novo login do painel.');
      return legacySellerInvoke({
        action: 'createSellerPlaylist',
        name: payload.name,
        playlistUrl: payload.playlistUrl,
        playlistType: payload.playlistType,
      });
    }
    return panelInvoke('playlist-registration', payload);
  }

  function draft(key, fallback) {
    if (window.RonecaUnifiedPlaylistEntry?.prepare) {
      try {
        return window.RonecaUnifiedPlaylistEntry.prepare(key);
      } catch (error) {
        if (!fallback) throw error;
      }
    }
    return fallback();
  }

  function normalizedDraftKey(prepared, sellerId = null) {
    let source = String(prepared.playlistUrl || '').trim();
    try {
      const parsed = new URL(source);
      parsed.hash = '';
      parsed.hostname = parsed.hostname.toLowerCase();
      const entries = [...parsed.searchParams.entries()]
        .sort(([ak, av], [bk, bv]) => ak.localeCompare(bk) || av.localeCompare(bv));
      parsed.search = '';
      for (const [key, value] of entries) parsed.searchParams.append(key, value);
      source = parsed.toString();
    } catch {
      // O servidor fará a validação definitiva.
    }
    return JSON.stringify({ source, sellerId, type: prepared.playlistType || 'm3u' });
  }

  function mapPlaylistFromResult(result) {
    if (result?.playlist?.id) return result.playlist;
    if (!result?.playlistId) return null;
    const status = result.qualificationStatus || 'validating';
    return {
      id: result.playlistId,
      name: result.playlistName || 'Lista salva nesta operação',
      qualificationStatus: status,
      qualificationLabel: status === 'ready_cache'
        ? 'Cache pronto'
        : status === 'ready_direct'
          ? 'Acesso direto homologado'
          : status === 'awaiting_device_test'
            ? 'Aguardando teste no aparelho'
            : 'Validando lista',
      qualificationMessage: result.message || 'A lista foi salva e está em validação.',
      commerciallyUsable: result.commerciallyUsable === true,
    };
  }

  async function refreshPlaylists(force = false) {
    if (state.refreshPromise && !force) return state.refreshPromise;
    state.refreshPromise = registrationInvoke({ action: 'list' })
      .then(result => {
        for (const playlist of result.playlists || []) {
          if (playlist?.id) state.playlists.set(String(playlist.id), playlist);
        }
        return [...state.playlists.values()];
      })
      .finally(() => { state.refreshPromise = null; });
    return state.refreshPromise;
  }

  async function createPlaylistRecord(prepared, { sellerId = null, operationKey = 'playlist-create' } = {}) {
    const requestKey = normalizedDraftKey(prepared, sellerId);
    const existing = state.createPromises.get(requestKey);
    if (existing) return existing;

    const promise = registrationInvoke({
      action: 'create',
      requestId: `${operationKey}:${crypto.randomUUID?.() || Date.now()}`,
      name: prepared.name,
      playlistUrl: prepared.playlistUrl,
      playlistType: prepared.playlistType,
      maxConnections: prepared.maxConnections || 1,
      ...(sellerId ? { sellerId } : {}),
    }).then(result => {
      const playlist = mapPlaylistFromResult(result);
      if (!result.playlistId || !playlist) {
        throw new Error('A lista foi salva sem retornar a identificação comercial.');
      }
      state.playlists.set(String(result.playlistId), playlist);
      return { ...result, playlist };
    }).finally(() => {
      window.setTimeout(() => state.createPromises.delete(requestKey), 1500);
    });

    state.createPromises.set(requestKey, promise);
    return promise;
  }

  function addResolvedOption(select, playlist) {
    if (!select || !playlist?.id) return;
    let option = [...select.options].find(item => item.value === String(playlist.id));
    if (!option) {
      option = document.createElement('option');
      option.value = String(playlist.id);
      select.appendChild(option);
    }
    option.textContent = playlist.name || 'Lista salva nesta operação';
    option.dataset.qualificationStatus = playlist.qualificationStatus || 'validating';
    option.disabled = false;
    select.value = String(playlist.id);
  }

  function qualificationMessage(playlist) {
    return playlist?.qualificationMessage || 'A lista ainda não está homologada.';
  }

  async function resolveNewSelection(selectId, key, fallback, sellerId = null) {
    const select = $(selectId);
    if (!select || select.value !== NEW_PLAYLIST) return null;

    const prepared = draft(key, fallback);
    const result = await createPlaylistRecord(prepared, {
      sellerId,
      operationKey: `inline:${selectId}`,
    });
    addResolvedOption(select, result.playlist);
    await refreshPlaylists(true).catch(() => {});

    if (result.playlist.commerciallyUsable !== true) {
      const next = result.playlist.qualificationStatus === 'awaiting_device_test'
        ? ' Ela precisa ser testada em um aparelho Android antes da ativação.'
        : ' Aguarde a validação ou gere o cache novamente.';
      throw new PlaylistSavedPendingError(
        `A lista foi salva corretamente, mas ainda não pode ser ativada.${next} Não cadastre novamente.`,
        result.playlist,
      );
    }
    return result.playlist;
  }

  async function requireSelectedUsable(selectId, label) {
    const select = $(selectId);
    if (!select || !select.value || select.value === NEW_PLAYLIST) return;
    let playlist = state.playlists.get(String(select.value));
    if (!playlist) {
      await refreshPlaylists(true);
      playlist = state.playlists.get(String(select.value));
    }
    if (playlist && playlist.commerciallyUsable !== true) {
      const next = playlist.qualificationStatus === 'awaiting_device_test'
        ? ' Faça a homologação em um Android.'
        : '';
      throw new PlaylistSavedPendingError(
        `${label} foi salva, porém ainda não está homologada. ${qualificationMessage(playlist)}${next}`,
        playlist,
      );
    }
  }

  function withLock(lockKey, action) {
    return async function (...args) {
      if (state.operationLocks.has(lockKey)) return;
      state.operationLocks.add(lockKey);
      try {
        return await action.apply(this, args);
      } finally {
        state.operationLocks.delete(lockKey);
      }
    };
  }

  function installAdminCreate() {
    const current = window.createPlaylist;
    if (typeof current !== 'function' || current.__ronecaPlaylistFlowController) return Boolean(current?.__ronecaPlaylistFlowController);

    const replacement = withLock('admin:create-playlist', async function createCanonicalAdminPlaylist() {
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
        const result = await createPlaylistRecord(prepared, { operationKey: 'admin:create' });
        for (const id of ['uxNewPlaylistName', 'uxNewPlaylistUrl', 'newPlaylistName', 'newPlaylistUrl']) {
          if ($(id)) $(id).value = '';
        }
        window.closePlaylistActionModal?.();
        await window.loadAll?.();
        await refreshPlaylists(true).catch(() => {});
        panelMessage(result.message || 'Lista salva. Acompanhe a homologação antes de ativar.', 'ok');
      } catch (error) {
        panelMessage(error.message || 'Não foi possível cadastrar a lista.', 'err');
      } finally {
        if (button) button.disabled = false;
      }
    });
    replacement.__ronecaPlaylistFlowController = true;
    replacement.__commercialQualificationReplacement = true;
    replacement.__commercialQualificationOriginal = current;
    window.createPlaylist = replacement;
    return true;
  }

  function installSellerCreate() {
    const current = window.sellerListsCreate;
    if (typeof current !== 'function' || current.__ronecaPlaylistFlowController) return Boolean(current?.__ronecaPlaylistFlowController);

    const replacement = withLock('seller:create-playlist', async function createCanonicalSellerPlaylist() {
      const button = $('sellerPlaylistForm')?.querySelector('button.primary');
      try {
        if (button) button.disabled = true;
        panelMessage('Salvando a lista. A validação continuará em segundo plano.');
        const prepared = draft('seller-base', () => ({
          name: $('sellerPlaylistName')?.value.trim() || '',
          playlistUrl: $('sellerPlaylistUrl')?.value.trim() || '',
          playlistType: $('sellerPlaylistType')?.value || 'm3u',
        }));
        const result = await createPlaylistRecord(prepared, { operationKey: 'seller:create' });
        if ($('sellerPlaylistName')) $('sellerPlaylistName').value = '';
        if ($('sellerPlaylistUrl')) $('sellerPlaylistUrl').value = '';
        window.sellerListsToggleForm?.(false);
        await window.sellerListsUxRender?.();
        await window.loadPortal?.();
        await refreshPlaylists(true).catch(() => {});
        panelMessage(result.message || 'Lista salva. Não cadastre novamente enquanto ela é validada.', 'ok');
      } catch (error) {
        panelMessage(error.message || 'Não foi possível cadastrar a lista.', 'err');
      } finally {
        if (button) button.disabled = false;
      }
    });
    replacement.__ronecaPlaylistFlowController = true;
    replacement.__commercialQualificationReplacement = true;
    replacement.__commercialQualificationOriginal = current;
    window.sellerListsCreate = replacement;
    return true;
  }

  function wrapBefore(name, hook, lockKey) {
    const current = window[name];
    if (typeof current !== 'function' || current.__ronecaPlaylistFlowController) return Boolean(current?.__ronecaPlaylistFlowController);

    const wrapped = async function (...args) {
      if (state.operationLocks.has(lockKey)) return;
      state.operationLocks.add(lockKey);
      try {
        await hook(...args);
        return await current.apply(this, args);
      } catch (error) {
        panelMessage(
          error.message || 'A lista ainda não pode ser utilizada.',
          error instanceof PlaylistSavedPendingError ? 'warn' : 'err',
        );
        return undefined;
      } finally {
        state.operationLocks.delete(lockKey);
      }
    };
    wrapped.__ronecaPlaylistFlowController = true;
    wrapped.__commercialQualificationHook = true;
    wrapped.__commercialQualificationOriginal = current;
    window[name] = wrapped;
    return true;
  }

  function installCommercialPreflights() {
    const adminInstalled = wrapBefore('activatePending', async deviceId => {
      const sellerId = $(`pend-seller-${deviceId}`)?.value || null;
      await resolveNewSelection(`pend-playlist-${deviceId}`, `pend-inline-playlist-${deviceId}`, () => ({
        name: $(`pend-inline-playlist-${deviceId}-name`)?.value.trim() || '',
        playlistUrl: $(`pend-inline-playlist-${deviceId}-url`)?.value.trim() || '',
        playlistType: $(`pend-inline-playlist-${deviceId}-type`)?.value || 'm3u',
      }), sellerId);
      await resolveNewSelection(`pend-backup-playlist-${deviceId}`, `pend-backup-new-${deviceId}`, () => ({
        name: $(`pend-backup-new-${deviceId}-name`)?.value.trim() || '',
        playlistUrl: $(`pend-backup-new-${deviceId}-url`)?.value.trim() || '',
        playlistType: $(`pend-backup-new-${deviceId}-type`)?.value || 'm3u',
      }), sellerId);
      await requireSelectedUsable(`pend-playlist-${deviceId}`, 'Lista principal');
      await requireSelectedUsable(`pend-backup-playlist-${deviceId}`, 'Lista reserva');
    }, 'admin:activate');

    const sellerActivationInstalled = wrapBefore('sellerUxActivateDevice', async () => {
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
    }, 'seller:activate');

    const sellerRenewInstalled = wrapBefore('sellerUxRenewDevice', async () => {
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
    }, 'seller:renew');

    return { adminInstalled, sellerActivationInstalled, sellerRenewInstalled };
  }

  function expectedInstalled() {
    const adminPage = /\/dashboard\.html$/.test(location.pathname);
    const sellerPage = /\/seller\.html$/.test(location.pathname);
    const adminReady = !adminPage || (
      window.createPlaylist?.__ronecaPlaylistFlowController
      && window.activatePending?.__ronecaPlaylistFlowController
    );
    const sellerReady = !sellerPage || (
      window.sellerListsCreate?.__ronecaPlaylistFlowController
      && window.sellerUxActivateDevice?.__ronecaPlaylistFlowController
      && window.sellerUxRenewDevice?.__ronecaPlaylistFlowController
    );
    return Boolean(adminReady && sellerReady);
  }

  function install() {
    installAdminCreate();
    installSellerCreate();
    installCommercialPreflights();
    return expectedInstalled();
  }

  function initialize() {
    refreshPlaylists().catch(() => {});
    if (install()) return;

    let scheduled = null;
    const observer = new MutationObserver(() => {
      clearTimeout(scheduled);
      scheduled = setTimeout(() => {
        if (install()) observer.disconnect();
      }, 60);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => {
      install();
      if (expectedInstalled()) observer.disconnect();
    }, 500);
  }

  window.RonecaPlaylistFlowController = Object.freeze({
    refreshPlaylists,
    createPlaylistRecord,
    NEW_PLAYLIST_VALUE: NEW_PLAYLIST,
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
