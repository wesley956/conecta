(() => {
  'use strict';

  if (window.__ronecaPlaylistSaveFeedbackInstalled) return;
  window.__ronecaPlaylistSaveFeedbackInstalled = true;

  const FUNCTION_NAME = 'seller-panel';
  const LEGACY_TOKEN_KEY = 'roneca_seller_token';
  const NEW_PLAYLIST = '__roneca_new_playlist__';
  let observerTimer = null;

  const $ = id => document.getElementById(id);

  function setMessage(text, tone = '') {
    const target = $('sellerListsMsg') || $('sellerUxMsg');
    if (target) {
      target.className = `seller-msg ${tone}`;
      target.textContent = String(text || '');
      return;
    }
    if (typeof window.show === 'function') window.show(String(text || ''), tone === 'err');
  }

  async function panelFunction(functionName, payload) {
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
    if (!response.ok) throw new Error(data.error || data.message || `Falha HTTP ${response.status}.`);
    return data.data ?? data;
  }

  async function sellerPanel(payload) {
    const legacyToken = sessionStorage.getItem(LEGACY_TOKEN_KEY) || '';
    if (!legacyToken) return panelFunction(FUNCTION_NAME, payload);

    const response = await fetch('https://awauvkjkucjqulkklmuo.supabase.co/functions/v1/seller-panel', {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'x-seller-token': legacyToken,
      },
      body: JSON.stringify(payload || {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || `Falha HTTP ${response.status}.`);
    return data;
  }

  function selectedOption(select, id, name) {
    let option = [...select.options].find(item => item.value === id);
    if (!option) {
      option = document.createElement('option');
      option.value = id;
      select.appendChild(option);
    }
    option.textContent = name || 'Lista salva nesta operação';
    select.value = id;
  }

  function playlistState(dashboard, playlistId) {
    return (dashboard?.playlists || []).find(item => item.id === playlistId) || null;
  }

  async function waitForPlaylistState(playlistId, attempts = 4) {
    let dashboard = null;
    for (let index = 0; index < attempts; index += 1) {
      dashboard = await sellerPanel({ action: 'dashboard' });
      const state = playlistState(dashboard, playlistId);
      if (state?.usable || state?.accessMode === 'direct' || state?.cacheStatus === 'ready') {
        return { dashboard, state };
      }
      if (index < attempts - 1) await new Promise(resolve => setTimeout(resolve, 450));
    }
    return { dashboard, state: playlistState(dashboard, playlistId) };
  }

  function preparedDraft(key, fallback) {
    if (window.RonecaUnifiedPlaylistEntry?.prepare) {
      return window.RonecaUnifiedPlaylistEntry.prepare(key);
    }
    return fallback();
  }

  async function createSellerPlaylistFromForm(key, fallback) {
    const draft = preparedDraft(key, fallback);
    const result = await sellerPanel({
      action: 'createSellerPlaylist',
      name: draft.name,
      playlistUrl: draft.playlistUrl,
      playlistType: draft.playlistType,
    });
    const playlistId = result.playlistId || result.id;
    if (!playlistId) throw new Error('A lista não retornou identificação após ser salva.');
    const final = await waitForPlaylistState(playlistId);
    return {
      result,
      playlistId,
      playlistName: result.playlistName || draft.name,
      state: final.state,
    };
  }

  async function resolveSellerSelect(selectId, key) {
    const select = $(selectId);
    if (!select || select.value !== NEW_PLAYLIST) return;

    const created = await createSellerPlaylistFromForm(key, () => ({
      name: $(`${key}-name`)?.value.trim() || '',
      playlistUrl: $(`${key}-url`)?.value.trim() || '',
      playlistType: $(`${key}-type`)?.value || 'm3u',
    }));
    selectedOption(select, created.playlistId, created.playlistName);

    const usable = created.state?.usable
      || created.state?.accessMode === 'direct'
      || created.state?.cacheStatus === 'ready';
    if (!usable) {
      throw new Error(
        'A lista foi salva em Minhas listas, mas ainda está sendo validada. Não cadastre novamente; aguarde e depois selecione esta mesma lista para concluir a ativação.',
      );
    }
  }

  async function resolveAdminSelect(selectId, key, sellerId) {
    const select = $(selectId);
    if (!select || select.value !== NEW_PLAYLIST) return;
    const draft = preparedDraft(key, () => ({
      name: $(`${key}-name`)?.value.trim() || '',
      playlistUrl: $(`${key}-url`)?.value.trim() || '',
      playlistType: $(`${key}-type`)?.value || 'm3u',
    }));
    const result = await panelFunction('admin-inline-playlist', { sellerId, ...draft });
    const playlistId = result.playlistId || result.id;
    if (!playlistId) throw new Error('A lista não retornou identificação após ser salva.');
    selectedOption(select, playlistId, result.playlistName || draft.name);
  }

  function wrapBefore(name, preflight) {
    const current = window[name];
    if (typeof current !== 'function' || current.__playlistSaveFeedbackHotfix) return;
    const wrapped = async function (...args) {
      try {
        await preflight(...args);
      } catch (error) {
        setMessage(error.message || 'Não foi possível preparar a lista.', 'err');
        return;
      }
      return current.apply(this, args);
    };
    wrapped.__playlistSaveFeedbackHotfix = true;
    wrapped.__playlistSaveFeedbackOriginal = current;
    window[name] = wrapped;
  }

  function installStandaloneSellerCreate() {
    const current = window.sellerListsCreate;
    if (typeof current !== 'function' || current.__playlistSaveFeedbackReplacement) return;

    const replacement = async function sellerListsCreateWithAccurateFeedback() {
      const button = $('sellerPlaylistForm')?.querySelector('button.primary');
      try {
        if (button) button.disabled = true;
        setMessage('Salvando a lista. A validação do provedor pode demorar...', '');

        const created = await createSellerPlaylistFromForm('seller-base', () => ({
          name: $('sellerPlaylistName')?.value.trim() || '',
          playlistUrl: $('sellerPlaylistUrl')?.value.trim() || '',
          playlistType: $('sellerPlaylistType')?.value || 'm3u',
        }));

        if ($('sellerPlaylistName')) $('sellerPlaylistName').value = '';
        if ($('sellerPlaylistUrl')) $('sellerPlaylistUrl').value = '';
        window.sellerListsToggleForm?.(false);
        await window.sellerListsUxRender?.();
        if (typeof window.loadPortal === 'function') await window.loadPortal();

        const state = created.state;
        if (state?.accessMode === 'direct') {
          setMessage('Lista salva com sucesso. O provedor demorou no cache, então o aplicativo usará acesso direto.', 'ok');
        } else if (state?.cacheStatus === 'ready' || state?.usable) {
          setMessage('Lista salva com sucesso e cache pronto.', 'ok');
        } else if (state?.accessMode === 'blocked') {
          setMessage('Lista salva, mas ainda não foi liberada para uso. Não cadastre novamente; use Gerar cache para tentar a validação.', 'err');
        } else {
          setMessage('Lista salva. A validação ainda está processando; não cadastre novamente.', 'ok');
        }
      } catch (error) {
        setMessage(error.message || 'Erro ao cadastrar lista.', 'err');
      } finally {
        if (button) button.disabled = false;
      }
    };
    replacement.__playlistSaveFeedbackReplacement = true;
    replacement.__playlistSaveFeedbackOriginal = current;
    window.sellerListsCreate = replacement;
  }

  function installWrappers() {
    installStandaloneSellerCreate();

    wrapBefore('sellerUxActivateDevice', async () => {
      await resolveSellerSelect('sellerActivationPlaylist', 'seller-inline-playlist');
      await resolveSellerSelect('sellerActivationBackupPlaylist', 'seller-activation-backup-new');
    });

    wrapBefore('sellerUxRenewDevice', async () => {
      await resolveSellerSelect('sellerRenewPlaylist', 'seller-renew-main-new');
      await resolveSellerSelect('sellerRenewBackupPlaylist', 'seller-renew-backup-new');
    });

    wrapBefore('activatePending', async deviceId => {
      const sellerId = $(`pend-seller-${deviceId}`)?.value || null;
      await resolveAdminSelect(`pend-playlist-${deviceId}`, `pend-inline-playlist-${deviceId}`, sellerId);
      await resolveAdminSelect(`pend-backup-playlist-${deviceId}`, `pend-backup-new-${deviceId}`, sellerId);
    });
  }

  function scheduleInstall() {
    clearTimeout(observerTimer);
    observerTimer = setTimeout(installWrappers, 60);
  }

  function initialize() {
    installWrappers();
    const observer = new MutationObserver(scheduleInstall);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setInterval(installWrappers, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
