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
const requests = [];

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

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const windowObject = {
  fetch: originalFetch,
  sessionStorage,
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

await windowObject.RonecaPanelAuth.signIn('ADMIN@EXAMPLE.COM', 'password-test');
assert.equal(windowObject.RonecaPanelAuth.hasSession(), true, 'Sessão deveria existir após login.');
assert.equal(sessionStorage.getItem('roneca_admin_token'), 'supabase-session');
assert.equal(sessionStorage.getItem('cruz-stars-admin-token'), 'supabase-session');
assert.equal(sessionStorage.getItem('roneca_seller_token'), 'supabase-session');

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
assert.equal(
  requests[0].headers.get('apikey'),
  'public-anon-key-for-test-only-abcdefghijklmnopqrstuvwxyz',
);
assert.equal(requests[0].headers.has('x-admin-token'), false);
assert.equal(requests[0].headers.has('x-seller-token'), false);

requests.length = 0;
await windowObject.fetch('https://evil.example/not-a-panel-function', {
  headers: { 'X-Test': 'untouched' },
});

assert.equal(requests.length, 1);
assert.equal(requests[0].url, 'https://evil.example/not-a-panel-function');
assert.equal(
  requests[0].headers.has('authorization'),
  false,
  'JWT não pode ser enviado para uma URL externa não reconhecida.',
);
assert.equal(requests[0].headers.has('apikey'), false);

windowObject.RonecaPanelAuth.clearSession();
assert.equal(windowObject.RonecaPanelAuth.hasSession(), false);
assert.equal(sessionStorage.getItem('roneca_admin_token'), null);
assert.equal(sessionStorage.getItem('cruz-stars-admin-token'), null);
assert.equal(sessionStorage.getItem('roneca_seller_token'), null);

console.log('✅ Sessão do painel validada: origem, JWT, compatibilidade e limpeza.');
