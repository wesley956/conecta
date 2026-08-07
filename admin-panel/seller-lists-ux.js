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

  function token() { return sessionStorage.getItem(TOKEN_KEY) || ''; }

  async function api(action, payload = {}) {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-seller-token': token() },
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

  function lifecycleInfo(playlist) {
    const technical = String(playlist.lifecycleStatus || playlist.qualificationStatus || 'validating');
    const code = String(playlist.qualificationCode || playlist.cacheErrorCode || '');
    const cacheReady = String(playlist.cacheStatus || '') === 'ready' && Number(playlist.cacheItemCount || 0) > 0;
    let status = technical;
    if (!playlist.lifecycleStatus) {
      if (playlist.active === false) status = 'archived';
      else if (technical === 'blocked' || playlist.accessMode === 'blocked') status = 'blocked';
      else if (cacheReady || technical === 'ready_cache') status = 'ready_cache';
      else if (technical === 'ready_direct') status = 'confirmed_by_device';
      else if (code === 'DEVICE_TEST_FAILED') status = 'device_failed';
      else if (technical === 'awaiting_device_test' || technical === 'retryable_error') status = 'awaiting_device_confirmation';
      else status = 'generating_cache';
    }
    const table = {
      saving: ['Salvando', 'O cadastro ainda está sendo processado.'],
      generating_cache: ['Gerando cache', 'O servidor está tentando autenticar a origem e gerar o cache.'],
      ready_cache: ['Pronta com cache', 'O cache foi gerado e a lista está pronta nas plataformas compatíveis.'],
      awaiting_device_confirmation: ['Aguardando confirmação no aparelho', 'O servidor não confirmou a origem. No Android, ela pode ser ativada provisoriamente.'],
      confirmed_by_device: ['Confirmada pelo aparelho', 'Um aparelho Android abriu o conteúdo e confirmou esta lista.'],
      device_failed: ['Falhou no aparelho', 'O aparelho não conseguiu abrir esta lista. Revise os dados ou tente novamente.'],
      blocked: ['Bloqueada', 'A origem precisa ser corrigida antes de uma nova ativação.'],
      archived: ['Arquivada', 'A lista foi arquivada.'],
    };
    const [fallbackLabel, fallbackMessage] = table[status] || table.generating_cache;
    return {
      status,
      label: playlist.lifecycleLabel || playlist.qualificationLabel || fallbackLabel,
      message: playlist.lifecycleMessage || playlist.qualificationMessage || fallbackMessage,
      cacheReady,
    };
  }

  function platformCapabilities(playlist, info) {
    const supplied = playlist.platformCapabilities || {};
    const blocked = info.status === 'blocked' || info.status === 'archived';
    return {
      android: supplied.android || (blocked ? 'blocked' : ['ready_cache','confirmed_by_device'].includes(info.status) ? 'available' : 'provisional'),
      lg: supplied.lg || (info.cacheReady || info.status === 'ready_cache' ? 'available_by_cache' : 'unavailable'),
      samsung: supplied.samsung || (info.cacheReady || info.status === 'ready_cache' ? 'available_by_cache' : 'unavailable'),
    };
  }

  function platformText(platform, status) {
    if (status === 'available') return `${platform}: disponível`;
    if (status === 'provisional') return `${platform}: provisória`;
    if (status === 'available_by_cache') return `${platform}: por cache`;
    if (status === 'blocked') return `${platform}: bloqueada`;
    return `${platform}: indisponível`;
  }

  function lifecyclePill(playlist) {
    const info = lifecycleInfo(playlist);
    const tone = ['ready_cache','confirmed_by_device'].includes(info.status) ? 'ready'
      : ['blocked','device_failed'].includes(info.status) ? 'error' : 'processing';
    return `<span class="cache-pill ${esc(tone)}">${esc(info.label)}</span>`;
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

  function inferPlaylistTypeFromUrl(rawUrl) {
    try {
      const url = new URL(String(rawUrl || '').trim());
      const path = url.pathname.toLowerCase().replace(/\/+$/, '');
      const hasCredentials = Boolean(url.searchParams.get('username') && url.searchParams.get('password'));
      return hasCredentials && (path.endsWith('/get.php') || path.endsWith('/player_api.php')) ? 'xtream' : null;
    } catch { return null; }
  }

  function syncDetectedPlaylistType() {
    const detected = inferPlaylistTypeFromUrl($('sellerPlaylistUrl')?.value);
    if (detected && $('sellerPlaylistType')) {
      $('sellerPlaylistType').value = detected;
      showListMsg('Formato Xtream identificado automaticamente.');
    }
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
          <p class="muted">Cadastre a origem. O painel tenta gerar o cache; se não conseguir, o Android pode confirmar a lista na primeira abertura.</p>
        </div>
        <div class="actions" style="margin-top:0;">
          <button class="primary" type="button" onclick="sellerListsToggleForm()">Adicionar lista</button>
          <button type="button" onclick="sellerListsUxRender()">Atualizar</button>
        </div>
      </div>
      <div id="sellerPlaylistForm" class="seller-playlist-form">
        <div class="seller-form-grid">
          <div><label for="sellerPlaylistName">Nome da lista</label><input id="sellerPlaylistName" placeholder="Ex: Minha lista premium" /></div>
          <div><label for="sellerPlaylistType">Tipo (automático)</label><select id="sellerPlaylistType"><option value="m3u">M3U</option><option value="xtream">Xtream</option><option value="stalker">Stalker</option></select></div>
          <div class="wide"><label for="sellerPlaylistUrl">URL da lista</label><input id="sellerPlaylistUrl" placeholder="https://..." /></div>
        </div>
        <div class="actions"><button class="primary" type="button" onclick="sellerListsCreate()">Salvar lista</button><button type="button" onclick="sellerListsToggleForm(false)">Cancelar</button></div>
      </div>
      <div id="sellerListsMsg" class="seller-msg"></div>
      <div id="sellerPlaylistsList" class="seller-playlist-list"></div>`;

    anchor.insertAdjacentElement('afterend', card);
    $('sellerPlaylistUrl')?.addEventListener('input', syncDetectedPlaylistType);
    window.sellerPortalRefreshNavigation?.();
  }

  function renderPlaylists() {
    ensureListsCard();
    const host = $('sellerPlaylistsList');
    if (!host) return;
    const playlists = listsData?.playlists || [];
    host.innerHTML = playlists.length ? playlists.map(playlist => {
      const info = lifecycleInfo(playlist);
      const platforms = platformCapabilities(playlist, info);
      return `<div class="seller-playlist-item">
        <div>
          <strong>${esc(playlist.name)}</strong>
          <div class="muted">Tipo: ${esc(playlist.playlistType || 'm3u')} · Itens: ${Number(playlist.cacheItemCount || 0).toLocaleString('pt-BR')}</div>
          <div class="muted">Atualizado: ${formatDate(playlist.cacheUpdatedAt || playlist.playlistUpdatedAt)}</div>
          ${lifecyclePill(playlist)}
          <div class="seller-msg ${['ready_cache','confirmed_by_device'].includes(info.status) ? 'ok' : info.status === 'blocked' ? 'err' : ''}">${esc(info.message)}</div>
          <div class="muted">${esc(platformText('Android', platforms.android))} · ${esc(platformText('LG', platforms.lg))} · ${esc(platformText('Samsung', platforms.samsung))}</div>
          ${cacheAttemptDetails(playlist)}
        </div>
        <div class="actions" style="margin-top:0;">
          ${playlist.canRetryCache === false ? '' : `<button type="button" onclick="sellerListsRefreshCache('${esc(playlist.id)}')">Tentar cache</button>`}
          <button class="red" type="button" onclick="sellerListsDelete('${esc(playlist.id)}')">Excluir</button>
        </div>
      </div>`;
    }).join('') : '<div class="muted">Nenhuma lista cadastrada ou liberada ainda.</div>';
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
      const playlistType = inferPlaylistTypeFromUrl(playlistUrl) || $('sellerPlaylistType')?.value || 'm3u';
      if (!name) throw new Error('Digite o nome da lista.');
      if (!playlistUrl) throw new Error('Digite a URL da lista.');

      showListMsg('Salvando lista...');
      const result = await api('createSellerPlaylist', { name, playlistUrl, playlistType });
      showListMsg(result.message || 'Lista salva. O processamento continuará automaticamente.', 'ok');

      $('sellerPlaylistName').value = '';
      $('sellerPlaylistUrl').value = '';
      sellerListsToggleForm(false);
      await loadLists();
      if (typeof window.loadPortal === 'function') await window.loadPortal();
    } catch (err) { showListMsg(err.message || 'Erro ao cadastrar lista.', 'err'); }
  };

  window.sellerListsRefreshCache = async function sellerListsRefreshCache(playlistId) {
    try {
      showListMsg('Tentando gerar o cache novamente...');
      const result = await api('refreshSellerPlaylistCache', { playlistId });
      showListMsg(result.message || 'Nova tentativa iniciada.', result.ok === false ? 'err' : 'ok');
      await loadLists();
      if (typeof window.loadPortal === 'function') await window.loadPortal();
    } catch (err) { showListMsg(err.message || 'Erro ao tentar o cache.', 'err'); }
  };

  window.sellerListsDelete = async function sellerListsDelete(playlistId) {
    const playlist = (listsData?.playlists || []).find(item => item.id === playlistId);
    if (!playlist) return showListMsg('Lista não encontrada. Atualize a página e tente novamente.', 'err');
    if (!window.confirm(`Excluir a lista "${playlist.name}" da sua conta? Esta ação não poderá ser desfeita.`)) return;
    try {
      showListMsg('Excluindo lista...');
      const result = await api('deleteSellerPlaylist', { playlistId });
      showListMsg(result.message || 'Lista excluída com sucesso.', 'ok');
      await loadLists();
      if (typeof window.loadPortal === 'function') await window.loadPortal();
    } catch (err) { showListMsg(err.message || 'Erro ao excluir lista.', 'err'); }
  };

  window.sellerListsUxRender = async function sellerListsUxRender() {
    try { showListMsg('Atualizando listas...'); await loadLists(); showListMsg(''); }
    catch (err) { showListMsg(err.message || 'Erro ao atualizar listas.', 'err'); }
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
    if (token()) loadLists().catch(() => {});
  }

  document.addEventListener('DOMContentLoaded', boot);
  setTimeout(boot, 350);
})();
