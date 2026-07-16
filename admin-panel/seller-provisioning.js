(function installSellerProvisioning(global) {
  'use strict';

  function byId(id) {
    return global.document.getElementById(id);
  }

  function setLabelFor(input, text) {
    if (!input) return;
    var previous = input.previousElementSibling;
    if (previous && previous.tagName === 'LABEL') previous.textContent = text;
  }

  function ensurePasswordField(emailId, passwordId) {
    var emailInput = byId(emailId);
    if (!emailInput) return null;

    emailInput.type = 'email';
    emailInput.required = true;
    emailInput.autocomplete = 'email';
    emailInput.placeholder = 'vendedor@exemplo.com';
    setLabelFor(emailInput, 'E-mail de acesso');

    var existing = byId(passwordId);
    if (existing) return existing;

    var passwordLabel = global.document.createElement('label');
    passwordLabel.htmlFor = passwordId;
    passwordLabel.textContent = 'Senha inicial';

    var passwordInput = global.document.createElement('input');
    passwordInput.id = passwordId;
    passwordInput.type = 'password';
    passwordInput.required = true;
    passwordInput.minLength = 8;
    passwordInput.maxLength = 128;
    passwordInput.autocomplete = 'new-password';
    passwordInput.placeholder = 'Mínimo de 8 caracteres';

    var help = global.document.createElement('p');
    help.className = 'muted small';
    help.textContent = 'O vendedor usará este e-mail e esta senha para entrar no portal. A senha não será armazenada no cadastro comercial.';
    help.style.margin = '7px 0 0';

    emailInput.insertAdjacentElement('afterend', passwordLabel);
    passwordLabel.insertAdjacentElement('afterend', passwordInput);
    passwordInput.insertAdjacentElement('afterend', help);
    return passwordInput;
  }

  function normalizeEmail(value) {
    var email = String(value || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Informe um e-mail válido para o vendedor.');
    }
    return email;
  }

  function validatePassword(value) {
    var password = String(value || '');
    if (password.length < 8) throw new Error('A senha inicial deve possuir pelo menos 8 caracteres.');
    if (password.length > 128) throw new Error('A senha inicial excede o tamanho permitido.');
    return password;
  }

  async function provisionSeller(payload) {
    var config = global.RONECA_PANEL_CONFIG || {};
    var supabaseUrl = String(config.supabaseUrl || '').trim();
    var anonKey = String(config.anonKey || '').trim();
    if (!supabaseUrl || !anonKey) throw new Error('Configuração pública do Supabase não encontrada.');

    var accessToken = await global.RonecaPanelAuth.getAccessToken();
    var response = await global.fetch(supabaseUrl + '/functions/v1/seller-provision', {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + accessToken,
        'apikey': anonKey,
      },
      body: JSON.stringify(payload),
    });

    var data = await response.json().catch(function emptyPayload() { return {}; });
    if (!response.ok) {
      throw new Error(data.error || data.message || 'Não foi possível cadastrar o vendedor.');
    }
    return data;
  }

  function clearSellerFields() {
    [
      'newSellerName',
      'newSellerWhatsapp',
      'newSellerEmail',
      'newSellerPassword',
      'uxNewSellerName',
      'uxNewSellerWhatsapp',
      'uxNewSellerEmail',
      'uxNewSellerPassword',
    ].forEach(function clearTextField(id) {
      var field = byId(id);
      if (field) field.value = '';
    });

    ['newSellerInitialCredits', 'uxNewSellerInitialCredits'].forEach(function resetCredits(id) {
      var field = byId(id);
      if (field) field.value = '0';
    });

    ['newSellerCanGoNegative', 'uxNewSellerCanGoNegative'].forEach(function resetCheck(id) {
      var field = byId(id);
      if (field) field.checked = false;
    });
  }

  function installFormFields() {
    ensurePasswordField('newSellerEmail', 'newSellerPassword');
    ensurePasswordField('uxNewSellerEmail', 'uxNewSellerPassword');

    var oldDescription = byId('newSellerName')?.closest('.card')?.querySelector('.sub');
    if (oldDescription) oldDescription.textContent = 'Crie o vendedor comercial e o acesso individual ao portal.';
  }

  function installOverrides() {
    global.createSeller = async function createSellerWithAuth() {
      try {
        var name = String(byId('newSellerName')?.value || '').trim();
        var whatsapp = String(byId('newSellerWhatsapp')?.value || '').trim();
        var email = normalizeEmail(byId('newSellerEmail')?.value);
        var password = validatePassword(byId('newSellerPassword')?.value);
        if (!name) throw new Error('Nome do vendedor é obrigatório.');
        if (!whatsapp) throw new Error('WhatsApp do vendedor é obrigatório.');

        if (typeof global.show === 'function') global.show('Criando vendedor e acesso ao portal...');
        var result = await provisionSeller({
          name: name,
          whatsapp: whatsapp,
          email: email,
          password: password,
          initialCredits: Number(byId('newSellerInitialCredits')?.value || 0),
          canGoNegative: Boolean(byId('newSellerCanGoNegative')?.checked),
        });

        clearSellerFields();
        if (typeof global.loadAll === 'function') await global.loadAll();
        if (typeof global.show === 'function') {
          global.show(result.message || 'Vendedor cadastrado e acesso ao portal liberado.');
        }
        return true;
      } catch (error) {
        var hiddenPassword = byId('newSellerPassword');
        if (hiddenPassword) hiddenPassword.value = '';
        if (typeof global.show === 'function') {
          global.show(error?.message || 'Falha ao cadastrar vendedor.', true);
        }
        return false;
      }
    };

    global.submitCommercialSeller = async function submitCommercialSellerWithAuth() {
      byId('newSellerName').value = byId('uxNewSellerName').value;
      byId('newSellerWhatsapp').value = byId('uxNewSellerWhatsapp').value;
      byId('newSellerEmail').value = byId('uxNewSellerEmail').value;
      byId('newSellerPassword').value = byId('uxNewSellerPassword').value;
      byId('newSellerInitialCredits').value = byId('uxNewSellerInitialCredits').value || '0';
      byId('newSellerCanGoNegative').checked = byId('uxNewSellerCanGoNegative').checked;

      var created = await global.createSeller();
      var modalPassword = byId('uxNewSellerPassword');
      if (modalPassword) modalPassword.value = '';
      if (created && typeof global.closeCommercialActionModal === 'function') {
        global.closeCommercialActionModal();
      }
    };
  }

  function install() {
    if (!byId('commercialActionModal')) return;
    installFormFields();
    installOverrides();
  }

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})(window);
