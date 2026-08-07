(() => {
  'use strict';
  if (window.__ronecaUnifiedPlaylistEntryInstalled) return;
  window.__ronecaUnifiedPlaylistEntryInstalled = true;

  const entries = new Map();
  const $ = id => document.getElementById(id);

  function installStyle() {
    if ($('ronecaUnifiedPlaylistEntryStyle')) return;
    const style = document.createElement('style'); style.id = 'ronecaUnifiedPlaylistEntryStyle';
    style.textContent = '.roneca-unified-entry{display:grid;grid-template-columns:1fr;gap:10px;width:100%;margin:8px 0 12px;grid-column:1/-1}.roneca-unified-entry small{display:block;margin-top:6px;color:var(--muted,#aaa);line-height:1.4}.roneca-unified-entry [data-unified-fields]{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:14px;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:rgba(255,255,255,.025)}.roneca-unified-entry [data-unified-fields] .wide{grid-column:1/-1}.roneca-unified-entry [hidden],.roneca-unified-url-hidden{display:none!important}.roneca-unified-note{grid-column:1/-1;padding:11px 13px;border:1px solid rgba(224,44,44,.25);border-radius:11px;background:rgba(224,44,44,.07);color:var(--muted,#ccc)}@media(max-width:720px){.roneca-unified-entry [data-unified-fields]{grid-template-columns:1fr}.roneca-unified-entry [data-unified-fields] .wide,.roneca-unified-note{grid-column:1}}';
    document.head.appendChild(style);
  }

  function buildUrl(host, username, password) {
    if (window.RonecaXtreamLogin?.buildXtreamUrl) return window.RonecaXtreamLogin.buildXtreamUrl(host, username, password);
    let base;
    try { base = new URL(String(host || '').trim()); } catch { throw new Error('Host inválido. Use http://servidor:porta.'); }
    if (!['http:','https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error('No host informe apenas protocolo, domínio, porta e subpasta.');
    const user = String(username || '').trim(); const pass = String(password || '').trim();
    if (!user || !pass) throw new Error('Informe usuário e senha Xtream.');
    base.pathname = `${base.pathname.replace(/\/+$/, '')}/get.php`;
    base.searchParams.set('username', user); base.searchParams.set('password', pass); base.searchParams.set('type', 'm3u_plus'); base.searchParams.set('output', 'ts');
    return base.toString();
  }

  function sourceNodes(input) {
    if (!input) return [];
    const label = input.closest('label'); if (label) return [label];
    const previous = input.previousElementSibling; return previous?.tagName === 'LABEL' ? [previous, input] : [input];
  }

  function toggle(block) {
    const config = block.__config; const xtream = block.querySelector('[data-unified-mode]')?.value === 'xtream';
    block.querySelector('[data-unified-fields]')?.toggleAttribute('hidden', !xtream);
    config.sourceNodes.forEach(node => node.classList.toggle('roneca-unified-url-hidden', xtream));
    config.url.required = !xtream;
    for (const selector of ['[data-unified-host]','[data-unified-user]','[data-unified-pass]']) block.querySelector(selector).required = xtream;
    if (xtream) config.type.value = 'xtream';
  }

  function mount({ key, container, name, url, type }) {
    if (!key || !container || !url || !type) return null;
    const config = { key, container, name, url, type, sourceNodes: sourceNodes(url) };
    let block = container.querySelector(`[data-unified-key="${CSS.escape(key)}"]`);
    if (!block) {
      block = document.createElement('div'); block.className = 'roneca-unified-entry'; block.dataset.unifiedKey = key;
      block.innerHTML = '<label class="wide"><span>Forma de cadastro</span><select data-unified-mode><option value="xtream" selected>Login Xtream — host, usuário e senha</option><option value="url">Link M3U completo</option></select><small>O painel monta o link e protege as credenciais dos diagnósticos.</small></label><div data-unified-fields><label class="wide"><span>Host do servidor</span><input data-unified-host autocomplete="url" placeholder="http://servidor.com:8080"></label><label><span>Usuário Xtream</span><input data-unified-user autocomplete="off"></label><label><span>Senha Xtream</span><input data-unified-pass type="password" autocomplete="new-password"></label><div class="roneca-unified-note">O cadastro da lista é independente da ativação. A qualificação comercial será decidida pelo seller-device-flow.</div></div>';
      const anchor = config.sourceNodes[0]; if (anchor?.parentElement) anchor.parentElement.insertBefore(block, anchor); else container.appendChild(block);
      block.querySelector('[data-unified-mode]').addEventListener('change', () => toggle(block));
    }
    block.__config = config; entries.set(key, block); toggle(block); return block;
  }

  function prepare(key) {
    const block = entries.get(key) || document.querySelector(`[data-unified-key="${CSS.escape(key)}"]`);
    if (!block?.isConnected) throw new Error('Formulário da lista não está disponível.');
    const config = block.__config; const mode = block.querySelector('[data-unified-mode]').value;
    if (mode === 'xtream') {
      config.url.value = buildUrl(block.querySelector('[data-unified-host]').value, block.querySelector('[data-unified-user]').value, block.querySelector('[data-unified-pass]').value);
      config.type.value = 'xtream';
    } else if (!String(config.url.value || '').trim()) throw new Error('Informe a URL completa da lista M3U.');
    const name = String(config.name?.value || '').trim(); if (config.name && !name) throw new Error('Digite o nome da nova lista.');
    return { name, playlistUrl: config.url.value.trim(), playlistType: config.type.value || 'm3u' };
  }

  function scan() {
    mount({ key: 'admin-base', container: $('playlistActionModal')?.querySelector('.panel-ux-form'), name: $('uxNewPlaylistName'), url: $('uxNewPlaylistUrl'), type: $('uxNewPlaylistType') });
    mount({ key: 'seller-base', container: $('sellerPlaylistForm')?.querySelector('.seller-form-grid'), name: $('sellerPlaylistName'), url: $('sellerPlaylistUrl'), type: $('sellerPlaylistType') });
  }

  function init() { installStyle(); scan(); setTimeout(scan, 250); }
  window.RonecaUnifiedPlaylistEntry = Object.freeze({ scan, prepare });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
