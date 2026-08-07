import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adminRoot = path.join(root, 'admin-panel');
const tvRoot = path.join(root, 'smart-tv', 'dist');
const artifactRoot = path.join(root, 'artifacts', 'e2e');
const calls = [];
const reports = [];

const ids = {
  seller: '00000000-0000-4000-8000-000000000001',
  customer: '00000000-0000-4000-8000-000000000002',
  plan: '00000000-0000-4000-8000-000000000003',
  primary: '00000000-0000-4000-8000-000000000004',
  backup: '00000000-0000-4000-8000-000000000005',
  active: '00000000-0000-4000-8000-000000000006',
  pending: '00000000-0000-4000-8000-000000000007',
};

const fixture = {
  seller: { id: ids.seller, name: 'Vendedor Teste', creditBalance: 12, canGoNegative: false, status: 'active' },
  customer: { id: ids.customer, name: 'Cliente Teste', whatsapp: '11999998888', sellerId: ids.seller },
  plan: { id: ids.plan, name: 'Mensal', durationDays: 30, creditCost: 1, status: 'active' },
  primary: { id: ids.primary, name: 'Lista Principal', active: true, qualificationStatus: 'ready_cache', qualificationLabel: 'Cache pronto', commerciallyUsable: true },
  backup: { id: ids.backup, name: 'Lista Reserva', active: true, qualificationStatus: 'ready_cache', qualificationLabel: 'Cache pronto', commerciallyUsable: true },
  active: {
    id: ids.active, deviceCode: 'ACTIVE01', status: 'active', sellerId: ids.seller,
    sellerName: 'Vendedor Teste', customerId: ids.customer, customerName: 'Cliente Teste',
    customerWhatsapp: '11999998888', planId: ids.plan, planName: 'Mensal',
    playlistId: ids.primary, playlistName: 'Lista Principal', backupPlaylistId: ids.backup,
    backupPlaylistName: 'Lista Reserva', expiresAt: '2026-09-01T12:00:00Z',
  },
  pending: { id: ids.pending, deviceCode: 'PEND5678', status: 'pending', sellerId: null, planId: null, playlistId: null },
};

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', env: process.env });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} falhou:\n${result.stdout}\n${result.stderr}`);
}

function mime(file) {
  if (file.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.json')) return 'application/json; charset=utf-8';
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

function serveFile(response, base, relative) {
  const file = path.resolve(base, relative || 'index.html');
  if (!file.startsWith(path.resolve(base) + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404); response.end('Not found'); return;
  }
  response.writeHead(200, { 'Content-Type': mime(file), 'Cache-Control': 'no-store' });
  response.end(fs.readFileSync(file));
}

async function startServer() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    if (url.pathname.startsWith('/admin/')) return serveFile(response, adminRoot, url.pathname.slice(7));
    if (url.pathname.startsWith('/tv/')) return serveFile(response, tvRoot, url.pathname.slice(4));
    response.writeHead(404); response.end('Not found');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-device-credential',
  };
}

function tvConfig() {
  const parts = prefix => ({
    channelsUrl: `https://cache.test/${prefix}/channels.json`,
    moviesUrl: `https://cache.test/${prefix}/movies.json`,
    seriesUrl: `https://cache.test/${prefix}/series.json`,
  });
  return {
    active: true, status: 'active', deviceCode: 'TV123456', deviceCredential: 'credential-e2e',
    clientName: 'Sala de Teste', expiresAt: '2026-09-01T12:00:00Z', playlistName: 'Lista Principal',
    selectedPlaylistId: 'playlist-primary', cacheVersion: 'e2e-v1', cacheItemCount: 3,
    cacheParts: parts('primary'),
    playlists: [
      { id: 'playlist-primary', name: 'Lista Principal', priority: 1, role: 'primary', cacheParts: parts('primary') },
      { id: 'playlist-backup', name: 'Lista Reserva', priority: 2, role: 'backup', cacheParts: parts('backup') },
    ],
  };
}

function cacheResult(url) {
  if (url.includes('/primary/')) return { status: 503, body: { error: 'Falha simulada da principal.' } };
  if (url.endsWith('/channels.json')) return { status: 200, body: { channels: [{ id: 'c1', name: 'Canal Reserva', groupTitle: 'Abertos', url: 'https://media.test/live.m3u8' }] } };
  if (url.endsWith('/movies.json')) return { status: 200, body: { movies: [{ id: 'm1', name: 'Filme Reserva', category: 'Aventura', url: 'https://media.test/movie.mp4' }] } };
  return { status: 200, body: { series: [{ id: 's1', name: 'Série Reserva', category: 'Drama', seasons: [] }] } };
}

async function installNetwork(page, story) {
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = request.url();
    if (url.startsWith('http://127.0.0.1:')) return request.continue();
    if (request.method() === 'OPTIONS') return request.respond({ status: 204, headers: cors() });
    if (url.startsWith('https://cache.test/')) {
      const result = cacheResult(url);
      return request.respond({ status: result.status, contentType: 'application/json', headers: cors(), body: JSON.stringify(result.body) });
    }
    if (url.includes('/functions/v1/')) {
      const functionName = new URL(url).pathname.split('/').filter(Boolean).at(-1);
      let payload = {};
      try { payload = JSON.parse(request.postData() || '{}'); } catch { payload = {}; }
      calls.push({ story, functionName, action: payload.action || null, payload });
      if (functionName === 'seller-panel') {
        if (payload.action === 'lookupDeviceCode') {
          return request.respond({ status: 200, contentType: 'application/json', headers: cors(), body: JSON.stringify({ ok: true, device: { ...fixture.pending, canActivate: true, canClaim: true, belongsToAnotherSeller: false } }) });
        }
        return request.respond({ status: 200, contentType: 'application/json', headers: cors(), body: JSON.stringify({ seller: fixture.seller, devices: [fixture.active, fixture.pending], plans: [fixture.plan], playlists: [fixture.primary, fixture.backup], creditLedger: [], stats: {} }) });
      }
      if (functionName === 'seller-device-flow') {
        return request.respond({ status: 200, contentType: 'application/json', headers: cors(), body: JSON.stringify({ ok: true, result: { applied: true, confirmationStatus: 'confirmed' }, message: 'Operação canônica concluída.' }) });
      }
      if (functionName === 'device-config') {
        if (payload.playlistHealth) {
          reports.push(payload.playlistHealth);
          return request.respond({ status: 200, contentType: 'application/json', headers: cors(), body: '{}' });
        }
        return request.respond({ status: 200, contentType: 'application/json', headers: cors(), body: JSON.stringify(tvConfig()) });
      }
      return request.respond({ status: 200, contentType: 'application/json', headers: cors(), body: '{}' });
    }
    if (url.startsWith('https://media.test/')) return request.respond({ status: 204, headers: cors() });
    return request.respond({ status: 200, contentType: 'application/json', headers: cors(), body: '{}' });
  });
}

function baseGlobals() {
  return `
    window.RONECA_PANEL_CONFIG={supabaseUrl:'https://example.test',anonKey:'${'x'.repeat(64)}'};
    window.RonecaPanelAuth={getAccessToken:async()=> 'e2e-token'};
    window.__messages=[];
    window.show=(message,error=false)=>window.__messages.push({message:String(message),error});
    window.loadAll=async()=>{};
  `;
}

async function waitForCall(story, action, start) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const call = calls.slice(start).find(item => item.story === story && item.functionName === 'seller-device-flow' && item.action === action);
    if (call) return call;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`seller-device-flow/${action} não ocorreu em ${story}.`);
}

async function adminStory(browser, origin) {
  const story = 'admin';
  const page = await browser.newPage();
  page.on('dialog', dialog => dialog.accept());
  await installNetwork(page, story);
  await page.setContent(`<!doctype html><html><body>
    <div id="msg"></div>
    <select id="pend-customer-${ids.pending}"><option value="${ids.customer}" selected>Cliente Teste</option></select>
    <select id="pend-seller-${ids.pending}"><option value="${ids.seller}" selected>Vendedor Teste</option></select>
    <select id="pend-plan-${ids.pending}"><option value="${ids.plan}" selected>Mensal</option></select>
    <select id="pend-playlist-${ids.pending}"><option value="${ids.primary}" selected>Principal</option></select>
    <select id="pend-backup-playlist-${ids.pending}"><option value="${ids.backup}" selected>Reserva</option></select>
    <input id="pend-exp-${ids.pending}" value="2026-09-30">
    <script>${baseGlobals()}
      var devices=${JSON.stringify([fixture.active, fixture.pending])};
      var sellers=${JSON.stringify([fixture.seller])};
      var customers=${JSON.stringify([fixture.customer])};
      var plans=${JSON.stringify([fixture.plan])};
      var playlists=${JSON.stringify([fixture.primary, fixture.backup])};
    </script>
    <script src="${origin}/admin/admin-device-flow.js"></script>
  </body></html>`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => Boolean(window.RonecaAdminDeviceFlow));

  let start = calls.length;
  await page.evaluate(async id => { await window.RonecaAdminDeviceFlow.activatePending(id); }, ids.pending);
  const activation = await waitForCall(story, 'activate', start);
  assert.equal(activation.payload.customerId, ids.customer);
  assert.equal(activation.payload.planId, ids.plan);
  assert.equal(activation.payload.playlistId, ids.primary);
  assert.equal(activation.payload.backupPlaylistId, ids.backup);
  assert.ok(activation.payload.idempotencyKey);

  start = calls.length;
  await page.evaluate(id => window.RonecaAdminDeviceFlow.openRenewal(id), ids.active);
  await page.waitForSelector('#adminDeviceFlowModal.open #adfRenewPlan');
  await page.select('#adfRenewPlan', ids.plan);
  await page.click('[data-adf-renew]');
  const renewal = await waitForCall(story, 'renew', start);
  assert.equal('playlistId' in renewal.payload, false);
  assert.equal('backupPlaylistId' in renewal.payload, false);
  assert.equal('customerId' in renewal.payload, false);

  start = calls.length;
  await page.evaluate(id => window.RonecaAdminDeviceFlow.openPlaylistChange(id), ids.active);
  await page.waitForSelector('#adminDeviceFlowModal.open #adfChangePrimary');
  await page.select('#adfChangePrimary', ids.primary);
  await page.select('#adfChangeBackup', ids.backup);
  await page.click('[data-adf-change]');
  const change = await waitForCall(story, 'changePlaylists', start);
  assert.equal('planId' in change.payload, false);
  assert.equal('expiresAt' in change.payload, false);
  assert.equal(change.payload.playlistId, ids.primary);
  assert.equal(change.payload.backupPlaylistId, ids.backup);

  await page.screenshot({ path: path.join(artifactRoot, 'admin-canonical.png') });
  await page.close();
}

async function sellerStory(browser, origin) {
  const story = 'seller';
  const page = await browser.newPage();
  await installNetwork(page, story);
  await page.setContent(`<!doctype html><html><body>
    <script>${baseGlobals()}
      window.loadPortal=async()=>{};
      window.RonecaSellerPortal={refresh:async()=>{}};
      window.RonecaUniversalPlaylists={open:()=>{}};
    </script>
    <script src="${origin}/admin/panel-time.js"></script>
    <script src="${origin}/admin/seller-activation-wizard.js"></script>
  </body></html>`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => Boolean(window.RonecaSellerDeviceFlowUI));

  let start = calls.length;
  await page.evaluate(code => window.RonecaSellerDeviceFlowUI.openActivation(code), fixture.pending.deviceCode);
  await page.waitForSelector('#activationWizard.open [data-aw-field="customerName"]');
  await page.type('[data-aw-field="customerName"]', 'Cliente Novo');
  await page.type('[data-aw-field="customerWhatsapp"]', '11911112222');
  await page.click('[data-aw-action="next"]');
  await page.select('[data-aw-field="planId"]', ids.plan);
  await page.click('[data-aw-action="next"]');
  await page.select('[data-aw-field="playlistId"]', ids.primary);
  await page.click('[data-aw-action="next"]');
  await page.click('[data-aw-field="useBackup"]');
  await page.select('[data-aw-field="backupPlaylistId"]', ids.backup);
  await page.click('[data-aw-action="next"]');
  await page.click('[data-aw-action="submit"]');
  const activation = await waitForCall(story, 'activate', start);
  assert.equal(activation.payload.playlistId, ids.primary);
  assert.equal(activation.payload.backupPlaylistId, ids.backup);
  await page.waitForFunction(() => !document.querySelector('#activationWizard')?.classList.contains('open'));

  start = calls.length;
  await page.evaluate(id => window.RonecaSellerDeviceFlowUI.openRenewal(id), ids.active);
  await page.waitForSelector('#activationWizard.open [data-aw-field="planId"]');
  await page.click('[data-aw-action="next"]');
  await page.click('[data-aw-action="submit"]');
  const renewal = await waitForCall(story, 'renew', start);
  assert.equal('playlistId' in renewal.payload, false);
  assert.equal('backupPlaylistId' in renewal.payload, false);
  assert.equal('customerName' in renewal.payload, false);
  await page.waitForFunction(() => !document.querySelector('#activationWizard')?.classList.contains('open'));

  start = calls.length;
  await page.evaluate(id => window.RonecaSellerDeviceFlowUI.openChange(id), ids.active);
  await page.waitForSelector('#activationWizard.open [data-aw-field="playlistId"]');
  await page.click('[data-aw-action="next"]');
  await page.select('[data-aw-field="backupPlaylistId"]', ids.backup);
  await page.click('[data-aw-action="next"]');
  await page.click('[data-aw-action="submit"]');
  const change = await waitForCall(story, 'changePlaylists', start);
  assert.equal('planId' in change.payload, false);
  assert.equal('expiresAt' in change.payload, false);
  assert.equal(change.payload.playlistId, ids.primary);
  assert.equal(change.payload.backupPlaylistId, ids.backup);

  await page.screenshot({ path: path.join(artifactRoot, 'seller-canonical.png') });
  await page.close();
}

async function tvStory(browser, origin) {
  const story = 'tv';
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('roneca.smart-tv.deviceCode', 'TV123456');
    localStorage.setItem('roneca.smart-tv.deviceCredential', 'credential-e2e');
    localStorage.setItem('roneca.smart-tv.deviceUuid', 'uuid-tv-e2e');
  });
  await installNetwork(page, story);
  await page.goto(`${origin}/tv/index.html`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.querySelector('.status')?.textContent?.includes('Reserva ativa'), { timeout: 10000 });
  assert.ok(reports.some(item => item.playlistId === 'playlist-primary' && item.status === 'failure'));
  assert.ok(reports.some(item => item.playlistId === 'playlist-backup' && item.status === 'success'));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  await page.screenshot({ path: path.join(artifactRoot, 'tv-failover.png') });
  await page.close();
}

let browser;
let server;
try {
  fs.mkdirSync(artifactRoot, { recursive: true });
  run('npm', ['run', 'build', '--prefix', 'smart-tv']);
  const started = await startServer();
  server = started.server;
  browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  await adminStory(browser, started.origin);
  await sellerStory(browser, started.origin);
  await tvStory(browser, started.origin);

  for (const story of ['admin', 'seller']) {
    for (const action of ['activate', 'renew', 'changePlaylists']) {
      assert.ok(calls.some(call => call.story === story && call.functionName === 'seller-device-flow' && call.action === action), `${story} não chamou ${action}`);
    }
  }
  fs.writeFileSync(path.join(artifactRoot, 'report.json'), JSON.stringify({ calls, reports }, null, 2) + '\n');
  console.log('✅ Browser E2E Lote 2: ADM e vendedor usam seller-device-flow; Smart TV mantém failover.');
} finally {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
