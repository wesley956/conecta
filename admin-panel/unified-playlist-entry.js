(() => {
  'use strict';

  if (window.__ronecaUnifiedPlaylistEntryInstalled) return;
  window.__ronecaUnifiedPlaylistEntryInstalled = true;

  const NEW = '__roneca_new_playlist__';
  const entries = new Map();
  const created = new Map();
  let timer = null;

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function installStyle() {
    if ($('ronecaUnifiedPlaylistEntryStyle')) return;
    const style = document.createElement('style');
    style.id = 'ronecaUnifiedPlaylistEntryStyle';
    style.textContent = `
      .roneca-unified-entry{display:grid;grid-template-columns:1fr;gap:10px;width:100%;margin:8px 0 12px;grid-column:1/-1}
      .roneca-unified-entry small{display:block;margin-top:6px;color:var(--muted,#aaa);line-height:1.4}
      .roneca-unified-entry [data-unified-fields]{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:14px;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:rgba(255,255,255,.025)}
      .roneca-unified-entry [data-unified-fields] .wide,.roneca-unified-entry .wide{grid-column:1/-1}
      .roneca-unified-entry [hidden],.roneca-unified-url-hidden{display:none!important}
      .roneca-unified-note{grid-column:1/-1;padding:11px 13px;border:1px solid rgba(224,44,44,.25);border-radius:11px;background:rgba(224,44,44,.07);color:var(--muted,#ccc)}
      .roneca-created-entry{grid-column:1/-1;margin:10px 0}
      @media(max-width:720px){.roneca-unified-entry [data-unified-fields]{grid-template-columns:1fr}.roneca-unified-entry [data-unified-fields] .wide,.roneca-unified-note{grid-column:1}}
    `;
    document.head.appendChild(style);
  }

  function buildUrl(host, username, password) {
    if (window.RonecaXtreamLogin?.buildXtreamUrl) {
      return window.RonecaXtreamLogin.buildXtreamUrl(host, username, password);
    }
    let base;
    try { base = new URL(String(host || '').trim()); }
    catch { throw new Error('Host inválido. Use http://servidor:porta.'); }
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
      throw new Error('No host informe apenas protocolo, domínio, porta e subpasta.');
    }
    const user = String(username || '').trim();
    const pass = String(password || '').trim();
    if (!user) throw new Error('Informe o usuário Xtream.');
    if (!pass) throw new Error('Informe a senha Xtream.');
    base.pathname = `${base.pathname.replace(/\/+$/, '')}/get.php`;
    base.searchParams.set('username', user);
    base.searchParams.set('password', pass);
    base.searchParams.set('type', 'm3u_plus');
    base.searchParams.set('output', 'ts');
    return base.toString();
  }

  function sourceNodes(input) {
    if (!input) return [];
    const label = input.closest('label');
    if (label) return [label];
    const previous = input.previousElementSibling;
    if (previous?.tagName === 'LABEL') return [previous, input];
    return [input];
  }

  function toggle(block) {
    const config = block.__config;
    const xtream = block.querySelector('[data-unified-mode]')?.value === 'xtream';
    block.querySelector('[data-unified-fields]')?.toggleAttribute('hidden', !xtream);
    for (const node of config.sourceNodes) node.classList.toggle('roneca-unified-url-hidden', xtream);
    config.url.required = !xtream;
    block.querySelector('[data-unified-host]').required = xtream;
    block.querySelector('[data-unified-user]').required = xtream;
    block.querySelector('[data-unified-pass]').required = xtream;
    if (xtream) config.type.value = 'xtream';
  }

  function mount({ key, container, name, url, type, defaultMode = 'xtream' }) {
    if (!key || !container || !url || !type) return null;
    const found = container.querySelector(`[data-unified-key="${CSS.escape(key)}"]`);
    if (found) {
      found.__config = { key, container, name, url, type, sourceNodes: sourceNodes(url) };
      entries.set(key, found);
      toggle(found);
      return found;
    }

    const block = document.createElement('div');
    block.className = 'roneca-unified-entry';
    block.dataset.unifiedKey = key;
    block.innerHTML = `
      <label class="wide"><span>Forma de cadastro</span>
        <select data-unified-mode>
          <option value="xtream" ${defaultMode === 'xtream' ? 'selected' : ''}>Login Xtream — host, usuário e senha</option>
          <option value="url" ${defaultMode === 'url' ? 'selected' : ''}>Link M3U completo</option>
        </select>
        <small>O painel monta o link automaticamente e mantém as credenciais fora dos diagnósticos.</small>
      </label>
      <div data-unified-fields>
        <label class="wide"><span>Host do servidor</span><input data-unified-host autocomplete="url" placeholder="http://servidor.com:8080"></label>
        <label><span>Usuário Xtream</span><input data-unified-user autocomplete="off" autocapitalize="none" spellcheck="false"></label>
        <label><span>Senha Xtream</span><input data-unified-pass type="password" autocomplete="new-password"></label>
        <div class="roneca-unified-note">A matriz testará API Xtream, fallback M3U, HTTP/HTTPS e formatos compatíveis.</div>
      </div>`;

    const config = { key, container, name, url, type, sourceNodes: sourceNodes(url) };
    block.__config = config;
    const anchor = config.sourceNodes[0];
    if (anchor?.parentElement) anchor.parentElement.insertBefore(block, anchor);
    else container.appendChild(block);
    block.querySelector('[data-unified-mode]').addEventListener('change', () => toggle(block));
    entries.set(key, block);
    toggle(block);
    return block;
  }

  function prepare(key) {
    const block = entries.get(key) || document.querySelector(`[data-unified-key="${CSS.escape(key)}"]`);
    if (!block?.isConnected) throw new Error('Formulário da lista não está disponível.');
    const config = block.__config;
    const mode = block.querySelector('[data-unified-mode]').value;
    if (mode === 'xtream') {
      config.url.value = buildUrl(
        block.querySelector('[data-unified-host]').value,
        block.querySelector('[data-unified-user]').value,
        block.querySelector('[data-unified-pass]').value,
      );
      config.type.value = 'xtream';
    } else if (!String(config.url.value || '').trim()) {
      throw new Error('Informe a URL completa da lista M3U.');
    }
    const name = String(config.name?.value || '').trim();
    if (config.name && !name) throw new Error('Digite o nome da nova lista.');
    return { name, playlistUrl: config.url.value.trim(), playlistType: config.type.value || 'm3u' };
  }

  function showError(message) {
    if (typeof window.show === 'function') return window.show(message, true);
    const target = $('sellerListsMsg') || $('sellerUxMsg');
    if (target) { target.classList.add('err'); target.textContent = message; }
  }

  function enhanceBase() {
    mount({
      key: 'admin-base',
      container: $('playlistActionModal')?.querySelector('.panel-ux-form'),
      name: $('uxNewPlaylistName'), url: $('uxNewPlaylistUrl'), type: $('uxNewPlaylistType'),
    });
    mount({
      key: 'seller-base',
      container: $('sellerPlaylistForm')?.querySelector('.seller-form-grid'),
      name: $('sellerPlaylistName'), url: $('sellerPlaylistUrl'), type: $('sellerPlaylistType'),
    });
  }

  function enhanceExistingInline() {
    document.querySelectorAll('.inline-playlist-fields-admin, #seller-inline-playlist').forEach(container => {
      if (!container.id) return;
      mount({
        key: container.id,
        container,
        name: $(`${container.id}-name`), url: $(`${container.id}-url`), type: $(`${container.id}-type`),
      });
    });
  }

  function addNewOption(select, text) {
    if (!select || select.querySelector(`option[value="${NEW}"]`)) return;
    const option = document.createElement('option');
    option.value = NEW;
    option.textContent = text;
    select.appendChild(option);
  }

  function createFields(select, key, title) {
    if (!select) return;
    let container = $(key);
    if (!container) {
      container = document.createElement('div');
      container.id = key;
      container.className = 'inline-playlist-fields roneca-created-entry';
      container.hidden = true;
      container.innerHTML = `
        <div class="inline-playlist-title wide"><strong>${esc(title)}</strong><span>Cadastre sem sair desta operação.</span></div>
        <label>Nome da nova lista<input id="${esc(key)}-name" placeholder="Ex: Lista do cliente"></label>
        <label>Tipo<select id="${esc(key)}-type"><option value="m3u">M3U</option><option value="xtream">Xtream</option><option value="stalker">Stalker</option></select></label>
        <label class="wide">URL da nova lista<input id="${esc(key)}-url" placeholder="https://..."></label>`;
      (select.closest('div, label') || select).insertAdjacentElement('afterend', container);
      select.addEventListener('change', () => {
        container.hidden = select.value !== NEW;
        container.classList.toggle('open', select.value === NEW);
      });
    }
    mount({ key, container, name: $(`${key}-name`), url: $(`${key}-url`), type: $(`${key}-type`) });
  }

  function enhanceSelectableCreation() {
    const activationBackup = $('sellerActivationBackupPlaylist');
    addNewOption(activationBackup, '＋ Cadastrar nova lista reserva');
    createFields(activationBackup, 'seller-activation-backup-new', 'Nova lista reserva');

    const renewMain = $('sellerRenewPlaylist');
    addNewOption(renewMain, '＋ Cadastrar nova lista principal');
    createFields(renewMain, 'seller-renew-main-new', 'Nova lista principal');

    const renewBackup = $('sellerRenewBackupPlaylist');
    addNewOption(renewBackup, '＋ Cadastrar nova lista reserva');
    createFields(renewBackup, 'seller-renew-backup-new', 'Nova lista reserva');

    document.querySelectorAll('[id^="pend-backup-playlist-"]').forEach(select => {
      const deviceId = select.id.replace('pend-backup-playlist-', '');
      addNewOption(select, '＋ Cadastrar nova lista reserva');
      createFields(select, `pend-backup-new-${deviceId}`, 'Nova lista reserva');
    });
  }

  async function panelFunction(functionName, payload) {
    const config = window.RONECA_PANEL_CONFIG || {};
    if (!config.supabaseUrl || !config.anonKey || !window.RonecaPanelAuth) throw new Error('Sessão do painel não encontrada.');
    const accessToken = await window.RonecaPanelAuth.getAccessToken();
    const response = await fetch(`${String(config.supabaseUrl).replace(/\/$/, '')}/functions/v1/${functionName}`, {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', apikey: config.anonKey, Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload || {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || `Falha HTTP ${response.status}.`);
    return data.data ?? data;
  }

  async function sellerPanel(payload) {
    const legacy = sessionStorage.getItem('roneca_seller_token') || '';
    if (!legacy) return panelFunction('seller-panel', payload);
    const response = await fetch('https://awauvkjkucjqulkklmuo.supabase.co/functions/v1/seller-panel', {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'x-seller-token': legacy },
      body: JSON.stringify(payload || {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || `Falha HTTP ${response.status}.`);
    return data;
  }

  function accepted(result) {
    return result?.cache?.ok === true || result?.cache?.accessMode === 'direct' || result?.accessMode === 'direct';
  }

  function selectResolved(select, id, name) {
    let option = [...select.options].find(item => item.value === id);
    if (!option) { option = document.createElement('option'); option.value = id; select.appendChild(option); }
    option.textContent = name || 'Lista criada nesta operação';
    select.value = id;
  }

  async function createFor({ select, key, scope, sellerId = null }) {
    if (!select || select.value !== NEW) return;
    const draft = prepare(key);
    const fingerprint = JSON.stringify({ scope, sellerId, ...draft });
    const old = created.get(key);
    if (old?.fingerprint === fingerprint) return selectResolved(select, old.id, old.name);

    const result = scope === 'admin'
      ? await panelFunction('admin-inline-playlist', { sellerId, ...draft })
      : await sellerPanel({ action: 'createSellerPlaylist', name: draft.name, playlistUrl: draft.playlistUrl, playlistType: draft.playlistType });
    const id = result.playlistId || result.id;
    const name = result.playlistName || draft.name;
    if (!id) throw new Error('O servidor não retornou a identificação da lista criada.');
    if (!accepted(result)) throw new Error(result.message || 'A lista foi salva, mas ainda não pôde ser validada para ativação.');
    created.set(key, { fingerprint, id, name });
    selectResolved(select, id, name);
    const container = $(key);
    if (container) container.hidden = true;
  }

  function before(name, hook) {
    const current = window[name];
    if (typeof current !== 'function' || current.__unifiedHook === hook) return;
    const wrapped = async function (...args) {
      try { await hook(...args); }
      catch (error) { showError(error.message || 'Não foi possível preparar a lista.'); return; }
      return current.apply(this, args);
    };
    wrapped.__unifiedHook = hook;
    window[name] = wrapped;
  }

  function after(name, hook) {
    const current = window[name];
    if (typeof current !== 'function' || current.__unifiedAfter === hook) return;
    const wrapped = function (...args) {
      const result = current.apply(this, args);
      Promise.resolve(result).then(() => setTimeout(hook, 0), () => setTimeout(hook, 0));
      return result;
    };
    wrapped.__unifiedAfter = hook;
    window[name] = wrapped;
  }

  async function adminActivation(id) {
    const sellerId = $(`pend-seller-${id}`)?.value || null;
    await createFor({ select: $(`pend-playlist-${id}`), key: `pend-inline-playlist-${id}`, scope: 'admin', sellerId });
    await createFor({ select: $(`pend-backup-playlist-${id}`), key: `pend-backup-new-${id}`, scope: 'admin', sellerId });
  }

  async function sellerActivation() {
    await createFor({ select: $('sellerActivationPlaylist'), key: 'seller-inline-playlist', scope: 'seller' });
    await createFor({ select: $('sellerActivationBackupPlaylist'), key: 'seller-activation-backup-new', scope: 'seller' });
  }

  async function sellerRenewal() {
    await createFor({ select: $('sellerRenewPlaylist'), key: 'seller-renew-main-new', scope: 'seller' });
    await createFor({ select: $('sellerRenewBackupPlaylist'), key: 'seller-renew-backup-new', scope: 'seller' });
  }

  function wrapFunctions() {
    before('submitPlaylistModal', () => prepare('admin-base'));
    before('sellerListsCreate', () => prepare('seller-base'));
    before('activatePending', adminActivation);
    before('sellerUxActivateDevice', sellerActivation);
    before('sellerUxRenewDevice', sellerRenewal);
    after('sellerUxOpenActivationForm', scan);
    after('sellerUxOpenRenewModal', scan);
  }

  function scan() {
    enhanceBase();
    enhanceExistingInline();
    enhanceSelectableCreation();
    wrapFunctions();
  }

  function schedule() { clearTimeout(timer); timer = setTimeout(scan, 50); }
  function init() {
    installStyle();
    scan();
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  }

  window.RonecaUnifiedPlaylistEntry = Object.freeze({ scan, prepare, NEW_PLAYLIST_VALUE: NEW });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
