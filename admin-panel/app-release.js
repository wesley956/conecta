(function installProtectedAppRelease(global) {
  'use strict';

  function formatBytes(value) {
    var bytes = Number(value || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return '—';
    return (bytes / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB';
  }

  function formatDate(value) {
    var date = new Date(String(value || ''));
    return Number.isNaN(date.getTime())
      ? '—'
      : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  async function request(action) {
    var response = await fetch(global.RonecaPanelAuth.getFunctionUrl('app-release'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: action }),
    });
    var payload = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(payload.error || 'Não foi possível consultar o aplicativo.');
    return payload;
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
    root.querySelector('[data-app-release-notes]').textContent =
      release.notes || 'Sem observações para esta versão.';
  }

  async function load(root) {
    setStatus(root, 'Consultando a versão publicada...');
    try {
      var release = await request('manifest');
      render(root, release);
      setStatus(root, 'Versão pronta para download protegido.');
    } catch (error) {
      setStatus(root, error.message, true);
    }
  }

  async function generate(root, openDownload) {
    setStatus(root, 'Gerando link temporário...');
    try {
      var release = await request('download');
      render(root, release);
      var input = root.querySelector('[data-app-release-link]');
      input.value = release.apkUrl || '';
      root.querySelector('[data-app-release-link-wrap]').hidden = false;
      setStatus(root, 'Link válido por 1 hora. Depois disso, gere outro.');

      if (openDownload) {
        var anchor = document.createElement('a');
        anchor.href = release.apkUrl;
        anchor.rel = 'noreferrer';
        anchor.download = 'ronecaPlayerTV-v' + release.versionName + '.apk';
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
      setStatus(root, 'Link copiado. Cole no Downloader em até 1 hora.');
    } catch (_error) {
      input.focus();
      input.select();
      document.execCommand('copy');
      setStatus(root, 'Link selecionado para copiar.');
    }
  }

  function bind(root) {
    if (root.dataset.appReleaseReady === 'true') return;
    root.dataset.appReleaseReady = 'true';
    root.querySelector('[data-app-release-generate]').addEventListener('click', function () {
      generate(root, false);
    });
    root.querySelector('[data-app-release-download]').addEventListener('click', function () {
      generate(root, true);
    });
    root.querySelector('[data-app-release-copy]').addEventListener('click', function () {
      copy(root);
    });
    load(root);
  }

  function init() {
    document.querySelectorAll('[data-app-release]').forEach(bind);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})(window);

