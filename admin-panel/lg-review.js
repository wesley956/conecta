(function installLgReviewPortal(global) {
  'use strict';

  var FUNCTION_NAME = 'lg-review-panel';
  var loginCard = document.getElementById('login-card');
  var reviewPanel = document.getElementById('review-panel');
  var loginForm = document.getElementById('login-form');
  var activationForm = document.getElementById('activation-form');
  var loginMessage = document.getElementById('login-message');
  var activationMessage = document.getElementById('activation-message');
  var devicesList = document.getElementById('devices-list');
  var loginButton = document.getElementById('login-button');
  var activateButton = document.getElementById('activate-button');
  var authFlowVersion = 0;

  function setMessage(element, text, kind) {
    element.textContent = text;
    element.className = 'message' + (kind ? ' ' + kind : '');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatDate(value) {
    if (!value) return '—';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  function friendlyAuthMessage(error) {
    var message = String(error && error.message || 'Sign-in failed.');
    if (/database error querying schema/i.test(message)) {
      return 'The review account could not be validated. Please try again.';
    }
    if (/invalid login credentials/i.test(message)) {
      return 'The review email or password is incorrect.';
    }
    return message;
  }

  function showLoggedOut(message, kind) {
    reviewPanel.hidden = true;
    loginCard.hidden = false;
    document.getElementById('account-expiry').textContent = 'Loading account information…';
    if (message) setMessage(loginMessage, message, kind || '');
  }

  function showReviewPanel() {
    loginCard.hidden = true;
    reviewPanel.hidden = false;
  }

  function getConfig() {
    var config = global.RONECA_PANEL_CONFIG || {};
    var supabaseUrl = String(config.supabaseUrl || '').replace(/\/$/, '');
    var anonKey = String(config.anonKey || '');
    if (!supabaseUrl || !anonKey) throw new Error('Public service configuration is unavailable.');
    return { supabaseUrl: supabaseUrl, anonKey: anonKey };
  }

  async function callReviewApi(action, payload) {
    var config = getConfig();
    var token = await global.RonecaPanelAuth.getAccessToken();
    var response = await fetch(config.supabaseUrl + '/functions/v1/' + FUNCTION_NAME, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.anonKey,
        Authorization: 'Bearer ' + token,
      },
      body: JSON.stringify(Object.assign({ action: action }, payload || {})),
    });
    var body = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(body.error || 'Review service request failed.');
    return body;
  }

  function renderDevices(devices) {
    if (!Array.isArray(devices) || devices.length === 0) {
      devicesList.innerHTML = '<p class="empty-state">No review television has been activated yet.</p>';
      return;
    }

    devicesList.innerHTML = devices.map(function (device) {
      var revoked = Boolean(device.revokedAt);
      var details = [device.platform || 'webOS', device.appVersion ? 'App ' + device.appVersion : null, 'Activated ' + formatDate(device.activatedAt)]
        .filter(Boolean).join(' · ');
      return '<article class="device-row' + (revoked ? ' revoked' : '') + '">' +
        '<div><strong>' + escapeHtml(device.deviceCode || 'Unknown device') + '</strong><small>' + escapeHtml(details) + '</small></div>' +
        '<span class="status-pill">' + (revoked ? 'Deactivated' : escapeHtml(device.status || 'Active')) + '</span>' +
        (revoked ? '' : '<button type="button" class="deactivate-button" data-device-code="' + escapeHtml(device.deviceCode || '') + '">Deactivate for retest</button>') +
        '</article>';
    }).join('');
  }

  async function loadStatus() {
    var result = await callReviewApi('status');
    document.getElementById('account-name').textContent = result.account && result.account.name || 'LG Quality Assurance';
    document.getElementById('account-expiry').textContent = 'Access valid until ' + formatDate(result.account && result.account.expiresAt) +
      ' · ' + String(result.account && result.account.activeDevices || 0) + '/' + String(result.account && result.account.maxDevices || 0) + ' active review TVs';
    renderDevices(result.devices);
    return result;
  }

  async function signOut() {
    authFlowVersion += 1;
    await global.RonecaPanelAuth.signOut();
    loginForm.reset();
    showLoggedOut('Signed out. Enter the private review credentials to continue.', '');
  }

  loginForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    var currentFlow = ++authFlowVersion;
    loginButton.disabled = true;
    showLoggedOut('Signing in…', '');

    try {
      await global.RonecaPanelAuth.signIn(
        document.getElementById('email').value,
        document.getElementById('password').value
      );
      if (currentFlow !== authFlowVersion) return;

      await loadStatus();
      if (currentFlow !== authFlowVersion) return;

      setMessage(loginMessage, 'Authenticated.', 'success');
      showReviewPanel();
    } catch (error) {
      if (currentFlow !== authFlowVersion) return;
      await global.RonecaPanelAuth.signOut();
      showLoggedOut(friendlyAuthMessage(error), 'error');
    } finally {
      if (currentFlow === authFlowVersion) loginButton.disabled = false;
    }
  });

  activationForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    var codeInput = document.getElementById('device-code');
    var deviceCode = String(codeInput.value || '').trim().toUpperCase();
    if (!deviceCode) return;

    activateButton.disabled = true;
    setMessage(activationMessage, 'Validating and activating the LG television…', '');
    try {
      var result = await callReviewApi('activate', { deviceCode: deviceCode });
      setMessage(activationMessage, result.message || 'Device activated. Return to the TV.', 'success');
      codeInput.value = '';
      await loadStatus();
    } catch (error) {
      setMessage(activationMessage, error && error.message ? error.message : 'Activation failed.', 'error');
    } finally {
      activateButton.disabled = false;
    }
  });

  devicesList.addEventListener('click', async function (event) {
    var button = event.target.closest('[data-device-code]');
    if (!button) return;
    var deviceCode = button.getAttribute('data-device-code');
    if (!deviceCode) return;

    button.disabled = true;
    setMessage(activationMessage, 'Deactivating the review television…', '');
    try {
      var result = await callReviewApi('deactivate', { deviceCode: deviceCode });
      setMessage(activationMessage, result.message || 'Device deactivated.', 'success');
      await loadStatus();
    } catch (error) {
      setMessage(activationMessage, error && error.message ? error.message : 'Deactivation failed.', 'error');
      button.disabled = false;
    }
  });

  document.getElementById('signout-button').addEventListener('click', signOut);
  document.getElementById('refresh-button').addEventListener('click', async function () {
    try {
      await loadStatus();
    } catch (error) {
      authFlowVersion += 1;
      await global.RonecaPanelAuth.signOut();
      showLoggedOut(error && error.message ? error.message : 'The review session has expired.', 'error');
    }
  });

  document.getElementById('device-code').addEventListener('input', function (event) {
    event.target.value = String(event.target.value || '').toUpperCase().replace(/[^A-Z0-9-]/g, '');
  });

  showLoggedOut('', '');

  (async function restoreSession() {
    if (!global.RonecaPanelAuth) {
      showLoggedOut('The isolated review authentication module did not load.', 'error');
      return;
    }
    if (!global.RonecaPanelAuth.hasSession()) return;

    var currentFlow = authFlowVersion;
    try {
      await loadStatus();
      if (currentFlow !== authFlowVersion) return;
      showReviewPanel();
    } catch (_error) {
      if (currentFlow !== authFlowVersion) return;
      await global.RonecaPanelAuth.signOut();
      showLoggedOut('Your previous review session is no longer valid. Sign in again.', '');
    }
  })();
})(window);
