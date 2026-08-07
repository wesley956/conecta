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
const generatedConfigs = [path.join(adminRoot, 'panel-config.js'), path.join(root, 'public', 'panel-config.js')];
const originals = new Map(generatedConfigs.map(file => [file, fs.existsSync(file) ? fs.readFileSync(file) : null]));

const baseState = {
  customers: [{ id: 'customer-1', name: 'Cliente Teste', whatsapp: '11999998888', sellerId: 'seller-1' }],
  playlists: [
    { id: 'playlist-1', name: 'Lista Principal', playlistUrl: 'https://playlist.test/main.m3u', playlistType: 'm3u', type: 'm3u', active: true, accessMode: 'server_cache', cacheStatus: 'ready', cacheItemCount: 10, qualificationStatus: 'ready_cache', qualificationLabel: 'Cache pronto', qualificationMessage: 'Lista pronta.', commerciallyUsable: true },
    { id: 'playlist-2', name: 'Lista Reserva', playlistUrl: 'https://playlist.test/backup.m3u', playlistType: 'm3u', type: 'm3u', active: true, accessMode: 'server_cache', cacheStatus: 'ready', cacheItemCount: 10, qualificationStatus: 'ready_cache', qualificationLabel: 'Cache pronto', qualificationMessage: 'Lista pronta.', commerciallyUsable: true },
  ],
  devices: [
    { id: 'device-1', deviceCode: 'ACTIVE01', deviceUuid: 'uuid-active', status: 'active', customerId: 'customer-1', customerName: 'Cliente Teste', customerWhatsapp: '11999998888', sellerId: 'seller-1', sellerName: 'Vendedor Teste', planId: 'plan-1', planName: 'Mensal', planCreditCost: 1, playlistId: 'playlist-1', playlistName: 'Lista Principal', backupPlaylistId: 'playlist-2', backupPlaylistName: 'Lista Reserva', expiresAt: '2026-09-01T12:00:00Z', daysLeft: 25, lastSeenAt: '2026-08-01T10:00:00Z', deviceType: 'androidtv', appVersion: '2.2.1' },
    { id: 'device-2', deviceCode: 'PEND5678', deviceUuid: 'uuid-pending', status: 'pending', customerId: null, customerName: null, customerWhatsapp: null, sellerId: null, sellerName: null, planId: null, planName: null, playlistId: null, playlistName: null, backupPlaylistId: null, backupPlaylistName: null, expiresAt: null, daysLeft: null, deviceType: 'androidtv', appVersion: '2.2.1' },
  ],
  sellers: [{ id: 'seller-1', name: 'Vendedor Teste', whatsapp: '11999997777', email: 'vendedor@example.test', status: 'active', creditBalance: 12, canGoNegative: false }],
  plans: [{ id: 'plan-1', name: 'Mensal', durationDays: 30, creditCost: 1, maxDevices: 1, status: 'active' }],
};

const calls = [];
const reports = [];
const storyStates = new Map();
const stateFor = story => {
  if (!storyStates.has(story)) storyStates.set(story, structuredClone(baseState));
  return storyStates.get(story);
};

function run(command, args, env = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', env: { ...process.env, ...env } });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} falhou:\n${result.stdout}\n${result.stderr}`);
}

function sellerDashboard(state) {
  return {
    seller: state.sellers[0],
    stats: { activeDevices: state.devices.filter(item => item.status === 'active').length, expiringSoon: 0, expiredDevices: 0, pendingDevices: state.devices.filter(item => item.status === 'pending').length, blockedDevices: 0, creditsAdded: 20, creditsConsumed: 8 },
    devices: state.devices,
    plans: state.plans,
    playlists: state.playlists,
    creditLedger: [],
  };
}

function mutateCanonical(state, action, payload) {
  const device = state.devices.find(item => item.id === payload.deviceId);
  if (!device) return;
  if (action === 'activate') {
    const seller = state.sellers.find(item => item.id === (payload.sellerId || 'seller-1')) || state.sellers[0];
    const plan = state.plans.find(item => item.id === payload.planId);
    const primary = state.playlists.find(item => item.id === payload.playlistId);
    const backup = state.playlists.find(item => item.id === payload.backupPlaylistId);
    const customer = state.customers.find(item => item.id === payload.customerId);
    Object.assign(device, {
      status: 'active', sellerId: seller.id, sellerName: seller.name,
      customerId: payload.customerId || device.customerId,
      customerName: payload.customerName || customer?.name || device.customerName,
      customerWhatsapp: payload.customerWhatsapp || customer?.whatsapp || device.customerWhatsapp,
      planId: payload.planId, planName: plan?.name || null,
      playlistId: payload.playlistId, playlistName: primary?.name || null,
      backupPlaylistId: payload.backupPlaylistId || null, backupPlaylistName: backup?.name || null,
      expiresAt: payload.expiresAt || '2026-09-30T23:59:59.999Z',
    });
  } else if (action === 'renew') {
    const plan = state.plans.find(item => item.id === payload.planId);
    Object.assign(device, { planId: payload.planId, planName: plan?.name || device.planName, expiresAt: payload.expiresAt || '2026-10-31T23:59:59.999Z' });
  } else if (action === 'changePlaylists') {
    const primary = state.playlists.find(item => item.id === payload.playlistId);
    const backup = state.playlists.find(item => item.id === payload.backupPlaylistId);
    Object.assign(device, { playlistId: payload.playlistId, playlistName: primary?.name || null, backupPlaylistId: payload.backupPlaylistId || null, backupPlaylistName: backup?.name || null });
  }
}

function apiResult(functionName, action, role, story, payload) {
  const state = stateFor(story);
  if (functionName === 'seller-device-flow') {
    mutateCanonical(state, action, payload);
    return { status: 200, body: { ok: true, message: action === 'activate' ? 'Aparelho ativado.' : action === 'renew' ? 'Aparelho renovado. Cliente e listas foram preservados.' : 'Listas alteradas sem consumir crédito ou mudar validade.', result: { applied: true, confirmationStatus: 'confirmed' } } };
  }
  if (functionName === 'admin-panel') {
    if (action === 'listCustomers') return { status: 200, body: { customers: state.customers } };
    if (action === 'listPlaylists') return { status: 200, body: { playlists: state.playlists } };
    if (action === 'listDevices') return { status: 200, body: { devices: state.devices } };
    if (action === 'listCommercialData') return { status: 200, body: { sellers: state.sellers, plans: state.plans, creditLedger: [] } };
    if (action === 'listAuditLogs') return { status: 200, body: { logs: [] } };
    return { status: 200, body: { ok: true, success: true, message: 'Operação administrativa simulada.' } };
  }
  if (functionName === 'seller-panel') {
    if (action === 'dashboard' || !action) return { status: 200, body: sellerDashboard(state) };
    if (action === 'lookupDeviceCode') {
      const device = state.devices.find(item => item.deviceCode === payload.deviceCode);
      return { status: device ? 200 : 404, body: device ? { ok: true, found: true, message: 'Código encontrado.', device: { ...device, canActivate: device.status !== 'active', canClaim: device.status === 'pending', belongsToAnotherSeller: false } } : { error: 'Aparelho não encontrado.' } };
    }
    if (action === 'deleteDevice') {
      state.devices = state.devices.filter(item => item.id !== payload.deviceId);
      return { status: 200, body: { ok: true } };
    }
    return { status: 200, body: { ok: true } };
  }
  if (functionName === 'playlist-registration') return { status: 200, body: { playlists: state.playlists } };
  if (functionName === 'playlist-validation') return { status: 200, body: { devices: [], sessions: [] } };
  if (functionName === 'admin-integrity-panel') return { status: 200, body: { ok: true, activeWithoutPlaylist: [] } };
  if (functionName === 'credit-packages-panel') return { status: 200, body: { role, summary: {}, packages: [], orders: [], sellers: state.sellers, seller: state.sellers[0], lots: [] } };
  if (functionName === 'playback-diagnostics-panel') return { status: 200, body: { summary: {}, diagnostics: [], filters: { sellers: [], playlists: [] } } };
  if (functionName === 'device-config') {
    if (payload.playlistHealth) {
      reports.push({ story, ...payload.playlistHealth });
      return { status: 200, body: {} };
    }
    return { status: 200, body: tvDeviceConfiguration() };
  }
  return { status: 200, body: {} };
}

function tvDeviceConfiguration() {
  const parts = prefix => ({ channelsUrl: `https://cache.test/${prefix}/channels.json`, moviesUrl: `https://cache.test/${prefix}/movies.json`, seriesUrl: `https://cache.test/${prefix}/series.json` });
  return {
    active: true, status: 'active', deviceCode: 'TV123456', deviceCredential: 'credential-e2e', clientName: 'Sala de Teste', expiresAt: '2026-09-01T12:00:00Z', playlistName: 'Lista Principal', selectedPlaylistId: 'playlist-primary', cacheVersion: 'e2e-v1', cacheItemCount: 9, cacheParts: parts('primary'),
    playlists: [
      { id: 'playlist-primary', name: 'Lista Principal', priority: 1, role: 'primary', cacheParts: parts('primary') },
      { id: 'playlist-backup', name: 'Lista Reserva', priority: 2, role: 'backup', cacheParts: parts('backup') },
    ],
  };
}

function cacheResult(url) {
  if (url.includes('/primary/')) return { status: 503, body: { error: 'Falha simulada da lista principal.' } };
  if (url.endsWith('/channels.json')) return { status: 200, body: { channels: [{ id: 'channel-1', name: 'Canal Notícias', groupTitle: 'Abertos', url: 'https://media.test/live.m3u8' }] } };
  if (url.endsWith('/movies.json')) return { status: 200, body: { movies: [{ id: 'movie-1', name: 'Filme de Teste', category: 'Aventura', year: 2026, synopsis: 'Catálogo da reserva.', url: 'https://media.test/movie.mp4' }] } };
  return { status: 200, body: { series: [{ id: 'series-1', name: 'Série de Teste', category: 'Drama', seasons: [{ number: 1, episodes: [{ id: 'episode-1', number: 1, name: 'Episódio 1', url: 'https://media.test/episode.mp4' }] }] }] } };
}

const authStub = `(function(){
  function active(){ return sessionStorage.getItem('roneca-e2e-session') === '1'; }
  window.RonecaPanelAuth = {
    hasSession: active,
    signIn: async function(email){ sessionStorage.setItem('roneca-e2e-session','1'); sessionStorage.setItem('roneca_seller_token','e2e-token'); sessionStorage.setItem('roneca-e2e-email',email); },
    signOut: async function(){ sessionStorage.removeItem('roneca-e2e-session'); sessionStorage.removeItem('roneca_seller_token'); },
    getAccessToken: async function(){ return active() ? 'e2e-access-token' : ''; }
  };
})();`;

function mime(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
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
    if (url.pathname === '/admin/panel-auth-session.js') {
      response.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(authStub); return;
    }
    if (url.pathname.startsWith('/admin/')) return serveFile(response, adminRoot, url.pathname.slice('/admin/'.length));
    if (url.pathname.startsWith('/tv/')) return serveFile(response, tvRoot, url.pathname.slice('/tv/'.length));
    response.writeHead(302, { Location: '/admin/index.html' }); response.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

function headers() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-device-credential' };
}

async function installNetwork(page, origin, role, story) {
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = request.url();
    if (url.startsWith(origin)) return request.continue();
    if (request.method() === 'OPTIONS') return request.respond({ status: 204, headers: headers() });
    if (url.startsWith('https://cache.test/')) {
      const result = cacheResult(url);
      return request.respond({ status: result.status, contentType: 'application/json', headers: headers(), body: JSON.stringify(result.body) });
    }
    if (url.includes('/functions/v1/')) {
      const functionName = new URL(url).pathname.split('/').filter(Boolean).at(-1);
      let payload = {};
      try { payload = JSON.parse(request.postData() || '{}'); } catch { payload = {}; }
      calls.push({ story, functionName, action: payload.action || null, payload });
      const result = apiResult(functionName, payload.action || null, role, story, payload);
      return request.respond({ status: result.status, contentType: 'application/json', headers: headers(), body: JSON.stringify(result.body) });
    }
    if (url.startsWith('https://media.test/') || url.startsWith('https://playlist.test/')) return request.respond({ status: 204, headers: headers() });
    return request.respond({ status: 200, contentType: 'application/json', headers: headers(), body: '{}' });
  });
}

async function waitForCall(story, predicate, startIndex) {
  const deadline = Date.now() + 7000;
  while (Date.now() < deadline) {
    const found = calls.slice(startIndex).find(call => call.story === story && predicate(call));
    if (found) return found;
    await new Promise(resolve => setTimeout(resolve, 60));
  }
  throw new Error(`Chamada esperada não ocorreu em ${story}: ${JSON.stringify(calls.slice(startIndex).filter(call => call.story === story).map(call => [call.functionName, call.action]))}`);
}

async function login(page, origin, role) {
  await page.goto(`${origin}/admin/index.html`, { waitUntil: 'networkidle0' });
  await page.type('#email', `${role}@example.test`);
  await page.type('#password', 'senha-segura-e2e');
  await page.click('.login-primary');
  const expected = role === 'admin' ? '/admin/dashboard.html' : '/admin/seller.html';
  await page.waitForFunction(pathname => location.pathname === pathname, { timeout: 7000 }, expected);
}

async function adminStory(browser, origin) {
  const story = 'admin';
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  await installNetwork(page, origin, 'admin', story);
  await login(page, origin, 'admin');
  await page.waitForFunction(() => window.__ronecaAdminDeviceFlowInstalled === true && document.querySelector('#stDevices')?.textContent === '2');

  await page.click('button[data-tab="pending"]');
  await page.waitForSelector('button[onclick="adminOpsOpenPending(\'device-2\')"]');
  await page.click('button[onclick="adminOpsOpenPending(\'device-2\')"]');
  await page.waitForSelector('#adminPendingActivationModal.open #pend-seller-device-2');
  await page.select('#pend-customer-device-2', 'customer-1');
  await page.select('#pend-seller-device-2', 'seller-1');
  await page.select('#pend-plan-device-2', 'plan-1');
  await page.select('#pend-playlist-device-2', 'playlist-1');
  await page.select('#pend-backup-playlist-device-2', 'playlist-2');
  const activationStart = calls.length;
  await page.click('button[onclick="adminOpsConfirmPending(\'device-2\')"]');
  const activation = await waitForCall(story, call => call.functionName === 'seller-device-flow' && call.action === 'activate', activationStart);
  assert.equal(activation.payload.customerId, 'customer-1');
  assert.equal(activation.payload.playlistId, 'playlist-1');
  assert.equal(activation.payload.backupPlaylistId, 'playlist-2');
  assert.ok(activation.payload.idempotencyKey);

  const renewalStart = calls.length;
  await page.evaluate(() => window.renewDevice('device-1'));
  await page.waitForSelector('#adminDeviceFlowModal.open #adfRenewPlan');
  await page.select('#adfRenewPlan', 'plan-1');
  await page.click('[data-adf-renew]');
  const renewal = await waitForCall(story, call => call.functionName === 'seller-device-flow' && call.action === 'renew', renewalStart);
  assert.equal('playlistId' in renewal.payload, false);
  assert.equal('backupPlaylistId' in renewal.payload, false);
  assert.ok(renewal.payload.idempotencyKey);

  const changeStart = calls.length;
  await page.evaluate(() => window.adminChangeDevicePlaylists('device-1'));
  await page.waitForSelector('#adminDeviceFlowModal.open #adfChangePrimary');
  await page.select('#adfChangePrimary', 'playlist-1');
  await page.select('#adfChangeBackup', 'playlist-2');
  await page.click('[data-adf-change]');
  const change = await waitForCall(story, call => call.functionName === 'seller-device-flow' && call.action === 'changePlaylists', changeStart);
  assert.equal('planId' in change.payload, false);
  assert.equal('expiresAt' in change.payload, false);
  assert.equal(change.payload.playlistId, 'playlist-1');
  assert.equal(change.payload.backupPlaylistId, 'playlist-2');

  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(artifactRoot, 'admin-1366x900.png'), fullPage: false });
  await page.close();
}

async function sellerStory(browser, origin) {
  const story = 'seller';
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  await installNetwork(page, origin, 'seller', story);
  await login(page, origin, 'seller');
  await page.waitForFunction(() => Boolean(window.RonecaSellerDeviceFlowUI));

  await page.evaluate(() => window.RonecaSellerDeviceFlowUI.openActivation('PEND5678'));
  await page.waitForSelector('#activationWizard.open [data-aw-field="customerName"]');
  await page.type('[data-aw-field="customerName"]', 'Cliente Novo');
  await page.type('[data-aw-field="customerWhatsapp"]', '11911112222');
  await page.click('[data-aw-action="next"]');
  await page.select('[data-aw-field="planId"]', 'plan-1');
  await page.click('[data-aw-action="next"]');
  await page.select('[data-aw-field="playlistId"]', 'playlist-1');
  await page.click('[data-aw-action="next"]');
  await page.click('[data-aw-field="useBackup"]');
  await page.waitForSelector('[data-aw-field="backupPlaylistId"]');
  await page.select('[data-aw-field="backupPlaylistId"]', 'playlist-2');
  await page.click('[data-aw-action="next"]');
  const activationStart = calls.length;
  await page.click('[data-aw-action="submit"]');
  const activation = await waitForCall(story, call => call.functionName === 'seller-device-flow' && call.action === 'activate', activationStart);
  assert.equal(activation.payload.playlistId, 'playlist-1');
  assert.equal(activation.payload.backupPlaylistId, 'playlist-2');
  assert.ok(activation.payload.idempotencyKey);
  await page.waitForFunction(() => !document.querySelector('#activationWizard')?.classList.contains('open'));

  await page.evaluate(() => window.RonecaSellerDeviceFlowUI.openRenewal('device-1'));
  await page.waitForSelector('#activationWizard.open [data-aw-field="planId"]');
  await page.select('[data-aw-field="planId"]', 'plan-1');
  await page.click('[data-aw-action="next"]');
  const renewalStart = calls.length;
  await page.click('[data-aw-action="submit"]');
  const renewal = await waitForCall(story, call => call.functionName === 'seller-device-flow' && call.action === 'renew', renewalStart);
  assert.equal('playlistId' in renewal.payload, false);
  assert.equal('backupPlaylistId' in renewal.payload, false);
  assert.ok(renewal.payload.idempotencyKey);
  await page.waitForFunction(() => !document.querySelector('#activationWizard')?.classList.contains('open'));

  await page.evaluate(() => window.RonecaSellerDeviceFlowUI.openChange('device-1'));
  await page.waitForSelector('#activationWizard.open [data-aw-field="playlistId"]');
  await page.select('[data-aw-field="playlistId"]', 'playlist-1');
  await page.click('[data-aw-action="next"]');
  await page.select('[data-aw-field="backupPlaylistId"]', 'playlist-2');
  await page.click('[data-aw-action="next"]');
  const changeStart = calls.length;
  await page.click('[data-aw-action="submit"]');
  const change = await waitForCall(story, call => call.functionName === 'seller-device-flow' && call.action === 'changePlaylists', changeStart);
  assert.equal('planId' in change.payload, false);
  assert.equal('expiresAt' in change.payload, false);
  assert.equal(change.payload.playlistId, 'playlist-1');
  assert.equal(change.payload.backupPlaylistId, 'playlist-2');

  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(artifactRoot, 'seller-390x844.png'), fullPage: false });
  await page.close();
}

async function tvStory(browser, origin) {
  const story = 'tv';
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('roneca.smart-tv.deviceCode', 'TV123456');
    localStorage.setItem('roneca.smart-tv.deviceCredential', 'credential-e2e');
    localStorage.setItem('roneca.smart-tv.deviceUuid', 'uuid-tv-e2e');
  });
  await installNetwork(page, origin, 'tv', story);
  await page.goto(`${origin}/tv/index.html`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.querySelector('.status')?.textContent?.includes('Reserva ativa'));
  await page.waitForFunction(() => document.querySelectorAll('.home-library .home-media-card').length >= 2);
  assert.ok(reports.some(report => report.playlistId === 'playlist-primary' && report.status === 'failure'));
  assert.ok(reports.some(report => report.playlistId === 'playlist-backup' && report.status === 'success'));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(artifactRoot, 'tv-1280x720.png'), fullPage: false });
  await page.close();
}

let server;
let browser;
try {
  fs.mkdirSync(artifactRoot, { recursive: true });
  run('npm', ['run', 'build', '--prefix', 'smart-tv']);
  run(process.execPath, ['scripts/generate-panel-config.mjs'], { SUPABASE_URL: 'https://example.test', SUPABASE_ANON_KEY: `e2e-public-anon-key-${'x'.repeat(64)}` });
  const started = await startServer();
  server = started.server;
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  await adminStory(browser, started.origin);
  await sellerStory(browser, started.origin);
  await tvStory(browser, started.origin);
  const canonicalCalls = calls.filter(call => call.functionName === 'seller-device-flow');
  assert.ok(canonicalCalls.some(call => call.story === 'admin' && call.action === 'activate'));
  assert.ok(canonicalCalls.some(call => call.story === 'admin' && call.action === 'renew'));
  assert.ok(canonicalCalls.some(call => call.story === 'admin' && call.action === 'changePlaylists'));
  assert.ok(canonicalCalls.some(call => call.story === 'seller' && call.action === 'activate'));
  assert.ok(canonicalCalls.some(call => call.story === 'seller' && call.action === 'renew'));
  assert.ok(canonicalCalls.some(call => call.story === 'seller' && call.action === 'changePlaylists'));
  fs.writeFileSync(path.join(artifactRoot, 'report.json'), JSON.stringify({ totalCalls: calls.length, canonicalCalls: canonicalCalls.length, reports }, null, 2) + '\n');
  console.log('✅ E2E Lote 2: ADM e vendedor usam seller-device-flow; Smart TV mantém failover principal/reserva.');
} finally {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
  for (const [file, contents] of originals) {
    if (contents === null) fs.rmSync(file, { force: true });
    else fs.writeFileSync(file, contents);
  }
}
