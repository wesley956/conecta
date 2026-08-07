(() => {
  'use strict';
  if (window.__ronecaSellerDeviceFlowUiInstalled) return;
  window.__ronecaSellerDeviceFlowUiInstalled = true;

  const DATA_FUNCTION = 'seller-panel';
  const FLOW_FUNCTION = 'seller-device-flow';
  const PLAYLIST_FUNCTION = 'playlist-registration';
  const SOURCE_FUNCTION = 'playlist-source-manager';
  const RECENT_RENEWAL_MINUTES = 60;
  const state = {
    mode: 'activation', step: 1, maxReachable: 1, data: null, device: null,
    draft: {}, busy: false, attempt: null, errors: {}, topError: '', result: null,
    search: { primary: '', backup: '' }, watchTimer: null, watchId: null, watchText: '',
  };
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');

  function timeApi() { return window.RonecaPanelTime || null; }
  function formatDateTime(value) {
    if (!value) return '—';
    if (timeApi()) return timeApi().formatDateTime(value);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : `${date.toLocaleString('pt-BR')} · America/Sao_Paulo`;
  }
  function projectedExpiry(plan, customDate = '', renewal = false) {
    try {
      if (timeApi()) return timeApi().projectedExpiry({
        currentExpiry: state.device?.expiresAt || null,
        durationDays: Number(plan?.durationDays || 30),
        customDate,
        renewal,
      });
    } catch { /* o backend fará a validação definitiva */ }
    return customDate ? null : state.device?.expiresAt || null;
  }
  function customExpiryIso(dateText) {
    if (!dateText) return null;
    if (!timeApi()) throw new Error('O módulo de horário do painel ainda está carregando. Tente novamente.');
    return timeApi().endOfDayIso(dateText);
  }

  async function panelApi(functionName, payload = {}) {
    if (!window.RonecaPanelAuth) throw new Error('Sessão do painel não encontrada. Entre novamente.');
    const config = window.RONECA_PANEL_CONFIG || {};
    const base = String(config.supabaseUrl || '').replace(/\/$/, '');
    if (!base || !config.anonKey) throw new Error('Configuração do painel indisponível.');
    const token = await window.RonecaPanelAuth.getAccessToken();
    const response = await fetch(`${base}/functions/v1/${functionName}`, {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', apikey: config.anonKey, Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || data.message || 'Falha na operação.');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  const sellerApi = (action, payload = {}) => panelApi(DATA_FUNCTION, { action, ...payload });
  const flowApi = (action, payload = {}) => panelApi(FLOW_FUNCTION, { action, ...payload });
  const draft = () => state.draft;
  const planById = id => (state.data?.plans || []).find(item => String(item.id) === String(id || '')) || null;
  const playlistById = id => (state.data?.playlists || []).find(item => String(item.id) === String(id || '')) || null;

  function newKey(prefix) { return `${prefix}:${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`; }
  function stableKey(action, payload) {
    const fingerprint = JSON.stringify({ action, ...payload });
    if (state.attempt?.fingerprint === fingerprint) return state.attempt.key;
    state.attempt = { fingerprint, key: newKey(`seller-${action}`) };
    return state.attempt.key;
  }
  function clearAttempt() { state.attempt = null; }
  function stopWatch() { if (state.watchTimer) clearTimeout(state.watchTimer); state.watchTimer = null; state.watchId = null; }

  function lifecycleInfo(item) {
    if (!item) return { status: 'generating_cache', label: 'Gerando cache', message: 'O servidor está processando a lista.', platforms: {} };
    const status = String(item.lifecycleStatus || (
      item.qualificationStatus === 'ready_cache' ? 'ready_cache'
        : item.qualificationStatus === 'ready_direct' ? 'confirmed_by_device'
        : item.qualificationStatus === 'blocked' ? 'blocked'
        : item.qualificationCode === 'DEVICE_TEST_FAILED' ? 'device_failed'
        : 'awaiting_device_confirmation'
    ));
    const labels = {
      saving: 'Salvando', generating_cache: 'Gerando cache', ready_cache: 'Pronta com cache',
      awaiting_device_confirmation: 'Aguardando confirmação no aparelho', confirmed_by_device: 'Confirmada pelo aparelho',
      device_failed: 'Falhou no aparelho', blocked: 'Bloqueada', archived: 'Arquivada',
    };
    const messages = {
      saving: 'A lista foi salva e está entrando na fila de processamento.',
      generating_cache: 'O servidor está tentando autenticar a origem e gerar o cache.',
      ready_cache: 'O cache foi gerado. Esta lista está pronta nas plataformas compatíveis.',
      awaiting_device_confirmation: 'O servidor não conseguiu confirmar sozinho. No Android, a confirmação acontece automaticamente na primeira abertura.',
      confirmed_by_device: 'Um aparelho Android abriu o conteúdo e confirmou esta lista.',
      device_failed: 'Um aparelho já tentou esta lista e não conseguiu abrir. Tente novamente ou corrija a origem.',
      blocked: 'A origem precisa ser corrigida antes de uma nova ativação.',
      archived: 'A lista foi arquivada e não pode ser escolhida para uma nova ativação.',
    };
    return {
      status,
      label: item.lifecycleLabel || item.qualificationLabel || labels[status] || labels.generating_cache,
      message: item.lifecycleMessage || item.qualificationMessage || messages[status] || messages.generating_cache,
      platforms: item.platformCapabilities || {},
    };
  }

  function devicePlatform() {
    const type = String(state.device?.deviceType || state.device?.platform || 'android').toLowerCase();
    if (type.includes('webos') || type.includes('lg')) return 'lg';
    if (type.includes('tizen') || type.includes('samsung')) return 'samsung';
    return 'android';
  }
  function platformStatus(item, platform) {
    const info = lifecycleInfo(item);
    const supplied = info.platforms?.[platform];
    if (supplied) return supplied;
    if (['blocked', 'archived', 'device_failed'].includes(info.status)) return 'blocked';
    if (platform === 'android') return ['ready_cache', 'confirmed_by_device'].includes(info.status) ? 'available' : 'provisional';
    return info.status === 'ready_cache' ? 'available_by_cache' : 'unavailable';
  }
  function playlistUnavailable(item) {
    if (!item) return true;
    const info = lifecycleInfo(item);
    if (info.status === 'device_failed' || ['blocked', 'archived'].includes(info.status)) return true;
    const status = platformStatus(item, devicePlatform());
    return status === 'blocked' || status === 'unavailable';
  }
  function platformLabel(platform, status) {
    const name = platform === 'android' ? 'Android' : platform === 'lg' ? 'LG' : 'Samsung';
    if (status === 'available') return `${name}: disponível`;
    if (status === 'provisional') return `${name}: provisória`;
    if (status === 'available_by_cache') return `${name}: por cache`;
    if (status === 'blocked') return `${name}: bloqueada`;
    return `${name}: indisponível`;
  }
  function playlistLabel(item) { return item ? `${item.name} · ${lifecycleInfo(item).label}` : 'Escolha uma lista'; }
  function playlistOptions(selected = '', empty = 'Escolha uma lista') {
    return `<option value="">${esc(empty)}</option>` + (state.data?.playlists || [])
      .filter(item => lifecycleInfo(item).status !== 'archived')
      .map(item => `<option value="${esc(item.id)}" ${String(item.id) === String(selected) ? 'selected' : ''} ${playlistUnavailable(item) ? 'disabled' : ''}>${esc(playlistLabel(item))}</option>`).join('');
  }
  function planOptions(selected = '') {
    return '<option value="">Escolha um plano</option>' + (state.data?.plans || [])
      .map(item => `<option value="${esc(item.id)}" ${String(item.id) === String(selected) ? 'selected' : ''}>${esc(item.name)} · ${Number(item.durationDays || 30)} dias · ${Number(item.creditCost || 1)} crédito(s)</option>`).join('');
  }
  function balanceSummary(plan) {
    const before = Number(state.data?.seller?.creditBalance || 0); const cost = Number(plan?.creditCost || 0);
    return { before, cost, after: before - cost, canGoNegative: state.data?.seller?.canGoNegative === true };
  }
  function lastRenewalFor(deviceId) {
    return (state.data?.creditLedger || [])
      .filter(entry => entry.type === 'renewal' && String(entry.referenceId || '') === String(deviceId || ''))
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0] || null;
  }
  function recentRenewal(deviceId) {
    const entry = lastRenewalFor(deviceId);
    if (!entry) return { entry: null, minutes: null, recent: false };
    const minutes = timeApi()?.minutesSince(entry.createdAt) ?? Math.max(0, Math.floor((Date.now() - new Date(entry.createdAt).getTime()) / 60000));
    return { entry, minutes, recent: Number.isFinite(minutes) && minutes <= RECENT_RENEWAL_MINUTES };
  }

  function fieldError(name) { return state.errors[name] ? `<span class="aw-field-error" role="alert">${esc(state.errors[name])}</span>` : ''; }
  function topError() { return state.topError ? `<div class="aw-notice err" role="alert"><strong>Confira esta etapa</strong><span>${esc(state.topError)}</span></div>` : ''; }
  function clearErrors() { state.errors = {}; state.topError = ''; }
  function invalidate(field, message) { state.errors[field] = message; state.topError ||= 'Há informações que precisam ser corrigidas antes de continuar.'; }

  function ensureModal() {
    if ($('activationWizard')) return;
    const root = document.createElement('div');
    root.id = 'activationWizard'; root.className = 'activation-wizard';
    root.innerHTML = `<div class="activation-wizard-card" role="dialog" aria-modal="true" aria-labelledby="activationWizardTitle"><header class="activation-wizard-head"><div><span class="activation-wizard-kicker">Ativação guiada</span><h2 id="activationWizardTitle"></h2><p id="activationWizardSubtitle"></p></div><button type="button" class="btn aw-close" data-aw-action="close" aria-label="Fechar">×</button></header><nav id="activationWizardSteps" class="activation-wizard-steps" aria-label="Etapas"></nav><main id="activationWizardBody" class="activation-wizard-body"></main><footer id="activationWizardFooter" class="activation-wizard-footer"></footer></div>`;
    root.addEventListener('click', event => {
      if (event.target === root && !state.busy) return close();
      const actionNode = event.target.closest('[data-aw-action]'); const action = actionNode?.dataset.awAction;
      if (!action) return;
      if (action === 'close') close();
      else if (action === 'back') back();
      else if (action === 'next') next();
      else if (action === 'submit') submit();
      else if (action === 'new-playlist') newPlaylist(actionNode.dataset.awFieldTarget);
      else if (action === 'step') go(Number(actionNode.dataset.awStep || 1));
      else if (action === 'choose-playlist') choosePlaylist(actionNode.dataset.awTargetField, actionNode.dataset.awPlaylistId);
      else if (action === 'retry-playlist') retryPlaylist(actionNode.dataset.awPlaylistId);
    });
    root.addEventListener('input', event => {
      const input = event.target.closest('input[data-aw-field],select[data-aw-field],textarea[data-aw-field]');
      if (input) { state.draft[input.dataset.awField] = input.type === 'checkbox' ? input.checked : input.value; delete state.errors[input.dataset.awField]; state.topError = ''; }
      const search = event.target.closest('[data-aw-search]');
      if (search) { state.search[search.dataset.awSearch] = search.value; renderPlaylistResults(search.dataset.awSearch); }
    });
    root.addEventListener('change', event => {
      const input = event.target.closest('input[data-aw-field],select[data-aw-field],textarea[data-aw-field]');
      if (!input) return;
      state.draft[input.dataset.awField] = input.type === 'checkbox' ? input.checked : input.value;
      if (input.dataset.awField === 'useBackup' && !input.checked) state.draft.backupPlaylistId = '';
      clearAttempt(); clearErrors();
      if (['planId', 'playlistId', 'backupPlaylistId', 'useBackup', 'expiresAt'].includes(input.dataset.awField)) render();
    });
    document.body.appendChild(root);
  }

  function steps() {
    if (state.mode === 'renewal') return ['Plano', 'Confirmar'];
    if (state.mode === 'change') return ['Lista', 'Reserva', 'Confirmar'];
    return ['Cliente', 'Plano', 'Lista', 'Reserva', 'Confirmar'];
  }
  function syncInputs() {
    document.querySelectorAll('#activationWizard input[data-aw-field],#activationWizard select[data-aw-field],#activationWizard textarea[data-aw-field]').forEach(input => {
      state.draft[input.dataset.awField] = input.type === 'checkbox' ? input.checked : input.value;
    });
  }
  function renderSteps() {
    const labels = steps(); $('activationWizardSteps').style.gridTemplateColumns = `repeat(${labels.length}, minmax(0,1fr))`;
    $('activationWizardSteps').innerHTML = labels.map((label, index) => {
      const number = index + 1; const reached = number <= state.maxReachable;
      return `<button type="button" class="aw-step ${number === state.step ? 'active' : ''} ${number < state.step ? 'done' : ''}" data-aw-action="step" data-aw-step="${number}" ${reached && !state.busy ? '' : 'disabled'} aria-current="${number === state.step ? 'step' : 'false'}"><span>${number < state.step ? '✓' : number}</span><em>${esc(label)}</em></button>`;
    }).join('');
  }
  function render() {
    ensureModal(); const labels = steps(); state.step = Math.min(Math.max(1, state.step), labels.length);
    $('activationWizardTitle').textContent = state.mode === 'activation' ? 'Ativar aparelho' : state.mode === 'renewal' ? 'Renovar aparelho' : 'Alterar listas';
    $('activationWizardSubtitle').textContent = state.mode === 'activation'
      ? `${state.device?.deviceCode || ''} · siga as etapas; o painel cuida da parte técnica`
      : state.mode === 'renewal' ? `${state.device?.deviceCode || ''} · cliente e listas serão preservados` : `${state.device?.deviceCode || ''} · sem crédito, plano ou validade`;
    renderSteps(); $('activationWizardBody').innerHTML = state.result ? renderResult() : renderStep(); $('activationWizardFooter').innerHTML = renderFooter();
    const logical = state.mode === 'renewal' ? 0 : (state.mode === 'activation' ? state.step : state.step + 2);
    if (!state.result && logical === 3) renderPlaylistResults('primary');
    if (!state.result && logical === 4) renderPlaylistResults('backup');
  }
  function renderFooter() {
    if (state.result) return `<span></span><div class="aw-footer-actions"><button type="button" class="btn primary" data-aw-action="close">Fechar</button></div>`;
    const labels = steps(); const spinner = state.busy ? '<span class="aw-spinner" aria-hidden="true"></span>' : '';
    return `${state.step > 1 ? `<button type="button" class="btn" data-aw-action="back" ${state.busy ? 'disabled' : ''}>Voltar</button>` : '<span></span>'}<div class="aw-footer-actions"><button type="button" class="btn" data-aw-action="close" ${state.busy ? 'disabled' : ''}>Cancelar</button>${state.step < labels.length ? `<button type="button" class="btn primary" data-aw-action="next" ${state.busy ? 'disabled' : ''}>${spinner}Continuar</button>` : `<button type="button" class="btn primary" data-aw-action="submit" ${state.busy ? 'disabled' : ''}>${spinner}${state.busy ? 'Processando…' : state.mode === 'activation' ? 'Ativar aparelho' : state.mode === 'renewal' ? 'Renovar aparelho' : 'Salvar novas listas'}</button>`}</div>`;
  }

  function renderStep() {
    const d = draft();
    if (state.mode === 'renewal') return state.step === 1 ? renderRenewalPlan() : renderRenewalReview();
    const logical = state.mode === 'activation' ? state.step : state.step + 2;
    if (logical === 1) return `<section class="aw-pane">${topError()}<div class="aw-pane-title"><span class="aw-number">1</span><div><h3>Quem vai usar o aparelho?</h3><p>Esses dados servem para você reconhecer o cliente depois.</p></div></div><div class="aw-grid"><label>Nome do cliente <strong>*</strong><input data-aw-field="customerName" value="${esc(d.customerName || state.device?.customerName || '')}" placeholder="Ex: João Silva" autocomplete="name">${fieldError('customerName')}</label><label>WhatsApp <strong>*</strong><input data-aw-field="customerWhatsapp" inputmode="tel" value="${esc(d.customerWhatsapp || state.device?.customerWhatsapp || '')}" placeholder="Ex: 19999999999" autocomplete="tel"><small>Use DDD + número. O painel aceita 10 a 15 dígitos.</small>${fieldError('customerWhatsapp')}</label><label class="wide">Observação <span class="muted">(opcional)</span><textarea data-aw-field="customerNotes" maxlength="1000" placeholder="Ex: TV da sala, preferência do cliente ou informação útil para atendimento">${esc(d.customerNotes || '')}</textarea><small>${Number((d.customerNotes || '').length)} / 1000 caracteres</small>${fieldError('customerNotes')}</label></div></section>`;
    if (logical === 2) return renderPlanStep();
    if (logical === 3) return renderPrimaryStep();
    if (logical === 4) return renderBackupStep();
    return renderActivationReview();
  }
  function renderPlanStep() {
    const d = draft(); const plan = planById(d.planId || state.device?.planId); const balance = balanceSummary(plan); const expiry = plan ? projectedExpiry(plan, d.expiresAt || '', false) : null;
    return `<section class="aw-pane">${topError()}<div class="aw-pane-title"><span class="aw-number">2</span><div><h3>Escolha o plano</h3><p>Você vê a duração, o custo e o saldo antes de confirmar.</p></div></div><div class="aw-grid"><label class="wide">Plano <strong>*</strong><select data-aw-field="planId">${planOptions(d.planId || '')}</select>${fieldError('planId')}</label><label class="wide">Validade personalizada <span class="muted">(opcional)</span><input type="date" data-aw-field="expiresAt" value="${esc(d.expiresAt || '')}"><small>Em branco, o painel usa a duração do plano e encerra às 23:59:59 de Brasília.</small>${fieldError('expiresAt')}</label></div>${plan ? `<div class="aw-summary-grid"><div><small>Duração</small><strong>${Number(plan.durationDays || 30)} dias</strong></div><div><small>Custo</small><strong>${balance.cost} crédito(s)</strong></div><div><small>Saldo atual</small><strong>${balance.before}</strong></div><div class="${balance.after < 0 ? 'danger' : ''}"><small>Saldo depois</small><strong>${balance.after}</strong></div></div><div class="aw-notice ${balance.after < 0 && !balance.canGoNegative ? 'err' : 'ok'}"><strong>${balance.after < 0 && !balance.canGoNegative ? 'Saldo insuficiente' : 'Validade prevista'}</strong><span>${balance.after < 0 && !balance.canGoNegative ? 'Escolha outro plano ou adicione créditos antes de continuar.' : `${formatDateTime(expiry)} · fim exato no fuso America/Sao_Paulo`}</span></div>` : '<div class="aw-empty">Escolha um plano para ver custo, saldo e validade.</div>'}</section>`;
  }
  function renderPrimaryStep() {
    const selected = playlistById(draft().playlistId || state.device?.playlistId);
    return `<section class="aw-pane">${topError()}<div class="aw-pane-title"><span class="aw-number">3</span><div><h3>Escolha a lista principal</h3><p>Você pode usar uma existente ou cadastrar uma nova sem sair desta tela.</p></div></div><div class="aw-picker-toolbar"><input data-aw-search="primary" value="${esc(state.search.primary)}" placeholder="Buscar lista por nome, servidor ou status" aria-label="Buscar lista principal"><button type="button" class="aw-new-list" data-aw-action="new-playlist" data-aw-field-target="playlistId"><strong>＋ Cadastrar nova lista</strong><span>O cadastro abre aqui mesmo.</span></button></div><label class="aw-select-fallback">Escolha rápida<select data-aw-field="playlistId">${playlistOptions(draft().playlistId || state.device?.playlistId || '')}</select>${fieldError('playlistId')}</label><div id="awPrimaryResults" class="aw-playlist-grid"></div>${selected ? qualificationNotice(selected) : ''}${state.watchId ? `<div class="aw-watch" aria-live="polite"><span class="aw-spinner"></span>${esc(state.watchText || 'Atualizando o status da lista…')}</div>` : ''}<div id="awInlinePlaylistHost" class="aw-inline-playlist-host"></div></section>`;
  }
  function renderBackupStep() {
    const d = draft(); const enabled = Boolean(d.useBackup || d.backupPlaylistId); const selected = enabled ? playlistById(d.backupPlaylistId || state.device?.backupPlaylistId) : null;
    return `<section class="aw-pane">${topError()}<div class="aw-pane-title"><span class="aw-number">4</span><div><h3>Deseja uma lista reserva?</h3><p>Ela só será usada quando a principal não estiver disponível.</p></div></div><label class="aw-choice-toggle"><input type="checkbox" data-aw-field="useBackup" ${enabled ? 'checked' : ''}><span><strong>Adicionar lista reserva</strong><small>Opcional. Deixe desligado se o cliente terá apenas uma lista.</small></span></label>${enabled ? `<div class="aw-picker-toolbar"><input data-aw-search="backup" value="${esc(state.search.backup)}" placeholder="Buscar lista reserva" aria-label="Buscar lista reserva"><button type="button" class="aw-new-list" data-aw-action="new-playlist" data-aw-field-target="backupPlaylistId"><strong>＋ Cadastrar nova reserva</strong><span>Sem sair da ativação.</span></button></div><label class="aw-select-fallback">Escolha rápida<select data-aw-field="backupPlaylistId">${playlistOptions(d.backupPlaylistId || state.device?.backupPlaylistId || '', 'Escolha a reserva')}</select>${fieldError('backupPlaylistId')}</label><div id="awBackupResults" class="aw-playlist-grid"></div>${selected ? qualificationNotice(selected) : ''}<div id="awInlinePlaylistHost" class="aw-inline-playlist-host"></div>` : '<div class="aw-notice ok"><strong>Sem reserva</strong><span>Nenhum campo adicional é necessário.</span></div>'}</section>`;
  }
  function renderPlaylistResults(role) {
    const host = $(role === 'primary' ? 'awPrimaryResults' : 'awBackupResults'); if (!host) return;
    const field = role === 'primary' ? 'playlistId' : 'backupPlaylistId'; const selected = draft()[field] || (role === 'primary' ? state.device?.playlistId : state.device?.backupPlaylistId) || ''; const term = String(state.search[role] || '').trim().toLowerCase();
    const rows = (state.data?.playlists || []).filter(item => lifecycleInfo(item).status !== 'archived' && (!term || [item.name, item.host, lifecycleInfo(item).label].join(' ').toLowerCase().includes(term)));
    host.innerHTML = rows.length ? rows.map(item => playlistCard(item, field, selected)).join('') : '<div class="aw-empty">Nenhuma lista encontrada com essa busca.</div>';
  }
  function playlistCard(item, field, selected) {
    const info = lifecycleInfo(item); const unavailable = playlistUnavailable(item); const chosen = String(item.id) === String(selected || ''); const host = item.host || item.primaryHost || 'Servidor identificado'; const items = Number(item.cacheItemCount || 0); const caps = ['android', 'lg', 'samsung'].map(platform => platformLabel(platform, platformStatus(item, platform)));
    return `<button type="button" class="aw-playlist-card ${chosen ? 'selected' : ''} ${unavailable ? 'unavailable' : ''}" data-aw-action="choose-playlist" data-aw-target-field="${field}" data-aw-playlist-id="${esc(item.id)}" ${unavailable ? 'disabled' : ''}><span class="aw-playlist-card-head"><strong>${esc(item.name)}</strong><span class="aw-status ${['ready_cache','confirmed_by_device'].includes(info.status) ? 'ok' : unavailable ? 'err' : 'warn'}">${esc(info.label)}</span></span><span class="aw-playlist-meta">${esc(host)} · ${items.toLocaleString('pt-BR')} item(ns)</span><span class="aw-platform-row">${caps.map(text => `<em>${esc(text)}</em>`).join('')}</span></button>`;
  }
  function qualificationNotice(playlist) {
    const info = lifecycleInfo(playlist); const tone = ['ready_cache','confirmed_by_device'].includes(info.status) ? 'ok' : playlistUnavailable(playlist) ? 'err' : 'warn'; const currentPlatform = platformLabel(devicePlatform(), platformStatus(playlist, devicePlatform())); const retry = info.status === 'device_failed' || info.status === 'blocked' ? `<button type="button" class="btn" data-aw-action="retry-playlist" data-aw-playlist-id="${esc(playlist.id)}">Tentar processar novamente</button>` : '';
    return `<div class="aw-notice ${tone}"><strong>${esc(info.label)}</strong><span>${esc(info.message)} · ${esc(currentPlatform)}</span>${retry}</div>`;
  }
  function choosePlaylist(field, playlistId) {
    const item = playlistById(playlistId); if (!field || !item || playlistUnavailable(item)) return;
    state.draft[field] = playlistId; delete state.errors[field]; state.topError = ''; clearAttempt(); render();
  }
  async function retryPlaylist(playlistId) {
    try { state.busy = true; render(); await panelApi(PLAYLIST_FUNCTION, { action: 'retry', playlistId }); state.busy = false; await refreshData(); render(); watchPlaylist(playlistId); }
    catch (error) { state.busy = false; state.topError = error.message || 'Não foi possível tentar novamente.'; render(); }
  }

  function renderActivationReview() {
    const d = draft(); const primary = playlistById(d.playlistId || state.device?.playlistId); const backup = d.useBackup === false ? null : playlistById(d.backupPlaylistId || state.device?.backupPlaylistId); const plan = planById(d.planId || state.device?.planId); const balance = balanceSummary(plan); const expiry = projectedExpiry(plan, d.expiresAt || '', false); const provisional = [primary, backup].filter(Boolean).some(item => platformStatus(item, devicePlatform()) === 'provisional');
    return `<section class="aw-pane">${topError()}<div class="aw-pane-title"><span class="aw-number">5</span><div><h3>Confira antes de ativar</h3><p>Nada será cobrado até você confirmar esta etapa.</p></div></div><div class="aw-review"><div><small>Cliente</small><strong>${esc(d.customerName || '—')}</strong><span>${esc(d.customerWhatsapp || '')}${d.customerNotes ? ` · ${esc(d.customerNotes)}` : ''}</span></div><div><small>Aparelho</small><strong>${esc(state.device?.deviceCode || '—')}</strong><span>${esc(state.device?.deviceType || 'Android')}</span></div><div><small>Plano</small><strong>${esc(plan?.name || '—')}</strong><span>${Number(plan?.durationDays || 30)} dias · ${balance.cost} crédito(s)</span></div><div><small>Validade</small><strong>${esc(formatDateTime(expiry))}</strong><span>Fim exato · America/Sao_Paulo</span></div><div><small>Lista principal</small><strong>${esc(primary?.name || '—')}</strong><span>${esc(primary?.host || '')} · ${esc(lifecycleInfo(primary).label)}</span></div><div><small>Lista reserva</small><strong>${esc(backup?.name || 'Não configurada')}</strong><span>${backup ? esc(lifecycleInfo(backup).label) : 'Opcional'}</span></div><div><small>Créditos</small><strong>${balance.before} → ${balance.after}</strong><span>Custo desta ativação: ${balance.cost}</span></div><div><small>Status da lista</small><strong>${provisional ? 'Confirmação automática no aparelho' : 'Confirmada'}</strong><span>${provisional ? 'O Android confirmará o acesso na primeira abertura.' : 'A lista já está confirmada para este aparelho.'}</span></div></div>${provisional ? '<div class="aw-notice warn"><strong>Ativação provisória</strong><span>Isso não exige homologação manual. O próprio aplicativo fará a confirmação.</span></div>' : '<div class="aw-notice ok"><strong>Pronto para ativar</strong><span>Cliente, plano, validade e listas serão gravados juntos em uma única transação.</span></div>'}<div id="awSubmitStatus" class="aw-submit-status" aria-live="polite"></div></section>`;
  }
  function renderRenewalPlan() {
    const d = draft(); const plan = planById(d.planId || state.device?.planId); const balance = balanceSummary(plan); const expiry = plan ? projectedExpiry(plan, d.expiresAt || '', true) : null; const last = recentRenewal(state.device?.id);
    return `<section class="aw-pane">${topError()}<div class="aw-pane-title"><span class="aw-number">1</span><div><h3>Plano e nova validade</h3><p>Cliente e listas não serão alterados.</p></div></div><div class="aw-grid"><label class="wide">Plano<select data-aw-field="planId">${planOptions(d.planId || state.device?.planId || '')}</select>${fieldError('planId')}</label><label class="wide">Validade personalizada <span class="muted">(opcional)</span><input type="date" data-aw-field="expiresAt" value="${esc(d.expiresAt || '')}"><small>Em branco, somamos a duração do plano à validade atual.</small>${fieldError('expiresAt')}</label></div>${plan ? `<div class="aw-summary-grid"><div><small>Duração</small><strong>${Number(plan.durationDays || 30)} dias</strong></div><div><small>Custo</small><strong>${balance.cost} crédito(s)</strong></div><div><small>Saldo</small><strong>${balance.before} → ${balance.after}</strong></div><div><small>Validade resultante</small><strong>${esc(formatDateTime(expiry))}</strong></div></div>` : ''}<div class="aw-renew-history"><div><small>Validade atual</small><strong>${esc(formatDateTime(state.device?.expiresAt))}</strong></div><div><small>Última renovação</small><strong>${last.entry ? esc(formatDateTime(last.entry.createdAt)) : 'Nenhuma renovação recente no extrato'}</strong></div></div>${last.recent ? `<label class="aw-confirm-danger"><input type="checkbox" data-aw-field="confirmRecentRenewal" ${d.confirmRecentRenewal ? 'checked' : ''}><span><strong>Este aparelho foi renovado há ${last.minutes} minuto(s).</strong><small>Confirmo que desejo consumir mais ${balance.cost} crédito(s) e ampliar novamente a validade.</small></span></label>${fieldError('confirmRecentRenewal')}` : '<div class="aw-notice ok"><strong>Renovação normal</strong><span>A nova validade e o débito só serão aplicados juntos.</span></div>'}</section>`;
  }
  function renderRenewalReview() {
    const d = draft(); const plan = planById(d.planId || state.device?.planId); const balance = balanceSummary(plan); const expiry = projectedExpiry(plan, d.expiresAt || '', true); const last = recentRenewal(state.device?.id);
    return `<section class="aw-pane">${topError()}<div class="aw-pane-title"><span class="aw-number">2</span><div><h3>Confira a renovação</h3><p>Veja exatamente o que muda e o que permanece igual.</p></div></div><div class="aw-review"><div><small>Aparelho</small><strong>${esc(state.device?.deviceCode || '—')}</strong><span>${esc(state.device?.customerName || '')}</span></div><div><small>Plano</small><strong>${esc(plan?.name || '—')}</strong><span>${Number(plan?.durationDays || 30)} dias · ${balance.cost} crédito(s)</span></div><div><small>Validade atual</small><strong>${esc(formatDateTime(state.device?.expiresAt))}</strong></div><div><small>Nova validade</small><strong>${esc(formatDateTime(expiry))}</strong><span>America/Sao_Paulo</span></div><div><small>Saldo</small><strong>${balance.before} → ${balance.after}</strong></div><div><small>Última renovação</small><strong>${last.entry ? esc(formatDateTime(last.entry.createdAt)) : '—'}</strong></div><div><small>Lista principal</small><strong>${esc(state.device?.playlistName || '—')}</strong><span>Preservada</span></div><div><small>Lista reserva</small><strong>${esc(state.device?.backupPlaylistName || 'Não configurada')}</strong><span>Preservada</span></div></div><div id="awSubmitStatus" class="aw-submit-status" aria-live="polite"></div></section>`;
  }
  function renderResult() {
    const ok = state.result?.ok !== false;
    return `<section class="aw-result ${ok ? 'ok' : 'err'}"><div class="aw-result-icon">${ok ? '✓' : '!'}</div><h3>${ok ? 'Operação concluída' : 'Não foi possível concluir'}</h3><p>${esc(state.result?.message || '')}</p>${state.result?.details ? `<small>${esc(state.result.details)}</small>` : ''}</section>`;
  }

  function validateStep() {
    syncInputs(); clearErrors(); const d = draft();
    if (state.mode === 'renewal') {
      if (state.step === 1) {
        if (!d.planId) invalidate('planId', 'Escolha um plano.');
        const plan = planById(d.planId); const balance = balanceSummary(plan);
        if (plan && balance.after < 0 && !balance.canGoNegative) invalidate('planId', 'Saldo insuficiente para este plano.');
        const recent = recentRenewal(state.device?.id); if (recent.recent && !d.confirmRecentRenewal) invalidate('confirmRecentRenewal', 'Confirme a renovação repetida para continuar.');
        const predicted = plan ? projectedExpiry(plan, d.expiresAt || '', true) : null;
        if (predicted && state.device?.expiresAt && new Date(predicted) <= new Date(state.device.expiresAt)) invalidate('expiresAt', 'A nova validade precisa ser posterior à validade atual.');
      }
    } else {
      const logical = state.mode === 'activation' ? state.step : state.step + 2;
      if (logical === 1) {
        if (!d.customerName?.trim()) invalidate('customerName', 'Informe o nome do cliente.');
        const phone = String(d.customerWhatsapp || '').replace(/\D/g, ''); if (phone.length < 10 || phone.length > 15) invalidate('customerWhatsapp', 'Informe DDD + número com 10 a 15 dígitos.');
        if (String(d.customerNotes || '').length > 1000) invalidate('customerNotes', 'Use no máximo 1000 caracteres.');
      }
      if (logical === 2) {
        if (!d.planId) invalidate('planId', 'Escolha um plano.');
        const plan = planById(d.planId); const balance = balanceSummary(plan); if (plan && balance.after < 0 && !balance.canGoNegative) invalidate('planId', 'Saldo insuficiente para este plano.');
      }
      if (logical === 3) {
        const item = playlistById(d.playlistId); if (!d.playlistId) invalidate('playlistId', 'Escolha a lista principal.'); else if (!item || playlistUnavailable(item)) invalidate('playlistId', 'Esta lista não está disponível para o tipo deste aparelho.');
      }
      if (logical === 4) {
        if (d.useBackup && !d.backupPlaylistId) invalidate('backupPlaylistId', 'Escolha a reserva ou desative essa opção.');
        const backup = d.backupPlaylistId ? playlistById(d.backupPlaylistId) : null; if (d.useBackup && backup && playlistUnavailable(backup)) invalidate('backupPlaylistId', 'Esta reserva não está disponível para este aparelho.');
        if (d.useBackup && d.playlistId === d.backupPlaylistId) invalidate('backupPlaylistId', 'A reserva precisa ser diferente da principal.');
      }
    }
    if (Object.keys(state.errors).length) {
      render(); setTimeout(() => document.querySelector('#activationWizard .aw-field-error')?.closest('label')?.querySelector('input,select,textarea')?.focus(), 0);
      throw new Error(state.topError || 'Corrija os campos indicados.');
    }
  }

  async function refreshData() {
    const [dashboard, official, universal] = await Promise.all([
      sellerApi('dashboard'), panelApi(PLAYLIST_FUNCTION, { action: 'list' }).catch(() => ({ playlists: [] })), panelApi(SOURCE_FUNCTION, { action: 'list' }).catch(() => ({ sources: [] })),
    ]);
    const officialById = new Map((official.playlists || []).map(item => [String(item.id), item]));
    const sourceById = new Map((universal.sources || []).map(source => { const endpoints = source.endpoints || []; const primary = endpoints.find(endpoint => endpoint.primary) || endpoints[0] || {}; return [String(source.id), { host: primary.host || null, endpointCount: endpoints.length }]; }));
    dashboard.playlists = (dashboard.playlists || []).map(item => ({ ...item, ...(officialById.get(String(item.id)) || {}), ...(sourceById.get(String(item.id)) || {}) }));
    for (const item of official.playlists || []) if (!dashboard.playlists.some(existing => String(existing.id) === String(item.id))) dashboard.playlists.push({ ...item, ...(sourceById.get(String(item.id)) || {}) });
    state.data = dashboard;
  }

  async function openActivation(deviceCode) {
    const code = String(deviceCode || '').trim().toUpperCase(); if (!code) throw new Error('Informe o código do aparelho.');
    const lookup = await sellerApi('lookupDeviceCode', { deviceCode: code }); if (!lookup.device?.canActivate) throw new Error(lookup.message || 'Este aparelho não pode ser ativado agora.');
    await refreshData(); resetFlow('activation', lookup.device, { customerName: lookup.device.customerName || '', customerWhatsapp: lookup.device.customerWhatsapp || '', customerNotes: '' });
  }
  async function openRenewal(deviceId) { await refreshData(); const device = (state.data.devices || []).find(item => String(item.id) === String(deviceId)); if (!device) throw new Error('Aparelho não encontrado.'); resetFlow('renewal', device, { planId: device.planId || '', expiresAt: '', confirmRecentRenewal: false }); }
  async function openChange(deviceId) { await refreshData(); const device = (state.data.devices || []).find(item => String(item.id) === String(deviceId)); if (!device) throw new Error('Aparelho não encontrado.'); resetFlow('change', device, { playlistId: device.playlistId || '', backupPlaylistId: device.backupPlaylistId || '', useBackup: Boolean(device.backupPlaylistId) }); }
  function resetFlow(mode, device, initialDraft) {
    stopWatch(); state.mode = mode; state.step = 1; state.maxReachable = 1; state.device = device; state.draft = initialDraft; state.busy = false; state.result = null; state.search = { primary: '', backup: '' }; state.watchText = ''; clearAttempt(); clearErrors(); ensureModal(); $('activationWizard').classList.add('open'); render(); setTimeout(() => $('activationWizardBody')?.querySelector('input,select,textarea')?.focus(), 0);
  }
  function close() { if (state.busy) return; stopWatch(); window.RonecaUniversalPlaylists?.close?.(); $('activationWizard')?.classList.remove('open'); state.busy = false; state.attempt = null; state.result = null; }

  async function newPlaylist(field) {
    if (!field) return; syncInputs(); const host = $('awInlinePlaylistHost'); if (!host) return; const api = window.RonecaUniversalPlaylists;
    if (!api?.openInline) { state.topError = 'O cadastro universal ainda está carregando. Aguarde alguns segundos e tente novamente.'; render(); return; }
    await api.openInline(host, { onSaved: async result => { await refreshData(); state.draft[field] = result.playlistId; clearAttempt(); setTimeout(() => { render(); watchPlaylist(result.playlistId); }, 0); }, onClose: () => setTimeout(render, 0) });
  }
  async function watchPlaylist(playlistId) {
    stopWatch(); state.watchId = playlistId; let attempts = 0;
    const tick = async () => {
      attempts += 1;
      try {
        const result = await panelApi(PLAYLIST_FUNCTION, { action: 'status', playlistId }); const current = playlistById(playlistId); if (current && result.playlist) Object.assign(current, result.playlist); const info = lifecycleInfo(result.playlist || current);
        state.watchText = ['ready_cache','confirmed_by_device'].includes(info.status) ? 'Lista pronta. Você pode continuar.' : playlistUnavailable(result.playlist || current) ? info.message : 'Lista salva. O cache continua em segundo plano; no Android você já pode continuar provisoriamente.';
        if ($('activationWizard')?.classList.contains('open')) render();
        if (['ready_cache','confirmed_by_device','device_failed','blocked','archived'].includes(info.status) || attempts >= 12) { stopWatch(); return; }
      } catch { state.watchText = 'Não foi possível atualizar o status agora. Você pode tentar novamente.'; if ($('activationWizard')?.classList.contains('open')) render(); }
      state.watchTimer = setTimeout(tick, 2000);
    };
    tick();
  }

  function go(step) {
    if (state.busy || state.result) return; const target = Math.max(1, Math.min(Number(step || 1), steps().length)); if (target > state.maxReachable) return;
    try { if (target > state.step) validateStep(); else syncInputs(); state.step = target; render(); } catch { /* validateStep já desenhou os erros */ }
  }
  function back() { if (state.busy) return; syncInputs(); clearErrors(); state.step = Math.max(1, state.step - 1); render(); }
  function next() { if (state.busy) return; try { validateStep(); state.maxReachable = Math.max(state.maxReachable, Math.min(steps().length, state.step + 1)); state.step += 1; render(); setTimeout(() => $('activationWizardBody')?.querySelector('input,select,textarea,button')?.focus(), 0); } catch { /* erros já visíveis */ } }

  async function submit() {
    try {
      validateStep(); if (state.busy) return; state.busy = true; syncInputs(); render();
      const d = draft(); const backup = d.useBackup === false ? null : (d.backupPlaylistId || null); let action; let payload;
      if (state.mode === 'activation') { action = 'activate'; payload = { deviceId: state.device.id, customerName: d.customerName.trim(), customerWhatsapp: d.customerWhatsapp.trim(), customerNotes: String(d.customerNotes || '').trim() || null, planId: d.planId, playlistId: d.playlistId, backupPlaylistId: backup, expiresAt: d.expiresAt ? customExpiryIso(d.expiresAt) : null }; }
      else if (state.mode === 'renewal') { action = 'renew'; payload = { deviceId: state.device.id, planId: d.planId, expiresAt: d.expiresAt ? customExpiryIso(d.expiresAt) : null }; }
      else { action = 'changePlaylists'; payload = { deviceId: state.device.id, playlistId: d.playlistId, backupPlaylistId: backup, reason: 'Alteração pelo fluxo comercial do vendedor' }; }
      const result = await flowApi(action, { ...payload, idempotencyKey: stableKey(action, payload) }); state.attempt = null;
      state.result = { ok: true, message: result.message || 'Operação concluída.', details: result.result?.confirmationStatus === 'awaiting_app_confirmation' ? 'O aplicativo fará a confirmação automática da lista.' : '' };
      state.busy = false; render(); await window.loadPortal?.(); await window.RonecaSellerPortal?.refresh?.(); setTimeout(close, 900);
    } catch (error) { state.busy = false; state.result = null; state.topError = error.message || 'Não foi possível concluir. Seus dados foram preservados; corrija o problema e tente novamente.'; render(); }
  }

  window.RonecaSellerDeviceFlowUI = Object.freeze({ openActivation, openRenewal, openChange, close });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureModal, { once: true }); else ensureModal();
})();
