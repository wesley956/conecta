(function installSellerManagement(global) {
  'use strict';

  function byId(id) { return global.document.getElementById(id); }
  function text(value) { return String(value == null ? '' : value).trim(); }

  function setLabelFor(input, labelText) {
    if (!input) return;
    var previous = input.previousElementSibling;
    if (previous && previous.tagName === 'LABEL') previous.textContent = labelText;
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

    var label = global.document.createElement('label');
    label.htmlFor = passwordId;
    label.textContent = 'Senha inicial';

    var input = global.document.createElement('input');
    input.id = passwordId;
    input.type = 'password';
    input.required = true;
    input.minLength = 8;
    input.maxLength = 128;
    input.autocomplete = 'new-password';
    input.placeholder = 'Mínimo de 8 caracteres';

    var help = global.document.createElement('p');
    help.className = 'muted small';
    help.style.margin = '7px 0 0';
    help.textContent = 'O vendedor usará este e-mail e esta senha para entrar no portal.';

    emailInput.insertAdjacentElement('afterend', label);
    label.insertAdjacentElement('afterend', input);
    input.insertAdjacentElement('afterend', help);
    return input;
  }

  function normalizeEmail(value) {
    var email = text(value).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um e-mail válido para o vendedor.');
    return email;
  }

  function validatePassword(value) {
    var password = String(value || '');
    if (password.length < 8) throw new Error('A senha inicial deve possuir pelo menos 8 caracteres.');
    if (password.length > 128) throw new Error('A senha inicial excede o tamanho permitido.');
    return password;
  }

  async function callProtectedFunction(functionName, payload) {
    var config = global.RONECA_PANEL_CONFIG || {};
    var supabaseUrl = text(config.supabaseUrl);
    var anonKey = text(config.anonKey);
    if (!supabaseUrl || !anonKey) throw new Error('Configuração pública do Supabase não encontrada.');
    if (!global.RonecaPanelAuth) throw new Error('Sessão do painel não foi carregada. Entre novamente.');

    var accessToken = await global.RonecaPanelAuth.getAccessToken();
    var response = await global.fetch(supabaseUrl + '/functions/v1/' + functionName, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: 'Bearer ' + accessToken,
        apikey: anonKey,
      },
      body: JSON.stringify(payload || {}),
    });

    var data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.error || data.message || 'A operação não pôde ser concluída.');
    return data;
  }

  function clearSellerFields() {
    ['newSellerName','newSellerWhatsapp','newSellerEmail','newSellerPassword','uxNewSellerName','uxNewSellerWhatsapp','uxNewSellerEmail','uxNewSellerPassword']
      .forEach(function (id) { var field = byId(id); if (field) field.value = ''; });
    ['newSellerInitialCredits','uxNewSellerInitialCredits']
      .forEach(function (id) { var field = byId(id); if (field) field.value = '0'; });
    ['newSellerAccessDurationHours','uxNewSellerAccessDurationHours']
      .forEach(function (id) { var field = byId(id); if (field) field.value = '0'; });
    ['newSellerAutoDeleteGraceHours','uxNewSellerAutoDeleteGraceHours']
      .forEach(function (id) { var field = byId(id); if (field) field.value = '36'; });
    ['newSellerCanGoNegative','uxNewSellerCanGoNegative','newSellerAutoDeleteAfterExpiry','uxNewSellerAutoDeleteAfterExpiry']
      .forEach(function (id) { var field = byId(id); if (field) field.checked = false; });
  }

  function removeLegacyAccessControls(root) {
    var scope = root || global.document;
    scope.querySelectorAll('[id^="seller-token-"], [id^="seller-public-code-"]').forEach(function (input) {
      var container = input.closest('.seller-detail-section') || input.parentElement;
      if (container && /Códigos de acesso/i.test(container.textContent || '')) container.remove();
    });
    scope.querySelectorAll('button').forEach(function (button) {
      var action = button.getAttribute('onclick') || '';
      var caption = button.textContent || '';
      if (/saveSellerToken|saveSellerPublicCode|seller-token-|seller-public-code-/i.test(action) || /copiar token|salvar token|código público/i.test(caption)) button.remove();
    });
  }

  function polishSellerUi(root) {
    removeLegacyAccessControls(root);
  }

  function installRenderHooks() {
    ['renderSellerReports', 'renderCommercial', 'showSellerDetails'].forEach(function (name) {
      var original = global[name];
      if (typeof original !== 'function' || original.__sellerManagementWrapped) return;
      var wrapped = function () {
        var result = original.apply(this, arguments);
        polishSellerUi(global.document);
        return result;
      };
      wrapped.__sellerManagementWrapped = true;
      global[name] = wrapped;
    });
  }

  function installForms() {
    ensurePasswordField('newSellerEmail', 'newSellerPassword');
    ensurePasswordField('uxNewSellerEmail', 'uxNewSellerPassword');
    var description = byId('newSellerName') && byId('newSellerName').closest('.card')?.querySelector('.sub');
    if (description) description.textContent = 'Crie o vendedor comercial e o acesso individual ao portal.';
  }

  global.createSeller = async function createSellerWithAuth() {
    try {
      var name = text(byId('newSellerName')?.value);
      var whatsapp = text(byId('newSellerWhatsapp')?.value);
      var email = normalizeEmail(byId('newSellerEmail')?.value);
      var password = validatePassword(byId('newSellerPassword')?.value);
      if (!name) throw new Error('Nome do vendedor é obrigatório.');
      if (!whatsapp) throw new Error('WhatsApp do vendedor é obrigatório.');

      if (typeof global.show === 'function') global.show('Criando vendedor e acesso ao portal...');
      var result = await callProtectedFunction('seller-provision', {
        name: name,
        whatsapp: whatsapp,
        email: email,
        password: password,
        initialCredits: Number(byId('newSellerInitialCredits')?.value || 0),
        canGoNegative: Boolean(byId('newSellerCanGoNegative')?.checked),
        accessDurationHours: Number(byId('newSellerAccessDurationHours')?.value || 0),
        autoDeleteAfterExpiry: Boolean(byId('newSellerAutoDeleteAfterExpiry')?.checked),
        autoDeleteGraceHours: Number(byId('newSellerAutoDeleteGraceHours')?.value || 36),
      });
      clearSellerFields();
      if (typeof global.loadAll === 'function') await global.loadAll();
      if (typeof global.show === 'function') global.show(result.message || 'Vendedor cadastrado e acesso liberado.');
      return true;
    } catch (error) {
      ['newSellerPassword', 'uxNewSellerPassword'].forEach(function (id) { var field = byId(id); if (field) field.value = ''; });
      if (typeof global.show === 'function') global.show(error?.message || 'Falha ao cadastrar vendedor.', true);
      return false;
    }
  };

  global.provisionExistingSellerLogin = async function provisionExistingSellerLogin(sellerId) {
    try {
      var seller = Array.isArray(global.sellers) ? global.sellers.find(function (item) { return item.id === sellerId; }) : null;
      if (!seller) throw new Error('Vendedor não encontrado.');
      var email = normalizeEmail(byId('seller-login-email-' + sellerId)?.value || seller.email);
      var password = validatePassword(byId('seller-login-password-' + sellerId)?.value);
      if (typeof global.show === 'function') global.show('Liberando login do vendedor antigo...');
      var result = await callProtectedFunction('seller-provision', {
        existingSellerId: sellerId,
        name: seller.name,
        whatsapp: seller.whatsapp,
        email: email,
        password: password,
      });
      if (typeof global.closeDetails === 'function') global.closeDetails();
      if (typeof global.loadAll === 'function') await global.loadAll();
      if (typeof global.show === 'function') global.show(result.message || 'Acesso do vendedor liberado.');
      return true;
    } catch (error) {
      var passwordField = byId('seller-login-password-' + sellerId);
      if (passwordField) passwordField.value = '';
      if (typeof global.show === 'function') global.show(error?.message || 'Falha ao liberar o acesso.', true);
      return false;
    }
  };

  global.submitCommercialSeller = async function submitCommercialSellerWithAuth() {
    var pairs = [
      ['newSellerName','uxNewSellerName'], ['newSellerWhatsapp','uxNewSellerWhatsapp'],
      ['newSellerEmail','uxNewSellerEmail'], ['newSellerPassword','uxNewSellerPassword'],
      ['newSellerInitialCredits','uxNewSellerInitialCredits'],
      ['newSellerAccessDurationHours','uxNewSellerAccessDurationHours'],
      ['newSellerAutoDeleteGraceHours','uxNewSellerAutoDeleteGraceHours'],
    ];
    pairs.forEach(function (pair) {
      var target = byId(pair[0]); var source = byId(pair[1]);
      if (target && source) target.value = source.value;
    });
    var targetCheck = byId('newSellerCanGoNegative');
    var sourceCheck = byId('uxNewSellerCanGoNegative');
    if (targetCheck && sourceCheck) targetCheck.checked = sourceCheck.checked;
    var targetAutoDelete = byId('newSellerAutoDeleteAfterExpiry');
    var sourceAutoDelete = byId('uxNewSellerAutoDeleteAfterExpiry');
    if (targetAutoDelete && sourceAutoDelete) targetAutoDelete.checked = sourceAutoDelete.checked;
    var created = await global.createSeller();
    if (created && typeof global.closeCommercialActionModal === 'function') global.closeCommercialActionModal();
    return created;
  };

  global.configureSellerTemporaryAccess = async function configureSellerTemporaryAccess(sellerId) {
    try {
      var durationHours = Number(byId('seller-access-duration-' + sellerId)?.value || 0);
      var graceHours = Number(byId('seller-access-grace-' + sellerId)?.value || 36);
      if (!Number.isFinite(durationHours) || durationHours < 0 || durationHours > 8760) {
        throw new Error('Informe uma validade entre 0 e 8760 horas.');
      }
      if (!Number.isFinite(graceHours) || graceHours < 1 || graceHours > 720) {
        throw new Error('Informe uma tolerância entre 1 e 720 horas.');
      }
      var autoDelete = durationHours > 0 && Boolean(byId('seller-access-auto-delete-' + sellerId)?.checked);

      if (typeof global.show === 'function') global.show('Atualizando a validade da conta...');
      var result = await callProtectedFunction('admin-panel', {
        action: 'configureSellerTemporaryAccess',
        sellerId: sellerId,
        durationHours: Math.floor(durationHours),
        autoDeleteAfterExpiry: autoDelete,
        autoDeleteGraceHours: Math.floor(graceHours),
      });
      if (typeof global.closeDetails === 'function') global.closeDetails();
      if (typeof global.loadAll === 'function') await global.loadAll();
      if (typeof global.show === 'function') global.show(result.message || 'Validade da conta atualizada.');
      return true;
    } catch (error) {
      if (typeof global.show === 'function') global.show(error?.message || 'Falha ao atualizar a validade.', true);
      return false;
    }
  };

  global.deleteSellerAccount = async function deleteSellerAccount(sellerId) {
    var seller = Array.isArray(global.sellers) ? global.sellers.find(function (item) { return item.id === sellerId; }) : null;
    var sellerName = seller?.name || 'este vendedor';
    if (!global.confirm('Excluir ' + sellerName + '? O acesso por e-mail e senha também será removido.')) return false;
    if (!global.confirm('Confirma a exclusão definitiva? Aparelhos e clientes serão preservados, mas ficarão sem vendedor. O histórico financeiro também será mantido.')) return false;
    try {
      if (typeof global.show === 'function') global.show('Excluindo vendedor e acesso...');
      var result = await callProtectedFunction('seller-delete', { sellerId: sellerId });
      if (typeof global.closeDetails === 'function') global.closeDetails();
      if (typeof global.loadAll === 'function') await global.loadAll();
      if (typeof global.show === 'function') global.show(result.message || 'Vendedor excluído.');
      return true;
    } catch (error) {
      if (typeof global.show === 'function') global.show(error?.message || 'Falha ao excluir vendedor.', true);
      return false;
    }
  };

  function install() {
    installForms();
    installRenderHooks();
    polishSellerUi(global.document);
  }

  if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})(window);
