(() => {
  const API = 'https://awauvkjkucjqulkklmuo.supabase.co/functions/v1/seller-panel';
  const TOKEN_KEY = 'roneca_seller_token';
  let listsData = null;

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

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

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR');
  }

  function cacheText(status) {
    const value = String(status || 'pending');
    if (value === 'ready') return 'Cache pronto';
    if (value === 'processing') return 'Processando cache';
    if (value === 'error') return 'Erro no cache';
    return 'Aguardando cache';
  }

  function cachePill(playlist) {
    if (playlist.accessMode === 'direct') {
      return '<span class="cache-pill ready">Acesso direto</span>';
    }
    if (playlist.accessMode === 'blocked') {
      return '<span class="cache-pill error">Lista bloqueada</span>';
    }
    const status = String(playlist.cacheStatus || 'pending');
    return `<span class="cache-pill ${esc(status)}">${esc(cacheText(status))}</span>`;
  }

  function cacheAttemptDetails(playlist) {
    const attempts = Array.isArray(playlist.cacheAttempts) ? playlist.cacheAttempts : [];
    const failures = attempts.filter(attempt => attempt?.status === 'error' && attempt?.error);
    if (!failures.length) return '';

    return failures.map(attempt => {
      const label = attempt.method === 'xtream' ? 'Xtream' : 'M3U';
      return `<div class="muted">${label}: ${esc(attempt.error)}</div>`;
    }).join('');
  }

  function showListMsg(text, type = '') {
    const msg = $('sellerListsMsg');
    if (!msg) return;
    msg.className = `seller-msg ${type}`;
    msg.textContent = text || '';
  }

  function ensureListsCard() {
    if ($('sellerListsCard')) return;

    const dashboard = $('dashboardView');
    if (!dashboard) return;

    const devicesCard = $('sellerDevicesCard');
    const activation = $('sellerActivationCard');
    const statsCard = dashboard.querySelector('.card');
    const anchor = devicesCard || activation || statsCard;
    if (!anchor) return;

    const card = document.createElement('div');
    card.id = 'sellerListsCard';
    card.className = 'card seller-playlists-card seller-portal-section';
    card.dataset.sellerSection = 'lists';
    card.hidden = true;
    card.innerHTML = `
      <div class="seller-playlist-head">
        <div>
          <h2>Minhas listas</h2>
          <p class="muted">Cadastre sua própria lista. O sistema gera cache para carregar rápido no aparelho.</p>
        </div>
        <div class="actions" style="margin-top:0;">
          <button class="primary" type="button" onclick="sellerListsToggleForm()">Adicionar lista</button>
          <button type="button" onclick="sellerListsUxRender()">Atualizar</button>
        </div>
      </div>

      <div id="sellerPlaylistForm" class="seller-playlist-form">
        <div class="seller-form-grid">
          <div>
            <label for="sellerPlaylistName">Nome da lista</label>
            <input id="sellerPlaylistName" placeholder="Ex: Minha lista premium" />
          </div>
          <div>
            <label for="sellerPlaylistType">Tipo</label>
            <select id="sellerPlaylistType">
              <option value="m3u">M3U</option>
              <option value="xtream">Xtream</option>
              <option value="stalker">Stalker</option>
            </select>
          </div>
          <div class="wide">
            <label for="sellerPlaylistUrl">URL da lista</label>
            <input id="sellerPlaylistUrl" placeholder="https://..." />
          </div>
        </div>
        <div class="actions">
          <button class="primary" type="button" onclick="sellerListsCreate()">Salvar e gerar cache</button>
          <button type="button" onclick="sellerListsToggleForm(false)">Cancelar</button>
        </div>
      </div>

      <div id="sellerListsMsg" class="seller-msg"></div>
      <div id="sellerPlaylistsList" class="seller-playlist-list"></div>
    `;

    anchor.insertAdjacentElement('afterend', card);
    window.sellerPortalRefreshNavigation?.();
  }

  function renderPlaylists() {
    ensureListsCard();
    const host = $('sellerPlaylistsList');
    if (!host) return;

    const playlists = listsData?.playlists || [];
    host.innerHTML = playlists.length
      ? playlists.map(playlist => `
        <div class="seller-playlist-item">
          <div>
            <strong>${esc(playlist.name)}</strong>
            <div class="muted">Tipo: ${esc(playlist.playlistType || 'm3u')} · Itens: ${Number(playlist.cacheItemCount || 0).toLocaleString('pt-BR')}</div>
            <div class="muted">Atualizado: ${formatDate(playlist.cacheUpdatedAt || playlist.playlistUpdatedAt)}</div>
            ${cachePill(playlist)}
            ${playlist.accessMode === 'direct'
              ? '<div class="seller-msg ok">O provedor bloqueia servidores. O aplicativo baixará a lista pela internet do aparelho.</div>'
              : (playlist.cacheError ? `<div class="seller-msg err">${esc(playlist.cacheError)}</div>` : '')}
            ${cacheAttemptDetails(playlist)}
          </div>
          <div class="actions" style="margin-top:0;">
            <button type="button" onclick="sellerListsRefreshCache('${esc(playlist.id)}')">Gerar cache</button>
          </div>
        </div>
      `).join('')
      : '<div class="muted">Nenhuma lista cadastrada ou liberada ainda.</div>';
  }

  async function loadLists() {
    if (!token()) return;
    listsData = await api('dashboard');
    renderPlaylists();
  }

  window.sellerListsToggleForm = function sellerListsToggleForm(force) {
    ensureListsCard();
    const form = $('sellerPlaylistForm');
    if (!form) return;
    const shouldOpen = typeof force === 'boolean' ? force : !form.classList.contains('open');
    form.classList.toggle('open', shouldOpen);
    if (shouldOpen) setTimeout(() => $('sellerPlaylistName')?.focus(), 0);
  };

  window.sellerListsCreate = async function sellerListsCreate() {
    try {
      const name = $('sellerPlaylistName')?.value.trim() || '';
      const playlistUrl = $('sellerPlaylistUrl')?.value.trim() || '';
      const playlistType = $('sellerPlaylistType')?.value || 'm3u';

      if (!name) throw new Error('Digite o nome da lista.');
      if (!playlistUrl) throw new Error('Digite a URL da lista.');

      showListMsg('Salvando lista e gerando cache. Pode levar alguns segundos...');

      const result = await api('createSellerPlaylist', { name, playlistUrl, playlistType });
      const cacheOk = Boolean(result.cache?.ok);
      const direct = result.cache?.accessMode === 'direct';
      showListMsg(
        result.message || (cacheOk ? 'Lista salva e cache pronto.' : 'Lista salva, mas não foi possível validá-la.'),
        cacheOk || direct ? 'ok' : 'err',
      );

      $('sellerPlaylistName').value = '';
      $('sellerPlaylistUrl').value = '';
      sellerListsToggleForm(false);

      await loadLists();
      if (typeof window.loadPortal === 'function') await window.loadPortal();
    } catch (err) {
      showListMsg(err.message || 'Erro ao cadastrar lista.', 'err');
    }
  };

  window.sellerListsRefreshCache = async function sellerListsRefreshCache(playlistId) {
    try {
      showListMsg('Gerando cache da lista...');
      const result = await api('refreshSellerPlaylistCache', { playlistId });
      const direct = result.accessMode === 'direct' || result.cache?.accessMode === 'direct';
      showListMsg(
        result.message || (result.ok ? 'Cache atualizado com sucesso.' : 'Não foi possível validar a lista.'),
        result.ok || direct ? 'ok' : 'err',
      );
      await loadLists();
      if (typeof window.loadPortal === 'function') await window.loadPortal();
    } catch (err) {
      showListMsg(err.message || 'Erro ao gerar cache.', 'err');
    }
  };

  window.sellerListsUxRender = async function sellerListsUxRender() {
    try {
      showListMsg('Atualizando listas...');
      await loadLists();
      showListMsg('');
    } catch (err) {
      showListMsg(err.message || 'Erro ao atualizar listas.', 'err');
    }
  };

  function boot() {
    ensureListsCard();

    const originalRenderPortal = window.renderPortal;
    if (typeof originalRenderPortal === 'function' && !window.__sellerListsUxPatched) {
      window.__sellerListsUxPatched = true;
      window.renderPortal = function patchedSellerListsRenderPortal(data) {
        originalRenderPortal(data);
        listsData = data;
        ensureListsCard();
        window.sellerPortalRefreshNavigation?.();
        renderPlaylists();
      };
    }

    if (token()) {
      loadLists().catch(() => {});
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
  setTimeout(boot, 350);
})();
