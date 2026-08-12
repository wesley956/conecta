(function installSupportProfile(global) {
  'use strict';

  if (global.RonecaSupportProfile) return;
  var loaded = new WeakSet();

  function field(form, name) {
    return form.elements.namedItem(name);
  }

  function setStatus(container, message, kind) {
    var status = container.querySelector('[data-support-status]');
    if (!status) return;
    status.textContent = message || '';
    status.className = 'support-profile-status' + (kind ? ' ' + kind : '');
    status.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  }

  function updatePreview(container) {
    var form = container.querySelector('[data-support-form]');
    var preview = container.querySelector('[data-support-preview]');
    if (!form || !preview) return;
    var values = {
      displayName: String(field(form, 'displayName').value || '').trim() || 'Suporte',
      whatsapp: String(field(form, 'whatsapp').value || '').trim(),
      email: String(field(form, 'email').value || '').trim(),
      supportText: String(field(form, 'supportText').value || '').trim(),
      businessHours: String(field(form, 'businessHours').value || '').trim(),
    };
    preview.querySelector('[data-preview-name]').textContent = values.displayName;
    preview.querySelector('[data-preview-contact]').textContent = values.whatsapp || values.email || 'Contato ainda não informado';
    preview.querySelector('[data-preview-text]').textContent = values.supportText || 'Sem mensagem adicional.';
    preview.querySelector('[data-preview-hours]').textContent = values.businessHours || 'Horário não informado.';
  }

  function applyProfile(container, profile) {
    var form = container.querySelector('[data-support-form]');
    if (!form) return;
    ['displayName', 'whatsapp', 'email', 'supportText', 'businessHours', 'contactUrl'].forEach(function assign(name) {
      field(form, name).value = profile && profile[name] ? String(profile[name]) : '';
    });
    var visibilityName = container.dataset.supportRole === 'system' ? 'enabled' : 'showInApp';
    field(form, visibilityName).checked = profile ? profile[visibilityName] === true : visibilityName === 'showInApp';
    updatePreview(container);
  }

  async function request(body) {
    var response = await fetch(global.RonecaPanelAuth.getFunctionUrl('support-panel'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    var payload = await response.json().catch(function emptyPayload() { return {}; });
    if (!response.ok) throw new Error(payload.error || payload.message || 'Falha ao acessar o perfil de suporte.');
    return payload;
  }

  async function load(container, force) {
    if (!container || (loaded.has(container) && !force)) return;
    setStatus(container, 'Carregando perfil…');
    try {
      var payload = await request({ action: 'getProfile' });
      applyProfile(container, payload.profile || {});
      loaded.add(container);
      setStatus(container, 'Perfil carregado.');
    } catch (error) {
      setStatus(container, error.message || 'Não foi possível carregar o perfil.', 'error');
    }
  }

  function formPayload(container, form) {
    var visibilityName = container.dataset.supportRole === 'system' ? 'enabled' : 'showInApp';
    return {
      action: 'saveProfile',
      displayName: field(form, 'displayName').value,
      whatsapp: field(form, 'whatsapp').value,
      email: field(form, 'email').value,
      supportText: field(form, 'supportText').value,
      businessHours: field(form, 'businessHours').value,
      contactUrl: field(form, 'contactUrl').value,
      [visibilityName]: field(form, visibilityName).checked,
    };
  }

  async function save(container, form) {
    var submit = form.querySelector('[type="submit"]');
    if (submit.disabled) return;
    submit.disabled = true;
    setStatus(container, 'Salvando…');
    try {
      var payload = await request(formPayload(container, form));
      applyProfile(container, payload.profile || {});
      loaded.add(container);
      setStatus(container, payload.message || 'Perfil salvo com sucesso.', 'success');
    } catch (error) {
      setStatus(container, error.message || 'Não foi possível salvar.', 'error');
    } finally {
      submit.disabled = false;
    }
  }

  function bind(container) {
    var form = container.querySelector('[data-support-form]');
    if (!form || form.dataset.supportBound === 'true') return;
    form.dataset.supportBound = 'true';
    form.addEventListener('input', function refreshPreview() { updatePreview(container); });
    form.addEventListener('submit', function submitProfile(event) {
      event.preventDefault();
      save(container, form);
    });
    container.querySelector('[data-support-reload]')?.addEventListener('click', function reloadProfile() {
      load(container, true);
    });
    updatePreview(container);
  }

  function loadAll(options) {
    document.querySelectorAll('[data-support-profile]').forEach(function initialize(container) {
      bind(container);
      if (options && options.force) load(container, true);
      else load(container, false);
    });
  }

  function initialize() {
    document.querySelectorAll('[data-support-profile]').forEach(bind);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();

  global.RonecaSupportProfile = Object.freeze({ load: load, loadAll: loadAll });
})(window);
