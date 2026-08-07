(() => {
  'use strict';
  if (window.__ronecaSellerDeviceFlowUiInstalled) return;
  window.__ronecaSellerDeviceFlowUiInstalled = true;

  const DATA_FUNCTION = 'seller-panel';
  const FLOW_FUNCTION = 'seller-device-flow';
  const PLAYLIST_FUNCTION = 'playlist-registration';
  const state = { mode: 'activation', step: 1, data: null, device: null, draft: {}, busy: false, attempt: null };
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');

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
  const planById = id => (state.data?.plans || []).find(item => item.id === id) || null;
  const playlistById = id => (state.data?.playlists || []).find(item => item.id === id) || null;

  function newKey(prefix) { return `${prefix}:${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`; }
  function stableKey(action, payload) {
    const fingerprint = JSON.stringify({ action, ...payload });
    if (state.attempt?.fingerprint === fingerprint) return state.attempt.key;
    state.attempt = { fingerprint, key: newKey(`seller-${action}`) };
    return state.attempt.key;
  }
  function clearAttempt() { state.attempt = null; }

  function lifecycleInfo(item) {
    if (!item) return { status: 'generating_cache', label: 'Gerando cache', message: 'O servidor está processando a lista.', platforms: {} };
    const technical = String(item.qualificationStatus || 'validating');
    const code = String(item.qualificationCode || item.cacheErrorCode || '');
    const cacheStatus = String(item.cacheStatus || 'missing');
    const cacheReady = cacheStatus === 'ready' && Number(item.cacheItemCount || 0) > 0;
    let status = String(item.lifecycleStatus || '');
    if (!status) {
      if (item.active === false) status = 'archived';
      else if (technical === 'blocked' || item.accessMode === 'blocked') status = 'blocked';
      else if (cacheReady || technical === 'ready_cache') status = 'ready_cache';
      else if (code === 'DEVICE_TEST_FAILED') status = 'device_failed';
      else if (technical === 'ready_direct') status = 'confirmed_by_device';
      else if (technical === 'awaiting_device_test' || technical === 'retryable_error') status = 'awaiting_device_confirmation';
      else if (technical === 'validating' && cacheStatus === 'missing') status = 'saving';
      else status = 'generating_cache';
    }
    const labels = {
      saving: 'Salvando',
      generating_cache: 'Gerando cache',
      ready_cache: 'Pronta com cache',
      awaiting_device_confirmation: 'Aguardando confirmação no aparelho',
      confirmed_by_device: 'Confirmada pelo aparelho',
      device_failed: 'Falhou no aparelho',
      blocked: 'Bloqueada',
      archived: 'Arquivada',
    };
    const messages = {
      saving: 'O cadastro da lista ainda está sendo processado.',
      generating_cache: 'O servidor está tentando autenticar a origem e gerar o cache.',
      ready_cache: 'O cache foi gerado e a lista está pronta nas plataformas compatíveis.',
      awaiting_device_confirmation: 'O servidor não confirmou a origem. No Android, ela pode ser ativada provisoriamente.',
      confirmed_by_device: 'Um aparelho Android abriu o conteúdo e confirmou esta lista.',
      device_failed: 'O aparelho tentou esta lista e não confirmou o acesso. Revise os dados ou tente novamente antes de uma nova ativação.',
      blocked: 'A origem precisa ser corrigida antes de uma nova ativação.',
      archived: 'A lista foi arquivada e não aparece em novas ativações.',
    };
    return {
      status,
      label: item.lifecycleLabel || item.qualificationLabel || labels[status] || labels.generating_cache,
      message: item.lifecycleMessage || item.qualificationMessage || messages[status] || messages.generating_cache,
      platforms: item.platformCapabilities || {},
    };
  }

  function playlistLabel(item) {
    if (!item) return 'Escolha uma lista';
    return `${item.name} · ${lifecycleInfo(item).label}`;
  }

  function playlistUnavailable(item) {
    const info = lifecycleInfo(item);
    return info.status === 'blocked' || info.status === 'device_failed';
  }

  function playlistOptions(selected = '', empty = 'Escolha uma lista') {
    return `<option value="">${esc(empty)}</option>` + (state.data?.playlists || [])
      .filter(item => lifecycleInfo(item).status !== 'archived')
      .map(item => `<option value="${esc(item.id)}" ${item.id === selected ? 'selected' : ''} ${playlistUnavailable(item) ? 'disabled' : ''}>${esc(playlistLabel(item))}</option>`).join('');
  }

  function planOptions(selected = '') {
    return '<option value="">Escolha um plano</option>' + (state.data?.plans || []).map(item => `<option value="${esc(item.id)}" ${item.id === selected ? 'selected' : ''}>${esc(item.name)} · ${Number(item.creditCost || 1)} crédito(s)</option>`).join('');
  }

  function qualificationNotice(id) {
    const playlist = playlistById(id);
    if (!playlist) return '';
    const info = lifecycleInfo(playlist);
    const tone = ['ready_cache','confirmed_by_device'].includes(info.status) ? 'ok'
      : ['blocked','device_failed'].includes(info.status) ? 'err' : 'warn';
    const android = info.platforms.android === 'provisional' ? ' · Android: ativação provisória'
      : info.platforms.android === 'available' ? ' · Android: disponível'
      : info.platforms.android === 'blocked' ? ' · Android: bloqueada' : '';
    return `<div class="aw-notice ${tone}"><strong>${esc(info.label)}</strong><span>${esc(info.message)}${esc(android)}</span></div>`;
  }

  function ensureModal() {
    if ($('activationWizard')) return;
    const root = document.createElement('div');
    root.id = 'activationWizard'; root.className = 'activation-wizard';
    root.innerHTML = `<div class="activation-wizard-card" role="dialog" aria-modal="true" aria-labelledby="activationWizardTitle"><header class="activation-wizard-head"><div><span class="activation-wizard-kicker">Fluxo comercial</span><h2 id="activationWizardTitle"></h2><p id="activationWizardSubtitle"></p></div><button type="button" class="btn" data-aw-action="close" aria-label="Fechar">×</button></header><nav id="activationWizardSteps" class="activation-wizard-steps"></nav><main id="activationWizardBody" class="activation-wizard-body"></main><footer id="activationWizardFooter" class="activation-wizard-footer"></footer></div>`;
    root.addEventListener('click', event => {
      if (event.target === root) return close();
      const action = event.target.closest('[data-aw-action]')?.dataset.awAction;
      if (!action) return;
      if (action === 'close') close(); else if (action === 'back') back(); else if (action === 'next') next(); else if (action === 'submit') submit(); else if (action === 'toggle-backup') toggleBackup(event.target.checked); else if (action === 'new-playlist') newPlaylist(event.target.closest('[data-aw-field-target]')?.dataset.awFieldTarget); else if (action === 'step') go(Number(event.target.closest('[data-aw-step]')?.dataset.awStep || 1));
    });
    document.body.appendChild(root);
  }

  function steps() { if (state.mode === 'renewal') return ['Plano', 'Confirmar']; if (state.mode === 'change') return ['Lista', 'Reserva', 'Confirmar']; return ['Cliente', 'Plano', 'Lista', 'Reserva', 'Confirmar']; }
  function syncInputs() { document.querySelectorAll('#activationWizard [data-aw-field]').forEach(input => { state.draft[input.dataset.awField] = input.type === 'checkbox' ? input.checked : input.value; }); }

  function render() {
    ensureModal(); const labels = steps(); state.step = Math.min(Math.max(1, state.step), labels.length);
    $('activationWizardTitle').textContent = state.mode === 'activation' ? 'Ativar aparelho' : state.mode === 'renewal' ? 'Renovar aparelho' : 'Alterar listas';
    $('activationWizardSubtitle').textContent = state.mode === 'activation' ? `${state.device?.deviceCode || ''} · cliente, plano e listas em uma única confirmação` : state.mode === 'renewal' ? `${state.device?.deviceCode || ''} · cliente e listas serão preservados` : `${state.device?.deviceCode || ''} · sem crédito, plano ou validade`;
    $('activationWizardSteps').style.gridTemplateColumns = `repeat(${labels.length}, minmax(0,1fr))`;
    $('activationWizardSteps').innerHTML = labels.map((label, index) => { const number = index + 1; return `<button type="button" class="aw-step ${number === state.step ? 'active' : ''} ${number < state.step ? 'done' : ''}" data-aw-action="step" data-aw-step="${number}"><span>${number < state.step ? '✓' : number}</span>${esc(label)}</button>`; }).join('');
    $('activationWizardBody').innerHTML = renderStep();
    $('activationWizardFooter').innerHTML = `${state.step > 1 ? '<button type="button" class="btn" data-aw-action="back">Voltar</button>' : '<span></span>'}<div class="aw-footer-actions"><button type="button" class="btn" data-aw-action="close">Cancelar</button>${state.step < labels.length ? '<button type="button" class="btn primary" data-aw-action="next">Continuar</button>' : `<button type="button" class="btn primary" data-aw-action="submit">${state.mode === 'activation' ? 'Ativar aparelho' : state.mode === 'renewal' ? 'Renovar aparelho' : 'Salvar novas listas'}</button>`}</div>`;
  }

  function renderStep() {
    const d = draft();
    if (state.mode === 'renewal') {
      if (state.step === 1) return `<section class="aw-pane"><h3>Plano e nova validade</h3><p>A renovação não recebe campos de cliente ou lista.</p><div class="aw-grid"><label>Plano<select data-aw-field="planId">${planOptions(d.planId || state.device?.planId || '')}</select></label><label>Validade personalizada <span class="muted">(opcional)</span><input type="date" data-aw-field="expiresAt" value="${esc(d.expiresAt || '')}"></label></div><div class="aw-notice ok"><strong>Listas preservadas</strong><span>${esc(state.device?.playlistName || 'Lista principal atual')} · reserva: ${esc(state.device?.backupPlaylistName || 'não configurada')}</span></div></section>`;
      const plan = planById(d.planId || state.device?.planId);
      return `<section class="aw-pane"><h3>Confira a renovação</h3><div class="aw-review"><div><small>Aparelho</small><strong>${esc(state.device?.deviceCode || '—')}</strong><span>${esc(state.device?.customerName || '')}</span></div><div><small>Plano</small><strong>${esc(plan?.name || '—')}</strong><span>${Number(plan?.creditCost || 0)} crédito(s)</span></div><div><small>Validade</small><strong>${d.expiresAt ? esc(d.expiresAt) : 'Automática pelo plano'}</strong><span>Será ampliada pelo backend</span></div><div><small>Listas</small><strong>${esc(state.device?.playlistName || '—')}</strong><span>Reserva: ${esc(state.device?.backupPlaylistName || 'não configurada')}</span></div></div><div id="awSubmitStatus" class="aw-submit-status"></div></section>`;
    }
    const logical = state.mode === 'activation' ? state.step : state.step + 2;
    if (logical === 1) return `<section class="aw-pane"><h3>Quem vai usar o aparelho?</h3><div class="aw-grid"><label>Nome do cliente<input data-aw-field="customerName" value="${esc(d.customerName || state.device?.customerName || '')}" placeholder="Ex: João Silva"></label><label>WhatsApp<input data-aw-field="customerWhatsapp" value="${esc(d.customerWhatsapp || state.device?.customerWhatsapp || '')}" placeholder="Ex: 19999999999"></label></div></section>`;
    if (logical === 2) return `<section class="aw-pane"><h3>Plano da ativação</h3><p>O custo é debitado apenas quando toda a transação for concluída.</p><div class="aw-grid"><label>Plano<select data-aw-field="planId">${planOptions(d.planId || state.device?.planId || '')}</select></label><label>Validade personalizada <span class="muted">(opcional)</span><input type="date" data-aw-field="expiresAt" value="${esc(d.expiresAt || '')}"></label></div></section>`;
    if (logical === 3) return `<section class="aw-pane"><h3>Lista principal</h3><div class="aw-list-choice"><label>Lista<select data-aw-field="playlistId">${playlistOptions(d.playlistId || state.device?.playlistId || '')}</select></label><button type="button" class="aw-new-list" data-aw-action="new-playlist" data-aw-field-target="playlistId"><strong>＋ Cadastrar nova lista</strong><span>Use o cadastro universal.</span></button></div>${qualificationNotice(d.playlistId || state.device?.playlistId)}</section>`;
    if (logical === 4) return `<section class="aw-pane"><h3>Lista reserva</h3><p>A reserva é opcional.</p><label class="aw-switch"><input type="checkbox" data-aw-field="useBackup" data-aw-action="toggle-backup" ${d.useBackup || d.backupPlaylistId || state.device?.backupPlaylistId ? 'checked' : ''}><span>Adicionar lista reserva</span></label><div id="awBackupArea" ${d.useBackup || d.backupPlaylistId || state.device?.backupPlaylistId ? '' : 'hidden'}><div class="aw-list-choice"><label>Reserva<select data-aw-field="backupPlaylistId">${playlistOptions(d.backupPlaylistId || state.device?.backupPlaylistId || '', 'Escolha a reserva')}</select></label><button type="button" class="aw-new-list" data-aw-action="new-playlist" data-aw-field-target="backupPlaylistId"><strong>＋ Cadastrar nova reserva</strong><span>Use o cadastro universal.</span></button></div>${qualificationNotice(d.backupPlaylistId || state.device?.backupPlaylistId)}</div></section>`;
    const primary = playlistById(d.playlistId || state.device?.playlistId); const backup = d.useBackup === false ? null : playlistById(d.backupPlaylistId || state.device?.backupPlaylistId); const plan = planById(d.planId || state.device?.planId);
    return `<section class="aw-pane"><h3>Confira antes de concluir</h3><div class="aw-review">${state.mode === 'activation' ? `<div><small>Cliente</small><strong>${esc(d.customerName || '—')}</strong><span>${esc(d.customerWhatsapp || '')}</span></div><div><small>Plano</small><strong>${esc(plan?.name || '—')}</strong><span>${Number(plan?.creditCost || 0)} crédito(s)</span></div>` : ''}<div><small>Lista principal</small><strong>${esc(primary?.name || '—')}</strong><span>${esc(playlistLabel(primary))}</span></div><div><small>Lista reserva</small><strong>${esc(backup?.name || 'Não configurada')}</strong><span>${backup ? esc(playlistLabel(backup)) : 'Opcional'}</span></div></div><div class="aw-notice ${state.mode === 'change' ? 'ok' : 'warn'}"><strong>${state.mode === 'change' ? 'Sem cobrança' : 'Transação única'}</strong><span>${state.mode === 'change' ? 'Plano, validade e cliente não serão alterados.' : 'Crédito, cliente, plano, validade e listas só serão confirmados juntos.'}</span></div><div id="awSubmitStatus" class="aw-submit-status"></div></section>`;
  }

  function validateStep() {
    syncInputs(); const d = draft();
    if (state.mode === 'renewal') { if (!d.planId) throw new Error('Escolha um plano.'); return; }
    const logical = state.mode === 'activation' ? state.step : state.step + 2;
    if (logical === 1 && (!d.customerName?.trim() || d.customerWhatsapp?.replace(/\D/g, '').length < 10)) throw new Error('Informe nome e WhatsApp do cliente.');
    if (logical === 2 && !d.planId) throw new Error('Escolha um plano.');
    if (logical === 3 && !d.playlistId) throw new Error('Escolha a lista principal.');
    if (logical === 3 && playlistUnavailable(playlistById(d.playlistId))) throw new Error('Esta lista está bloqueada para novas ativações. Revise o estado ou tente o cache novamente.');
    if (logical === 4 && d.useBackup && !d.backupPlaylistId) throw new Error('Escolha a reserva ou desative essa opção.');
    if (logical === 4 && d.useBackup && playlistUnavailable(playlistById(d.backupPlaylistId))) throw new Error('A lista reserva está bloqueada para novas ativações.');
    if (d.playlistId && d.playlistId === d.backupPlaylistId) throw new Error('As listas principal e reserva precisam ser diferentes.');
  }

  async function refreshData() {
    const [dashboard, official] = await Promise.all([
      sellerApi('dashboard'),
      panelApi(PLAYLIST_FUNCTION, { action: 'list' }).catch(() => ({ playlists: [] })),
    ]);
    const officialById = new Map((official.playlists || []).map(item => [String(item.id), item]));
    dashboard.playlists = (dashboard.playlists || []).map(item => ({ ...item, ...(officialById.get(String(item.id)) || {}) }));
    state.data = dashboard;
  }

  async function openActivation(deviceCode) {
    const code = String(deviceCode || '').trim().toUpperCase(); if (!code) throw new Error('Informe o código do aparelho.');
    const lookup = await sellerApi('lookupDeviceCode', { deviceCode: code });
    if (!lookup.device?.canActivate) throw new Error(lookup.message || 'Este aparelho não pode ser ativado agora.');
    await refreshData(); state.mode = 'activation'; state.step = 1; state.device = lookup.device; state.draft = { customerName: lookup.device.customerName || '', customerWhatsapp: lookup.device.customerWhatsapp || '' }; state.busy = false; clearAttempt(); ensureModal(); $('activationWizard').classList.add('open'); render();
  }
  async function openRenewal(deviceId) { await refreshData(); const device = (state.data.devices || []).find(item => item.id === deviceId); if (!device) throw new Error('Aparelho não encontrado.'); state.mode = 'renewal'; state.step = 1; state.device = device; state.draft = { planId: device.planId || '', expiresAt: '' }; state.busy = false; clearAttempt(); ensureModal(); $('activationWizard').classList.add('open'); render(); }
  async function openChange(deviceId) { await refreshData(); const device = (state.data.devices || []).find(item => item.id === deviceId); if (!device) throw new Error('Aparelho não encontrado.'); state.mode = 'change'; state.step = 1; state.device = device; state.draft = { playlistId: device.playlistId || '', backupPlaylistId: device.backupPlaylistId || '', useBackup: Boolean(device.backupPlaylistId) }; state.busy = false; clearAttempt(); ensureModal(); $('activationWizard').classList.add('open'); render(); }
  function close() { $('activationWizard')?.classList.remove('open'); state.busy = false; state.attempt = null; }

  async function newPlaylist(field) {
    if (!field) return; syncInputs(); const before = new Set((state.data?.playlists || []).map(item => item.id));
    if (!window.RonecaUniversalPlaylists?.open) throw new Error('O cadastro universal ainda está carregando.');
    window.RonecaUniversalPlaylists.open(); const modal = $('uplModal'); if (!modal) return;
    const observer = new MutationObserver(async () => { if (modal.classList.contains('open')) return; observer.disconnect(); try { await refreshData(); const created = (state.data.playlists || []).find(item => !before.has(item.id)); if (created) state.draft[field] = created.id; clearAttempt(); render(); } catch (error) { alert(error.message); } });
    observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
  }
  function toggleBackup(enabled) { syncInputs(); state.draft.useBackup = Boolean(enabled); if (!enabled) state.draft.backupPlaylistId = ''; clearAttempt(); render(); }
  function go(step) { try { if (step > state.step) validateStep(); else syncInputs(); state.step = Math.max(1, Math.min(step, steps().length)); render(); } catch (error) { alert(error.message); } }
  function back() { syncInputs(); state.step = Math.max(1, state.step - 1); render(); }
  function next() { validateStep(); state.step += 1; render(); }

  async function submit() {
    try {
      validateStep(); if (state.busy) return; state.busy = true; syncInputs(); const d = draft(); const backup = d.useBackup === false ? null : (d.backupPlaylistId || null); const status = $('awSubmitStatus'); if (status) status.textContent = 'Processando uma única transação…';
      let action; let payload;
      if (state.mode === 'activation') { action = 'activate'; payload = { deviceId: state.device.id, customerName: d.customerName.trim(), customerWhatsapp: d.customerWhatsapp.trim(), planId: d.planId, playlistId: d.playlistId, backupPlaylistId: backup, expiresAt: d.expiresAt ? new Date(`${d.expiresAt}T23:59:59.999Z`).toISOString() : null }; }
      else if (state.mode === 'renewal') { action = 'renew'; payload = { deviceId: state.device.id, planId: d.planId, expiresAt: d.expiresAt ? new Date(`${d.expiresAt}T23:59:59.999Z`).toISOString() : null }; }
      else { action = 'changePlaylists'; payload = { deviceId: state.device.id, playlistId: d.playlistId, backupPlaylistId: backup, reason: 'Alteração pelo fluxo comercial do vendedor' }; }
      const result = await flowApi(action, { ...payload, idempotencyKey: stableKey(action, payload) });
      if (status) status.textContent = result.message || 'Operação concluída.'; state.attempt = null; await window.loadPortal?.(); await window.RonecaSellerPortal?.refresh?.(); setTimeout(close, 350);
    } catch (error) { const status = $('awSubmitStatus'); if (status) status.textContent = error.message || 'Não foi possível concluir.'; else alert(error.message || 'Não foi possível concluir.'); }
    finally { state.busy = false; }
  }

  window.RonecaSellerDeviceFlowUI = Object.freeze({ openActivation, openRenewal, openChange, close });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureModal, { once: true }); else ensureModal();
})();
