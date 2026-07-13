(function installRonecaPanelAuth(global) {
  'use strict';

  var STORAGE_KEY = 'roneca-panel-auth-session-v1';
  var REFRESH_MARGIN_SECONDS = 90;
  var originalFetch = global.fetch.bind(global);
  var refreshPromise = null;

  function getConfig() {
    var config = global.RONECA_PANEL_CONFIG || {};
    var supabaseUrl = String(config.supabaseUrl || '').replace(/\/$/, '');
    var anonKey = String(config.anonKey || '').trim();

    if (!/^https:\/\//i.test(supabaseUrl) || !anonKey) {
      throw new Error('Configuração pública do Supabase não encontrada. Gere panel-config.js no deploy.');
    }

    return { supabaseUrl: supabaseUrl, anonKey: anonKey };
  }

  function readSession() {
    try {
      var raw = global.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;

      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.access_token || !parsed.refresh_token) return null;
      return parsed;
    } catch (_error) {
      return null;
    }
  }

  function writeSession(session) {
    if (!session || !session.access_token || !session.refresh_token) {
      throw new Error('Sessão de autenticação incompleta.');
    }

    var expiresIn = Number(session.expires_in || 3600);
    var expiresAt = Number(session.expires_at || Math.floor(Date.now() / 1000) + expiresIn);
    var safeSession = {
      access_token: String(session.access_token),
      refresh_token: String(session.refresh_token),
      token_type: String(session.token_type || 'bearer'),
      expires_in: expiresIn,
      expires_at: expiresAt,
      user: session.user || null,
    };

    global.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(safeSession));
    return safeSession;
  }

  function clearSession() {
    global.sessionStorage.removeItem(STORAGE_KEY);
  }

  function hasSession() {
    return Boolean(readSession());
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
        headers: {
          apikey: config.anonKey,
          Authorization: 'Bearer ' + session.access_token,
        },
      });
    } catch (_error) {
      // A sessão local já foi removida. Falha de rede não deve impedir logout.
    }
  }

  function isPanelFunctionUrl(value) {
    try {
      var url = new URL(String(value), global.location.href);
      return /\/functions\/v1\/(admin-panel|seller-panel)(?:\/|$)/.test(url.pathname);
    } catch (_error) {
      return false;
    }
  }

  global.fetch = async function authenticatedPanelFetch(input, init) {
    var requestUrl = input instanceof Request ? input.url : String(input);

    if (!isPanelFunctionUrl(requestUrl)) {
      return originalFetch(input, init);
    }

    var token = await getAccessToken();
    var config = getConfig();
    var headers = new Headers(
      init && init.headers
        ? init.headers
        : input instanceof Request
          ? input.headers
          : undefined,
    );

    headers.delete('x-admin-token');
    headers.delete('x-seller-token');
    headers.set('Authorization', 'Bearer ' + token);
    headers.set('apikey', config.anonKey);

    var nextInit = Object.assign({}, init || {}, {
      headers: headers,
      cache: 'no-store',
    });

    var response = await originalFetch(input, nextInit);

    if (response.status !== 401) return response;

    await refreshSession();
    headers.set('Authorization', 'Bearer ' + await getAccessToken());
    return await originalFetch(input, Object.assign({}, nextInit, { headers: headers }));
  };

  global.RonecaPanelAuth = Object.freeze({
    signIn: signIn,
    signOut: signOut,
    hasSession: hasSession,
    getAccessToken: getAccessToken,
    refreshSession: refreshSession,
    clearSession: clearSession,
    getUser: function getUser() {
      var session = readSession();
      return session ? session.user || null : null;
    },
  });
})(window);
