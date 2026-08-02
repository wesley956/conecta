(() => {
  'use strict';

  if (window.__ronecaPlaylistDiagnosticsLoaded) return;
  window.__ronecaPlaylistDiagnosticsLoaded = true;

  const labels = {
    head: '5 · HEAD do endpoint',
    redirects: '6 · Redirecionamentos',
    auth: '7 · Autenticação',
    account: '8 · Conta',
    category: '9 · Categoria pequena',
    content: '10 · Amostra de conteúdo',
    playback: '11 · Reprodução',
    comparison: '12 · Servidor × aparelho',
    classification: '13 · Classificação',
    strategy: '14 · Estratégia',
  };
  const state = { timer: 0, activeId: null };

  function esc(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function config() {
    const panel = window.RONECA_PANEL_CONFIG || {};
    const auth = window.RonecaPanelAuth;
    if (!auth?.getAccessToken) throw new Error('Sessão segura do painel não encontrada.');
    const endpoint = auth.getFunctionUrl?.('playlist-diagnostics')
      || `${String(panel.supabaseUrl || '').replace(/\/$/, '')}/functions/v1/playlist-diagnostics`;
    if (!endpoint.startsWith('https://')) throw new Error('Endpoint de diagnóstico não configurado.');
    return { auth, endpoint, anonKey: panel.anonKey || '' };
  }

  async function api(action, payload = {}) {
    const current = config();
    async function request() {
      const accessToken = await current.auth.getAccessToken();
      return fetch(current.endpoint, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(current.anonKey ? { apikey: current.anonKey } : {}),
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action, ...payload }),
      });
    }

    let response = await request();
    if (response.status === 401 && current.auth.refreshSession) {
      await current.auth.refreshSession();
      response = await request();
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || body.message || 'Falha ao executar diagnóstico.');
    return body;
  }

  function installStyles() {
    if (document.getElementById('playlistDiagnosticsStyles')) return;
    const style = document.createElement('style');
    style.id = 'playlistDiagnosticsStyles';
    style.textContent = `
      .pld-overlay{position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.78);display:grid;place-items:center;padding:18px}
      .pld-overlay[hidden]{display:none}.pld-dialog{width:min(780px,100%);max-height:88vh;overflow:auto;background:#151515;border:1px solid #393939;border-radius:18px;padding:20px;box-shadow:0 24px 80px rgba(0,0,0,.55);color:#f7f7f7}
      .pld-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.pld-head h2{margin:0 0 5px}.pld-head p{margin:0;color:#b9b9b9}.pld-close{min-width:44px;min-height:44px}
      .pld-summary{margin:16px 0;padding:14px;border-radius:12px;background:#202020;border:1px solid #343434}.pld-summary strong{display:block;margin-bottom:5px}.pld-meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
      .pld-pill{display:inline-flex;align-items:center;min-height:28px;padding:4px 9px;border-radius:999px;background:#2a2a2a;font-size:12px}.pld-pill.ok{background:#153d26;color:#b8ffd0}.pld-pill.warn{background:#4a3511;color:#ffe4a3}.pld-pill.bad{background:#4a1717;color:#ffc0c0}
      .pld-steps{display:grid;gap:9px}.pld-step{display:grid;grid-template-columns:34px 1fr auto;gap:10px;align-items:start;padding:12px;border-radius:12px;background:#1e1e1e;border:1px solid #303030}.pld-step-number{width:30px;height:30px;display:grid;place-items:center;border-radius:50%;background:#2b2b2b;font-weight:700}.pld-step strong{display:block}.pld-step small{display:block;color:#aaa;margin-top:4px;line-height:1.4}.pld-origin{font-size:11px;color:#aaa;text-transform:uppercase}.pld-loading{padding:18px;text-align:center;color:#bbb}.pld-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
      .pld-diagnose-button{white-space:nowrap}
      @media(max-width:620px){.pld-overlay{padding:8px}.pld-dialog{padding:15px;border-radius:14px}.pld-step{grid-template-columns:30px 1fr}.pld-origin{grid-column:2}}
    `;
    document.head.appendChild(style);
  }

  function modal() {
    installStyles();
    let overlay = document.getElementById('playlistDiagnosticsOverlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'playlistDiagnosticsOverlay';
    overlay.className = 'pld-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <section class="pld-dialog" role="dialog" aria-modal="true" aria-labelledby="playlistDiagnosticsTitle">
        <div class="pld-head">
          <div><h2 id="playlistDiagnosticsTitle">Diagnóstico da lista</h2><p id="playlistDiagnosticsSubtitle">Teste técnico sem ativar aparelho nem consumir crédito.</p></div>
          <button type="button" class="btn pld-close" aria-label="Fechar">✕</button>
        </div>
        <div id="playlistDiagnosticsContent" class="pld-loading">Preparando diagnóstico...</div>
        <div class="pld-actions"><button type="button" class="btn pld-repeat" hidden>Repetir diagnóstico</button></div>
      </section>`;
    overlay.querySelector('.pld-close').addEventListener('click', close);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.querySelector('.pld-repeat').addEventListener('click', () => {
      const playlistId = overlay.dataset.playlistId;
      const playlistName = overlay.dataset.playlistName;
      if (playlistId) start(playlistId, playlistName || 'Lista');
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function open(playlistId, playlistName) {
    const overlay = modal();
    overlay.dataset.playlistId = playlistId;
    overlay.dataset.playlistName = playlistName || 'Lista';
    overlay.hidden = false;
    overlay.querySelector('#playlistDiagnosticsTitle').textContent = `Diagnóstico · ${playlistName || 'Lista'}`;
    overlay.querySelector('.pld-close').focus();
    return overlay;
  }

  function close() {
    clearTimeout(state.timer);
    state.timer = 0;
    state.activeId = null;
    const overlay = document.getElementById('playlistDiagnosticsOverlay');
    if (overlay) overlay.hidden = true;
  }

  function statusTone(status) {
    if (status === 'completed') return 'ok';
    if (status === 'waiting_device' || status === 'running') return 'warn';
    return 'bad';
  }

  function stepTone(status) {
    if (status === 'ok' || status === 'skipped') return 'ok';
    if (status === 'waiting' || status === 'timeout') return 'warn';
    return 'bad';
  }

  function render(diagnostic) {
    const overlay = modal();
    const content = overlay.querySelector('#playlistDiagnosticsContent');
    const steps = [...(diagnostic.serverSteps || []), ...(diagnostic.deviceSteps || [])]
      .sort((left, right) => Number(left.step || 0) - Number(right.step || 0) || String(left.origin).localeCompare(String(right.origin)));
    const statusLabel = diagnostic.status === 'waiting_device'
      ? 'Aguardando Android oficial'
      : diagnostic.status === 'completed'
        ? 'Concluído'
        : diagnostic.status === 'running'
          ? 'Em execução'
          : diagnostic.status === 'expired'
            ? 'Expirado'
            : 'Falhou';

    content.className = '';
    content.innerHTML = `
      <div class="pld-summary">
        <strong>${esc(diagnostic.summary || 'Diagnóstico sem resumo.')}</strong>
        <div class="pld-meta">
          <span class="pld-pill ${statusTone(diagnostic.status)}">${esc(statusLabel)}</span>
          ${diagnostic.classification ? `<span class="pld-pill">${esc(diagnostic.classification)}</span>` : ''}
          ${diagnostic.strategy ? `<span class="pld-pill">Estratégia: ${esc(diagnostic.strategy)}</span>` : ''}
        </div>
      </div>
      <div class="pld-steps">
        ${steps.length ? steps.map(item => `
          <article class="pld-step">
            <span class="pld-step-number">${Number(item.step || 0)}</span>
            <div>
              <strong>${esc(labels[item.key] || item.key || `Etapa ${item.step}`)}</strong>
              <small>${esc(item.detail || item.code || 'Sem detalhe adicional.')}${item.httpStatus ? ` · HTTP ${Number(item.httpStatus)}` : ''}${item.latencyMs != null ? ` · ${Number(item.latencyMs)} ms` : ''}</small>
              <span class="pld-pill ${stepTone(item.status)}">${esc(item.status || '—')}</span>
            </div>
            <span class="pld-origin">${esc(item.origin === 'device' ? 'Android' : item.origin === 'server' ? 'Servidor' : 'Sistema')}</span>
          </article>`).join('') : '<div class="pld-loading">O servidor ainda está executando as primeiras etapas.</div>'}
      </div>`;
    overlay.querySelector('.pld-repeat').hidden = diagnostic.status === 'running' || diagnostic.status === 'waiting_device';
  }

  function renderError(message) {
    const overlay = modal();
    const content = overlay.querySelector('#playlistDiagnosticsContent');
    content.className = '';
    content.innerHTML = `<div class="pld-summary"><strong>Não foi possível concluir</strong><p>${esc(message)}</p></div>`;
    overlay.querySelector('.pld-repeat').hidden = false;
  }

  async function poll(id) {
    if (!id || state.activeId !== id) return;
    try {
      const result = await api('get', { diagnosticId: id });
      const diagnostic = result.diagnostic;
      render(diagnostic);
      if (diagnostic?.status === 'waiting_device' || diagnostic?.status === 'running') {
        state.timer = window.setTimeout(() => poll(id), 3_000);
      }
    } catch (error) {
      renderError(error.message || 'Falha ao atualizar diagnóstico.');
    }
  }

  async function start(playlistId, playlistName) {
    clearTimeout(state.timer);
    const overlay = open(playlistId, playlistName);
    const content = overlay.querySelector('#playlistDiagnosticsContent');
    content.className = 'pld-loading';
    content.textContent = 'Executando etapas 5 a 11 pelo servidor...';
    overlay.querySelector('.pld-repeat').hidden = true;
    try {
      const result = await api('start', { playlistId });
      const diagnostic = result.diagnostic;
      state.activeId = diagnostic.id;
      render(diagnostic);
      if (diagnostic.status === 'waiting_device' || diagnostic.status === 'running') {
        state.timer = window.setTimeout(() => poll(diagnostic.id), 3_000);
      }
    } catch (error) {
      renderError(error.message || 'Falha ao iniciar diagnóstico.');
    }
  }

  function button(playlistId, playlistName) {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'btn pld-diagnose-button';
    element.textContent = 'Diagnosticar';
    element.dataset.playlistDiagnosticId = playlistId;
    element.addEventListener('click', () => start(playlistId, playlistName));
    return element;
  }

  function installAdminButtons() {
    document.querySelectorAll('#playlistsBody tr').forEach(row => {
      if (row.querySelector('[data-playlist-diagnostic-id]')) return;
      const input = row.querySelector('input[id^="pl-name-"]');
      const actions = row.querySelector('.actions');
      if (!input || !actions) return;
      const playlistId = input.id.slice('pl-name-'.length);
      if (!playlistId) return;
      actions.insertBefore(button(playlistId, input.value || 'Lista'), actions.firstChild);
    });
  }

  function installSellerButtons() {
    document.querySelectorAll('.seller-playlist-item').forEach(item => {
      if (item.querySelector('[data-playlist-diagnostic-id]')) return;
      const refresh = item.querySelector('[onclick*="sellerListsRefreshCache"]');
      const actions = refresh?.closest('.actions');
      const match = refresh?.getAttribute('onclick')?.match(/sellerListsRefreshCache\(['"]([^'"]+)['"]\)/);
      const playlistId = match?.[1];
      if (!playlistId || !actions) return;
      const playlistName = item.querySelector('strong')?.textContent?.trim() || 'Lista';
      actions.insertBefore(button(playlistId, playlistName), actions.firstChild);
    });
  }

  function installButtons() {
    installAdminButtons();
    installSellerButtons();
  }

  installStyles();
  installButtons();
  const observer = new MutationObserver(() => requestAnimationFrame(installButtons));
  observer.observe(document.body, { childList: true, subtree: true });
  window.playlistDiagnosticsStart = start;
})();
