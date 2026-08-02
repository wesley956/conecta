(function installProtectedAppRelease(global) {
  'use strict';

  var platforms = [
    { id: 'android', label: 'Android TV', extension: 'APK', install: 'Instalação direta e atualização pelo aplicativo.' },
    { id: 'webos', label: 'LG webOS', extension: 'IPK', install: 'Teste via Developer Mode ou atualização pela LG Content Store.' },
    { id: 'tizen', label: 'Samsung Tizen', extension: 'WGT', install: 'Pacote assinado para TV autorizada ou atualização pela Samsung Apps.' }
  ];

  function formatBytes(value) {
    var bytes = Number(value || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return '—';
    return (bytes / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB';
  }

  function formatDate(value) {
    var date = new Date(String(value || ''));
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  async function request(action, platform) {
    var response = await fetch(global.RonecaPanelAuth.getFunctionUrl('app-release'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: action, platform: platform })
    });
    var payload = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(payload.error || 'Não foi possível consultar o aplicativo.');
    return payload;
  }

  function current(root) {
    return platforms.find(function (item) { return item.id === root.dataset.releasePlatform; }) || platforms[0];
  }

  function setStatus(root, message, error) {
    var status = root.querySelector('[data-app-release-status]');
    if (!status) return;
    status.textContent = message || '';
    status.classList.toggle('err', Boolean(error));
  }

  function render(root, release) {
    root.querySelector('[data-app-release-version]').textContent = release.versionName || '—';
    root.querySelector('[data-app-release-size]').textContent = formatBytes(release.fileSizeBytes);
    root.querySelector('[data-app-release-date]').textContent = formatDate(release.publishedAt);
    root.querySelector('[data-app-release-notes]').textContent = release.notes || 'Sem observações para esta versão.';
  }

  function reset(root) {
    render(root, {});
    root.querySelector('[data-app-release-link-wrap]').hidden = true;
    root.querySelector('[data-app-release-link]').value = '';
  }

  function installPlatformPicker(root) {
    var picker = document.createElement('div');
    picker.className = 'app-release-platforms';
    platforms.forEach(function (item) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn app-release-platform';
      button.dataset.platform = item.id;
      button.textContent = item.label + ' · .' + item.extension.toLowerCase();
      button.addEventListener('click', function () { select(root, item.id); });
      picker.appendChild(button);
    });
    var summary = root.querySelector('.app-release-summary');
    root.insertBefore(picker, summary);
  }

  function updatePlatformCopy(root) {
    var item = current(root);
    root.querySelectorAll('.app-release-platform').forEach(function (button) {
      button.classList.toggle('primary', button.dataset.platform === item.id);
      button.setAttribute('aria-pressed', String(button.dataset.platform === item.id));
    });
    root.querySelector('[data-app-release-download]').textContent = 'Baixar ' + item.extension;
    root.querySelector('[data-app-release-generate]').textContent = 'Gerar link temporário';
    var description = root.querySelector('h2 + p');
    if (description) description.textContent = item.install;
  }

  async function select(root, platform) {
    root.dataset.releasePlatform = platform;
    reset(root);
    updatePlatformCopy(root);
    await load(root);
  }

  async function load(root) {
    var item = current(root);
    setStatus(root, 'Consultando a versão ' + item.label + '...');
    try {
      var release = await request('manifest', item.id);
      render(root, release);
      setStatus(root, 'Versão pronta para download protegido.');
    } catch (error) {
      reset(root);
      setStatus(root, error.message === 'Nenhuma versão foi publicada.'
        ? 'O pacote ' + item.extension + ' ainda não foi publicado.'
        : error.message, true);
    }
  }

  async function generate(root, openDownload) {
    var item = current(root);
    setStatus(root, 'Gerando link temporário...');
    try {
      var release = await request('download', item.id);
      render(root, release);
      var url = release.downloadUrl || release.apkUrl || '';
      var input = root.querySelector('[data-app-release-link]');
      input.value = url;
      root.querySelector('[data-app-release-link-wrap]').hidden = false;
      setStatus(root, 'Link válido por 1 hora. Depois disso, gere outro.');
      if (openDownload) {
        var anchor = document.createElement('a');
        anchor.href = url;
        anchor.rel = 'noreferrer';
        anchor.download = 'ronecaPlayerTV-' + item.id + '-v' + release.versionName + '.' + item.extension.toLowerCase();
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      }
    } catch (error) {
      setStatus(root, error.message, true);
    }
  }

  async function copy(root) {
    var input = root.querySelector('[data-app-release-link]');
    if (!input || !input.value) return generate(root, false);
    try {
      await navigator.clipboard.writeText(input.value);
      setStatus(root, 'Link copiado. Ele expira em 1 hora.');
    } catch (_error) {
      input.focus(); input.select(); document.execCommand('copy');
      setStatus(root, 'Link selecionado para copiar.');
    }
  }

  function bind(root) {
    if (root.dataset.appReleaseReady === 'true') return;
    root.dataset.appReleaseReady = 'true';
    root.dataset.releasePlatform = 'android';
    installPlatformPicker(root);
    root.querySelector('[data-app-release-generate]').addEventListener('click', function () { generate(root, false); });
    root.querySelector('[data-app-release-download]').addEventListener('click', function () { generate(root, true); });
    root.querySelector('[data-app-release-copy]').addEventListener('click', function () { copy(root); });
    updatePlatformCopy(root);
    load(root);
  }

  function init() { document.querySelectorAll('[data-app-release]').forEach(bind); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(window);

(function loadPlaylistDiagnosticsModule(global) {
  'use strict';
  if (global.__ronecaPlaylistDiagnosticsLoaderInstalled) return;
  global.__ronecaPlaylistDiagnosticsLoaderInstalled = true;

  function load() {
    if (document.querySelector('script[data-playlist-diagnostics-module]')) return;
    var script = document.createElement('script');
    script.src = './playlist-diagnostics-module.js';
    script.defer = true;
    script.dataset.playlistDiagnosticsModule = 'true';
    document.head.appendChild(script);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once: true });
  else load();
})(window);
