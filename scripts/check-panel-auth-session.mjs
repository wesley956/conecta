import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(String(key)) ? values.get(String(key)) : null;
    },
    setItem(key, value) {
      values.set(String(key), String(value));
    },
    removeItem(key) {
      values.delete(String(key));
    },
  };
}

const source = fs.readFileSync('admin-panel/panel-auth-session.js', 'utf8');
const sessionStorage = createStorage();
const localStorage = createStorage();
const retiredKeys = ['roneca_admin_token', 'cruz-stars-admin-token', 'roneca_seller_token'];
for (const key of retiredKeys) {
  sessionStorage.setItem(key, 'legacy-secret-session');
  localStorage.setItem(key, 'legacy-secret-local');
}
const requests = [];
let refreshMode = 'success';

async function originalFetch(input, init = {}) {
  const url = input instanceof Request ? input.url : String(input);
  const headers = new Headers(
    init.headers || (input instanceof Request ? input.headers : undefined),
  );

  requests.push({ url, headers, init });

  if (url.includes('/auth/v1/token?grant_type=password')) {
    return new Response(JSON.stringify({
      access_token: 'access-token-test',
      refresh_token: 'refresh-token-test',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'user-test', email: 'admin@example.com' },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (url.includes('/auth/v1/token?grant_type=refresh_token')) {
    if (refreshMode === 'fail') {
      return new Response(JSON.stringify({ error: 'refresh_token_not_found' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({
      access_token: 'access-token-refreshed',
      refresh_token: 'refresh-token-refreshed',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'user-test', email: 'admin@example.com' },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const windowObject = {
  fetch: originalFetch,
  sessionStorage,
  localStorage,
  location: {
    href: 'https://wesley956.github.io/conecta/index.html',
  },
  RONECA_PANEL_CONFIG: {
    supabaseUrl: 'https://project-test.supabase.co',
    anonKey: 'public-anon-key-for-test-only-abcdefghijklmnopqrstuvwxyz',
  },
};

vm.runInNewContext(source, {
  window: windowObject,
  URL,
  Request,
  Headers,
  Response,
  console,
});

assert.ok(windowObject.RonecaPanelAuth, 'Cliente de autenticação não foi instalado.');
for (const key of retiredKeys) {
  assert.equal(sessionStorage.getItem(key), null, `Chave legada ${key} deve ser removida do sessionStorage no boot.`);
  assert.equal(localStorage.getItem(key), null, `Chave legada ${key} deve ser removida do localStorage no boot.`);
}

await windowObject.RonecaPanelAuth.signIn('ADMIN@EXAMPLE.COM', 'password-test');
assert.equal(windowObject.RonecaPanelAuth.hasSession(), true, 'Sessão deveria existir após login.');
for (const key of retiredKeys) {
  assert.equal(sessionStorage.getItem(key), null, `Login moderno não pode recriar ${key}.`);
  assert.equal(localStorage.getItem(key), null, `Login moderno não pode persistir ${key}.`);
}

requests.length = 0;
await windowObject.fetch('https://evil.example/functions/v1/admin-panel?source=legacy', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-admin-token': 'legacy-secret-that-must-not-leave',
    'x-seller-token': 'legacy-secret-that-must-not-leave',
  },
  body: JSON.stringify({ action: 'dashboard' }),
});

assert.equal(requests.length, 1);
assert.equal(
  requests[0].url,
  'https://project-test.supabase.co/functions/v1/admin-panel?source=legacy',
  'Função do painel deveria ser reescrita para a origem Supabase configurada.',
);
assert.equal(requests[0].headers.get('authorization'), 'Bearer access-token-test');
assert.equal(requests[0].headers.get('apikey'), 'public-anon-key-for-test-only-abcdefghijklmnopqrstuvwxyz');
assert.equal(requests[0].headers.has('x-admin-token'), false);
assert.equal(requests[0].headers.has('x-seller-token'), false);

requests.length = 0;
await windowObject.fetch('https://evil.example/functions/v1/seller-device-flow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'noop' }),
});
assert.equal(requests.length, 1);
assert.equal(requests[0].url, 'https://project-test.supabase.co/functions/v1/seller-device-flow');
assert.equal(requests[0].headers.get('authorization'), 'Bearer access-token-test');

requests.length = 0;
await windowObject.fetch('https://evil.example/not-a-panel-function', {
  headers: { 'X-Test': 'untouched' },
});

assert.equal(requests.length, 1);
assert.equal(requests[0].url, 'https://evil.example/not-a-panel-function');
assert.equal(requests[0].headers.has('authorization'), false, 'JWT não pode ser enviado para uma URL externa não reconhecida.');
assert.equal(requests[0].headers.has('apikey'), false);

const STORAGE_KEY = 'roneca-panel-auth-session-v1';
let stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
stored.expires_at = Math.floor(Date.now() / 1000) - 1;
sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
refreshMode = 'success';
requests.length = 0;

assert.equal(
  await windowObject.RonecaPanelAuth.getAccessToken(),
  'access-token-refreshed',
  'Sessão expirada deve renovar o JWT antes de uma operação comercial.',
);
assert.ok(
  requests.some(request => request.url.includes('/auth/v1/token?grant_type=refresh_token')),
  'Sessão expirada precisa passar pelo refresh token.',
);
assert.equal(windowObject.RonecaPanelAuth.hasSession(), true, 'Refresh válido deve preservar a sessão.');

stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
stored.expires_at = Math.floor(Date.now() / 1000) - 1;
sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
refreshMode = 'fail';

await assert.rejects(
  windowObject.RonecaPanelAuth.getAccessToken(),
  /refresh_token_not_found/,
  'Refresh inválido precisa encerrar a sessão expirada.',
);
assert.equal(windowObject.RonecaPanelAuth.hasSession(), false, 'Sessão irrecuperável deve ser removida.');
for (const key of retiredKeys) {
  assert.equal(sessionStorage.getItem(key), null);
  assert.equal(localStorage.getItem(key), null);
}

windowObject.RonecaPanelAuth.clearSession();
assert.equal(windowObject.RonecaPanelAuth.hasSession(), false);
for (const key of retiredKeys) {
  assert.equal(sessionStorage.getItem(key), null);
  assert.equal(localStorage.getItem(key), null);
}

console.log('✅ Sessão do painel validada: somente Supabase Auth, refresh controlado e nenhuma chave legada.');
