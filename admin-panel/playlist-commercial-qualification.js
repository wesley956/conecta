(() => {
  'use strict';
  if (window.__ronecaPlaylistCommercialQualificationInstalled) return;
  window.__ronecaPlaylistCommercialQualificationInstalled = true;

  const state = { playlists: new Map(), validationDevices: [], validationSessions: [], refreshing: null };
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#039;');

  function isAdminPage() { return /\/dashboard\.html$/.test(location.pathname); }

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

  function lifecycle(item) {
    const technical = String(item?.qualificationStatus || 'validating');
    const code = String(item?.qualificationCode || item?.cacheErrorCode || '');
    const cacheStatus = String(item?.cacheStatus || 'missing');
    const archived = item?.active === false || Boolean(item?.archivedAt);
    const cacheReady = cacheStatus === 'ready' && Number(item?.cacheItemCount || 0) > 0;
    if (item?.lifecycleStatus) return String(item.lifecycleStatus);
    if (archived) return 'archived';
    if (technical === 'blocked') return 'blocked';
    if (cacheReady || technical === 'ready_cache') return 'ready_cache';
    if (code === 'DEVICE_TEST_FAILED') return 'device_failed';
    if (technical === 'ready_direct') return 'confirmed_by_device';
    if (technical === 'awaiting_device_test' || technical === 'retryable_error') return 'awaiting_device_confirmation';
    if (technical === 'validating' && cacheStatus === 'missing') return 'saving';
    return 'generating_cache';
  }

  function lifecyclePresentation(item) {
    const status = lifecycle(item);
    const table = {
      saving: ['Salvando', 'O cadastro da lista ainda está sendo processado.'],
      generating_cache: ['Gerando cache', 'O servidor está tentando autenticar a origem e gerar o cache.'],
      ready_cache: ['Pronta com cache', 'O cache foi gerado e a lista está pronta nas plataformas compatíveis.'],
      awaiting_device_confirmation: ['Aguardando confirmação no aparelho', 'O servidor não confirmou a origem. O Android pode confirmar automaticamente na primeira abertura.'],
      confirmed_by_device: ['Confirmada pelo aparelho', 'Um aparelho Android abriu o conteúdo e confirmou esta lista.'],
      device_failed: ['Falhou no aparelho', 'O aparelho tentou esta lista e não confirmou o acesso. Revise os dados ou tente novamente antes de uma nova ativação.'],
      blocked: ['Bloqueada', 'A origem precisa ser corrigida antes de uma nova ativação.'],
      archived: ['Arquivada', 'A lista foi arquivada e não aparece em novas ativações.'],
    };
    const [label, message] = table[status] || table.generating_cache;
    return {
      status,
      label: item?.lifecycleLabel || label,
      message: item?.lifecycleMessage || item?.qualificationMessage || message,
    };
  }

  function platformStatus(item) {
    const lifecycleInfo = lifecyclePresentation(item);
    const supplied = item?.platformCapabilities || {};
    const cacheReady = String(item?.cacheStatus || '') === 'ready' && Number(item?.cacheItemCount || 0) > 0;
    const blocked = ['blocked', 'archived', 'device_failed'].includes(lifecycleInfo.status);
    return {
      android: supplied.android || (blocked ? 'blocked' : ['ready_cache','confirmed_by_device'].includes(lifecycleInfo.status) ? 'available' : 'provisional'),
      lg: supplied.lg || (cacheReady || lifecycleInfo.status === 'ready_cache' ? 'available_by_cache' : 'unavailable'),
      samsung: supplied.samsung || (cacheReady || lifecycleInfo.status === 'ready_cache' ? 'available_by_cache' : 'unavailable'),
    };
  }

  function platformLabel(platform, status) {
    if (status === 'available') return `${platform}: disponível`;
    if (status === 'provisional') return `${platform}: provisória`;
    if (status === 'available_by_cache') return `${platform}: disponível por cache`;
    if (status === 'blocked') return `${platform}: bloqueada`;
    return `${platform}: indisponível`;
  }

  async function refreshPlaylists(force = false) {
    if (!isAdminPage()) return [];
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
    panelMessage(result.message || 'Nova tentativa de cache iniciada.', 'ok');
    await refreshPlaylists(true);
  }

  async function loadValidationState() {
    const result = await invoke('playlist-validation', { action: 'list' });
    state.validationDevices = result.devices || [];
    state.validationSessions = result.sessions || [];
  }

  async function loadAdminDevices() {
    try {
      const result = await invoke('admin-panel', { action: 'listDevices' });
      return (result.devices || []).filter(device => device.status === 'pending' && !device.customerId && !device.playlistId && !device.planId);
    } catch { return []; }
  }

  function qualificationMount() { return $('section-playlists'); }

  async function renderQualificationPanel() {
    if (!isAdminPage()) return;
    const mount = qualificationMount();
    if (!mount) return;
    let panel = $('ronecaQualificationPanel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'ronecaQualificationPanel';
      panel.className = 'roneca-qualification-panel';
      mount.appendChild(panel);
    }

    await loadValidationState();
    const allPendingDevices = await loadAdminDevices();
    const playlists = [...state.playlists.values()];
    const markedIds = new Set(state.validationDevices.map(device => device.id));
    const deviceOptions = [
      ...state.validationDevices.map(device => ({ ...device, marked: true })),
      ...allPendingDevices.filter(device => !markedIds.has(device.id)).map(device => ({ id: device.id, deviceCode: device.deviceCode, clientName: device.clientName, marked: false })),
    ];
    const activeSessions = state.validationSessions.filter(session => session.status === 'active');
    const diagnosticCandidates = playlists.filter(item => {
      const status = lifecycle(item);
      return item.adminDiagnosticRecommended === true
        || status === 'awaiting_device_confirmation'
        || status === 'device_failed';
    });

    panel.innerHTML = `
      <h3>Diagnóstico técnico de listas</h3>
      <p>Uso exclusivo do ADM para investigar DNS, TLS, bloqueio de datacenter e diferenças de protocolo. <strong>Esta área não é etapa da ativação do vendedor.</strong></p>
      <div class="roneca-qualification-toolbar">
        <label><span>Aparelho dedicado ao diagnóstico</span><select id="qualificationDeviceSelect"><option value="">Selecione um aparelho pendente</option>${deviceOptions.map(device => `<option value="${esc(device.id)}" data-marked="${device.marked ? '1' : '0'}">${esc(device.deviceCode || device.id)}${device.clientName ? ` — ${esc(device.clientName)}` : ''}${device.marked ? ' — preparado' : ''}</option>`).join('')}</select></label>
        <label><span>Lista para diagnóstico</span><select id="qualificationPlaylistSelect"><option value="">Selecione a lista</option>${diagnosticCandidates.map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}</select></label>
        <button type="button" class="primary" id="qualificationStartButton" ${diagnosticCandidates.length ? '' : 'disabled'}>Iniciar diagnóstico</button>
      </div>
      ${activeSessions.length ? `<div class="roneca-qualification-list">${activeSessions.map(session => `<article class="roneca-qualification-item"><div><strong>Diagnóstico em andamento: ${esc(session.playlistName || 'Lista')}</strong><small>${esc(session.deviceCode || 'Aparelho')} · expira em ${esc(new Date(session.expiresAt).toLocaleString('pt-BR'))}</small></div><div class="roneca-qualification-actions"><button type="button" data-revoke-session="${esc(session.id)}">Encerrar</button></div></article>`).join('')}</div>` : ''}
      <div class="roneca-qualification-list">${playlists.length ? playlists.map(item => {
        const info = lifecyclePresentation(item);
        const platforms = platformStatus(item);
        return `<article class="roneca-qualification-item" data-playlist-id="${esc(item.id)}"><div><strong>${esc(item.name)}</strong><span class="roneca-qualification-badge ${esc(info.status)}">${esc(info.label)}</span><small>${esc(info.message)}</small><small>${esc(platformLabel('Android', platforms.android))} · ${esc(platformLabel('LG', platforms.lg))} · ${esc(platformLabel('Samsung', platforms.samsung))}</small></div><div class="roneca-qualification-actions">${item.canRetryCache ? `<button type="button" data-retry-playlist="${esc(item.id)}">Tentar cache novamente</button>` : ''}${diagnosticCandidates.some(candidate => candidate.id === item.id) ? '<span class="roneca-qualification-badge awaiting_device_confirmation">Diagnóstico ADM disponível</span>' : ''}</div></article>`;
      }).join('') : '<div class="roneca-qualification-empty">Nenhuma lista disponível.</div>'}</div>`;

    panel.querySelectorAll('[data-retry-playlist]').forEach(button => button.addEventListener('click', () => retryPlaylist(button.dataset.retryPlaylist).catch(error => panelMessage(error.message, 'err'))));
    panel.querySelectorAll('[data-revoke-session]').forEach(button => button.addEventListener('click', async () => {
      try { await invoke('playlist-validation', { action: 'revoke', sessionId: button.dataset.revokeSession }); panelMessage('Sessão de diagnóstico encerrada.', 'ok'); await refreshPlaylists(true); }
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
        panelMessage('Diagnóstico iniciado. Abra ou atualize o aplicativo no aparelho escolhido.', 'ok');
        await refreshPlaylists(true);
      } catch (error) { panelMessage(error.message, 'err'); }
    });
  }

  function initialize() {
    if (!isAdminPage()) return;
    refreshPlaylists().catch(() => {});
    window.addEventListener('roneca:playlist-fingerprint-backfill-complete', () => refreshPlaylists(true).catch(() => {}));
  }

  window.RonecaPlaylistQualification = Object.freeze({ refresh: refreshPlaylists });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true }); else initialize();
})();
