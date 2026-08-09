(function installUniversalPlaylistRegistration(global) {
  'use strict';

  var FUNCTION_NAME = 'playlist-source-manager';
  var state = {
    sources: [],
    draft: null,
    tests: null,
    editId: null,
    editEndpoints: [],
    step: 1,
    busy: false,
    surface: document.body.classList.contains('seller-v2') ? 'seller' : 'admin'
  };

  function el(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value == null ? '' : value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
  function fmt(value) {
    if (!value) return '—';
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }
  function number(value) { return Number(value || 0).toLocaleString('pt-BR'); }
  function checked(id, fallback) {
    var input = el(id);
    return input ? input.checked : Boolean(fallback);
  }
  function value(id) { return (el(id) && el(id).value || '').trim(); }
  function setValue(id, input) { if (el(id)) el(id).value = input == null ? '' : String(input); }
  function setChecked(id, input) { if (el(id)) el(id).checked = Boolean(input); }

  async function api(action, payload) {
    if (!global.RonecaPanelAuth) throw new Error('Sessão do painel não está disponível.');
    var response = await fetch(global.RonecaPanelAuth.getFunctionUrl(FUNCTION_NAME), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ action: action }, payload || {}))
    });
    var result = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(result.error || result.message || 'Falha no cadastro universal.');
    return result;
  }

  function status(message, type) {
    var target = el('uplStatus');
    if (!target) return;
    target.className = 'upl-status' + (type ? ' ' + type : '');
    target.textContent = message || '';
  }

  function setBusy(busy, message) {
    state.busy = Boolean(busy);
    document.querySelectorAll('[data-upl-action]').forEach(function (button) { button.disabled = state.busy; });
    if (message) status(message + (busy ? '…' : ''), busy ? 'upl-loading' : '');
  }

  function ensureModal() {
    if (el('uplModal')) return;
    var modal = document.createElement('div');
    modal.id = 'uplModal';
    modal.className = 'upl-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="upl-modal-card" role="dialog" aria-modal="true" aria-labelledby="uplTitle" onclick="event.stopPropagation()">
        <div class="upl-modal-head">
          <div>
            <h2 id="uplTitle">Cadastro universal de fontes</h2>
            <p>Cole a mensagem do fornecedor ou configure a origem com todos os dados recebidos.</p>
          </div>
          <button class="upl-btn upl-modal-close" type="button" data-upl-action onclick="RonecaUniversalPlaylists.close()" aria-label="Fechar">×</button>
        </div>
        <div class="upl-step-nav" aria-label="Etapas do cadastro">
          <span class="upl-step active" data-upl-step-label="1">1. Origem</span>
          <span class="upl-step" data-upl-step-label="2">2. Segurança</span>
          <span class="upl-step" data-upl-step-label="3">3. Conferência e salvar</span>
        </div>

        <section class="upl-pane active" data-upl-pane="1">
          <h3>Como você recebeu essa fonte?</h3>
          <p>A detecção automática é a melhor opção para mensagens completas de painéis.</p>
          <div class="upl-mode-cards">
            <label class="upl-mode"><input type="radio" name="uplMode" value="provider_message" checked><strong>Mensagem completa</strong><span>Usuário, senha, DNS, M3U, HLS e demais links juntos.</span></label>
            <label class="upl-mode"><input type="radio" name="uplMode" value="m3u"><strong>M3U / M3U8 / HLS</strong><span>URL completa preservada exatamente.</span></label>
            <label class="upl-mode"><input type="radio" name="uplMode" value="xtream"><strong>Xtream</strong><span>Servidor, porta, usuário e senha separados.</span></label>
            <label class="upl-mode"><input type="radio" name="uplMode" value="advanced"><strong>Outras fontes</strong><span>Stalker, API, transmissão direta, lista manual ou arquivo.</span></label>
          </div>
          <div class="upl-grid">
            <div class="upl-field"><label>Nome da lista</label><input id="uplName" placeholder="Ex: Netplay · João" maxlength="180"></div>
            <div class="upl-field third"><label>Conexões</label><input id="uplMaxConnections" type="number" min="1" max="50" value="1"></div>
            <div class="upl-field third"><label>Fornecedor</label><input id="uplProviderName" placeholder="Detectado automaticamente"></div>
            <div class="upl-field third"><label>Plano</label><input id="uplPlanName" placeholder="Opcional"></div>
          </div>

          <div id="uplModeProvider" class="upl-mode-panel">
            <div class="upl-field wide"><label>Mensagem recebida do fornecedor</label><textarea id="uplProviderMessage" class="upl-provider-message" placeholder="Cole aqui a mensagem inteira, incluindo usuário, senha, DNS, M3U, HLS e demais informações."></textarea><p class="upl-help">O texto bruto não será armazenado. O sistema salva somente os dados extraídos e um resumo sem credenciais.</p></div>
          </div>

          <div id="uplModeM3u" class="upl-mode-panel upl-hidden">
            <div class="upl-grid">
              <div class="upl-field wide"><label>URL completa</label><input id="uplSingleUrl" placeholder="http://servidor:porta/get.php?username=...&password=..."></div>
              <div class="upl-field"><label>Formato informado</label><select id="uplSingleType"><option value="m3u">M3U / M3U Plus</option><option value="hls">M3U8 / HLS</option><option value="direct">Transmissão direta</option></select></div>
              <div class="upl-field"><label>Nome do endpoint</label><input id="uplSingleLabel" value="Origem principal"></div>
            </div>
          </div>

          <div id="uplModeXtream" class="upl-mode-panel upl-hidden">
            <div class="upl-grid">
              <div class="upl-field third"><label>Protocolo</label><select id="uplXtreamProtocol"><option value="http">HTTP</option><option value="https">HTTPS</option></select></div>
              <div class="upl-field"><label>Servidor</label><input id="uplXtreamHost" placeholder="servidor.com"></div>
              <div class="upl-field third"><label>Porta</label><input id="uplXtreamPort" type="number" min="1" max="65535" placeholder="Opcional"></div>
              <div class="upl-field"><label>Caminho base</label><input id="uplXtreamBasePath" placeholder="/ ou /painel"></div>
              <div class="upl-field"><label>Usuário</label><input id="uplXtreamUsername" autocomplete="off"></div>
              <div class="upl-field"><label>Senha</label><input id="uplXtreamPassword" type="password" autocomplete="new-password"></div>
              <div class="upl-field"><label>Saída</label><select id="uplXtreamOutput"><option value="mpegts">MPEGTS</option><option value="ts">TS</option><option value="hls">HLS</option><option value="m3u8">M3U8</option></select></div>
            </div>
          </div>

          <div id="uplModeAdvanced" class="upl-mode-panel upl-hidden">
            <div class="upl-grid">
              <div class="upl-field"><label>Tipo principal</label><select id="uplAdvancedType"><option value="stalker">Stalker / MAG</option><option value="api">API JSON / REST</option><option value="direct">Transmissão direta</option><option value="manual">Lista manual</option><option value="file">Arquivo M3U/M3U8/TXT</option><option value="m3u">M3U</option><option value="hls">HLS</option><option value="dash">DASH / MPD</option><option value="rtmp">RTMP</option><option value="rtsp">RTSP</option></select></div>
              <div class="upl-field"><label>Arquivo opcional</label><input id="uplFile" type="file" accept=".m3u,.m3u8,.txt,text/plain,audio/x-mpegurl,application/vnd.apple.mpegurl"></div>
              <div class="upl-field wide"><label>URLs, uma por linha</label><textarea id="uplAdvancedUrls" placeholder="https://portal.exemplo.com/stalker_portal/c/&#10;https://api.exemplo.com/catalog.json&#10;https://cdn.exemplo.com/live/index.m3u8"></textarea><p class="upl-help">Para APIs particulares, informe também método, cabeçalhos e corpo na próxima etapa.</p></div>
            </div>
          </div>

          <div class="upl-actions" style="margin-top:16px;justify-content:flex-end;">
            <button class="upl-btn primary" type="button" data-upl-action onclick="RonecaUniversalPlaylists.analyze()">Analisar origem</button>
          </div>
        </section>

        <section class="upl-pane" data-upl-pane="2">
          <h3>Segurança e compatibilidade</h3>
          <p>As exceções são individuais desta fonte e nunca alteram a segurança das outras listas.</p>
          <div class="upl-panel">
            <label class="upl-check"><input type="radio" name="uplTlsMode" value="strict" checked><span><strong>Validar certificado normalmente</strong><br><small>Recomendado e selecionado por padrão.</small></span></label>
            <label class="upl-check"><input type="radio" name="uplTlsMode" value="custom_ca"><span><strong>Confiar em certificado específico</strong><br><small>Adiciona a autoridade PEM informada somente nesta fonte.</small></span></label>
            <label class="upl-check"><input type="radio" name="uplTlsMode" value="insecure"><span><strong>Ignorar erros do certificado</strong><br><small>Modo de compatibilidade limitado aos domínios autorizados.</small></span></label>
          </div>
          <div id="uplCustomCaWrap" class="upl-field wide upl-hidden"><label>Certificado CA em formato PEM</label><textarea id="uplCustomCaPem" placeholder="-----BEGIN CERTIFICATE-----"></textarea></div>
          <div id="uplTlsRisk" class="upl-panel warn upl-hidden">
            <strong>Atenção: esta opção reduz a segurança da conexão.</strong>
            <p class="upl-help">Use apenas quando você conhece e confia no fornecedor. A escolha ficará registrada no histórico.</p>
            <label class="upl-check"><input id="uplRiskAccepted" type="checkbox"><span>Confirmo que desejo ignorar erros de certificado somente nesta fonte.</span></label>
          </div>
          <div class="upl-grid">
            <div class="upl-field wide"><label>Domínios autorizados, um por linha</label><textarea id="uplAllowedHosts" placeholder="servidor.com&#10;cdn.servidor.com"></textarea></div>
            <div class="upl-field"><label class="upl-check"><input id="uplAllowSubdomains" type="checkbox"><span>Permitir subdomínios desses hosts</span></label></div>
            <div class="upl-field"><label class="upl-check"><input id="uplAllowRedirectHosts" type="checkbox"><span>Permitir redirecionamentos somente para hosts autorizados</span></label></div>
          </div>
          <span class="upl-section-label">Aplicar a política em</span>
          <div class="upl-grid">
            <label class="upl-check upl-field third"><input id="uplScopeValidation" type="checkbox" checked><span>Teste e validação</span></label>
            <label class="upl-check upl-field third"><input id="uplScopeCache" type="checkbox" checked><span>Geração de cache</span></label>
            <label class="upl-check upl-field third"><input id="uplScopeCatalog" type="checkbox" checked><span>Download do catálogo</span></label>
            <label class="upl-check upl-field third"><input id="uplScopePlayback" type="checkbox" checked><span>Reprodução</span></label>
          </div>
          <details class="upl-panel">
            <summary><strong>Configuração avançada de conexão</strong></summary>
            <div class="upl-grid" style="margin-top:12px;">
              <div class="upl-field third"><label>Método</label><select id="uplMethod"><option value="GET">GET</option><option value="POST">POST</option></select></div>
              <div class="upl-field third"><label>Timeout (ms)</label><input id="uplTimeout" type="number" min="1000" max="180000" value="45000"></div>
              <div class="upl-field third"><label>Tentativas</label><input id="uplRetries" type="number" min="0" max="5" value="1"></div>
              <div class="upl-field wide"><label>Cabeçalhos — um por linha no formato Nome: valor</label><textarea id="uplHeaders" placeholder="User-Agent: VLC/3.0.20&#10;Referer: https://fornecedor.com/&#10;Origin: https://fornecedor.com"></textarea></div>
              <div class="upl-field wide"><label>Corpo JSON opcional</label><textarea id="uplRequestBody" placeholder='{"action":"catalog"}'></textarea></div>
              <label class="upl-check upl-field"><input id="uplFollowRedirects" type="checkbox" checked><span>Seguir redirecionamentos</span></label>
            </div>
          </details>
          <div class="upl-actions" style="margin-top:16px;">
            <button class="upl-btn" type="button" data-upl-action onclick="RonecaUniversalPlaylists.go(1)">Voltar</button>
            <button class="upl-btn primary" type="button" data-upl-action onclick="RonecaUniversalPlaylists.go(3)">Conferir dados</button>
          </div>
        </section>

        <section class="upl-pane" data-upl-pane="3">
          <h3>O que o painel identificou</h3>
          <p>Credenciais permanecem mascaradas. Escolha qual endpoint será tentado primeiro.</p>
          <div id="uplAnalysisSummary"></div>
          <div class="upl-actions" style="margin-top:16px;">
            <button class="upl-btn" type="button" data-upl-action onclick="RonecaUniversalPlaylists.go(2)">Voltar</button>
            <button class="upl-btn primary" type="button" data-upl-action onclick="RonecaUniversalPlaylists.save()">Salvar fonte</button>
          </div>
        </section>

        <section class="upl-pane" data-upl-pane="4">
          <h3>Teste e gravação</h3>
          <p>O modo seguro é tentado primeiro. Uma exceção de certificado só entra em ação depois da falha segura.</p>
          <div id="uplTestResults" class="upl-test-list"><div class="upl-empty">Nenhum teste executado ainda.</div></div>
          <div class="upl-actions" style="margin-top:16px;">
            <button class="upl-btn" type="button" data-upl-action onclick="RonecaUniversalPlaylists.go(3)">Voltar</button>
            <button class="upl-btn green" type="button" data-upl-action onclick="RonecaUniversalPlaylists.test()">Executar teste</button>
            <button class="upl-btn primary" type="button" data-upl-action onclick="RonecaUniversalPlaylists.save()">Salvar fonte</button>
          </div>
        </section>
        <div id="uplStatus" class="upl-status" role="status"></div>
      </div>`;
    modal.addEventListener('click', function (event) { if (event.target === modal) close(); });
    document.body.appendChild(modal);

    if (state.surface === 'seller') {
      modal.querySelectorAll('[data-upl-admin-security]').forEach(function (item) { item.remove(); });
      var strictOnlyNote = document.createElement('div');
      strictOnlyNote.className = 'upl-panel ok';
      strictOnlyNote.textContent = 'Contas de vendedor usam validação segura de certificado. Exceções TLS são configuradas somente pelo administrador.';
      var securityPanel = modal.querySelector('[data-upl-pane="2"] .upl-panel');
      if (securityPanel) securityPanel.insertAdjacentElement('afterend', strictOnlyNote);
    }

    document.querySelectorAll('input[name="uplMode"]').forEach(function (input) { input.addEventListener('change', syncMode); });
    document.querySelectorAll('input[name="uplTlsMode"]').forEach(function (input) { input.addEventListener('change', syncTls); });
    el('uplFile').addEventListener('change', readFile);
  }

  function ensureBoard() {
    if (el('uplBoard')) return;
    var anchor = state.surface === 'seller' ? el('sellerListsCard') : el('playlistActionPanel');
    if (!anchor) return;
    var board = document.createElement('div');
    board.id = 'uplBoard';
    board.className = 'upl-board';
    board.innerHTML = `
      <div class="upl-board-head">
        <div><h2>Fontes universais</h2><p>Uma conta pode reunir Xtream, M3U, HLS e endereços alternativos sem duplicação.</p></div>
        <div class="upl-actions"><button class="upl-btn primary" type="button" onclick="RonecaUniversalPlaylists.open()">Adicionar fonte</button><button class="upl-btn" type="button" onclick="RonecaUniversalPlaylists.refresh()">Atualizar</button><button class="upl-btn" type="button" onclick="RonecaUniversalPlaylists.toggleLegacy()">Ferramentas antigas</button></div>
      </div>
      <div class="upl-toolbar">
        <input id="uplSearch" placeholder="Buscar por nome, fornecedor, domínio ou ID" aria-label="Buscar fontes">
        <select id="uplTlsFilter"><option value="">Todos os certificados</option><option value="strict">Certificado validado</option><option value="custom_ca">Certificado específico</option><option value="insecure">Certificado ignorado</option></select>
        <select id="uplStatusFilter"><option value="">Todos os status</option><option value="ready_cache">Cache pronto</option><option value="ready_direct">Acesso direto</option><option value="awaiting_device_test">Aguardando aparelho</option><option value="retryable_error">Falha temporária</option><option value="blocked">Bloqueada</option></select>
        <select id="uplTypeFilter"><option value="">Todos os formatos</option><option value="xtream">Xtream</option><option value="m3u">M3U</option><option value="hls">HLS</option><option value="stalker">Stalker</option><option value="api">API</option><option value="direct">Direto</option></select>
      </div>
      <div id="uplSourceGrid" class="upl-source-grid"><div class="upl-empty">Carregando fontes…</div></div>`;
    if (state.surface === 'seller') {
      var head = anchor.querySelector('.seller-playlist-head');
      if (head) head.insertAdjacentElement('afterend', board); else anchor.prepend(board);
      var oldForm = el('sellerPlaylistForm'); if (oldForm) oldForm.classList.remove('open');
    } else {
      anchor.insertAdjacentElement('afterend', board);
    }
    ['uplSearch', 'uplTlsFilter', 'uplStatusFilter', 'uplTypeFilter'].forEach(function (id) {
      el(id).addEventListener(id === 'uplSearch' ? 'input' : 'change', renderSources);
    });
  }

  function sourceStatus(source) {
    var map = {
      ready_cache: ['Cache pronto', 'ok'],
      ready_direct: ['Acesso direto', 'ok'],
      awaiting_device_test: ['Aguardando teste no aparelho', 'warn'],
      retryable_error: ['Falha temporária', 'err'],
      blocked: ['Bloqueada', 'err'],
      validating: ['Em validação', 'warn']
    };
    return map[source.qualificationStatus] || [source.qualificationStatus || 'Sem status', ''];
  }

  function tlsLabel(mode) {
    if (mode === 'insecure') return ['Certificado ignorado', 'warn'];
    if (mode === 'custom_ca') return ['Certificado específico', 'warn'];
    return ['Certificado validado', 'ok'];
  }

  function filteredSources() {
    var term = (value('uplSearch') || '').toLowerCase();
    var tls = value('uplTlsFilter');
    var statusFilter = value('uplStatusFilter');
    var type = value('uplTypeFilter');
    return state.sources.filter(function (source) {
      var endpoints = source.endpoints || [];
      var text = [source.name, source.providerName, source.id].concat(endpoints.map(function (endpoint) { return [endpoint.host, endpoint.preview, endpoint.type].join(' '); })).join(' ').toLowerCase();
      return (!term || text.includes(term))
        && (!tls || source.tls && source.tls.mode === tls)
        && (!statusFilter || source.qualificationStatus === statusFilter)
        && (!type || endpoints.some(function (endpoint) { return endpoint.type === type; }));
    });
  }

  function renderSources() {
    ensureBoard();
    var grid = el('uplSourceGrid');
    if (!grid) return;
    var sources = filteredSources();
    grid.innerHTML = sources.length ? sources.map(function (source) {
      var endpoints = source.endpoints || [];
      var primary = endpoints.find(function (endpoint) { return endpoint.primary; }) || endpoints[0] || {};
      var statusInfo = sourceStatus(source);
      var tlsInfo = tlsLabel(source.tls && source.tls.mode);
      var expired = source.providerExpiresAt && new Date(source.providerExpiresAt).getTime() <= Date.now();
      return `<article class="upl-source-card" data-tls="${esc(source.tls && source.tls.mode || 'strict')}" data-status="${esc(statusInfo[1])}">
        <div class="upl-source-head"><div><h3>${esc(source.name)}</h3><p>${esc(source.providerName || 'Fornecedor não informado')} · ID ${esc(String(source.id || '').slice(-6).toUpperCase())}</p></div><span class="upl-chip ${statusInfo[1]}">${esc(statusInfo[0])}</span></div>
        <div class="upl-chip-row"><span class="upl-chip ${tlsInfo[1]}">${esc(tlsInfo[0])}</span>${expired ? '<span class="upl-chip err">Conta vencida</span>' : ''}<span class="upl-chip">${endpoints.length} endpoint(s)</span></div>
        <div class="upl-meta"><div><small>Origem principal</small><strong title="${esc(primary.preview || '')}">${esc(primary.host || '—')}${primary.port ? ':' + esc(primary.port) : ''}</strong></div><div><small>Formato</small><strong>${esc((primary.type || source.type || '—').toUpperCase())}</strong></div><div><small>Itens</small><strong>${number(source.cacheItemCount)}</strong></div><div><small>Vencimento</small><strong class="${expired ? 'upl-expired' : ''}">${fmt(source.providerExpiresAt)}</strong></div></div>
        <div class="upl-actions">${state.surface === 'admin' ? `<button class="upl-btn" type="button" onclick="RonecaUniversalPlaylists.edit('${esc(source.id)}')">Editar</button>` : ''}<button class="upl-btn" type="button" onclick="RonecaUniversalPlaylists.testSaved('${esc(source.id)}')">Testar</button><button class="upl-btn danger" type="button" onclick="RonecaUniversalPlaylists.remove('${esc(source.id)}')">Excluir</button></div>
      </article>`;
    }).join('') : '<div class="upl-empty">Nenhuma fonte encontrada com esses filtros.</div>';
  }

  async function refresh() {
    ensureBoard();
    var grid = el('uplSourceGrid'); if (grid) grid.innerHTML = '<div class="upl-empty">Atualizando fontes…</div>';
    try {
      var result = await api('list');
      state.sources = result.sources || [];
      renderSources();
    } catch (error) {
      if (grid) grid.innerHTML = '<div class="upl-panel err">' + esc(error.message) + '</div>';
    }
  }

  function reset() {
    state.draft = null; state.tests = null; state.editId = null; state.editEndpoints = []; state.step = 1;
    ['uplName','uplProviderName','uplPlanName','uplProviderMessage','uplSingleUrl','uplSingleLabel','uplXtreamHost','uplXtreamPort','uplXtreamBasePath','uplXtreamUsername','uplXtreamPassword','uplAdvancedUrls','uplCustomCaPem','uplAllowedHosts','uplHeaders','uplRequestBody'].forEach(function (id) { setValue(id, ''); });
    setValue('uplMaxConnections', '1'); setValue('uplSingleLabel', 'Origem principal'); setValue('uplTimeout', '45000'); setValue('uplRetries', '1');
    setChecked('uplRiskAccepted', false); setChecked('uplAllowSubdomains', false); setChecked('uplAllowRedirectHosts', false); setChecked('uplFollowRedirects', true);
    ['uplScopeValidation','uplScopeCache','uplScopeCatalog','uplScopePlayback'].forEach(function (id) { setChecked(id, true); });
    var mode = document.querySelector('input[name="uplMode"][value="provider_message"]'); if (mode) mode.checked = true;
    var tls = document.querySelector('input[name="uplTlsMode"][value="strict"]'); if (tls) tls.checked = true;
    if (el('uplAnalysisSummary')) el('uplAnalysisSummary').innerHTML = '<div class="upl-empty">Analise uma origem para continuar.</div>';
    if (el('uplTestResults')) el('uplTestResults').innerHTML = '<div class="upl-empty">Nenhum teste executado ainda.</div>';
    status(''); syncMode(); syncTls(); go(1);
  }

  function open() {
    ensureModal(); reset();
    el('uplModal').classList.add('open'); el('uplModal').setAttribute('aria-hidden', 'false');
    setTimeout(function () { el('uplName').focus(); }, 0);
  }
  function close() {
    if (state.busy) return;
    var modal = el('uplModal'); if (!modal) return;
    modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true');
  }

  function syncMode() {
    var selected = document.querySelector('input[name="uplMode"]:checked');
    var mode = selected ? selected.value : 'provider_message';
    ['Provider','M3u','Xtream','Advanced'].forEach(function (name) { el('uplMode' + name).classList.add('upl-hidden'); });
    if (mode === 'provider_message') el('uplModeProvider').classList.remove('upl-hidden');
    if (mode === 'm3u') el('uplModeM3u').classList.remove('upl-hidden');
    if (mode === 'xtream') el('uplModeXtream').classList.remove('upl-hidden');
    if (mode === 'advanced') el('uplModeAdvanced').classList.remove('upl-hidden');
  }
  function syncTls() {
    var selected = document.querySelector('input[name="uplTlsMode"]:checked');
    var mode = selected ? selected.value : 'strict';
    el('uplCustomCaWrap').classList.toggle('upl-hidden', mode !== 'custom_ca');
    el('uplTlsRisk').classList.toggle('upl-hidden', mode !== 'insecure');
  }

  async function readFile(event) {
    var file = event.target.files && event.target.files[0]; if (!file) return;
    if (file.size > 1024 * 1024) { status('O arquivo deve ter no máximo 1 MB para análise nesta tela.', 'err'); return; }
    try {
      var text = await file.text();
      setValue('uplAdvancedUrls', text);
      status('Arquivo lido. O painel identificará os endereços presentes nele.', 'ok');
    } catch (_error) { status('Não foi possível ler o arquivo.', 'err'); }
  }

  function modeValue() {
    var selected = document.querySelector('input[name="uplMode"]:checked');
    return selected ? selected.value : 'provider_message';
  }

  function buildXtreamEndpoints() {
    var protocol = value('uplXtreamProtocol') || 'http';
    var host = value('uplXtreamHost').replace(/^https?:\/\//i, '').replace(/\/$/, '');
    var port = value('uplXtreamPort'); var basePath = value('uplXtreamBasePath').replace(/^\/+|\/+$/g, '');
    var username = value('uplXtreamUsername'); var password = value('uplXtreamPassword'); var output = value('uplXtreamOutput') || 'mpegts';
    if (!host || !username || !password) throw new Error('Informe servidor, usuário e senha do Xtream.');
    var origin = protocol + '://' + host + (port ? ':' + port : '') + (basePath ? '/' + basePath : '');
    var apiUrl = new URL(origin + '/player_api.php'); apiUrl.searchParams.set('username', username); apiUrl.searchParams.set('password', password);
    var m3uUrl = new URL(origin + '/get.php'); m3uUrl.searchParams.set('username', username); m3uUrl.searchParams.set('password', password); m3uUrl.searchParams.set('type', 'm3u_plus'); m3uUrl.searchParams.set('output', output);
    return [{ type: 'xtream', label: 'API Xtream', url: apiUrl.toString(), primary: true }, { type: output === 'hls' || output === 'm3u8' ? 'hls' : 'm3u', label: 'Playlist Xtream ' + output.toUpperCase(), url: m3uUrl.toString() }];
  }

  function extractUrls(text) {
    var matches = String(text || '').match(/(?:https?|rtmp|rtsp):\/\/[^\s<>"'`]+/gi) || [];
    return Array.from(new Set(matches.map(function (item) { return item.replace(/[),.;!\]}*_]+$/g, ''); })));
  }

  function parseHeaders() {
    var headers = {};
    value('uplHeaders').split(/\n+/).forEach(function (line) {
      var index = line.indexOf(':'); if (index <= 0) return;
      var name = line.slice(0, index).trim(); var entry = line.slice(index + 1).trim();
      if (name && entry) headers[name] = entry;
    });
    return headers;
  }

  function sourcePayload() {
    var mode = modeValue(); var payload = { name: value('uplName'), maxConnections: Number(value('uplMaxConnections') || 1), providerName: value('uplProviderName'), planName: value('uplPlanName') };
    if (state.editId) payload.playlistId = state.editId;
    if (mode === 'provider_message') payload.providerMessage = value('uplProviderMessage');
    if (mode === 'm3u') payload.sourceKind = 'm3u', payload.endpoints = [{ type: value('uplSingleType') || 'm3u', label: value('uplSingleLabel') || 'Origem principal', url: value('uplSingleUrl'), primary: true }];
    if (mode === 'xtream') payload.sourceKind = 'xtream', payload.endpoints = buildXtreamEndpoints();
    if (mode === 'advanced') {
      var advancedType = value('uplAdvancedType') || 'direct'; var urls = extractUrls(value('uplAdvancedUrls'));
      if (!urls.length) throw new Error('Informe ao menos uma URL válida.');
      payload.sourceKind = advancedType === 'api' ? 'api' : advancedType === 'stalker' ? 'stalker' : advancedType === 'file' ? 'file' : advancedType === 'manual' ? 'manual' : 'direct';
      payload.endpoints = urls.slice(0, 20).map(function (url, index) {
        var saved = state.editEndpoints.find(function (endpoint) { return endpoint.url === url; });
        return {
          type: saved && saved.type || advancedType,
          label: saved && saved.label || (advancedType || 'Endpoint').toUpperCase() + ' ' + (index + 1),
          url: url,
          primary: saved ? saved.primary === true : index === 0,
          active: saved ? saved.active !== false : true,
          outputFormat: saved && saved.outputFormat || null
        };
      });
    }
    payload.security = securityPayload(); payload.connectionProfile = connectionPayload();
    if (state.draft) payload.primaryIndex = selectedPrimaryIndex();
    return payload;
  }

  function securityPayload() {
    var selected = document.querySelector('input[name="uplTlsMode"]:checked');
    var mode = state.surface === 'seller' ? 'strict' : (selected ? selected.value : 'strict');
    return { mode: mode, allowedHosts: value('uplAllowedHosts').split(/\n+/).map(function (item) { return item.trim(); }).filter(Boolean), allowSubdomains: state.surface === 'seller' ? false : checked('uplAllowSubdomains'), allowRedirectHosts: state.surface === 'seller' ? false : checked('uplAllowRedirectHosts'), riskAccepted: state.surface === 'seller' ? false : checked('uplRiskAccepted'), scopes: { validation: checked('uplScopeValidation', true), cache: checked('uplScopeCache', true), catalog: checked('uplScopeCatalog', true), playback: checked('uplScopePlayback', true) } };
  }

  function connectionPayload() {
    var body = null; var rawBody = value('uplRequestBody');
    if (rawBody) { try { body = JSON.parse(rawBody); } catch (_error) { throw new Error('O corpo avançado precisa ser um JSON válido.'); } }
    return { customCaPem: value('uplCustomCaPem'), headers: parseHeaders(), method: value('uplMethod') || 'GET', body: body, timeoutMs: Number(value('uplTimeout') || 45000), retryCount: Number(value('uplRetries') || 1), followRedirects: checked('uplFollowRedirects', true) };
  }

  function selectedPrimaryIndex() {
    var selected = document.querySelector('input[name="uplPrimaryEndpoint"]:checked');
    return selected ? Number(selected.value) : 0;
  }

  function fillDetected(parsed) {
    if (!value('uplName') && parsed.provider && parsed.provider.name) setValue('uplName', parsed.provider.name);
    if (parsed.provider && parsed.provider.name && !value('uplProviderName')) setValue('uplProviderName', parsed.provider.name);
    if (parsed.provider && parsed.provider.planName && !value('uplPlanName')) setValue('uplPlanName', parsed.provider.planName);
    if (parsed.provider && parsed.provider.maxConnections) setValue('uplMaxConnections', parsed.provider.maxConnections);
    var hosts = Array.from(new Set((parsed.endpoints || []).map(function (endpoint) { return endpoint.host; }).filter(Boolean)));
    setValue('uplAllowedHosts', hosts.join('\n'));
  }

  function renderAnalysis() {
    var host = el('uplAnalysisSummary'); if (!host || !state.draft) return;
    var draft = state.draft; var provider = draft.provider || {}; var warnings = draft.warnings || [];
    host.innerHTML = `<div class="upl-panel ${warnings.length ? 'warn' : 'ok'}"><div class="upl-meta"><div><small>Fornecedor</small><strong>${esc(provider.name || 'Não identificado')}</strong></div><div><small>Plano</small><strong>${esc(provider.planName || 'Não informado')}</strong></div><div><small>Usuário</small><strong>${esc(provider.usernameMasked || 'Não identificado')}</strong></div><div><small>Senha</small><strong>${provider.passwordConfigured ? 'Configurada' : 'Não identificada'}</strong></div><div><small>Conexões</small><strong>${esc(provider.maxConnections || value('uplMaxConnections') || 1)}</strong></div><div><small>Vencimento</small><strong>${fmt(provider.expiresAt)}</strong></div></div>${warnings.length ? '<div class="upl-warning-list">' + warnings.map(function (warning) { return '<div class="upl-chip warn">' + esc(warning) + '</div>'; }).join('') + '</div>' : '<div class="upl-chip ok">Dados principais reconhecidos</div>'}</div>
      <div class="upl-panel"><span class="upl-section-label">Endpoints encontrados</span><div class="upl-endpoint-list">${(draft.endpoints || []).map(function (endpoint, index) { return `<label class="upl-endpoint"><input type="radio" name="uplPrimaryEndpoint" value="${index}" ${endpoint.primary || index === 0 ? 'checked' : ''} ${endpoint.type === 'direct' && (!endpoint.path || endpoint.path === '/') && (draft.endpoints || []).some(function (candidate) { return ['xtream','m3u','hls','api','stalker'].includes(candidate.type) && candidate.active !== false && candidate.path && candidate.path !== '/'; }) ? 'disabled' : ''}><span><strong>${esc(endpoint.label)} · ${esc(String(endpoint.type || '').toUpperCase())}</strong><br><code>${esc(endpoint.preview)}</code><br><small>${esc(endpoint.protocol || '')} · ${esc(endpoint.host)}${endpoint.port ? ':' + esc(endpoint.port) : ' · porta não informada'} · saída ${esc(endpoint.outputFormat || 'automática')}</small></span><span class="upl-chip">Prioridade ${index + 1}</span></label>`; }).join('')}</div></div>
      ${(draft.externalLinks || []).length ? '<div class="upl-panel"><span class="upl-section-label">Links informativos ignorados como streaming</span><div class="upl-chip-row">' + draft.externalLinks.map(function (link) { return '<span class="upl-chip">' + esc(link.type) + ' · ' + esc(link.host) + '</span>'; }).join('') + '</div></div>' : ''}`;
  }

  async function analyze() {
    try {
      setBusy(true, 'Analisando a origem');
      var result = await api('analyze', sourcePayload());
      state.draft = result.draft; state.tests = null;
      fillDetected(state.draft); renderAnalysis();
      status('Origem analisada. Confira os endpoints e a segurança.', 'ok'); go(2);
    } catch (error) { status(error.message, 'err'); }
    finally { setBusy(false); }
  }

  function renderTests() {
    var host = el('uplTestResults'); if (!host) return;
    var results = state.tests && state.tests.results || [];
    host.innerHTML = results.length ? results.map(function (result) {
      var cls = result.result === 'success' ? 'ok' : result.result === 'partial' ? 'warn' : 'err';
      return `<div class="upl-test-result"><span class="upl-chip ${cls}">${esc(result.result)}</span><span><strong>${esc(result.endpoint && result.endpoint.label || 'Endpoint')}</strong><br><code>${esc(result.endpoint && result.endpoint.preview || '')}</code><br><small>${esc(result.message || '')}</small></span><span><small>${esc((result.tlsMode || 'strict').toUpperCase())}${result.httpStatus ? ' · HTTP ' + esc(result.httpStatus) : ''}${result.durationMs ? ' · ' + esc(result.durationMs) + ' ms' : ''}</small></span></div>`;
    }).join('') : '<div class="upl-empty">Nenhum resultado disponível.</div>';
  }

  async function test() {
    try {
      setBusy(true, 'Testando endpoints');
      var payload = sourcePayload(); payload.action = undefined;
      var result = await api('test', payload);
      state.tests = result; renderTests();
      status(result.success ? 'Ao menos uma estratégia respondeu com sucesso.' : 'Nenhuma estratégia foi confirmada. Confira os diagnósticos.', result.success ? 'ok' : 'err');
    } catch (error) { status(error.message, 'err'); }
    finally { setBusy(false); }
  }

  async function save() {
    try {
      if (!state.draft && !state.editId) throw new Error('Analise a origem antes de salvar.');
      setBusy(true, 'Salvando a fonte');
      var result = await api('save', sourcePayload());
      status(result.message || 'Fonte salva.', 'ok');
      await refresh();
      if (typeof global.loadAll === 'function' && state.surface === 'admin') global.loadAll().catch(function () {});
      if (typeof global.loadPortal === 'function' && state.surface === 'seller') global.loadPortal().catch(function () {});
      setTimeout(function () { state.busy = false; close(); }, 450);
    } catch (error) { status(error.message, 'err'); }
    finally { setBusy(false); }
  }

  function go(step) {
    state.step = Math.max(1, Math.min(4, Number(step || 1)));
    document.querySelectorAll('[data-upl-pane]').forEach(function (pane) { pane.classList.toggle('active', Number(pane.dataset.uplPane) === state.step); });
    document.querySelectorAll('[data-upl-step-label]').forEach(function (label) { label.classList.toggle('active', Number(label.dataset.uplStepLabel) === state.step); });
    if (state.step === 3) renderAnalysis();
    var card = document.querySelector('#uplModal .upl-modal-card'); if (card) card.scrollTop = 0;
  }

  async function edit(playlistId) {
    if (state.surface === 'seller') {
      global.alert('A edição da origem e da segurança é restrita ao administrador.');
      return;
    }
    ensureModal(); reset();
    try {
      setBusy(true, 'Carregando a fonte');
      var result = await api('details', { playlistId: playlistId });
      var playlist = result.playlist || {}; var endpoints = result.endpoints || []; var profile = result.connectionProfile || {};
      state.editId = playlistId; state.editEndpoints = endpoints.map(function (endpoint) { return Object.assign({}, endpoint); });
      setValue('uplName', playlist.name); setValue('uplMaxConnections', playlist.max_connections || 1); setValue('uplProviderName', playlist.provider_name || ''); setValue('uplPlanName', playlist.provider_plan_name || '');
      var advanced = document.querySelector('input[name="uplMode"][value="advanced"]'); if (advanced) advanced.checked = true;
      setValue('uplAdvancedType', playlist.source_kind === 'stalker' ? 'stalker' : playlist.source_kind === 'api' ? 'api' : 'direct'); setValue('uplAdvancedUrls', endpoints.map(function (endpoint) { return endpoint.url; }).join('\n'));
      var tls = document.querySelector('input[name="uplTlsMode"][value="' + (playlist.tls_mode || 'strict') + '"]'); if (tls) tls.checked = true;
      setValue('uplAllowedHosts', (playlist.tls_allowed_hosts || []).join('\n')); setChecked('uplAllowSubdomains', playlist.tls_allow_subdomains); setChecked('uplAllowRedirectHosts', playlist.tls_allow_redirect_hosts); setChecked('uplRiskAccepted', playlist.tls_mode === 'insecure');
      setChecked('uplScopeValidation', playlist.tls_scope_validation); setChecked('uplScopeCache', playlist.tls_scope_cache); setChecked('uplScopeCatalog', playlist.tls_scope_catalog); setChecked('uplScopePlayback', playlist.tls_scope_playback);
      setValue('uplCustomCaPem', profile.customCaPem || ''); setValue('uplMethod', profile.method || 'GET'); setValue('uplTimeout', profile.timeoutMs || 45000); setValue('uplRetries', profile.retryCount || 1); setChecked('uplFollowRedirects', profile.followRedirects !== false); setValue('uplHeaders', Object.entries(profile.headers || {}).map(function (entry) { return entry[0] + ': ' + entry[1]; }).join('\n')); setValue('uplRequestBody', profile.body ? JSON.stringify(profile.body, null, 2) : '');
      syncMode(); syncTls();
      var analyzeResult = await api('analyze', sourcePayload()); state.draft = analyzeResult.draft; renderAnalysis();
      el('uplModal').classList.add('open'); el('uplModal').setAttribute('aria-hidden', 'false'); go(1); status('Fonte carregada para edição.', 'ok');
    } catch (error) { status(error.message, 'err'); el('uplModal').classList.add('open'); }
    finally { setBusy(false); }
  }

  async function testSaved(playlistId) {
    ensureModal(); reset(); state.editId = playlistId; el('uplModal').classList.add('open');
    try { setBusy(true, 'Carregando e testando a fonte'); var result = await api('test', { playlistId: playlistId }); state.tests = result; renderTests(); go(4); status(result.success ? 'Teste concluído com sucesso.' : 'Teste concluído com falhas.', result.success ? 'ok' : 'err'); }
    catch (error) { go(4); status(error.message, 'err'); }
    finally { setBusy(false); }
  }


  function legacyElements() {
    var result = [];
    if (state.surface === 'admin') {
      var table = el('playlistsBody');
      var card = table && table.closest('.entity-primary-card');
      var form = el('newPlaylistName');
      var formCard = form && form.closest('.entity-hidden-form');
      if (card) result.push(card);
      if (formCard) result.push(formCard);
    } else {
      ['sellerPlaylistForm', 'sellerListsMsg', 'sellerPlaylistsList'].forEach(function (id) {
        var node = el(id); if (node) result.push(node);
      });
    }
    return result;
  }

  function hideLegacy() {
    legacyElements().forEach(function (node) { node.classList.add('upl-legacy-hidden'); });
  }

  function toggleLegacy() {
    var nodes = legacyElements();
    var shouldShow = nodes.some(function (node) { return node.classList.contains('upl-legacy-hidden'); });
    nodes.forEach(function (node) { node.classList.toggle('upl-legacy-hidden', !shouldShow); });
  }

  async function removeSource(playlistId) {
    var source = state.sources.find(function (item) { return item.id === playlistId; });
    var name = source && source.name || 'esta fonte';
    if (!global.confirm('Excluir "' + name + '"? O painel bloqueará a ação se ainda houver aparelhos vinculados.')) return;
    try {
      setBusy(true, 'Excluindo a fonte');
      var result = await api('delete', { playlistId: playlistId });
      status(result.message || 'Fonte excluída.', 'ok');
      await refresh();
      if (typeof global.loadAll === 'function' && state.surface === 'admin') global.loadAll().catch(function () {});
      if (typeof global.loadPortal === 'function' && state.surface === 'seller') global.loadPortal().catch(function () {});
    } catch (error) {
      status(error.message, 'err');
      global.alert(error.message);
    } finally {
      setBusy(false);
    }
  }

  function patchLegacyEntrypoints() {
    global.openPlaylistActionModal = function () { open(); };
    if (state.surface === 'seller') global.sellerListsToggleForm = function () { open(); };
    var originalLoadAll = global.loadAll;
    if (typeof originalLoadAll === 'function' && !originalLoadAll.__uplPatched) {
      var wrapped = async function () { var result = await originalLoadAll.apply(this, arguments); refresh().catch(function () {}); return result; }; wrapped.__uplPatched = true; global.loadAll = wrapped;
    }
    var originalPortal = global.loadPortal;
    if (typeof originalPortal === 'function' && !originalPortal.__uplPatched) {
      var wrappedPortal = async function () { var result = await originalPortal.apply(this, arguments); refresh().catch(function () {}); return result; }; wrappedPortal.__uplPatched = true; global.loadPortal = wrappedPortal;
    }
  }

  function boot() {
    ensureModal(); ensureBoard(); patchLegacyEntrypoints(); hideLegacy();
    if (global.RonecaPanelAuth && global.RonecaPanelAuth.hasSession && global.RonecaPanelAuth.hasSession()) refresh();
  }

  global.RonecaUniversalPlaylists = { open: open, close: close, analyze: analyze, test: test, save: save, go: go, refresh: refresh, edit: edit, testSaved: testSaved, remove: removeSource, toggleLegacy: toggleLegacy };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
  setTimeout(boot, 400);
})(window);
