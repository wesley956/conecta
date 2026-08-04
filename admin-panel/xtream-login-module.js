(() => {
  'use strict';

  if (window.__ronecaXtreamLoginInstalled) return;
  window.__ronecaXtreamLoginInstalled = true;

  let observerTimer = null;

  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function installStylesheet() {
    if (document.querySelector('link[data-xtream-login-module]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './xtream-login-module.css?v=1.0';
    link.dataset.xtreamLoginModule = 'true';
    document.head.appendChild(link);
  }

  function normalizedHost(rawValue) {
    const raw = String(rawValue || '').trim();
    if (!raw) throw new Error('Informe o host do servidor Xtream.');

    let parsed;
    try {
      parsed = new URL(raw);
    } catch {
      throw new Error('Host inválido. Use o formato http://servidor:porta.');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('O host precisa usar HTTP ou HTTPS.');
    }
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error('No campo host informe apenas protocolo, domínio, porta e subpasta.');
    }

    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    return parsed.toString().replace(/\/$/, '');
  }

  function buildXtreamUrl(host, username, password) {
    const base = normalizedHost(host);
    const user = String(username || '').trim();
    const pass = String(password || '').trim();
    if (!user) throw new Error('Informe o usuário Xtream.');
    if (!pass) throw new Error('Informe a senha Xtream.');
    if (user.length > 300 || pass.length > 300) {
      throw new Error('Usuário ou senha excede o tamanho permitido.');
    }

    const endpoint = new URL(`${base}/get.php`);
    endpoint.searchParams.set('username', user);
    endpoint.searchParams.set('password', pass);
    endpoint.searchParams.set('type', 'm3u_plus');
    endpoint.searchParams.set('output', 'ts');
    return endpoint.toString();
  }

  function currentSourceHint() {
    const source = document.querySelector('#playlistEditContent .playlist-edit-inspection-grid');
    if (!source) return { host: '', xtream: false };
    const values = [...source.querySelectorAll('div')].map(item => ({
      label: String(item.querySelector('small')?.textContent || '').trim().toLowerCase(),
      value: String(item.querySelector('span')?.textContent || '').trim(),
    }));
    const protocol = values.find(item => item.label === 'protocolo')?.value.toLowerCase() || 'http';
    const host = values.find(item => item.label === 'servidor')?.value || '';
    const hasUser = values.find(item => item.label.includes('usuário'))?.value === 'Sim';
    const hasPassword = values.find(item => item.label.includes('senha'))?.value === 'Sim';
    return {
      host: host && host !== '—' ? `${protocol}://${host}` : '',
      xtream: Boolean(host && hasUser && hasPassword),
    };
  }

  function toggleMode(form) {
    const mode = form.querySelector('[name="sourceMode"]')?.value || 'url';
    const urlGroup = form.querySelector('[data-source-url-group]');
    const xtreamGroup = form.querySelector('[data-source-xtream-group]');
    const playlistUrl = form.elements.playlistUrl;
    const host = form.elements.xtreamHost;
    const username = form.elements.xtreamUsername;
    const password = form.elements.xtreamPassword;

    const xtream = mode === 'xtream_login';
    urlGroup?.toggleAttribute('hidden', xtream);
    xtreamGroup?.toggleAttribute('hidden', !xtream);
    if (playlistUrl) playlistUrl.required = !xtream;
    if (host) host.required = xtream;
    if (username) username.required = xtream;
    if (password) password.required = xtream;

    const type = form.elements.playlistType;
    if (xtream && type) type.value = 'xtream';
  }

  function enhanceForm(form) {
    if (!form || form.dataset.xtreamLoginEnhanced === 'true') return;
    const textarea = form.elements.playlistUrl;
    const typeSelect = form.elements.playlistType;
    if (!textarea || !typeSelect) return;

    form.dataset.xtreamLoginEnhanced = 'true';
    const originalLabel = textarea.closest('label');
    if (!originalLabel) return;
    originalLabel.dataset.sourceUrlGroup = 'true';
    originalLabel.querySelector('span').textContent = 'URL M3U completa';

    const hint = currentSourceHint();
    const sourceMode = document.createElement('label');
    sourceMode.className = 'wide xtream-source-mode';
    sourceMode.innerHTML = `
      <span>Forma de cadastro</span>
      <select name="sourceMode">
        <option value="xtream_login" ${hint.xtream ? 'selected' : ''}>Login Xtream — host, usuário e senha</option>
        <option value="url" ${hint.xtream ? '' : 'selected'}>Link M3U completo</option>
      </select>
      <small>O painel monta os endpoints Xtream automaticamente. As credenciais permanecem ocultas depois de salvas.</small>`;

    const xtreamGroup = document.createElement('div');
    xtreamGroup.className = 'wide xtream-login-fields';
    xtreamGroup.dataset.sourceXtreamGroup = 'true';
    xtreamGroup.innerHTML = `
      <label class="wide"><span>Host do servidor</span><input name="xtreamHost" maxlength="1000" autocomplete="url" placeholder="http://servidor.com:8080" value="${esc(hint.host)}" /></label>
      <label><span>Usuário Xtream</span><input name="xtreamUsername" maxlength="300" autocomplete="off" autocapitalize="none" spellcheck="false" /></label>
      <label><span>Senha Xtream</span><input name="xtreamPassword" type="password" maxlength="300" autocomplete="new-password" /></label>
      <div class="xtream-login-note"><strong>Matriz automática:</strong> o aplicativo testará API Xtream e fallback M3U, HTTP/HTTPS e formatos compatíveis sem alterar os dados informados.</div>`;

    originalLabel.parentElement.insertBefore(sourceMode, originalLabel);
    originalLabel.parentElement.insertBefore(xtreamGroup, originalLabel.nextSibling);

    sourceMode.querySelector('select').addEventListener('change', () => toggleMode(form));
    form.addEventListener('submit', event => {
      if (event.defaultPrevented) return;
      const mode = form.elements.sourceMode?.value || 'url';
      if (mode !== 'xtream_login') return;
      try {
        textarea.value = buildXtreamUrl(
          form.elements.xtreamHost?.value,
          form.elements.xtreamUsername?.value,
          form.elements.xtreamPassword?.value,
        );
        typeSelect.value = 'xtream';
      } catch (error) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const progress = document.getElementById('playlistEditProgress');
        if (progress) {
          progress.hidden = false;
          progress.classList.add('error');
          progress.textContent = error.message || 'Dados Xtream inválidos.';
        }
      }
    }, true);

    toggleMode(form);
  }

  function scan() {
    enhanceForm(document.getElementById('playlistEditForm'));
  }

  function scheduleScan() {
    clearTimeout(observerTimer);
    observerTimer = setTimeout(scan, 40);
  }

  function initialize() {
    installStylesheet();
    scan();
    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
