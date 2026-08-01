(() => {
  'use strict';

  const onAdmin = /\/dashboard\.html$/i.test(location.pathname);
  const onSeller = /\/seller\.html$/i.test(location.pathname);
  if (!onAdmin && !onSeller) return;

  const state = {
    adminPage: 1,
    sellerPage: 1,
    adminLoading: false,
    sellerLoading: false,
    adminData: null,
    sellerData: null,
  };

  const sourceLabels = {
    content: 'Conteúdo',
    network: 'Conexão',
    playlist: 'Lista',
    app: 'Aplicativo',
    device: 'Aparelho',
    unknown: 'Não identificado',
  };
  const severityLabels = { low: 'Baixa', medium: 'Média', high: 'Alta', critical: 'Crítica' };
  const statusLabels = { open: 'Aberto', investigating: 'Investigando', resolved: 'Resolvido', ignored: 'Ignorado' };

  function byId(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function fmtDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR');
  }

  function fmtPosition(value) {
    const totalSeconds = Math.max(0, Math.floor(Number(value || 0) / 1000));
    if (!totalSeconds) return '—';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return hours > 0
      ? `${hours}h ${String(minutes).padStart(2, '0')}min`
      : `${minutes}min ${String(seconds).padStart(2, '0')}s`;
  }

  function badge(value, kind = value) {
    return `<span class="pd-badge ${esc(kind || '')}">${esc(value || '—')}</span>`;
  }

  async function diagnosticApi(action, payload = {}) {
    const config = window.RONECA_PANEL_CONFIG || {};
    if (!config.supabaseUrl || !config.anonKey || !window.RonecaPanelAuth) {
      throw new Error('Configuração do painel não encontrada.');
    }

    async function request() {
      const accessToken = await window.RonecaPanelAuth.getAccessToken();
      return fetch(`${String(config.supabaseUrl).replace(/\/$/, '')}/functions/v1/playback-diagnostics-panel`, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          apikey: config.anonKey,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action, ...payload }),
      });
    }

    let response = await request();
    if (response.status === 401) {
      await window.RonecaPanelAuth.refreshSession();
      response = await request();
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || 'Falha ao consultar diagnósticos.');
    return data;
  }

  function stat(label, value, tone = '') {
    return `<div class="pd-stat ${tone}"><small>${esc(label)}</small><strong>${Number(value || 0).toLocaleString('pt-BR')}</strong></div>`;
  }

  function paginationHtml(prefix, pagination) {
    const page = Number(pagination?.page || 1);
    const pages = Number(pagination?.pages || 1);
    return `
      <div class="pd-pages">
        <button class="btn" type="button" ${page <= 1 ? 'disabled' : ''} onclick="${prefix}(${page - 1})">Anterior</button>
        <span class="pd-count">Página ${page} de ${pages}</span>
        <button class="btn" type="button" ${page >= pages ? 'disabled' : ''} onclick="${prefix}(${page + 1})">Próxima</button>
      </div>`;
  }

  function rankingsHtml(data) {
    function box(title, items) {
      return `<div class="pd-ranking"><h3>${esc(title)}</h3>${(items || []).length
        ? items.map(item => `<div class="pd-ranking-item"><span>${esc(item.label)}</span><strong>${Number(item.count || 0)}</strong></div>`).join('')
        : '<div class="pd-sub">Sem repetições no período.</div>'}</div>`;
    }
    return box('Conteúdos recorrentes', data.topContents) +
      box('Aparelhos afetados', data.topDevices) +
      box('Listas afetadas', data.topPlaylists);
  }

  function adminFilterPayload(page) {
    return {
      page,
      pageSize: 25,
      search: byId('pdAdminSearch')?.value || '',
      severity: byId('pdAdminSeverity')?.value || '',
      probableSource: byId('pdAdminSource')?.value || '',
      status: byId('pdAdminStatus')?.value || '',
      platform: byId('pdAdminPlatform')?.value || '',
      sellerId: byId('pdAdminSeller')?.value || '',
      playlistId: byId('pdAdminPlaylist')?.value || '',
      dateFrom: byId('pdAdminDateFrom')?.value || '',
      dateTo: byId('pdAdminDateTo')?.value || '',
    };
  }

  function installAdmin() {
    const nav = document.querySelector('.tabs');
    const auditButton = nav?.querySelector('[data-tab="audit"]');
    if (!nav || !auditButton) return false;

    if (!nav.querySelector('[data-tab="diagnostics"]')) {
      const button = document.createElement('button');
      button.className = 'tab';
      button.type = 'button';
      button.dataset.tab = 'diagnostics';
      button.title = 'Diagnóstico';
      button.setAttribute('aria-label', 'Diagnóstico');
      button.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3v3M12 18v3M4.2 5.2l2.1 2.1M17.7 16.7l2.1 2.1M3 12h3M18 12h3M4.2 18.8l2.1-2.1M17.7 7.3l2.1-2.1"/><circle cx="12" cy="12" r="4"/></svg><span>Diagnóstico</span>';
      button.addEventListener('click', () => window.playbackDiagnosticsOpenAdmin());
      auditButton.insertAdjacentElement('beforebegin', button);
    }

    if (!byId('section-diagnostics')) {
      const section = document.createElement('section');
      section.id = 'section-diagnostics';
      section.className = 'section';
      section.innerHTML = `
        <div class="card pd-shell">
          <div class="pd-head">
            <div><h2>Diagnóstico de reprodução</h2><p>Falhas de conteúdo, lista, conexão, aplicativo e aparelho em um único lugar.</p></div>
            <button class="btn primary" type="button" onclick="playbackDiagnosticsLoadAdmin(1)">Atualizar diagnóstico</button>
          </div>
          <div id="pdAdminStats" class="pd-stats"></div>
          <div class="pd-filters">
            <div><label for="pdAdminSearch">Buscar</label><input id="pdAdminSearch" placeholder="Aparelho, conteúdo, erro ou ID de correlação" /></div>
            <div><label for="pdAdminSeverity">Gravidade</label><select id="pdAdminSeverity"><option value="">Todas</option><option value="critical">Crítica</option><option value="high">Alta</option><option value="medium">Média</option><option value="low">Baixa</option></select></div>
            <div><label for="pdAdminSource">Origem provável</label><select id="pdAdminSource"><option value="">Todas</option><option value="content">Conteúdo</option><option value="network">Conexão</option><option value="playlist">Lista</option><option value="app">Aplicativo</option><option value="device">Aparelho</option><option value="unknown">Não identificada</option></select></div>
            <div><label for="pdAdminStatus">Situação</label><select id="pdAdminStatus"><option value="">Todas</option><option value="open">Aberto</option><option value="investigating">Investigando</option><option value="resolved">Resolvido</option><option value="ignored">Ignorado</option></select></div>
            <div><label for="pdAdminPlatform">Plataforma</label><select id="pdAdminPlatform"><option value="">Todas</option><option value="androidtv">Android TV</option><option value="android">Android</option><option value="webos">LG webOS</option><option value="tizen">Samsung Tizen</option></select></div>
            <div><label for="pdAdminSeller">Vendedor</label><select id="pdAdminSeller"><option value="">Todos</option></select></div>
            <div><label for="pdAdminPlaylist">Lista</label><select id="pdAdminPlaylist"><option value="">Todas</option></select></div>
            <div class="pd-date-row"><div><label for="pdAdminDateFrom">De</label><input id="pdAdminDateFrom" type="date" /></div><div><label for="pdAdminDateTo">Até</label><input id="pdAdminDateTo" type="date" /></div></div>
            <div class="actions"><button class="btn primary" type="button" onclick="playbackDiagnosticsLoadAdmin(1)">Filtrar</button><button class="btn" type="button" onclick="playbackDiagnosticsClearAdminFilters()">Limpar</button></div>
          </div>
          <div class="pd-toolbar"><div id="pdAdminCount" class="pd-count"></div></div>
          <div id="pdAdminList" class="pd-list"><div class="pd-loading">Carregue os diagnósticos.</div></div>
          <div id="pdAdminPages"></div>
          <div id="pdAdminRankings" class="pd-ranking-grid"></div>
        </div>`;
      const auditSection = byId('section-audit');
      auditSection?.parentNode?.insertBefore(section, auditSection);
    }
    return true;
  }

  function populateAdminOptions(data) {
    const sellerSelect = byId('pdAdminSeller');
    const playlistSelect = byId('pdAdminPlaylist');
    if (sellerSelect) {
      const selected = sellerSelect.value;
      sellerSelect.innerHTML = '<option value="">Todos</option>' + (data.filters?.sellers || [])
        .map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('');
      sellerSelect.value = selected;
    }
    if (playlistSelect) {
      const selected = playlistSelect.value;
      playlistSelect.innerHTML = '<option value="">Todas</option>' + (data.filters?.playlists || [])
        .map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('');
      playlistSelect.value = selected;
    }
  }

  function renderAdmin(data) {
    state.adminData = data;
    const summary = data.summary || {};
    byId('pdAdminStats').innerHTML =
      stat('Falhas em 24 horas', summary.last24Hours, summary.last24Hours ? 'danger' : 'ok') +
      stat('Aparelhos afetados', summary.affectedDevices, summary.affectedDevices ? 'warn' : 'ok') +
      stat('Conteúdos identificados', summary.affectedContents) +
      stat('Listas afetadas', summary.affectedPlaylists) +
      stat('Recuperadas', summary.recovered, 'ok') +
      stat('Fecharam o player', summary.playerExited, summary.playerExited ? 'danger' : 'ok');

    populateAdminOptions(data);
    byId('pdAdminCount').textContent = `${Number(data.pagination?.total || 0).toLocaleString('pt-BR')} ocorrência(s) encontrada(s).`;
    byId('pdAdminList').innerHTML = (data.records || []).length
      ? data.records.map(record => `
        <article class="pd-row">
          <div class="pd-main">
            <strong>${esc(record.contentLabel || 'Conteúdo não identificado')}</strong>
            <div class="pd-sub">${esc(record.deviceCode)} · ${esc(record.clientName || 'Sem cliente')}</div>
            <div class="pd-badges">
              ${badge(severityLabels[record.severity] || record.severity, record.severity)}
              ${badge(statusLabels[record.status] || record.status, record.status)}
              ${record.recovered ? badge('Recuperado', 'recovered') : ''}
              ${record.playerExited ? badge('Player fechado', 'high') : ''}
            </div>
          </div>
          <div class="pd-meta"><strong>${esc(record.probableSourceLabel || sourceLabels[record.probableSource] || 'Falha')}</strong><small>${esc(record.playlistName || 'Lista não identificada')} · ${esc(record.sellerName || 'Sem vendedor')}</small></div>
          <div class="pd-meta"><strong>${fmtDate(record.occurredAt)}</strong><small>${esc(record.platform || 'plataforma não informada')} · v${esc(record.appVersion || '—')}</small></div>
          <div class="pd-actions"><button class="btn" type="button" onclick="playbackDiagnosticsOpenAdminDetail('${esc(record.id)}')">Abrir</button><button class="btn orange" type="button" onclick="playbackDiagnosticsChangeStatus('${esc(record.id)}')">Situação</button></div>
        </article>`).join('')
      : '<div class="pd-empty">Nenhuma ocorrência encontrada com esses filtros.</div>';
    byId('pdAdminPages').innerHTML = paginationHtml('playbackDiagnosticsLoadAdmin', data.pagination);
    byId('pdAdminRankings').innerHTML = rankingsHtml(data);
  }

  function adminRecord(id) {
    return state.adminData?.records?.find(record => record.id === id) || null;
  }

  window.playbackDiagnosticsOpenAdmin = function playbackDiagnosticsOpenAdmin() {
    if (!installAdmin()) return;
    document.querySelectorAll('.tab').forEach(button => {
      const active = button.dataset.tab === 'diagnostics';
      button.classList.toggle('active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });
    document.querySelectorAll('.section').forEach(section => section.classList.remove('active'));
    byId('section-diagnostics')?.classList.add('active');
    if (byId('adminPageEyebrow')) byId('adminPageEyebrow').textContent = 'Qualidade · operação';
    if (byId('adminPageTitle')) byId('adminPageTitle').textContent = 'Diagnóstico';
    if (byId('adminPageDescription')) byId('adminPageDescription').textContent = 'Entenda falhas de reprodução sem expor URLs ou credenciais das listas.';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (!state.adminData) window.playbackDiagnosticsLoadAdmin(1);
  };

  window.playbackDiagnosticsLoadAdmin = async function playbackDiagnosticsLoadAdmin(page = 1) {
    if (state.adminLoading) return;
    state.adminLoading = true;
    state.adminPage = Math.max(1, Number(page || 1));
    const list = byId('pdAdminList');
    if (list) list.innerHTML = '<div class="pd-loading">Consultando falhas de reprodução...</div>';
    try {
      const data = await diagnosticApi('list', adminFilterPayload(state.adminPage));
      renderAdmin(data);
    } catch (error) {
      if (list) list.innerHTML = `<div class="pd-error">${esc(error.message || 'Falha ao carregar diagnóstico.')}</div>`;
    } finally {
      state.adminLoading = false;
    }
  };

  window.playbackDiagnosticsClearAdminFilters = function playbackDiagnosticsClearAdminFilters() {
    ['pdAdminSearch', 'pdAdminSeverity', 'pdAdminSource', 'pdAdminStatus', 'pdAdminPlatform', 'pdAdminSeller', 'pdAdminPlaylist', 'pdAdminDateFrom', 'pdAdminDateTo']
      .forEach(id => { const element = byId(id); if (element) element.value = ''; });
    window.playbackDiagnosticsLoadAdmin(1);
  };

  window.playbackDiagnosticsOpenAdminDetail = function playbackDiagnosticsOpenAdminDetail(id) {
    const record = adminRecord(id);
    if (!record) return;
    const html = `
      <div class="pd-detail-grid">
        <div class="pd-detail-box"><small>Aparelho</small><strong>${esc(record.deviceCode)}</strong></div>
        <div class="pd-detail-box"><small>Cliente</small><strong>${esc(record.clientName || 'Sem cliente')}</strong></div>
        <div class="pd-detail-box"><small>Vendedor</small><strong>${esc(record.sellerName || 'Sem vendedor')}</strong></div>
        <div class="pd-detail-box"><small>Lista</small><strong>${esc(record.playlistName || 'Não identificada')}</strong></div>
        <div class="pd-detail-box"><small>Plataforma</small><strong>${esc(record.platform || '—')} · v${esc(record.appVersion || '—')}</strong></div>
        <div class="pd-detail-box"><small>Data</small><strong>${fmtDate(record.occurredAt)}</strong></div>
        <div class="pd-detail-box"><small>Conteúdo</small><strong>${esc(record.contentLabel || 'Não identificado')}</strong></div>
        <div class="pd-detail-box"><small>Posição</small><strong>${fmtPosition(record.positionMs)} / ${fmtPosition(record.durationMs)}</strong></div>
        <div class="pd-detail-box"><small>Gravidade</small><strong>${esc(severityLabels[record.severity] || record.severity)}</strong></div>
        <div class="pd-detail-box"><small>Origem provável</small><strong>${esc(record.probableSourceLabel || 'Não identificada')}</strong></div>
        <div class="pd-detail-box"><small>Tentativas</small><strong>${Number(record.retryCount || 0)}</strong></div>
        <div class="pd-detail-box"><small>Lista reserva</small><strong>${record.backupAvailable ? 'Disponível' : 'Não configurada'}</strong></div>
        <div class="pd-detail-box wide"><small>ID de correlação</small><strong>${esc(record.correlationId || 'Não informado')}</strong></div>
        <div class="pd-detail-box wide"><small>Tentativa de failover</small><strong>${esc(record.failoverAttemptId || 'Não informada')}</strong></div>
        <div class="pd-detail-box wide"><small>Tentativa de cache</small><strong>${esc(record.cacheAttemptId || 'Não informada')}</strong></div>
        <div class="pd-detail-box wide"><small>Erro registrado</small><strong>${esc(record.errorCode || 'PLAYBACK_ERROR')} · ${esc(record.errorMessage || 'Sem mensagem')}</strong></div>
        <div class="pd-detail-box wide"><small>Resposta do aplicativo</small><strong>${esc(record.recoveryAction || 'Nenhuma ação informada')}</strong></div>
        <div class="pd-detail-box wide"><small>Observação administrativa</small><strong>${esc(record.adminNotes || 'Sem observação')}</strong></div>
      </div>`;
    if (typeof window.openDetails === 'function') {
      window.openDetails('Diagnóstico de reprodução', `${esc(record.contentLabel)} · ${esc(record.deviceCode)}`, html);
    } else {
      alert(`${record.deviceCode}\n${record.errorMessage || 'Falha de reprodução'}`);
    }
  };

  window.playbackDiagnosticsChangeStatus = async function playbackDiagnosticsChangeStatus(id) {
    const record = adminRecord(id);
    if (!record) return;
    const selected = prompt('Nova situação: open, investigating, resolved ou ignored', record.status || 'open');
    if (selected === null) return;
    const status = String(selected).trim().toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(statusLabels, status)) {
      alert('Situação inválida.');
      return;
    }
    const notes = prompt('Observação administrativa (opcional):', record.adminNotes || '');
    try {
      await diagnosticApi('updateStatus', { id, status, notes: notes || '' });
      await window.playbackDiagnosticsLoadAdmin(state.adminPage);
    } catch (error) {
      alert(error.message || 'Falha ao atualizar diagnóstico.');
    }
  };

  function sellerFilterPayload(page) {
    return {
      page,
      pageSize: 20,
      search: byId('pdSellerSearch')?.value || '',
      status: byId('pdSellerStatus')?.value || '',
    };
  }

  function installSeller() {
    const nav = document.querySelector('.seller-v2-nav');
    const appButton = nav?.querySelector('[data-seller-nav="app"]');
    const dashboard = byId('dashboardView');
    if (!nav || !appButton || !dashboard) return false;

    if (!nav.querySelector('[data-seller-nav="diagnostics"]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.sellerNav = 'diagnostics';
      button.textContent = 'Diagnóstico';
      button.addEventListener('click', () => {
        window.sellerPortalNavigate?.('diagnostics');
        window.playbackDiagnosticsLoadSeller(1);
      });
      nav.insertBefore(button, appButton);
    }

    if (!byId('sellerDiagnosticsCard')) {
      const section = document.createElement('div');
      section.id = 'sellerDiagnosticsCard';
      section.className = 'card seller-portal-section pd-shell pd-seller-section';
      section.dataset.sellerSection = 'diagnostics';
      section.hidden = true;
      section.innerHTML = `
        <div class="pd-head"><div><h2>Diagnóstico</h2><p>Problemas recentes dos seus clientes, em linguagem simples.</p></div><button type="button" onclick="playbackDiagnosticsLoadSeller(1)">Atualizar</button></div>
        <div id="pdSellerStats" class="pd-stats"></div>
        <div class="pd-filters"><div><label for="pdSellerSearch">Buscar</label><input id="pdSellerSearch" placeholder="Cliente, aparelho ou conteúdo" /></div><div><label for="pdSellerStatus">Situação</label><select id="pdSellerStatus"><option value="">Todas</option><option value="open">Precisa verificar</option><option value="investigating">Em análise</option><option value="resolved">Resolvido</option></select></div><div class="actions"><button class="primary" type="button" onclick="playbackDiagnosticsLoadSeller(1)">Filtrar</button></div></div>
        <div id="pdSellerCount" class="pd-count"></div>
        <div id="pdSellerList" class="pd-list"><div class="pd-loading">Abra a aba para carregar os diagnósticos.</div></div>
        <div id="pdSellerPages"></div>`;
      const appSection = dashboard.querySelector('[data-seller-section="app"]');
      dashboard.insertBefore(section, appSection || null);
    }
    return true;
  }

  function renderSeller(data) {
    state.sellerData = data;
    const summary = data.summary || {};
    byId('pdSellerStats').innerHTML =
      stat('Problemas em 24 horas', summary.last24Hours, summary.last24Hours ? 'danger' : 'ok') +
      stat('Aparelhos afetados', summary.affectedDevices, summary.affectedDevices ? 'warn' : 'ok') +
      stat('Recuperados', summary.recovered, 'ok') +
      stat('Sem lista reserva', summary.withoutBackup, summary.withoutBackup ? 'warn' : 'ok') +
      stat('Precisam verificar', summary.open, summary.open ? 'danger' : 'ok');
    byId('pdSellerCount').textContent = `${Number(data.pagination?.total || 0).toLocaleString('pt-BR')} ocorrência(s).`;
    byId('pdSellerList').innerHTML = (data.records || []).length
      ? data.records.map(record => `
        <article class="pd-seller-card">
          <div><strong>${esc(record.clientName || 'Cliente não identificado')}</strong><div class="pd-sub">${esc(record.deviceCode)} · ${esc(record.contentLabel || 'Conteúdo não identificado')}</div><div class="pd-badges">${badge(record.category || 'Falha de carregamento', record.recovered ? 'recovered' : 'medium')}${record.recovered ? badge('Resolvido automaticamente', 'recovered') : badge(statusLabels[record.status] || 'Verificar', record.status)}</div></div>
          <div><strong>${esc(record.message || 'Falha de reprodução.')}</strong><p>${fmtDate(record.occurredAt)}${record.backupAvailable ? ' · possui lista reserva' : ' · sem lista reserva'}</p></div>
          <div class="pd-actions"><button type="button" onclick="playbackDiagnosticsCopySeller('${esc(record.id)}')">Copiar resumo</button>${record.acknowledgedAt ? badge('Visto', 'resolved') : `<button type="button" onclick="playbackDiagnosticsAcknowledge('${esc(record.id)}')">Marcar como visto</button>`}</div>
        </article>`).join('')
      : '<div class="pd-empty">Nenhum problema encontrado. Ótima notícia.</div>';
    byId('pdSellerPages').innerHTML = paginationHtml('playbackDiagnosticsLoadSeller', data.pagination).replaceAll('class="btn"', '');
  }

  function sellerRecord(id) {
    return state.sellerData?.records?.find(record => record.id === id) || null;
  }

  window.playbackDiagnosticsLoadSeller = async function playbackDiagnosticsLoadSeller(page = 1) {
    if (!installSeller() || state.sellerLoading || !window.RonecaPanelAuth?.hasSession()) return;
    state.sellerLoading = true;
    state.sellerPage = Math.max(1, Number(page || 1));
    const list = byId('pdSellerList');
    if (list) list.innerHTML = '<div class="pd-loading">Consultando problemas recentes...</div>';
    try {
      const data = await diagnosticApi('list', sellerFilterPayload(state.sellerPage));
      renderSeller(data);
    } catch (error) {
      if (list) list.innerHTML = `<div class="pd-error">${esc(error.message || 'Falha ao carregar diagnóstico.')}</div>`;
    } finally {
      state.sellerLoading = false;
    }
  };

  window.playbackDiagnosticsAcknowledge = async function playbackDiagnosticsAcknowledge(id) {
    try {
      await diagnosticApi('acknowledge', { id });
      await window.playbackDiagnosticsLoadSeller(state.sellerPage);
    } catch (error) {
      alert(error.message || 'Falha ao confirmar diagnóstico.');
    }
  };

  window.playbackDiagnosticsCopySeller = async function playbackDiagnosticsCopySeller(id) {
    const record = sellerRecord(id);
    if (!record) return;
    const summary = [
      `Cliente: ${record.clientName || 'Não identificado'}`,
      `Aparelho: ${record.deviceCode}`,
      `Conteúdo: ${record.contentLabel || 'Não identificado'}`,
      `Ocorrido: ${fmtDate(record.occurredAt)}`,
      `Situação: ${record.message || 'Falha de reprodução'}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(summary);
      alert('Resumo copiado para o atendimento.');
    } catch (_error) {
      prompt('Copie o resumo:', summary);
    }
  };

  function bootstrap() {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      const installed = onAdmin ? installAdmin() : installSeller();
      if (installed || attempts >= 40) clearInterval(timer);
    }, 200);
    if (onAdmin) installAdmin();
    if (onSeller) installSeller();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
