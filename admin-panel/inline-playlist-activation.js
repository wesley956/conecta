(() => {
  'use strict';

  const NEW_PLAYLIST_VALUE = '__roneca_new_playlist__';
  const adminDrafts = new Map();
  const sellerDrafts = new Map();

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function installStylesheet() {
    if (document.querySelector('link[data-inline-playlist-activation]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './inline-playlist-activation.css?v=1.0';
    link.dataset.inlinePlaylistActivation = 'true';
    document.head.appendChild(link);
  }

  async function callPanelFunction(functionName, payload) {
    const config = window.RONECA_PANEL_CONFIG || {};
    const supabaseUrl = String(config.supabaseUrl || '').replace(/\/$/, '');
    const anonKey = String(config.anonKey || '').trim();

    if (!supabaseUrl || !anonKey) {
      throw new Error('Configuração pública do Supabase não encontrada.');
    }
    if (!window.RonecaPanelAuth) {
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
      throw new Error(data.error || data.message || `Falha HTTP ${response.status}.`);
    }
    return data;
  }

  function appendNewPlaylistOption(select) {
    if (!select || select.querySelector(`option[value="${NEW_PLAYLIST_VALUE}"]`)) return;
    const option = document.createElement('option');
    option.value = NEW_PLAYLIST_VALUE;
    option.textContent = '＋ Cadastrar uma nova lista agora';
    select.appendChild(option);
  }

  function addResolvedPlaylistOption(select, playlistId, playlistName) {
    if (!select || !playlistId) return;
    let option = Array.from(select.options).find(item => item.value === playlistId);
    if (!option) {
      option = document.createElement('option');
      option.value = playlistId;
      select.appendChild(option);
    }
    option.textContent = playlistName || 'Lista criada nesta ativação';
    select.value = playlistId;
  }

  function readDraft(prefix) {
    const name = $(`${prefix}-name`)?.value.trim() || '';
    const playlistUrl = $(`${prefix}-url`)?.value.trim() || '';
    const playlistType = $(`${prefix}-type`)?.value || 'm3u';

    if (!name) throw new Error('Digite o nome da nova lista.');
    if (!playlistUrl) throw new Error('Digite a URL da nova lista.');
    if (!/^https?:\/\//i.test(playlistUrl)) {
      throw new Error('A URL da lista precisa começar com http:// ou https://.');
    }

    return { name, playlistUrl, playlistType };
  }

  function draftFingerprint(draft, ownerId = '') {
    return JSON.stringify({ ...draft, ownerId: String(ownerId || '') });
  }

  function setInlineFieldsVisible(container, visible) {
    if (!container) return;
    container.hidden = !visible;
    container.classList.toggle('open', visible);
    container.querySelectorAll('input, select').forEach(field => {
      field.disabled = !visible;
    });
  }

  async function resolveAdminPlaylist(deviceId, sellerId, draft) {
    const fingerprint = draftFingerprint(draft, sellerId);
    const previous = adminDrafts.get(deviceId);

    if (previous?.fingerprint === fingerprint && previous.playlistId) {
      const refreshed = await callPanelFunction('admin-panel', {
        action: 'refreshPlaylistCache',
        id: previous.playlistId,
      });
      if (!refreshed.ok && !refreshed.cache?.ok) {
        throw new Error(refreshed.message || 'A lista foi cadastrada, mas o cache ainda não ficou pronto.');
      }
      return previous;
    }

    const created = await callPanelFunction('admin-inline-playlist', {
      sellerId: sellerId || null,
      name: draft.name,
      playlistUrl: draft.playlistUrl,
      playlistType: draft.playlistType,
    });
    const resolved = {
      fingerprint,
      playlistId: created.playlistId || created.id,
      playlistName: created.playlistName || draft.name,
    };

    if (!resolved.playlistId) throw new Error('O servidor não retornou a identificação da lista criada.');
    adminDrafts.set(deviceId, resolved);

    if (!created.cache?.ok) {
      throw new Error(created.message || 'A lista foi cadastrada, mas o cache ainda não ficou pronto. Tente novamente para atualizar o cache.');
    }

    return resolved;
  }

  function adminPendingRow(device) {
    const safeId = esc(device.id);
    const mainOptions = window.playlistOptions(device.playlistId) +
      `<option value="${NEW_PLAYLIST_VALUE}">＋ Cadastrar uma nova lista agora</option>`;

    return `
      <tr>
        <td>
          <span class="mono">${esc(device.deviceCode)}</span><br>
          <span class="small muted">${esc(device.deviceUuid || '')}</span>
        </td>
        <td><select class="table-select" id="pend-customer-${safeId}">${window.customerOptions(device.customerId)}</select></td>
        <td><select class="table-select" id="pend-seller-${safeId}">${window.sellerOptions(device.sellerId)}</select></td>
        <td><select class="table-select" id="pend-plan-${safeId}">${window.planOptions(device.planId)}</select></td>
        <td class="inline-playlist-cell">
          <label class="small">Principal
            <select class="table-select" id="pend-playlist-${safeId}" onchange="ronecaInlineToggleAdminPlaylist('${safeId}')">${mainOptions}</select>
          </label>
          <div id="pend-inline-playlist-${safeId}" class="inline-playlist-fields inline-playlist-fields-admin" hidden>
            <label>Nome da nova lista<input id="pend-inline-playlist-${safeId}-name" placeholder="Ex: Lista de Maria" /></label>
            <label>Tipo
              <select id="pend-inline-playlist-${safeId}-type">
                <option value="m3u">M3U</option>
                <option value="xtream">Xtream</option>
                <option value="stalker">Stalker</option>
              </select>
            </label>
            <label class="wide">URL da nova lista<input id="pend-inline-playlist-${safeId}-url" placeholder="https://..." /></label>
            <p class="inline-playlist-help wide">A lista será salva, terá o cache validado e será vinculada ao vendedor escolhido antes da liberação.</p>
          </div>
          <label class="small">Reserva<select class="table-select" id="pend-backup-playlist-${safeId}">${window.playlistOptions(device.backupPlaylistId)}</select></label>
        </td>
        <td><input class="table-input" id="pend-exp-${safeId}" type="date" value="${window.thirtyDaysDate()}"></td>
        <td>
          <button class="btn primary icon-btn icon-wide" title="Liberar aparelho" aria-label="Liberar aparelho" onclick="activatePending('${safeId}')">✅ Liberar</button>
        </td>
      </tr>
    `;
  }

  function installAdminActivation() {
    if (!/\/dashboard\.html$/i.test(location.pathname)) return false;
    if (window.__ronecaInlineAdminInstalled) return true;
    if (typeof window.pendingRow !== 'function' || typeof window.activatePending !== 'function') return false;

    window.__ronecaInlineAdminInstalled = true;
    window.pendingRow = adminPendingRow;

    window.ronecaInlineToggleAdminPlaylist = function ronecaInlineToggleAdminPlaylist(deviceId) {
      const select = $(`pend-playlist-${deviceId}`);
      setInlineFieldsVisible($(`pend-inline-playlist-${deviceId}`), select?.value === NEW_PLAYLIST_VALUE);
    };

    window.activatePending = async function activatePendingWithInlinePlaylist(id) {
      try {
        const sellerId = $(`pend-seller-${id}`).value || null;
        const planId = $(`pend-plan-${id}`).value || null;
        let playlistId = $(`pend-playlist-${id}`).value || null;
        const backupPlaylistId = $(`pend-backup-playlist-${id}`).value || null;
        const customerId = $(`pend-customer-${id}`).value || null;
        const expiresAtInput = $(`pend-exp-${id}`).value || '';
        const creatingPlaylist = playlistId === NEW_PLAYLIST_VALUE;
        const draft = creatingPlaylist ? readDraft(`pend-inline-playlist-${id}`) : null;

        if (!creatingPlaylist && playlistId && backupPlaylistId && playlistId === backupPlaylistId) {
          throw new Error('Escolha uma lista reserva diferente da principal.');
        }

        if (!window.confirmCreditConsumption(id, sellerId, planId, 'Liberar aparelho pendente')) return;

        await window.withDeviceActionLock(id, 'activatePending', async () => {
          if (creatingPlaylist && draft) {
            window.show('Salvando a nova lista e validando o cache...');
            const resolved = await resolveAdminPlaylist(id, sellerId, draft);
            playlistId = resolved.playlistId;
            const select = $(`pend-playlist-${id}`);
            addResolvedPlaylistOption(select, resolved.playlistId, resolved.playlistName);
            setInlineFieldsVisible($(`pend-inline-playlist-${id}`), false);
          }

          if (playlistId && backupPlaylistId && playlistId === backupPlaylistId) {
            throw new Error('Escolha uma lista reserva diferente da principal.');
          }

          const input = { customerId, sellerId, planId, playlistId, backupPlaylistId, expiresAtInput };
          const attempt = window.ensureDeviceCommercialAttempt(
            id,
            'activation',
            input,
            () => window.explicitExpiry(expiresAtInput) || window.calculatedExpiry(planId),
          );

          await window.api('updateDevice', {
            id,
            customerId,
            sellerId,
            planId,
            playlistId,
            backupPlaylistId,
            status: 'active',
            expiresAt: attempt.expiresAt,
            operationType: 'activation',
            idempotencyKey: attempt.idempotencyKey,
          });

          window.clearDeviceCommercialAttempt(id, 'activation');
          adminDrafts.delete(id);
          await window.loadAll();
          window.show('Aparelho liberado com a nova lista vinculada.');
        });
      } catch (error) {
        window.show(error?.message || 'Não foi possível liberar o aparelho.', true);
      }
    };

    window.renderPending();
    return true;
  }

  function sellerMessage(text, type = '') {
    const message = $('sellerUxMsg');
    if (!message) return;
    message.className = `seller-msg ${type}`;
    message.textContent = text || '';
  }

  function ensureSellerFields() {
    const select = $('sellerActivationPlaylist');
    const grid = $('sellerActivationForm')?.querySelector('.seller-form-grid');
    if (!select || !grid) return false;

    appendNewPlaylistOption(select);
    if (!$('seller-inline-playlist')) {
      const fields = document.createElement('div');
      fields.id = 'seller-inline-playlist';
      fields.className = 'inline-playlist-fields inline-playlist-fields-seller wide';
      fields.hidden = true;
      fields.innerHTML = `
        <div class="inline-playlist-title wide">
          <strong>Cadastrar nova lista principal</strong>
          <span>Ela será salva em Minhas listas e vinculada a este aparelho.</span>
        </div>
        <label>Nome da nova lista<input id="seller-inline-playlist-name" placeholder="Ex: Lista de Maria" /></label>
        <label>Tipo
          <select id="seller-inline-playlist-type">
            <option value="m3u">M3U</option>
            <option value="xtream">Xtream</option>
            <option value="stalker">Stalker</option>
          </select>
        </label>
        <label class="wide">URL da nova lista<input id="seller-inline-playlist-url" placeholder="https://..." /></label>
        <p class="inline-playlist-help wide">A cobrança só acontece depois que o cache da lista estiver pronto.</p>
      `;
      select.closest('div')?.insertAdjacentElement('afterend', fields);
    }

    if (!select.dataset.inlinePlaylistListener) {
      select.dataset.inlinePlaylistListener = 'true';
      select.addEventListener('change', () => {
        setInlineFieldsVisible($('seller-inline-playlist'), select.value === NEW_PLAYLIST_VALUE);
      });
    }
    return true;
  }

  async function resolveSellerPlaylist(deviceCode, draft) {
    const fingerprint = draftFingerprint(draft, deviceCode);
    const previous = sellerDrafts.get(deviceCode);

    if (previous?.fingerprint === fingerprint && previous.playlistId) {
      const refreshed = await callPanelFunction('seller-panel', {
        action: 'refreshSellerPlaylistCache',
        playlistId: previous.playlistId,
      });
      if (!refreshed.ok && !refreshed.cache?.ok) {
        throw new Error('A lista foi cadastrada, mas o cache ainda não ficou pronto. Tente novamente em alguns instantes.');
      }
      return previous;
    }

    const created = await callPanelFunction('seller-panel', {
      action: 'createSellerPlaylist',
      name: draft.name,
      playlistUrl: draft.playlistUrl,
      playlistType: draft.playlistType,
    });
    const resolved = {
      fingerprint,
      playlistId: created.playlistId,
      playlistName: created.playlistName || draft.name,
    };

    if (!resolved.playlistId) throw new Error('O servidor não retornou a identificação da lista criada.');
    sellerDrafts.set(deviceCode, resolved);

    if (!created.cache?.ok) {
      throw new Error(created.message || 'A lista foi cadastrada, mas o cache ainda não ficou pronto. Tente novamente para atualizar o cache.');
    }

    return resolved;
  }

  function clearSellerDraftFields() {
    ['seller-inline-playlist-name', 'seller-inline-playlist-url'].forEach(id => {
      const field = $(id);
      if (field) field.value = '';
    });
    if ($('seller-inline-playlist-type')) $('seller-inline-playlist-type').value = 'm3u';
    setInlineFieldsVisible($('seller-inline-playlist'), false);
  }

  function installSellerActivation() {
    if (!/\/seller\.html$/i.test(location.pathname)) return false;
    if (!ensureSellerFields()) return false;
    if (window.__ronecaInlineSellerInstalled) return true;
    if (typeof window.sellerUxActivateDevice !== 'function') return false;

    window.__ronecaInlineSellerInstalled = true;
    const originalActivate = window.sellerUxActivateDevice;
    const originalOpen = window.sellerUxOpenActivationForm;
    const originalClose = window.sellerUxCloseActivationForm;

    window.sellerUxOpenActivationForm = function openActivationWithInlinePlaylist() {
      originalOpen?.apply(this, arguments);
      ensureSellerFields();
      appendNewPlaylistOption($('sellerActivationPlaylist'));
    };

    window.sellerUxCloseActivationForm = function closeActivationWithInlinePlaylist() {
      originalClose?.apply(this, arguments);
      clearSellerDraftFields();
    };

    window.sellerUxActivateDevice = async function activateWithInlinePlaylist() {
      const select = $('sellerActivationPlaylist');
      if (!select || select.value !== NEW_PLAYLIST_VALUE) {
        return await originalActivate.apply(this, arguments);
      }

      try {
        const deviceCode = $('sellerDeviceCodeLookup')?.value.trim().toUpperCase() || 'aparelho';
        const draft = readDraft('seller-inline-playlist');
        sellerMessage('Salvando a nova lista e validando o cache...');
        const resolved = await resolveSellerPlaylist(deviceCode, draft);

        addResolvedPlaylistOption(select, resolved.playlistId, resolved.playlistName);
        setInlineFieldsVisible($('seller-inline-playlist'), false);
        await originalActivate.apply(this, arguments);

        if (!$('sellerActivationForm')?.classList.contains('open')) {
          sellerDrafts.delete(deviceCode);
          clearSellerDraftFields();
        }
      } catch (error) {
        sellerMessage(error?.message || 'Não foi possível cadastrar a lista durante a ativação.', 'err');
      }
    };

    return true;
  }

  function install() {
    installStylesheet();
    const adminInstalled = installAdminActivation();
    const sellerInstalled = installSellerActivation();

    if (!adminInstalled && /\/dashboard\.html$/i.test(location.pathname)) {
      setTimeout(install, 180);
    }
    if (!sellerInstalled && /\/seller\.html$/i.test(location.pathname)) {
      setTimeout(install, 180);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
