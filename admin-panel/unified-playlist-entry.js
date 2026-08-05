(() => {
  'use strict';

  if (window.__ronecaUnifiedPlaylistEntryInstalled) return;
  window.__ronecaUnifiedPlaylistEntryInstalled = true;

  const NEW = '__roneca_new_playlist__';
  const entries = new Map();
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
    try {
      base = new URL(String(host || '').trim());
    } catch {
      throw new Error('Host inválido. Use http://servidor:porta.');
    }
    if (!['http:', 'https:'].includes(base.protocol)
        || base.username
        || base.password
        || base.search
        || base.hash) {
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
    const config = { key, container, name, url, type, sourceNodes: sourceNodes(url) };

    if (found) {
      found.__config = config;
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
        <div class="roneca-unified-note">O sistema tentará cache protegido e, se o servidor for lento ou bloquear o datacenter, poderá solicitar homologação direta em Android.</div>
      </div>`;

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
    return {
      name,
      playlistUrl: config.url.value.trim(),
      playlistType: config.type.value || 'm3u',
    };
  }

  function enhanceBase() {
    mount({
      key: 'admin-base',
      container: $('playlistActionModal')?.querySelector('.panel-ux-form'),
      name: $('uxNewPlaylistName'),
      url: $('uxNewPlaylistUrl'),
      type: $('uxNewPlaylistType'),
    });
    mount({
      key: 'seller-base',
      container: $('sellerPlaylistForm')?.querySelector('.seller-form-grid'),
      name: $('sellerPlaylistName'),
      url: $('sellerPlaylistUrl'),
      type: $('sellerPlaylistType'),
    });
  }

  function enhanceExistingInline() {
    document.querySelectorAll('.inline-playlist-fields-admin, #seller-inline-playlist').forEach(container => {
      if (!container.id) return;
      mount({
        key: container.id,
        container,
        name: $(`${container.id}-name`),
        url: $(`${container.id}-url`),
        type: $(`${container.id}-type`),
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
    mount({
      key,
      container,
      name: $(`${key}-name`),
      url: $(`${key}-url`),
      type: $(`${key}-type`),
    });
  }

  function enhanceSelectableCreation() {
    const sellerMain = $('sellerActivationPlaylist');
    addNewOption(sellerMain, '＋ Cadastrar nova lista principal');
    createFields(sellerMain, 'seller-inline-playlist', 'Nova lista principal');

    const sellerBackup = $('sellerActivationBackupPlaylist');
    addNewOption(sellerBackup, '＋ Cadastrar nova lista reserva');
    createFields(sellerBackup, 'seller-activation-backup-new', 'Nova lista reserva');

    const renewMain = $('sellerRenewPlaylist');
    addNewOption(renewMain, '＋ Cadastrar nova lista principal');
    createFields(renewMain, 'seller-renew-main-new', 'Nova lista principal');

    const renewBackup = $('sellerRenewBackupPlaylist');
    addNewOption(renewBackup, '＋ Cadastrar nova lista reserva');
    createFields(renewBackup, 'seller-renew-backup-new', 'Nova lista reserva');

    document.querySelectorAll('[id^="pend-playlist-"]').forEach(select => {
      if (select.id.startsWith('pend-backup-playlist-')) return;
      const deviceId = select.id.replace('pend-playlist-', '');
      addNewOption(select, '＋ Cadastrar nova lista principal');
      createFields(select, `pend-inline-playlist-${deviceId}`, 'Nova lista principal');
    });

    document.querySelectorAll('[id^="pend-backup-playlist-"]').forEach(select => {
      const deviceId = select.id.replace('pend-backup-playlist-', '');
      addNewOption(select, '＋ Cadastrar nova lista reserva');
      createFields(select, `pend-backup-new-${deviceId}`, 'Nova lista reserva');
    });
  }

  function scan() {
    enhanceBase();
    enhanceExistingInline();
    enhanceSelectableCreation();
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(scan, 50);
  }

  function init() {
    installStyle();
    scan();
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  }

  window.RonecaUnifiedPlaylistEntry = Object.freeze({
    scan,
    prepare,
    NEW_PLAYLIST_VALUE: NEW,
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
