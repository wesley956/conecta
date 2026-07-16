(function installRonecaPanelAuth(global) {
  'use strict';

  var STORAGE_KEY = 'roneca-panel-auth-session-v1';
  var LEGACY_SESSION_MARKER = 'supabase-session';
  var LEGACY_KEYS = ['roneca_admin_token', 'cruz-stars-admin-token', 'roneca_seller_token'];
  var REFRESH_MARGIN_SECONDS = 90;
  var MAX_TOKEN_LENGTH = 16 * 1024;
  var PANEL_FUNCTIONS = Object.freeze({
    'admin-panel': true,
    'seller-panel': true,
  });
  var originalFetch = global.fetch.bind(global);
  var refreshPromise = null;

  function getConfig() {
    var config = global.RONECA_PANEL_CONFIG || {};
    var rawUrl = String(config.supabaseUrl || '').trim();
    var anonKey = String(config.anonKey || '').trim();
    var parsed;

    try {
      parsed = new URL(rawUrl);
    } catch (_error) {
      throw new Error('Configuração pública do Supabase não encontrada. Gere panel-config.js no deploy.');
    }

    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      throw new Error('SUPABASE_URL precisa usar HTTPS e não pode conter credenciais.');
    }

    if (!anonKey || anonKey.length > MAX_TOKEN_LENGTH) {
      throw new Error('Chave pública anon do Supabase não encontrada ou inválida.');
    }

    return {
      supabaseUrl: parsed.origin,
      supabaseOrigin: parsed.origin,
      anonKey: anonKey,
    };
  }

  function syncLegacySessionMarkers(enabled) {
    LEGACY_KEYS.forEach(function updateMarker(key) {
      if (enabled) {
        global.sessionStorage.setItem(key, LEGACY_SESSION_MARKER);
      } else {
        global.sessionStorage.removeItem(key);
      }
    });
  }

  function readSession() {
    try {
      var raw = global.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;

      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.access_token || !parsed.refresh_token) return null;
      if (
        String(parsed.access_token).length > MAX_TOKEN_LENGTH ||
        String(parsed.refresh_token).length > MAX_TOKEN_LENGTH
      ) {
        clearSession();
        return null;
      }

      return parsed;
    } catch (_error) {
      return null;
    }
  }

  function writeSession(session) {
    if (!session || !session.access_token || !session.refresh_token) {
      throw new Error('Sessão de autenticação incompleta.');
    }

    var accessToken = String(session.access_token);
    var refreshToken = String(session.refresh_token);
    if (accessToken.length > MAX_TOKEN_LENGTH || refreshToken.length > MAX_TOKEN_LENGTH) {
      throw new Error('Sessão de autenticação excede o tamanho permitido.');
    }

    var expiresIn = Number(session.expires_in || 3600);
    if (!Number.isFinite(expiresIn) || expiresIn <= 0) expiresIn = 3600;

    var expiresAt = Number(session.expires_at || Math.floor(Date.now() / 1000) + expiresIn);
    if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
      expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
    }

    var safeSession = {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: String(session.token_type || 'bearer'),
      expires_in: expiresIn,
      expires_at: expiresAt,
      user: session.user || null,
    };

    global.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(safeSession));
    syncLegacySessionMarkers(true);
    return safeSession;
  }

  function clearSession() {
    global.sessionStorage.removeItem(STORAGE_KEY);
    syncLegacySessionMarkers(false);
  }

  function hasSession() {
    var present = Boolean(readSession());
    syncLegacySessionMarkers(present);
    return present;
  }

  async function parseJson(response) {
    var payload = null;

    try {
      payload = await response.json();
    } catch (_error) {
      payload = null;
    }

    if (!response.ok) {
      var message = payload && (
        payload.msg ||
        payload.message ||
        payload.error_description ||
        payload.error
      );

      throw new Error(String(message || ('Falha de autenticação. HTTP ' + response.status)));
    }

    if (!payload) throw new Error('O servidor de autenticação respondeu sem dados.');
    return payload;
  }

  async function authRequest(path, body) {
    var config = getConfig();
    var response = await originalFetch(config.supabaseUrl + path, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.anonKey,
      },
      body: JSON.stringify(body),
    });

    return await parseJson(response);
  }

  async function signIn(email, password) {
    var normalizedEmail = String(email || '').trim().toLowerCase();
    var normalizedPassword = String(password || '');

    if (!normalizedEmail || !normalizedPassword) {
      throw new Error('Informe email e senha.');
    }

    var session = await authRequest('/auth/v1/token?grant_type=password', {
      email: normalizedEmail,
      password: normalizedPassword,
    });

    return writeSession(session);
  }

  async function refreshSession() {
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async function refreshCurrentSession() {
      var current = readSession();
      if (!current) throw new Error('Sessão não encontrada.');

      try {
        var next = await authRequest('/auth/v1/token?grant_type=refresh_token', {
          refresh_token: current.refresh_token,
        });
        return writeSession(next);
      } catch (error) {
        clearSession();
        throw error;
      }
    })();

    try {
      return await refreshPromise;
    } finally {
      refreshPromise = null;
    }
  }

  async function getAccessToken() {
    var session = readSession();
    if (!session) throw new Error('Sessão do painel não encontrada.');

    var now = Math.floor(Date.now() / 1000);
    if (Number(session.expires_at || 0) - now <= REFRESH_MARGIN_SECONDS) {
      session = await refreshSession();
    }

    return session.access_token;
  }

  async function signOut() {
    var session = readSession();
    clearSession();

    if (!session || !session.access_token) return;

    try {
      var config = getConfig();
      await originalFetch(config.supabaseUrl + '/auth/v1/logout', {
        method: 'POST',
        cache: 'no-store',
        headers: {
          apikey: config.anonKey,
          Authorization: 'Bearer ' + session.access_token,
        },
      });
    } catch (_error) {
      // A sessão local já foi removida. Falha de rede não deve impedir logout.
    }
  }

  function resolvePanelFunctionUrl(value) {
    try {
      var config = getConfig();
      var url = new URL(String(value), global.location.href);
      var match = url.pathname.match(/^\/functions\/v1\/(admin-panel|seller-panel)(?:\/|$)/);

      if (!match || !PANEL_FUNCTIONS[match[1]]) return null;
      return new URL(url.pathname + url.search, config.supabaseOrigin).toString();
    } catch (_error) {
      return null;
    }
  }

  function getFunctionUrl(name) {
    var functionName = String(name || '').trim();
    if (!PANEL_FUNCTIONS[functionName]) {
      throw new Error('Função do painel não permitida.');
    }

    return getConfig().supabaseUrl + '/functions/v1/' + functionName;
  }

  function mergeHeaders(input, init) {
    var headers = new Headers(input instanceof Request ? input.headers : undefined);

    if (init && init.headers) {
      new Headers(init.headers).forEach(function copyHeader(value, key) {
        headers.set(key, value);
      });
    }

    return headers;
  }

  global.fetch = async function authenticatedPanelFetch(input, init) {
    var isRequestObject = input instanceof Request;
    var requestUrl = isRequestObject ? input.url : String(input);
    var panelUrl = resolvePanelFunctionUrl(requestUrl);

    if (!panelUrl) {
      return originalFetch(input, init);
    }

    var token = await getAccessToken();
    var config = getConfig();
    var headers = mergeHeaders(input, init);

    headers.delete('x-admin-token');
    headers.delete('x-seller-token');
    headers.set('Authorization', 'Bearer ' + token);
    headers.set('apikey', config.anonKey);

    var nextInit = Object.assign({}, init || {}, {
      headers: headers,
      cache: 'no-store',
    });

    function nextInput() {
      return isRequestObject
        ? new Request(panelUrl, input.clone())
        : panelUrl;
    }

    var response = await originalFetch(nextInput(), nextInit);
    if (response.status !== 401) return response;

    await refreshSession();
    headers.set('Authorization', 'Bearer ' + await getAccessToken());
    return await originalFetch(nextInput(), Object.assign({}, nextInit, { headers: headers }));
  };

  function installSellerAccessShortcut() {
    if (!/\/dashboard\.html$/.test(global.location.pathname)) return;
    if (document.querySelector('[data-seller-access-shortcut]')) return;

    var actions = document.querySelector('.topbar .actions');
    if (!actions) return;

    var link = document.createElement('a');
    link.href = './seller-access.html';
    link.className = 'btn green';
    link.textContent = 'Acessos de vendedores';
    link.setAttribute('data-seller-access-shortcut', 'true');
    actions.insertBefore(link, actions.firstChild);
  }

  global.RonecaPanelAuth = Object.freeze({
    signIn: signIn,
    signOut: signOut,
    hasSession: hasSession,
    getAccessToken: getAccessToken,
    refreshSession: refreshSession,
    clearSession: clearSession,
    getFunctionUrl: getFunctionUrl,
    getUser: function getUser() {
      var session = readSession();
      return session ? session.user || null : null;
    },
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installSellerAccessShortcut, { once: true });
  } else {
    installSellerAccessShortcut();
  }
})(window);
