(function installProtectedAppRelease(global) {
  'use strict';

  var platforms = [
    { id: 'android', label: 'Android TV', extension: 'APK', available: true, install: 'Instalação direta e atualização pelo aplicativo.' },
    { id: 'webos', label: 'LG webOS', extension: 'IPK', available: true, install: 'Teste via Developer Mode ou atualização pela LG Content Store.' },
    { id: 'tizen', label: 'Samsung Tizen', extension: 'WGT', available: false, availabilityLabel: 'Em breve', install: 'O pacote Samsung Tizen ainda não foi publicado.' }
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

  // Trechos entre crases viram <code>. Tudo é montado com textContent (sem innerHTML), então o texto
  // das notas nunca é interpretado como HTML.
  function appendInlineCode(parent, text) {
    String(text).split('`').forEach(function (part, index) {
      if (!part) return;
      if (index % 2 === 1) {
        var code = document.createElement('code');
        code.textContent = part;
        parent.appendChild(code);
      } else {
        parent.appendChild(document.createTextNode(part));
      }
    });
  }

  // As notas chegam em Markdown simples: "# Título" por versão e "- item". Antes eram exibidas cruas
  // (com "#" e "-"). Cada versão vira uma seção recolhível; a mais recente (a primeira) começa aberta.
  function renderNotes(container, notes) {
    var source = String(notes || '').trim();
    container.replaceChildren();
    if (!source) {
      container.classList.remove('app-release-notes-rich');
      container.textContent = 'Sem observações para esta versão.';
      return;
    }
    container.classList.add('app-release-notes-rich');
    var sections = [];
    var section = null;
    source.split(/\r?\n/).forEach(function (line) {
      var heading = /^#{1,3}\s+(.*)$/.exec(line);
      if (heading) {
        section = { title: heading[1].trim(), lines: [] };
        sections.push(section);
        return;
      }
      if (!section) {
        section = { title: '', lines: [] };
        sections.push(section);
      }
      section.lines.push(line);
    });
    sections.forEach(function (item, index) {
      var details = document.createElement('details');
      details.className = 'app-release-notes-section';
      details.open = index === 0;
      if (item.title) {
        var summary = document.createElement('summary');
        appendInlineCode(summary, item.title);
        details.appendChild(summary);
      }
      var list = null;
      item.lines.forEach(function (line) {
        var bullet = /^\s*[-*]\s+(.*)$/.exec(line);
        if (bullet) {
          if (!list) {
            list = document.createElement('ul');
            details.appendChild(list);
          }
          var entry = document.createElement('li');
          appendInlineCode(entry, bullet[1]);
          list.appendChild(entry);
          return;
        }
        list = null;
        if (!line.trim()) return;
        var paragraph = document.createElement('p');
        appendInlineCode(paragraph, line.trim());
        details.appendChild(paragraph);
      });
      container.appendChild(details);
    });
  }

  // O elemento das notas era um <p>; com seções e listas dentro, passa a ser um <div>.
  function notesContainer(root) {
    var node = root.querySelector('[data-app-release-notes]');
    if (node && node.tagName === 'P') {
      var replacement = document.createElement('div');
      replacement.className = node.className;
      replacement.setAttribute('data-app-release-notes', '');
      node.replaceWith(replacement);
      node = replacement;
    }
    return node;
  }

  function render(root, release) {
    root.querySelector('[data-app-release-version]').textContent = release.versionName || '—';
    root.querySelector('[data-app-release-size]').textContent = formatBytes(release.fileSizeBytes);
    root.querySelector('[data-app-release-date]').textContent = formatDate(release.publishedAt);
    renderNotes(notesContainer(root), release.notes);
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
      if (item.available === false) {
        button.disabled = true;
        button.setAttribute('aria-disabled', 'true');
        button.title = item.label + ': pacote ainda não publicado';
        button.textContent = item.label + ' · ' + (item.availabilityLabel || 'indisponível');
      } else {
        button.textContent = item.label + ' · .' + item.extension.toLowerCase();
        button.addEventListener('click', function () { select(root, item.id); });
      }
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
    var selected = platforms.find(function (item) { return item.id === platform; });
    if (!selected || selected.available === false) {
      setStatus(root, selected ? selected.install : 'Plataforma indisponível.', true);
      return;
    }
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
