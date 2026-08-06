(() => {
  'use strict';
  if (window.__sellerActivationWizardInstalled) return;
  window.__sellerActivationWizardInstalled = true;

  const SELLER_API = 'https://awauvkjkucjqulkklmuo.supabase.co/functions/v1/seller-panel';
  const FLOW_FUNCTION = 'seller-device-flow';
  const TOKEN_KEY = 'roneca_seller_token';
  const state = { mode: 'activation', step: 1, data: null, device: null, targetField: null, busy: false };
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

  async function sellerApi(action, payload = {}) {
    const response = await fetch(SELLER_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-seller-token': sessionStorage.getItem(TOKEN_KEY) || '' },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || 'Falha no portal do vendedor.');
    return data;
  }

  async function flowApi(action, payload = {}) {
    if (!window.RonecaPanelAuth) throw new Error('Sessão do painel não encontrada. Entre novamente.');
    const accessToken = await window.RonecaPanelAuth.getAccessToken();
    const config = window.RONECA_PANEL_CONFIG || {};
    const base = String(config.supabaseUrl || 'https://awauvkjkucjqulkklmuo.supabase.co').replace(/\/$/, '');
    const response = await fetch(`${base}/functions/v1/${FLOW_FUNCTION}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...(config.anonKey ? { apikey: config.anonKey } : {}),
      },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || 'Falha na operação.');
    return data;
  }

  function key(prefix) {
    return `${prefix}:${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  }

  function planById(id) { return (state.data?.plans || []).find(item => item.id === id) || null; }
  function playlistById(id) { return (state.data?.playlists || []).find(item => item.id === id) || null; }
  function playlistLabel(item) {
    if (!item) return 'Escolha uma lista';
    const status = item.qualificationStatus || 'validating';
    const suffix = status === 'ready_cache' ? 'Cache pronto'
      : status === 'ready_direct' ? 'Confirmada no aparelho'
      : status === 'blocked' ? 'Bloqueada'
      : 'Confirmação no app';
    return `${item.name} · ${suffix}`;
  }
  function playlistOptions(selected = '', empty = 'Escolha uma lista') {
    return `<option value="">${esc(empty)}</option>` + (state.data?.playlists || []).map(item =>
      `<option value="${esc(item.id)}" ${item.id === selected ? 'selected' : ''} ${item.qualificationStatus === 'blocked' ? 'disabled' : ''}>${esc(playlistLabel(item))}</option>`
    ).join('');
  }
  function planOptions(selected = '') {
    return '<option value="">Escolha um plano</option>' + (state.data?.plans || []).map(item =>
      `<option value="${esc(item.id)}" ${item.id === selected ? 'selected' : ''}>${esc(item.name)} · ${Number(item.creditCost || 1)} crédito(s)</option>`
    ).join('');
  }

  function ensureModal() {
    if ($('activationWizard')) return;
    const root = document.createElement('div');
    root.id = 'activationWizard';
    root.className = 'activation-wizard';
    root.innerHTML = `
      <div class="activation-wizard-card" role="dialog" aria-modal="true" aria-labelledby="activationWizardTitle">
        <header class="activation-wizard-head">
          <div><span class="activation-wizard-kicker">Assistente de ativação</span><h2 id="activationWizardTitle">Ativar aparelho</h2><p id="activationWizardSubtitle"></p></div>
          <button type="button" class="btn" onclick="sellerActivationWizardClose()" aria-label="Fechar">×</button>
        </header>
        <nav id="activationWizardSteps" class="activation-wizard-steps"></nav>
        <main id="activationWizardBody" class="activation-wizard-body"></main>
        <footer id="activationWizardFooter" class="activation-wizard-footer"></footer>
      </div>`;
    root.addEventListener('click', event => { if (event.target === root) close(); });
    document.body.appendChild(root);
  }

  function steps() {
    return state.mode === 'activation'
      ? ['Cliente', 'Plano', 'Lista', 'Reserva', 'Confirmar']
      : ['Lista', 'Reserva', 'Confirmar'];
  }
  function draft() {
    if (!state.draft) state.draft = {};
    return state.draft;
  }
  function syncInputs() {
    document.querySelectorAll('#activationWizard [data-aw-field]').forEach(input => {
      const name = input.dataset.awField;
      if (input.type === 'checkbox') draft()[name] = input.checked;
      else draft()[name] = input.value;
    });
  }
  function expiryIso() {
    const value = draft().expiresAt;
    if (value) return new Date(`${value}T23:59:59.999Z`).toISOString();
    const plan = planById(draft().planId);
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + Math.max(1, Number(plan?.durationDays || 30)));
    date.setUTCHours(23,59,59,999);
    return date.toISOString();
  }
  function qualificationNotice(id) {
    const playlist = playlistById(id);
    if (!playlist) return '';
    if (['ready_cache','ready_direct'].includes(playlist.qualificationStatus)) {
      return '<div class="aw-notice ok"><strong>Pronta para uso</strong><span>O painel já confirmou esta lista.</span></div>';
    }
    return '<div class="aw-notice warn"><strong>Ativação provisória</strong><span>O aparelho será liberado e o aplicativo confirmará esta lista na primeira abertura.</span></div>';
  }

  function render() {
    ensureModal();
    const allSteps = steps();
    state.step = Math.min(Math.max(1, state.step), allSteps.length);
    $('activationWizardTitle').textContent = state.mode === 'activation' ? 'Ativar aparelho' : 'Alterar listas';
    $('activationWizardSubtitle').textContent = state.mode === 'activation'
      ? `${state.device?.deviceCode || ''} · apenas o próximo passo aparece na tela`
      : `${state.device?.deviceCode || ''} · sem renovar validade e sem consumir crédito`;
    $('activationWizardSteps').innerHTML = allSteps.map((label, index) => {
      const number = index + 1;
      return `<button type="button" class="aw-step ${number === state.step ? 'active' : ''} ${number < state.step ? 'done' : ''}" onclick="sellerActivationWizardGo(${number})"><span>${number < state.step ? '✓' : number}</span>${esc(label)}</button>`;
    }).join('');
    $('activationWizardBody').innerHTML = renderStep();
    $('activationWizardFooter').innerHTML = `
      ${state.step > 1 ? '<button type="button" class="btn" onclick="sellerActivationWizardBack()">Voltar</button>' : '<span></span>'}
      <div class="aw-footer-actions">
        <button type="button" class="btn" onclick="sellerActivationWizardClose()">Cancelar</button>
        ${state.step < allSteps.length
          ? '<button type="button" class="btn primary" onclick="sellerActivationWizardNext()">Continuar</button>'
          : `<button type="button" class="btn primary" onclick="sellerActivationWizardSubmit()">${state.mode === 'activation' ? 'Ativar aparelho' : 'Salvar novas listas'}</button>`}
      </div>`;
  }

  function renderStep() {
    const d = draft();
    const offset = state.mode === 'activation' ? 0 : 2;
    const logical = state.step + offset;
    if (logical === 1) return `<section class="aw-pane"><h3>Quem vai usar o aparelho?</h3><p>Somente os dados essenciais. O WhatsApp ajuda a localizar e atender o cliente.</p><div class="aw-grid"><label>Nome do cliente<input data-aw-field="customerName" value="${esc(d.customerName || state.device?.customerName || '')}" placeholder="Ex: João Silva"></label><label>WhatsApp<input data-aw-field="customerWhatsapp" value="${esc(d.customerWhatsapp || state.device?.customerWhatsapp || '')}" placeholder="Ex: 19999999999"></label></div></section>`;
    if (logical === 2) return `<section class="aw-pane"><h3>Qual plano será usado?</h3><p>O custo fica visível antes da confirmação.</p><div class="aw-grid"><label>Plano<select data-aw-field="planId">${planOptions(d.planId || state.device?.planId || '')}</select></label><label>Validade personalizada <span class="muted">(opcional)</span><input type="date" data-aw-field="expiresAt" value="${esc(d.expiresAt || '')}"></label></div><div id="awPlanSummary" class="aw-summary-line">O plano escolhido definirá a validade e o consumo de créditos.</div></section>`;
    if (logical === 3) return `<section class="aw-pane"><h3>Escolha a lista principal</h3><p>Use uma lista já cadastrada ou abra o cadastro universal sem sair da ativação.</p><div class="aw-list-choice"><label>Lista existente<select id="awPrimaryPlaylist" data-aw-field="playlistId">${playlistOptions(d.playlistId || state.device?.playlistId || '')}</select></label><button type="button" class="aw-new-list" onclick="sellerActivationWizardNewPlaylist('playlistId')"><strong>＋ Cadastrar nova lista</strong><span>Cole a mensagem completa, M3U, HLS ou Xtream.</span></button></div>${qualificationNotice(d.playlistId || state.device?.playlistId)}</section>`;
    if (logical === 4) return `<section class="aw-pane"><h3>Deseja uma lista reserva?</h3><p>A reserva é opcional e só aparece quando você decide usar.</p><label class="aw-switch"><input type="checkbox" data-aw-field="useBackup" ${d.useBackup || d.backupPlaylistId || state.device?.backupPlaylistId ? 'checked' : ''} onchange="sellerActivationWizardToggleBackup(this.checked)"><span>Adicionar lista reserva</span></label><div id="awBackupArea" ${d.useBackup || d.backupPlaylistId || state.device?.backupPlaylistId ? '' : 'hidden'}><div class="aw-list-choice"><label>Lista reserva<select id="awBackupPlaylist" data-aw-field="backupPlaylistId">${playlistOptions(d.backupPlaylistId || state.device?.backupPlaylistId || '', 'Escolha a lista reserva')}</select></label><button type="button" class="aw-new-list" onclick="sellerActivationWizardNewPlaylist('backupPlaylistId')"><strong>＋ Cadastrar nova reserva</strong><span>Use o mesmo cadastro universal.</span></button></div>${qualificationNotice(d.backupPlaylistId || state.device?.backupPlaylistId)}</div></section>`;
    const primary = playlistById(d.playlistId || state.device?.playlistId);
    const backup = d.useBackup === false ? null : playlistById(d.backupPlaylistId || state.device?.backupPlaylistId);
    const plan = planById(d.planId || state.device?.planId);
    return `<section class="aw-pane"><h3>Confira antes de concluir</h3><p>Nada será escondido: plano, listas e consumo ficam resumidos aqui.</p><div class="aw-review">${state.mode === 'activation' ? `<div><small>Cliente</small><strong>${esc(d.customerName || state.device?.customerName || '—')}</strong><span>${esc(d.customerWhatsapp || state.device?.customerWhatsapp || '')}</span></div><div><small>Plano</small><strong>${esc(plan?.name || '—')}</strong><span>${Number(plan?.creditCost || 0)} crédito(s)</span></div>` : ''}<div><small>Lista principal</small><strong>${esc(primary?.name || '—')}</strong><span>${esc(playlistLabel(primary))}</span></div><div><small>Lista reserva</small><strong>${esc(backup?.name || 'Não configurada')}</strong><span>${backup ? esc(playlistLabel(backup)) : 'Opcional'}</span></div></div><div class="aw-notice ${primary && ['ready_cache','ready_direct'].includes(primary.qualificationStatus) ? 'ok' : 'warn'}"><strong>${primary && ['ready_cache','ready_direct'].includes(primary.qualificationStatus) ? 'Lista confirmada' : 'Confirmação automática no aplicativo'}</strong><span>${state.mode === 'activation' ? 'A ativação não será parada por uma homologação manual.' : 'A troca não renova a validade e não consome crédito.'}</span></div><div id="awSubmitStatus" class="aw-submit-status"></div></section>`;
  }

  function validateStep() {
    syncInputs();
    const d = draft();
    const offset = state.mode === 'activation' ? 0 : 2;
    const logical = state.step + offset;
    if (logical === 1 && (!d.customerName?.trim() || !d.customerWhatsapp?.replace(/\D/g,''))) throw new Error('Informe o nome e o WhatsApp do cliente.');
    if (logical === 2 && !d.planId) throw new Error('Escolha um plano.');
    if (logical === 3 && !d.playlistId) throw new Error('Escolha ou cadastre a lista principal.');
    if (logical === 4 && d.useBackup && !d.backupPlaylistId) throw new Error('Escolha a lista reserva ou desative essa opção.');
    if (d.playlistId && d.playlistId === d.backupPlaylistId) throw new Error('As listas principal e reserva precisam ser diferentes.');
  }

  async function refreshData() { state.data = await sellerApi('dashboard'); }
  async function openActivation() {
    const code = $('sellerDeviceCodeLookup')?.value.trim().toUpperCase();
    if (!code) throw new Error('Busque o código do aparelho primeiro.');
    const lookup = await sellerApi('lookupDeviceCode', { deviceCode: code });
    state.mode = 'activation'; state.step = 1; state.device = lookup.device; state.draft = {}; await refreshData();
    ensureModal(); $('activationWizard').classList.add('open'); render();
  }
  async function openChange(deviceId) {
    await refreshData();
    const device = (state.data.devices || []).find(item => item.id === deviceId);
    if (!device) throw new Error('Aparelho não encontrado.');
    state.mode = 'change'; state.step = 1; state.device = device;
    state.draft = { playlistId: device.playlistId || '', backupPlaylistId: device.backupPlaylistId || '', useBackup: Boolean(device.backupPlaylistId) };
    ensureModal(); $('activationWizard').classList.add('open'); render();
  }
  function close() { $('activationWizard')?.classList.remove('open'); state.busy = false; }

  async function newPlaylist(field) {
    syncInputs(); state.targetField = field;
    const before = new Set((state.data?.playlists || []).map(item => item.id));
    if (!window.RonecaUniversalPlaylists?.open) throw new Error('O cadastro universal ainda está carregando. Tente novamente.');
    window.RonecaUniversalPlaylists.open();
    const modal = $('uplModal');
    if (!modal) return;
    const observer = new MutationObserver(async () => {
      if (modal.classList.contains('open')) return;
      observer.disconnect();
      try {
        await refreshData();
        const created = (state.data.playlists || []).find(item => !before.has(item.id));
        if (created) draft()[field] = created.id;
        render();
      } catch (error) { alert(error.message); }
    });
    observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
  }

  async function submit() {
    validateStep();
    if (state.busy) return;
    state.busy = true;
    const status = $('awSubmitStatus');
    if (status) status.textContent = 'Salvando…';
    try {
      const d = draft();
      const backup = d.useBackup === false ? null : (d.backupPlaylistId || null);
      let result;
      if (state.mode === 'activation') {
        result = await flowApi('activate', {
          deviceId: state.device.id,
          customerName: d.customerName.trim(),
          customerWhatsapp: d.customerWhatsapp.trim(),
          planId: d.planId,
          playlistId: d.playlistId,
          backupPlaylistId: backup,
          expiresAt: expiryIso(),
          idempotencyKey: key('activation-wizard'),
        });
      } else {
        result = await flowApi('changePlaylists', {
          deviceId: state.device.id,
          playlistId: d.playlistId,
          backupPlaylistId: backup,
          reason: 'Alteração pelo assistente do vendedor',
          idempotencyKey: key('change-playlists'),
        });
      }
      if (status) status.textContent = result.message || 'Operação concluída.';
      await window.loadPortal?.();
      setTimeout(close, 900);
    } catch (error) {
      if (status) status.textContent = error.message || 'Não foi possível concluir.';
      state.busy = false;
    }
  }

  function patchDeviceActions() {
    document.querySelectorAll('.seller-more-actions-menu').forEach(menu => {
      if (menu.querySelector('[data-change-playlists]')) return;
      const renew = [...menu.querySelectorAll('button')].find(button => /Renovar aparelho/i.test(button.textContent || ''));
      const match = renew?.getAttribute('onclick')?.match(/'([^']+)'/);
      if (!match) return;
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'btn'; button.dataset.changePlaylists = 'true';
      button.textContent = 'Alterar listas'; button.onclick = () => openChange(match[1]).catch(error => alert(error.message));
      renew.insertAdjacentElement('afterend', button);
    });
  }

  window.sellerActivationWizardClose = close;
  window.sellerActivationWizardGo = value => { try { if (value > state.step) validateStep(); state.step = Number(value); render(); } catch (error) { alert(error.message); } };
  window.sellerActivationWizardNext = () => { try { validateStep(); state.step += 1; render(); } catch (error) { alert(error.message); } };
  window.sellerActivationWizardBack = () => { syncInputs(); state.step -= 1; render(); };
  window.sellerActivationWizardToggleBackup = checked => { syncInputs(); draft().useBackup = checked; render(); };
  window.sellerActivationWizardNewPlaylist = field => newPlaylist(field).catch(error => alert(error.message));
  window.sellerActivationWizardSubmit = submit;
  window.sellerUxOpenActivationForm = function () { openActivation().catch(error => alert(error.message)); };
  window.sellerUxOpenActivationForm.__ronecaPlaylistFlowController = true;
  window.sellerUxActivateDevice = submit;
  window.sellerUxActivateDevice.__ronecaPlaylistFlowController = true;
  window.sellerUxOpenChangePlaylists = deviceId => openChange(deviceId).catch(error => alert(error.message));

  function boot() {
    ensureModal();
    patchDeviceActions();
    const observer = new MutationObserver(patchDeviceActions);
    observer.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
  setTimeout(boot, 500);
})();
