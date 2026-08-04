(() => {
  'use strict';

  if (window.__ronecaPlaylistEditInstalled) return;
  window.__ronecaPlaylistEditInstalled = true;

  const FUNCTION_NAME = 'subscription-playlist-edit';
  let observerTimer = null;
  let toastTimer = null;

  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function installStylesheet() {
    if (document.querySelector('link[data-playlist-edit-module]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './playlist-edit-module.css?v=1.1';
    link.dataset.playlistEditModule = 'true';
    document.head.appendChild(link);
  }

  function installXtreamLoginModule() {
    if (document.querySelector('script[data-xtream-login-module]')) return;
    const script = document.createElement('script');
    script.src = './xtream-login-module.js?v=1.0';
    script.async = false;
    script.dataset.xtreamLoginModule = 'true';
    document.head.appendChild(script);
  }

  function operationKey() {
    const random = globalThis.crypto?.randomUUID?.()
      || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `replace-playlist:${random}`;
  }

  function showToast(message, error = false) {
    let toast = document.getElementById('playlistEditToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'playlistEditToast';
      toast.className = 'playlist-edit-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = String(message || 'Operação concluída.');
    toast.classList.toggle('error', error);
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 5000);
  }

  async function callApi(payload) {
    const config = window.RONECA_PANEL_CONFIG || {};
    const supabaseUrl = String(config.supabaseUrl || '').replace(/\/$/, '');
    const anonKey = String(config.anonKey || '').trim();
    if (!supabaseUrl || !anonKey) throw new Error('Configuração pública do Supabase não encontrada.');
    if (!window.RonecaPanelAuth) throw new Error('Sessão do painel não encontrada. Entre novamente.');
    const accessToken = await window.RonecaPanelAuth.getAccessToken();
    const response = await fetch(`${supabaseUrl}/functions/v1/${FUNCTION_NAME}`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload || {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || `Falha HTTP ${response.status}.`);
    return data.data ?? data;
  }

  function ensureModal() {
    let modal = document.getElementById('playlistEditModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'playlistEditModal';
    modal.className = 'playlist-edit-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = '<div class="playlist-edit-dialog" role="dialog" aria-modal="true"><div id="playlistEditContent"></div></div>';
    modal.addEventListener('click', event => {
      if (event.target === modal) closeModal();
    });
    document.body.appendChild(modal);
    return modal;
  }

  function closeModal() {
    const modal = document.getElementById('playlistEditModal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    const content = document.getElementById('playlistEditContent');
    if (content) content.innerHTML = '';
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR');
  }

  function formatBytes(value) {
    const bytes = Number(value || 0);
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
  }

  function sourceInspectionHtml(source) {
    if (!source) return '<div class="playlist-edit-empty">Nenhuma origem cadastrada nesta posição.</div>';
    const parameters = Array.isArray(source.parameterNames) && source.parameterNames.length
      ? source.parameterNames.map(name => `<code>${esc(name)}</code>`).join(' ')
      : 'Nenhum parâmetro';
    return `
      <div class="playlist-edit-current-source">
        <strong>Origem atual protegida</strong>
        <code class="playlist-edit-preview">${esc(source.preview || 'Origem protegida')}</code>
        <div class="playlist-edit-inspection-grid">
          <div><small>Protocolo</small><span>${esc(source.protocol || '—')}</span></div>
          <div><small>Servidor</small><span>${esc(source.host || '—')}</span></div>
          <div><small>Usuário informado</small><span>${source.hasUsername ? 'Sim' : 'Não identificado'}</span></div>
          <div><small>Senha informada</small><span>${source.hasPassword ? 'Sim' : 'Não identificada'}</span></div>
          <div class="wide"><small>Parâmetros encontrados</small><span>${parameters}</span></div>
        </div>
        <p>A senha e os valores sensíveis permanecem ocultos. Para corrigir qualquer dado, cole novamente a URL completa fornecida pelo provedor.</p>
      </div>`;
  }

  async function refreshPanels() {
    document.querySelector('[data-subscription-action="refresh"]')?.click();
    if (typeof window.loadAll === 'function') {
      await window.loadAll();
    } else if (typeof window.loadSellerData === 'function') {
      await window.loadSellerData();
    }
  }

  async function openEditor(target, priority) {
    const modal = ensureModal();
    const content = document.getElementById('playlistEditContent');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    content.innerHTML = '<div class="playlist-edit-loading">Carregando os dados protegidos da lista...</div>';

    try {
      const details = await callApi({ action: 'details', ...target, priority });
      const current = details.current;
      const roleLabel = priority === 1 ? 'principal' : 'reserva';
      const defaultName = current?.name || `Lista ${roleLabel} de ${details.customerName || 'cliente'}`;
      const minimumConnections = Math.max(1, Number(details.simultaneousConnections || 1));
      const defaultConnections = Math.max(minimumConnections, Number(current?.maxConnections || 1));

      content.innerHTML = `
        <div class="playlist-edit-head">
          <div>
            <h2>${current ? 'Editar ou trocar' : 'Adicionar'} lista ${roleLabel}</h2>
            <p>${esc(details.customerName || 'Cliente')} · a lista atual permanece funcionando até a nova passar na validação.</p>
          </div>
          <button type="button" class="btn" data-playlist-edit-close>×</button>
        </div>
        ${sourceInspectionHtml(current?.source)}
        <div class="playlist-edit-cache-summary">
          <span><strong>Cache atual:</strong> ${esc(current?.cacheStatus || 'não existe')}</span>
          <span><strong>Itens:</strong> ${Number(current?.cacheItemCount || 0)}</span>
          <span><strong>Tamanho:</strong> ${formatBytes(current?.cacheSizeBytes)}</span>
          <span><strong>Atualizado:</strong> ${esc(formatDate(current?.cacheUpdatedAt))}</span>
        </div>
        ${current?.cacheError ? `<div class="playlist-edit-warning">Último erro: ${esc(current.cacheError)}</div>` : ''}
        <form id="playlistEditForm">
          <div class="playlist-edit-grid">
            <label class="wide"><span>Nome da lista</span><input name="name" maxlength="180" required value="${esc(defaultName)}" /></label>
            <label><span>Tipo</span>
              <select name="playlistType">
                <option value="m3u" ${current?.type === 'm3u' ? 'selected' : ''}>M3U</option>
                <option value="xtream" ${current?.type === 'xtream' ? 'selected' : ''}>Xtream</option>
                <option value="stalker" ${current?.type === 'stalker' ? 'selected' : ''}>Stalker</option>
              </select>
            </label>
            <label><span>Conexões suportadas</span><input name="maxConnections" type="number" min="${minimumConnections}" max="50" required value="${defaultConnections}" /></label>
            <label class="wide"><span>Nova URL completa</span><textarea name="playlistUrl" rows="4" maxlength="4096" required placeholder="Cole aqui a URL correta ou a URL da nova lista"></textarea></label>
            <label class="wide"><span>Motivo da alteração</span><input name="reason" minlength="3" maxlength="500" required placeholder="Ex: corrigir senha digitada ou trocar provedor" /></label>
          </div>
          <div class="playlist-edit-safety">
            <strong>Troca sem interrupção:</strong> primeiro o servidor testa a URL e gera o novo cache. A mudança só é aplicada depois que esse processo terminar com sucesso. Em caso de erro, a lista atual é mantida.
          </div>
          <div id="playlistEditProgress" class="playlist-edit-progress" hidden></div>
          <div class="playlist-edit-actions">
            <button class="btn" type="button" data-playlist-edit-close>Cancelar</button>
            <button class="btn primary" type="submit">Validar e aplicar</button>
          </div>
        </form>`;

      content.querySelectorAll('[data-playlist-edit-close]').forEach(button => {
        button.addEventListener('click', closeModal);
      });

      const form = document.getElementById('playlistEditForm');
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const submit = form.querySelector('button[type="submit"]');
        const progress = document.getElementById('playlistEditProgress');
        submit.disabled = true;
        progress.hidden = false;
        progress.classList.remove('error');
        progress.textContent = 'Validando acesso, testando a origem e gerando o cache. Aguarde...';
        try {
          const values = new FormData(form);
          const result = await callApi({
            action: 'replace',
            ...target,
            priority,
            name: values.get('name'),
            playlistType: values.get('playlistType'),
            maxConnections: Number(values.get('maxConnections')),
            playlistUrl: values.get('playlistUrl'),
            reason: values.get('reason'),
            idempotencyKey: operationKey(),
          });
          progress.textContent = result.message || 'Lista validada e aplicada.';
          showToast(result.message || 'Lista validada e aplicada com segurança.');
          setTimeout(async () => {
            closeModal();
            await refreshPanels();
          }, 650);
        } catch (error) {
          progress.textContent = error.message || 'Não foi possível aplicar a nova lista.';
          progress.classList.add('error');
          showToast(error.message || 'Não foi possível aplicar a nova lista.', true);
          submit.disabled = false;
        }
      });
    } catch (error) {
      content.innerHTML = `
        <div class="playlist-edit-head"><div><h2>Não foi possível abrir a lista</h2><p>${esc(error.message || 'Falha ao carregar os dados.')}</p></div><button type="button" class="btn" data-playlist-edit-close>×</button></div>`;
      content.querySelector('[data-playlist-edit-close]')?.addEventListener('click', closeModal);
    }
  }

  function subscriptionIdForCard(card) {
    return card.querySelector('[data-subscription-action][data-id]')?.dataset.id || null;
  }

  function priorityForRow(row) {
    const label = String(row.querySelector('strong')?.textContent || '').trim().toLowerCase();
    if (label.startsWith('principal')) return 1;
    if (label.startsWith('reserva')) return 2;
    return null;
  }

  function addEditButton(container, target, priority, label = 'Editar / trocar') {
    const key = target.deviceId || target.subscriptionId;
    const selector = `[data-playlist-edit-button="${priority}-${key}"]`;
    if (container.querySelector(selector)) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn playlist-edit-button';
    button.dataset.playlistEditButton = `${priority}-${key}`;
    button.textContent = label;
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      openEditor(target, priority);
    });
    container.appendChild(button);
  }

  function addSubscriptionBackupButton(list, subscriptionId) {
    if (list.querySelector('[data-playlist-add-backup]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn playlist-edit-add-backup';
    button.dataset.playlistAddBackup = 'true';
    button.textContent = 'Adicionar lista reserva';
    button.addEventListener('click', () => openEditor({ subscriptionId }, 2));
    list.appendChild(button);
  }

  function enhanceSubscriptionCards() {
    document.querySelectorAll('.subscription-card').forEach(card => {
      const subscriptionId = subscriptionIdForCard(card);
      if (!subscriptionId) return;
      const list = card.querySelector('.subscription-playlist-list');
      if (!list) return;
      let hasBackup = false;
      list.querySelectorAll('.subscription-playlist-row').forEach(row => {
        const priority = priorityForRow(row);
        if (!priority) return;
        if (priority === 2) hasBackup = true;
        addEditButton(row, { subscriptionId }, priority);
      });
      if (!hasBackup) addSubscriptionBackupButton(list, subscriptionId);
    });
  }

  function extractDeviceId(card) {
    const direct = card.dataset.deviceId || card.getAttribute('data-id');
    if (/^[0-9a-f-]{36}$/i.test(String(direct || ''))) return direct;
    const elements = card.querySelectorAll('[onclick], [data-device-id]');
    for (const element of elements) {
      const explicit = element.dataset?.deviceId;
      if (/^[0-9a-f-]{36}$/i.test(String(explicit || ''))) return explicit;
      const onclick = element.getAttribute('onclick') || '';
      const match = onclick.match(/["']([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})["']/i);
      if (match) return match[1];
    }
    return null;
  }

  function enhanceLegacyDeviceCards() {
    document.querySelectorAll('.admin-device-card, .seller-device-card, [data-device-card]').forEach(card => {
      const deviceId = extractDeviceId(card);
      if (!deviceId) return;
      const status = String(card.dataset.status || '').toLowerCase();
      if (['blocked', 'inactive'].includes(status)) return;
      const actions = card.querySelector('.admin-device-actions, .seller-device-actions, .actions') || card;
      addEditButton(actions, { deviceId }, 1, 'Editar lista principal');
      addEditButton(actions, { deviceId }, 2, 'Editar / adicionar reserva');
    });
  }

  function enhanceCards() {
    enhanceSubscriptionCards();
    enhanceLegacyDeviceCards();
  }

  function scheduleEnhancement() {
    clearTimeout(observerTimer);
    observerTimer = setTimeout(enhanceCards, 80);
  }

  function initialize() {
    installStylesheet();
    installXtreamLoginModule();
    ensureModal();
    enhanceCards();
    const observer = new MutationObserver(scheduleEnhancement);
    observer.observe(document.documentElement, { subtree: true, childList: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
