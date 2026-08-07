(() => {
  'use strict';
  if (window.__ronecaPlaylistLifecycleUiInstalled) return;
  window.__ronecaPlaylistLifecycleUiInstalled = true;
  if (!/\/dashboard\.html$/.test(location.pathname)) return;

  const officialById = new Map();
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#039;');

  async function invoke(payload) {
    const config = window.RONECA_PANEL_CONFIG || {};
    const base = String(config.supabaseUrl || '').replace(/\/$/, '');
    if (!base || !config.anonKey || !window.RonecaPanelAuth) throw new Error('Sessão do painel indisponível.');
    const token = await window.RonecaPanelAuth.getAccessToken();
    const response = await fetch(`${base}/functions/v1/playlist-registration`, {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', apikey: config.anonKey, Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload || {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || `Falha HTTP ${response.status}.`);
    return data;
  }

  function playlistRows() {
    try { return typeof playlists !== 'undefined' && Array.isArray(playlists) ? playlists : []; }
    catch { return []; }
  }

  function lifecycle(item) {
    const status = String(item?.lifecycleStatus || 'generating_cache');
    const table = {
      saving: ['Salvando', 'O cadastro da lista ainda está sendo processado.'],
      generating_cache: ['Gerando cache', 'O servidor está tentando autenticar a origem e gerar o cache.'],
      ready_cache: ['Pronta com cache', 'O cache foi gerado e a lista está pronta nas plataformas compatíveis.'],
      awaiting_device_confirmation: ['Aguardando confirmação no aparelho', 'O servidor não confirmou a origem. No Android, ela pode ser ativada provisoriamente.'],
      confirmed_by_device: ['Confirmada pelo aparelho', 'Um aparelho Android abriu o conteúdo e confirmou esta lista.'],
      device_failed: ['Falhou no aparelho', 'O aparelho tentou esta lista e não confirmou o acesso. Revise os dados ou tente novamente antes de uma nova ativação.'],
      blocked: ['Bloqueada', 'A origem precisa ser corrigida antes de uma nova ativação.'],
      archived: ['Arquivada', 'A lista foi arquivada e não aparece em novas ativações.'],
    };
    const [label, message] = table[status] || table.generating_cache;
    return { status, label: item?.lifecycleLabel || label, message: item?.lifecycleMessage || message };
  }

  function platformText(platform, status) {
    if (status === 'available') return `${platform}: disponível`;
    if (status === 'provisional') return `${platform}: provisória`;
    if (status === 'available_by_cache') return `${platform}: disponível por cache`;
    if (status === 'blocked') return `${platform}: bloqueada`;
    return `${platform}: indisponível`;
  }

  function unavailableForNewActivation(item) {
    const status = lifecycle(item).status;
    return status === 'blocked' || status === 'device_failed';
  }

  function mergeOfficial() {
    for (const playlist of playlistRows()) {
      const official = officialById.get(String(playlist.id));
      if (official) Object.assign(playlist, official);
    }
  }

  function optionLabel(item) {
    const info = lifecycle(item);
    return `${item.name} · ${info.label}`;
  }

  function patchPlaylistOptions() {
    if (typeof window.playlistOptions !== 'function' || window.playlistOptions.__lote3Lifecycle) return;
    const wrapped = function lifecyclePlaylistOptions(selectedId) {
      return ['<option value="">Sem lista</option>']
        .concat(playlistRows()
          .filter(item => lifecycle(item).status !== 'archived')
          .map(item => `<option value="${esc(item.id)}" ${item.id === selectedId ? 'selected' : ''} ${unavailableForNewActivation(item) ? 'disabled' : ''}>${esc(optionLabel(item))}</option>`))
        .join('');
    };
    wrapped.__lote3Lifecycle = true;
    window.playlistOptions = wrapped;
  }

  function patchCacheBadge() {
    if (typeof window.playlistCacheBadge !== 'function' || window.playlistCacheBadge.__lote3Lifecycle) return;
    const wrapped = function lifecycleBadge(item) {
      const info = lifecycle(item);
      const tone = ['ready_cache','confirmed_by_device'].includes(info.status) ? 'active'
        : ['blocked','device_failed'].includes(info.status) ? 'blocked' : 'pending';
      return `<span class="badge ${tone}">${esc(info.label)}</span>`;
    };
    wrapped.__lote3Lifecycle = true;
    window.playlistCacheBadge = wrapped;
  }

  function annotateRows() {
    const body = $('#playlistsBody');
    if (!body) return;
    let visible;
    try { visible = typeof filteredPlaylists === 'function' ? filteredPlaylists() : playlistRows(); }
    catch { visible = playlistRows(); }
    [...body.querySelectorAll('tr')].forEach((row, index) => {
      const item = visible[index];
      const cell = row.cells?.[4];
      if (!item || !cell) return;
      cell.querySelector('.playlist-lifecycle-platforms')?.remove();
      cell.querySelector('.playlist-lifecycle-message')?.remove();
      const info = lifecycle(item);
      const platforms = item.platformCapabilities || {};
      const message = document.createElement('div');
      message.className = 'small playlist-lifecycle-message';
      message.style.marginTop = '5px';
      message.textContent = info.message;
      const capability = document.createElement('div');
      capability.className = 'small muted playlist-lifecycle-platforms';
      capability.style.marginTop = '5px';
      capability.textContent = [
        platformText('Android', platforms.android || (unavailableForNewActivation(item) ? 'blocked' : 'provisional')),
        platformText('LG', platforms.lg || 'unavailable'),
        platformText('Samsung', platforms.samsung || 'unavailable'),
      ].join(' · ');
      cell.append(message, capability);
    });
  }

  function patchRenderers() {
    patchPlaylistOptions();
    patchCacheBadge();
    if (typeof window.renderPlaylists === 'function' && !window.renderPlaylists.__lote3Lifecycle) {
      const original = window.renderPlaylists;
      const wrapped = function lifecycleRenderPlaylists(...args) {
        mergeOfficial(); patchPlaylistOptions(); patchCacheBadge();
        const result = original.apply(this, args);
        annotateRows();
        return result;
      };
      wrapped.__lote3Lifecycle = true;
      window.renderPlaylists = wrapped;
    }
  }

  async function refresh(forceRender = true) {
    const result = await invoke({ action: 'list' });
    officialById.clear();
    for (const item of result.playlists || []) officialById.set(String(item.id), item);
    mergeOfficial(); patchRenderers();
    if (forceRender && typeof window.renderPlaylists === 'function') window.renderPlaylists();
    else annotateRows();
    return result.playlists || [];
  }

  function wrapLoadAll() {
    if (typeof window.loadAll !== 'function' || window.loadAll.__lote3Lifecycle) return;
    const original = window.loadAll;
    const wrapped = async function lifecycleLoadAll(...args) {
      const result = await original.apply(this, args);
      await refresh(true).catch(() => {});
      return result;
    };
    wrapped.__lote3Lifecycle = true;
    window.loadAll = wrapped;
  }

  async function init() {
    patchRenderers(); wrapLoadAll();
    await refresh(true).catch(() => {});
  }

  window.RonecaPlaylistLifecycleUI = Object.freeze({ refresh, lifecycle });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
