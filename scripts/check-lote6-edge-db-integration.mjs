import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const baseUrl = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const anonKey = String(process.env.SUPABASE_ANON_KEY || '');
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const sellerId = String(process.env.LOTE6_TEST_SELLER_ID || '00000000-0000-4000-8000-000000009699');
const idempotencyKey = String(process.env.LOTE6_TEST_IDEMPOTENCY_KEY || 'lote6-edge-db-integration:v1');

assert.ok(baseUrl, 'SUPABASE_URL local não informado.');
assert.ok(anonKey, 'SUPABASE_ANON_KEY local não informado.');
assert.ok(serviceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY local não informado.');

const userEmail = `lote6-edge-${crypto.randomUUID()}@example.invalid`;
const userPassword = `L6-${crypto.randomUUID()}-Aa1!`;

async function request(path, { method = 'GET', key = serviceRoleKey, bearer = key, body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      apikey: key,
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { response, data };
}

function expectOk(result, label) {
  assert.ok(result.response.ok, `${label}: HTTP ${result.response.status} ${JSON.stringify(result.data)}`);
  return result.data;
}

const createdUser = expectOk(await request('/auth/v1/admin/users', {
  method: 'POST',
  body: {
    email: userEmail,
    password: userPassword,
    email_confirm: true,
    user_metadata: { panel_role: 'admin', source: 'lote6-integration' },
  },
}), 'Criar usuário Auth local');
const userId = String(createdUser?.id || createdUser?.user?.id || '');
assert.ok(userId, 'Auth local não retornou user id.');

expectOk(await request('/rest/v1/rpc/assign_panel_role', {
  method: 'POST',
  body: {
    p_user_id: userId,
    p_role: 'admin',
    p_seller_id: null,
    p_active: true,
  },
}), 'Atribuir papel admin');

const login = expectOk(await request('/auth/v1/token?grant_type=password', {
  method: 'POST',
  key: anonKey,
  bearer: null,
  body: { email: userEmail, password: userPassword },
}), 'Autenticar admin local');
const accessToken = String(login?.access_token || '');
assert.ok(accessToken, 'Login local não retornou access token.');

const unauthorized = await request('/functions/v1/admin-credit-adjust', {
  method: 'POST',
  key: anonKey,
  bearer: null,
  body: {
    sellerId,
    amount: 5,
    description: 'Integração Lote 6',
    idempotencyKey,
  },
});
assert.ok([401, 403].includes(unauthorized.response.status), `Edge sem sessão deveria rejeitar, recebeu ${unauthorized.response.status}.`);

const first = expectOk(await request('/functions/v1/admin-credit-adjust', {
  method: 'POST',
  key: anonKey,
  bearer: accessToken,
  body: {
    sellerId,
    amount: 5,
    description: 'Integração Edge Auth PostgreSQL do Lote 6',
    idempotencyKey,
  },
}), 'Primeiro ajuste pela Edge');
assert.equal(first?.ok, true, 'Edge deveria confirmar operação.');
assert.equal(first?.applied, true, 'Primeiro ajuste deveria ser aplicado.');
assert.equal(Number(first?.balanceBefore), 10, 'Saldo inicial retornado pela Edge incorreto.');
assert.equal(Number(first?.balanceAfter), 15, 'Saldo final retornado pela Edge incorreto.');

const retry = expectOk(await request('/functions/v1/admin-credit-adjust', {
  method: 'POST',
  key: anonKey,
  bearer: accessToken,
  body: {
    sellerId,
    amount: 5,
    description: 'Integração Edge Auth PostgreSQL do Lote 6',
    idempotencyKey,
  },
}), 'Retry idempotente pela Edge');
assert.equal(retry?.ok, true);
assert.equal(retry?.applied, false, 'Retry com mesma chave não pode reaplicar o crédito.');
assert.equal(Number(retry?.balanceAfter), 15, 'Retry deve preservar o saldo final.');

console.log('✅ Integração HTTP concluída: sessão obrigatória, papel admin reconhecido, Edge aplicada e retry idempotente.');
