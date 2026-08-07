(() => {
  'use strict';
  if (window.__ronecaPlaylistFlowControllerInstalled) return;
  window.__ronecaPlaylistFlowControllerInstalled = true;

  const state = { playlists: new Map(), refreshPromise: null, createPromises: new Map(), operationLocks: new Set() };
  const $ = id => document.getElementById(id);

  function panelMessage(text, tone = '') {
    const target = $('sellerListsMsg') || $('sellerUxMsg') || $('msg');
    if (target?.id === 'msg' && typeof window.show === 'function') return window.show(String(text || ''), tone === 'err');
    if (target) { target.className = `seller-msg ${tone}`; target.textContent = String(text || ''); return; }
    if (typeof window.show === 'function') window.show(String(text || ''), tone === 'err');
  }

  async function panelInvoke(functionName, payload) {
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
    if (!response.ok) throw new Error(data.error || data.message || `Falha HTTP ${response.status}.`);
    return data.data ?? data;
  }

  const registrationInvoke = payload => panelInvoke('playlist-registration', payload);

  function draft(key, fallback) {
    if (window.RonecaUnifiedPlaylistEntry?.prepare) {
      try { return window.RonecaUnifiedPlaylistEntry.prepare(key); }
      catch (error) { if (!fallback) throw error; }
    }
    return fallback();
  }

  function normalizedDraftKey(prepared, sellerId = null) {
    let source = String(prepared.playlistUrl || '').trim();
    try {
      const parsed = new URL(source); parsed.hash = ''; parsed.hostname = parsed.hostname.toLowerCase();
      const entries = [...parsed.searchParams.entries()].sort(([ak,av],[bk,bv]) => ak.localeCompare(bk) || av.localeCompare(bv));
      parsed.search = ''; entries.forEach(([key,value]) => parsed.searchParams.append(key, value)); source = parsed.toString();
    } catch { /* validação definitiva acontece no servidor */ }
    return JSON.stringify({ source, sellerId, type: prepared.playlistType || 'm3u' });
  }

  function mapPlaylist(result) {
    if (result?.playlist?.id) return result.playlist;
    if (!result?.playlistId) return null;
    return {
      id: result.playlistId,
      name: result.playlistName || 'Lista salva',
      qualificationStatus: result.qualificationStatus || 'validating',
      commerciallyUsable: result.commerciallyUsable === true,
      qualificationMessage: result.message || null,
    };
  }

  async function refreshPlaylists(force = false) {
    if (state.refreshPromise && !force) return state.refreshPromise;
    state.refreshPromise = registrationInvoke({ action: 'list' }).then(result => {
      for (const playlist of result.playlists || []) if (playlist?.id) state.playlists.set(String(playlist.id), playlist);
      return [...state.playlists.values()];
    }).finally(() => { state.refreshPromise = null; });
    return state.refreshPromise;
  }

  async function createPlaylistRecord(prepared, { sellerId = null, operationKey = 'playlist-create' } = {}) {
    const requestKey = normalizedDraftKey(prepared, sellerId);
    if (state.createPromises.has(requestKey)) return state.createPromises.get(requestKey);
    const promise = registrationInvoke({
      action: 'create',
      requestId: `${operationKey}:${crypto.randomUUID?.() || Date.now()}`,
      name: prepared.name,
      playlistUrl: prepared.playlistUrl,
      playlistType: prepared.playlistType,
      maxConnections: prepared.maxConnections || 1,
      ...(sellerId ? { sellerId } : {}),
    }).then(result => {
      const playlist = mapPlaylist(result);
      if (!playlist?.id) throw new Error('A lista foi salva sem retornar a identificação comercial.');
      state.playlists.set(String(playlist.id), playlist);
      return { ...result, playlist };
    }).finally(() => setTimeout(() => state.createPromises.delete(requestKey), 1500));
    state.createPromises.set(requestKey, promise);
    return promise;
  }

  function withLock(lockKey, action) {
    return async function (...args) {
      if (state.operationLocks.has(lockKey)) return;
      state.operationLocks.add(lockKey);
      try { return await action.apply(this, args); }
      finally { state.operationLocks.delete(lockKey); }
    };
  }

  function installAdminCreate() {
    const current = window.createPlaylist;
    if (typeof current !== 'function' || current.__ronecaPlaylistRegistrationOnly) return Boolean(current?.__ronecaPlaylistRegistrationOnly);
    const replacement = withLock('admin:create-playlist', async () => {
      const button = $('playlistActionModal')?.querySelector('button.primary') || $('newPlaylistForm')?.querySelector('button[type="submit"]');
      try {
        if (button) button.disabled = true;
        panelMessage('Salvando a lista. A validação seguirá sem interferir em ativação ou renovação.');
        const prepared = draft('admin-base', () => ({
          name: $('uxNewPlaylistName')?.value.trim() || $('newPlaylistName')?.value.trim() || '',
          playlistUrl: $('uxNewPlaylistUrl')?.value.trim() || $('newPlaylistUrl')?.value.trim() || '',
          playlistType: $('uxNewPlaylistType')?.value || $('newPlaylistType')?.value || 'm3u',
        }));
        const result = await createPlaylistRecord(prepared, { operationKey: 'admin:create' });
        for (const id of ['uxNewPlaylistName','uxNewPlaylistUrl','newPlaylistName','newPlaylistUrl']) if ($(id)) $(id).value = '';
        window.closePlaylistActionModal?.(); await window.loadAll?.(); await refreshPlaylists(true).catch(() => {});
        panelMessage(result.message || 'Lista salva. O fluxo comercial decidirá quando ela pode ser usada.', 'ok');
      } catch (error) { panelMessage(error.message || 'Não foi possível cadastrar a lista.', 'err'); }
      finally { if (button) button.disabled = false; }
    });
    replacement.__ronecaPlaylistRegistrationOnly = true;
    window.createPlaylist = replacement;
    return true;
  }

  function installSellerCreate() {
    const current = window.sellerListsCreate;
    if (typeof current !== 'function' || current.__ronecaPlaylistRegistrationOnly) return Boolean(current?.__ronecaPlaylistRegistrationOnly);
    const replacement = withLock('seller:create-playlist', async () => {
      const button = $('sellerPlaylistForm')?.querySelector('button.primary');
      try {
        if (button) button.disabled = true;
        panelMessage('Salvando a lista. A validação seguirá em segundo plano.');
        const prepared = draft('seller-base', () => ({ name: $('sellerPlaylistName')?.value.trim() || '', playlistUrl: $('sellerPlaylistUrl')?.value.trim() || '', playlistType: $('sellerPlaylistType')?.value || 'm3u' }));
        const result = await createPlaylistRecord(prepared, { operationKey: 'seller:create' });
        if ($('sellerPlaylistName')) $('sellerPlaylistName').value = '';
        if ($('sellerPlaylistUrl')) $('sellerPlaylistUrl').value = '';
        window.sellerListsToggleForm?.(false); await window.sellerListsUxRender?.(); await window.loadPortal?.(); await refreshPlaylists(true).catch(() => {});
        panelMessage(result.message || 'Lista salva. Não cadastre novamente enquanto ela é validada.', 'ok');
      } catch (error) { panelMessage(error.message || 'Não foi possível cadastrar a lista.', 'err'); }
      finally { if (button) button.disabled = false; }
    });
    replacement.__ronecaPlaylistRegistrationOnly = true;
    window.sellerListsCreate = replacement;
    return true;
  }

  function install() {
    installAdminCreate(); installSellerCreate();
  }

  window.RonecaPlaylistFlowController = Object.freeze({ refreshPlaylists, createPlaylistRecord });
  window.__ronecaPlaylistFlowController = window.RonecaPlaylistFlowController;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true }); else install();
  setTimeout(install, 250);
})();
