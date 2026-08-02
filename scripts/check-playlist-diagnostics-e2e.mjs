import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adminRoot = path.join(root, 'admin-panel');
const artifactRoot = path.join(root, 'artifacts', 'e2e');
const calls = [];
let starts = 0;

function chromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    '/tmp/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  const found = candidates.find(file => fs.existsSync(file));
  if (!found) throw new Error('Chromium/Chrome não encontrado. Configure CHROME_PATH.');
  return found;
}

function step(number, key, origin, status, code, detail) {
  return {
    step: number,
    key,
    origin,
    status,
    httpStatus: status === 'ok' && number !== 12 ? 200 : null,
    latencyMs: origin === 'system' ? null : 18 + number,
    code,
    count: null,
    detail,
  };
}

function diagnostic(status, id = 'diagnostic-e2e') {
  const completed = status === 'completed';
  return {
    id,
    playlistId: id.includes('seller') ? 'playlist-seller' : 'playlist-admin',
    playlistName: id.includes('seller') ? 'Lista do Vendedor' : 'Lista Administrativa',
    status,
    classification: completed ? 'DEVICE_ONLY' : 'SERVER_UNAVAILABLE',
    strategy: completed ? 'direct' : 'retry',
    summary: completed
      ? 'O Android oficial confirmou o acesso pela rede do cliente.'
      : 'O servidor não concluiu; aguardando comparação pelo Android oficial.',
    serverSteps: [
      step(5, 'head', 'server', completed ? 'timeout' : 'timeout', 'TIMEOUT', 'O servidor atingiu o tempo limite.'),
      step(6, 'redirects', 'server', 'ok', 'NO_REDIRECT', 'Sem redirecionamento.'),
      step(7, 'auth', 'server', 'skipped', 'SERVER_UNAVAILABLE', 'Autenticação não repetida sem conexão.'),
      step(8, 'account', 'server', 'skipped', 'AUTH_REQUIRED', 'Conta não consultada.'),
      step(9, 'category', 'server', 'skipped', 'AUTH_REQUIRED', 'Categoria não consultada.'),
      step(10, 'content', 'server', 'skipped', 'AUTH_REQUIRED', 'Conteúdo não consultado.'),
      step(11, 'playback', 'server', 'skipped', 'CONTENT_REQUIRED', 'Playback não testado no servidor.'),
      step(12, 'comparison', 'system', completed ? 'ok' : 'waiting', completed ? 'DEVICE_CONFIRMED' : 'WAITING_DEVICE', completed ? 'Comparação concluída.' : 'Aguardando Android oficial.'),
      step(13, 'classification', 'system', 'ok', completed ? 'DEVICE_ONLY' : 'SERVER_UNAVAILABLE', completed ? 'Acesso confirmado somente no aparelho.' : 'Resultado provisório do servidor.'),
      step(14, 'strategy', 'system', 'ok', completed ? 'direct' : 'retry', completed ? 'Estratégia direta selecionada.' : 'Nova tentativa ou comparação necessária.'),
    ],
    deviceSteps: completed ? [
      step(5, 'head', 'device', 'ok', 'HEAD_OK', 'Android alcançou o endpoint.'),
      step(7, 'auth', 'device', 'ok', 'AUTH_OK', 'Android confirmou autenticação.'),
      step(11, 'playback', 'device', 'ok', 'PLAYBACK_OK', 'Android confirmou a reprodução.'),
    ] : [],
    comparison: completed ? { divergent: true, deviceConfirmed: true } : {},
    startedAt: '2026-08-02T22:00:00Z',
    updatedAt: '2026-08-02T22:00:05Z',
    completedAt: completed ? '2026-08-02T22:00:05Z' : null,
    expiresAt: '2026-08-02T22:10:00Z',
  };
}

const fixture = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Diagnóstico E2E</title></head>
<body>
  <table><tbody id="playlistsBody"><tr>
    <td><input id="pl-name-playlist-admin" value="Lista Administrativa"></td>
    <td><div class="actions"></div></td>
  </tr></tbody></table>
  <article class="seller-playlist-item">
    <strong>Lista do Vendedor</strong>
    <div class="actions"><button type="button" onclick="sellerListsRefreshCache('playlist-seller')">Atualizar cache</button></div>
  </article>
  <script>
    window.__e2ePlaylistAccess = { 'playlist-admin': ['seller-1'], 'playlist-seller': ['seller-1'] };
    window.RONECA_PANEL_CONFIG = { supabaseUrl: 'https://diagnostics.test', anonKey: 'public-e2e-key' };
    window.RonecaPanelAuth = {
      getAccessToken: async () => 'e2e-access-token',
      getFunctionUrl: name => 'https://diagnostics.test/functions/v1/' + name,
      refreshSession: async () => true,
    };
  </script>
  <script src="./app-release.js"></script>
</body>
</html>`;

async function startServer() {
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname;
    if (pathname === '/' || pathname === '/fixture.html') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(fixture);
      return;
    }
    const fileName = pathname.slice(1);
    if (!['app-release.js', 'playlist-diagnostics-module.js'].includes(fileName)) {
      response.writeHead(404); response.end('Not found'); return;
    }
    response.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(fs.readFileSync(path.join(adminRoot, fileName)));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

function responseHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, authorization, apikey',
  };
}

async function main() {
  fs.mkdirSync(artifactRoot, { recursive: true });
  const { server, origin } = await startServer();
  const browser = await puppeteer.launch({
    executablePath: chromeExecutable(),
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = request.url();
      if (url.startsWith(origin)) {
        request.continue();
        return;
      }
      if (url.startsWith('https://diagnostics.test/functions/v1/playlist-diagnostics')) {
        if (request.method() === 'OPTIONS') {
          request.respond({ status: 204, headers: responseHeaders() });
          return;
        }
        let payload = {};
        try { payload = JSON.parse(request.postData() || '{}'); } catch { payload = {}; }
        calls.push(payload);
        if (payload.action === 'start') {
          starts += 1;
          const id = payload.playlistId === 'playlist-seller' ? 'diagnostic-seller' : 'diagnostic-admin';
          const body = { ok: true, diagnostic: diagnostic(starts === 1 ? 'waiting_device' : 'completed', id) };
          request.respond({ status: 200, contentType: 'application/json', headers: responseHeaders(), body: JSON.stringify(body) });
          return;
        }
        if (payload.action === 'get') {
          request.respond({ status: 200, contentType: 'application/json', headers: responseHeaders(), body: JSON.stringify({ diagnostic: diagnostic('completed', 'diagnostic-admin') }) });
          return;
        }
        request.respond({ status: 400, contentType: 'application/json', headers: responseHeaders(), body: JSON.stringify({ error: 'Ação não simulada.' }) });
        return;
      }
      request.abort();
    });

    await page.goto(`${origin}/fixture.html`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.__playlistDiagnosticsReady === true, { timeout: 7_000 });
    await page.waitForFunction(() => document.querySelectorAll('[data-playlist-diagnostic-id]').length === 2, { timeout: 7_000 });
    assert.equal(await page.evaluate(() => window.__e2ePlaylistAccess['playlist-admin'][0]), 'seller-1');

    await page.click('[data-playlist-diagnostic-id="playlist-admin"]');
    await page.waitForFunction(() => document.querySelector('#playlistDiagnosticsContent')?.textContent?.includes('Aguardando Android oficial'), { timeout: 7_000 });
    await page.waitForFunction(() => document.querySelector('#playlistDiagnosticsContent')?.textContent?.includes('Concluído'), { timeout: 8_000 });

    const adminText = await page.$eval('#playlistDiagnosticsContent', element => element.textContent || '');
    assert.match(adminText, /5 · HEAD do endpoint/);
    assert.match(adminText, /14 · Estratégia/);
    assert.match(adminText, /DEVICE_ONLY/);
    assert.doesNotMatch(adminText, /https?:\/\//i);
    assert.doesNotMatch(adminText, /username|password|secret|alice/i);
    await page.screenshot({ path: path.join(artifactRoot, 'playlist-diagnostics-1280x800.png'), fullPage: false });

    await page.click('.pld-close');
    await page.click('[data-playlist-diagnostic-id="playlist-seller"]');
    await page.waitForFunction(() => document.querySelector('#playlistDiagnosticsContent')?.textContent?.includes('Concluído'), { timeout: 7_000 });
    const sellerText = await page.$eval('#playlistDiagnosticsContent', element => element.textContent || '');
    assert.match(sellerText, /Lista do Vendedor|DEVICE_ONLY/);
    assert.doesNotMatch(sellerText, /https?:\/\//i);

    assert.ok(calls.some(call => call.action === 'start' && call.playlistId === 'playlist-admin'));
    assert.ok(calls.some(call => call.action === 'get' && call.diagnosticId === 'diagnostic-admin'));
    assert.ok(calls.some(call => call.action === 'start' && call.playlistId === 'playlist-seller'));
    assert.deepEqual(errors, []);
    await page.close();
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }

  console.log('✅ Diagnóstico progressivo validado no navegador: admin, vendedor, espera Android e saneamento.');
}

await main();
