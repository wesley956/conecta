(function installLgReviewAuth(global) {
  'use strict';

  var STORAGE_KEY = 'roneca-lg-review-auth-session-v1';
  var REFRESH_MARGIN_SECONDS = 90;
  var MAX_TOKEN_LENGTH = 16 * 1024;
  var refreshPromise = null;
  var originalFetch = global.fetch.bind(global);

  function getConfig() {
    var config = global.RONECA_PANEL_CONFIG || {};
    var rawUrl = String(config.supabaseUrl || '').trim();
    var anonKey = String(config.anonKey || '').trim();
    var parsed;

    try {
      parsed = new URL(rawUrl);
    } catch (_error) {
      throw new Error('Public authentication configuration is unavailable.');
    }

    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      throw new Error('The authentication service configuration is invalid.');
    }

    if (!anonKey || anonKey.length > MAX_TOKEN_LENGTH) {
      throw new Error('The public authentication key is unavailable.');
    }

    return { supabaseUrl: parsed.origin, anonKey: anonKey };
  }

  function clearSession() {
    global.sessionStorage.removeItem(STORAGE_KEY);
  }

  function readSession() {
    try {
      var raw = global.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;

      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.access_token || !parsed.refresh_token) {
        clearSession();
        return null;
      }

      if (
        String(parsed.access_token).length > MAX_TOKEN_LENGTH ||
        String(parsed.refresh_token).length > MAX_TOKEN_LENGTH
      ) {
        clearSession();
        return null;
      }

      return parsed;
    } catch (_error) {
      clearSession();
      return null;
    }
  }

  function writeSession(session) {
    if (!session || !session.access_token || !session.refresh_token) {
      throw new Error('The authentication session is incomplete.');
    }

    var accessToken = String(session.access_token);
    var refreshToken = String(session.refresh_token);
    if (accessToken.length > MAX_TOKEN_LENGTH || refreshToken.length > MAX_TOKEN_LENGTH) {
      throw new Error('The authentication session is invalid.');
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
    return safeSession;
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
      throw new Error(String(message || ('Authentication failed. HTTP ' + response.status)));
    }

    if (!payload) throw new Error('The authentication service returned no data.');
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
      throw new Error('Enter the review email and password.');
    }

    clearSession();
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
      if (!current) throw new Error('Review session not found.');

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
    if (!session) throw new Error('Review session not found.');

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
      // The isolated local review session has already been removed.
    }
  }

  global.RonecaPanelAuth = Object.freeze({
    signIn: signIn,
    signOut: signOut,
    hasSession: function hasSession() { return Boolean(readSession()); },
    getAccessToken: getAccessToken,
    refreshSession: refreshSession,
    clearSession: clearSession,
    getUser: function getUser() {
      var session = readSession();
      return session ? session.user || null : null;
    },
  });
})(window);
