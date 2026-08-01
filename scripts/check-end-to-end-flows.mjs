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
const generatedConfigs = [
  path.join(root, 'admin-panel', 'panel-config.js'),
  path.join(root, 'public', 'panel-config.js'),
];
const originalConfigs = new Map(generatedConfigs.map(file => [
  file,
  fs.existsSync(file) ? fs.readFileSync(file) : null,
]));

const adminState = {
  customers: [{ id: 'customer-1', name: 'Cliente Teste', whatsapp: '11999998888' }],
  playlists: [
    { id: 'playlist-1', name: 'Lista Principal', playlistUrl: 'https://playlist.test/main.m3u', type: 'm3u', active: true, accessMode: 'cache', cacheStatus: 'ready' },
    { id: 'playlist-2', name: 'Lista Reserva', playlistUrl: 'https://playlist.test/backup.m3u', type: 'm3u', active: true, accessMode: 'cache', cacheStatus: 'ready' },
  ],
  devices: [
    {
      id: 'device-1', deviceCode: 'ACTIVE01', deviceUuid: 'uuid-active', status: 'active',
      customerId: 'customer-1', customerName: 'Cliente Teste', customerWhatsapp: '11999998888',
      sellerId: 'seller-1', sellerName: 'Vendedor Teste', planId: 'plan-1', planName: 'Mensal',
      planCreditCost: 1, playlistId: 'playlist-1', playlistName: 'Lista Principal',
      backupPlaylistId: 'playlist-2', backupPlaylistName: 'Lista Reserva',
      expiresAt: '2026-09-01T12:00:00Z', daysLeft: 31, lastSeenAt: '2026-08-01T10:00:00Z',
    },
    {
      id: 'device-2', deviceCode: 'PEND5678', deviceUuid: 'uuid-pending', status: 'pending',
      customerId: null, customerName: null, customerWhatsapp: null, sellerId: null, sellerName: null,
      planId: null, planName: null, playlistId: null, playlistName: null,
      backupPlaylistId: null, backupPlaylistName: null, expiresAt: null, daysLeft: null,
      deviceType: 'androidtv', appVersion: '1.0.0',
    },
  ],
  sellers: [{
    id: 'seller-1', name: 'Vendedor Teste', whatsapp: '11999997777',
    email: 'vendedor@example.test', status: 'active', creditBalance: 12,
    canGoNegative: false, accessExpiresAt: '2026-08-10T12:00:00Z',
    autoDeleteAfterExpiry: true, autoDeleteGraceHours: 36,
  }],
  plans: [{ id: 'plan-1', name: 'Mensal', durationDays: 30, creditCost: 1, maxDevices: 1, status: 'active' }],
};

const calls = [];
const reports = [];
const storyStates = new Map();

function stateFor(story) {
  if (!storyStates.has(story)) storyStates.set(story, structuredClone(adminState));
  return storyStates.get(story);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
  });
  if (result.status !== 0) {
    throw new Error(command + ' ' + args.join(' ') + ' falhou:\n' + result.stdout + '\n' + result.stderr);
  }
  return result;
}

function adminDashboard(state) {
  return {
    sellers: state.sellers,
    plans: state.plans,
    creditLedger: [],
  };
}

function sellerDashboard(state) {
  return {
    seller: state.sellers[0],
    stats: {
      activeDevices: 1, expiringSoon: 0, expiredDevices: 0, pendingDevices: 1,
      blockedDevices: 0, creditsAdded: 20, creditsConsumed: 8,
    },
    devices: state.devices,
    plans: state.plans,
    playlists: state.playlists,
    creditLedger: [],
  };
}

function applyFixtureMutation(state, functionName, action, payload) {
  if (functionName === 'finance-panel' && action === 'activateDeviceWithFinance') {
    const device = state.devices.find(item => item.id === payload.deviceId || item.deviceCode === payload.deviceCode);
    const customer = state.customers.find(item => item.id === payload.customerId);
    const seller = state.sellers.find(item => item.id === payload.sellerId);
    const plan = state.plans.find(item => item.id === payload.planId);
    const playlist = state.playlists.find(item => item.id === payload.playlistId);
    const backup = state.playlists.find(item => item.id === payload.backupPlaylistId);
    if (device) Object.assign(device, {
      status: 'active', customerId: payload.customerId || device.customerId, customerName: payload.customerName || customer?.name || device.customerName || null,
      customerWhatsapp: payload.customerWhatsapp || device.customerWhatsapp || null,
      sellerId: payload.sellerId || state.sellers[0]?.id || device.sellerId, sellerName: seller?.name || state.sellers[0]?.name || device.sellerName || null,
      planId: payload.planId, planName: plan?.name || null,
      playlistId: payload.playlistId, playlistName: playlist?.name || null,
      backupPlaylistId: payload.backupPlaylistId || null, backupPlaylistName: backup?.name || null,
      expiresAt: payload.expiresAt,
    });
  }
  if (functionName === 'seller-panel' && action === 'activateDeviceByCode') {
    const device = state.devices.find(item => item.deviceCode === payload.deviceCode);
    if (device) Object.assign(device, {
      status: 'active', sellerId: state.sellers[0].id, sellerName: state.sellers[0].name,
      planId: payload.planId, playlistId: payload.playlistId,
      backupPlaylistId: payload.backupPlaylistId || null, expiresAt: payload.expiresAt,
    });
  }
  if (functionName === 'admin-panel' && action === 'deleteDevice') {
    state.devices = state.devices.filter(item => item.id !== payload.id);
  }
  if (functionName === 'seller-panel' && action === 'deleteDevice') {
    state.devices = state.devices.filter(item => item.id !== payload.deviceId);
  }
}

function apiResult(functionName, action, role, story, payload) {
  const state = stateFor(story);
  applyFixtureMutation(state, functionName, action, payload);
  if (functionName === 'admin-panel') {
    if (role === 'seller' && action === 'listCommercialData') {
      return { status: 403, body: { error: 'Papel administrativo ausente.' } };
    }
    if (action === 'listCustomers') return { status: 200, body: { customers: state.customers } };
    if (action === 'listPlaylists') return { status: 200, body: { playlists: state.playlists } };
    if (action === 'listDevices') return { status: 200, body: { devices: state.devices } };
    if (action === 'listCommercialData') return { status: 200, body: adminDashboard(state) };
    if (action === 'listAuditLogs') return { status: 200, body: { logs: [] } };
    return { status: 200, body: { success: true, message: 'Operação administrativa simulada.' } };
  }

  if (functionName === 'seller-panel') {
    if (action === 'dashboard') return { status: 200, body: sellerDashboard(state) };
    if (action === 'lookupDeviceCode') {
      return {
        status: 200,
        body: {
          message: 'Aparelho pronto para ativação.',
          device: {
            ...state.devices.find(item => item.deviceCode === payload.deviceCode),
            canActivate: true,
            canClaim: false,
            belongsToAnotherSeller: false,
          },
        },
      };
    }
    return { status: 200, body: { success: true, message: 'Operação do vendedor simulada.' } };
  }

  if (functionName === 'credit-packages-panel') {
    return {
      status: 200,
      body: { role, summary: {}, packages: [], orders: [], sellers: state.sellers, seller: state.sellers[0], lots: [] },
    };
  }
  if (functionName === 'playback-diagnostics-panel') {
    return { status: 200, body: { summary: {}, diagnostics: [], filters: { sellers: [], playlists: [] } } };
  }
  if (functionName === 'device-config') {
    return { status: 200, body: tvDeviceConfiguration() };
  }
  return { status: 200, body: {} };
}

function tvDeviceConfiguration() {
  const parts = prefix => ({
    channelsUrl: 'https://cache.test/' + prefix + '/channels.json',
    moviesUrl: 'https://cache.test/' + prefix + '/movies.json',
    seriesUrl: 'https://cache.test/' + prefix + '/series.json',
  });
  return {
    active: true,
    status: 'active',
    deviceCode: 'TV123456',
    deviceCredential: 'credential-e2e',
    clientName: 'Sala de Teste',
    expiresAt: '2026-09-01T12:00:00Z',
    playlistName: 'Lista Principal',
    selectedPlaylistId: 'playlist-primary',
    cacheVersion: 'e2e-v1',
    cacheItemCount: 9,
    cacheParts: parts('primary'),
    playlists: [
      { id: 'playlist-primary', name: 'Lista Principal', priority: 1, role: 'primary', cacheParts: parts('primary') },
      { id: 'playlist-backup', name: 'Lista Reserva', priority: 2, role: 'backup', cacheParts: parts('backup') },
    ],
  };
}

function cacheResult(url) {
  if (url.includes('/primary/')) return { status: 503, body: { error: 'Falha simulada da lista principal.' } };
  if (url.endsWith('/channels.json')) {
    return {
      status: 200,
      body: {
        channels: [
          { id: 'channel-1', name: 'Canal Notícias', groupTitle: 'Abertos', url: 'https://media.test/live.m3u8' },
          { id: 'channel-2', name: 'Canal Filmes', groupTitle: 'Filmes', url: 'https://media.test/movies.m3u8' },
        ],
      },
    };
  }
  if (url.endsWith('/movies.json')) {
    return {
      status: 200,
      body: {
        movies: [
          { id: 'movie-1', name: 'Filme de Teste', category: 'Aventura', year: 2026, synopsis: 'Catálogo seguro da lista reserva.', url: 'https://media.test/movie.mp4' },
          { id: 'movie-2', name: 'Outro Filme', category: 'Aventura', year: 2025, url: 'https://media.test/movie-2.mp4' },
        ],
      },
    };
  }
  return {
    status: 200,
    body: {
      series: [{
        id: 'series-1', name: 'Série de Teste', category: 'Drama',
        seasons: [{ number: 1, episodes: [{ id: 'episode-1', number: 1, name: 'Episódio 1', url: 'https://media.test/episode.mp4' }] }],
      }],
    },
  };
}

const authStub = [
  '(function(){',
  '  function active(){ return sessionStorage.getItem("roneca-e2e-session") === "1"; }',
  '  window.RonecaPanelAuth = {',
  '    hasSession: active,',
  '    signIn: async function(email){ sessionStorage.setItem("roneca-e2e-session","1"); sessionStorage.setItem("roneca_seller_token","e2e-token"); sessionStorage.setItem("roneca-e2e-email",email); },',
  '    signOut: async function(){ sessionStorage.removeItem("roneca-e2e-session"); sessionStorage.removeItem("roneca_seller_token"); },',
  '    getAccessToken: async function(){ return active() ? "e2e-access-token" : ""; }',
  '  };',
  '})();',
].join('\n');

function mime(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.json')) return 'application/json; charset=utf-8';
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  if (file.endsWith('.woff2')) return 'font/woff2';
  return 'application/octet-stream';
}

function serveFile(response, base, relative) {
  const requested = relative || 'index.html';
  const file = path.resolve(base, requested);
  if (!file.startsWith(path.resolve(base) + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': mime(file), 'Cache-Control': 'no-store' });
  response.end(fs.readFileSync(file));
}

async function startServer() {
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
    if (pathname === '/admin/panel-auth-session.js') {
      response.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(authStub);
      return;
    }
    if (pathname.startsWith('/admin/')) {
      serveFile(response, adminRoot, pathname.slice('/admin/'.length));
      return;
    }
    if (pathname.startsWith('/tv/')) {
      serveFile(response, tvRoot, pathname.slice('/tv/'.length));
      return;
    }
    response.writeHead(302, { Location: '/admin/index.html' });
    response.end();
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return { server, origin: 'http://127.0.0.1:' + address.port };
}

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

function responseHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-device-credential, authorization, apikey, x-seller-token',
  };
}

async function installNetwork(page, origin, role, story) {
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = request.url();
    if (url.startsWith(origin)) {
      request.continue();
      return;
    }
    if (request.method() === 'OPTIONS') {
      request.respond({ status: 204, headers: responseHeaders() });
      return;
    }
    if (url.startsWith('https://cache.test/')) {
      const result = cacheResult(url);
      request.respond({
        status: result.status,
        contentType: 'application/json',
        headers: responseHeaders(),
        body: JSON.stringify(result.body),
      });
      return;
    }
    if (url.includes('/functions/v1/')) {
      const functionName = new URL(url).pathname.split('/').filter(Boolean).at(-1);
      let payload = {};
      try { payload = JSON.parse(request.postData() || '{}'); } catch { payload = {}; }
      calls.push({ story, functionName, action: payload.action || null, payload });

      if (functionName === 'device-config' && payload.playlistHealth) {
        reports.push({ story, ...payload.playlistHealth });
        request.respond({ status: 200, contentType: 'application/json', headers: responseHeaders(), body: '{}' });
        return;
      }
      const result = apiResult(functionName, payload.action || null, role, story, payload);
      request.respond({
        status: result.status,
        contentType: 'application/json',
        headers: responseHeaders(),
        body: JSON.stringify(result.body),
      });
      return;
    }
    if (url.startsWith('https://media.test/') || url.startsWith('https://playlist.test/')) {
      request.respond({ status: 204, headers: responseHeaders() });
      return;
    }
    request.respond({ status: 200, contentType: 'application/json', headers: responseHeaders(), body: '{}' });
  });
}

async function waitForCall(story, predicate, startIndex) {
  const timeoutAt = Date.now() + 7000;
  while (Date.now() < timeoutAt) {
    const call = calls.slice(startIndex).find(item => item.story === story && predicate(item));
    if (call) return call;
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  const observed = calls.slice(startIndex).filter(item => item.story === story).map(item => ({
    functionName: item.functionName,
    action: item.action,
  }));
  throw new Error('Chamada esperada não ocorreu em ' + story + '. Observadas: ' + JSON.stringify(observed));
}

async function login(page, origin, role) {
  await page.goto(origin + '/admin/index.html', { waitUntil: 'networkidle0' });
  await page.type('#email', role + '@example.test');
  await page.type('#password', 'senha-segura-e2e');
  await page.click('.login-primary');
  const expected = role === 'admin' ? '/admin/dashboard.html' : '/admin/seller.html';
  await page.waitForFunction(value => location.pathname === value, { timeout: 7000 }, expected);
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
  await page.waitForFunction(() => document.querySelector('#stDevices')?.textContent === '2');
  try {
    await page.waitForFunction(() => window.__financeAdminActivationInstalled === true && window.__financeAdminRenewInstalled === true, { timeout: 7000 });
  } catch (error) {
    const runtime = await page.evaluate(() => ({
      activation: window.__financeAdminActivationInstalled,
      renewal: window.__financeAdminRenewInstalled,
      financeScript: [...document.scripts].map(script => script.src).find(src => src.includes('finance-module.js')) || null,
      financeModal: Boolean(document.querySelector('#financeModal')),
    }));
    throw new Error('Módulo financeiro administrativo não inicializou: ' + JSON.stringify({ runtime, errors, cause: error.message }));
  }

  await page.click('button[data-tab="devices"]');
  await page.type('#deviceSearch', 'PEND5678');
  await page.waitForFunction(() => document.querySelectorAll('#devicesBody .admin-device-card').length === 1);
  assert.match(await page.$eval('#devicesBody', element => element.textContent || ''), /PEND5678/);
  await page.$eval('#deviceSearch', element => { element.value = ''; element.dispatchEvent(new Event('input', { bubbles: true })); });

  await page.click('button[data-tab="pending"]');
  await page.waitForSelector('button[onclick="adminOpsOpenPending(\'device-2\')"]');
  await page.click('button[onclick="adminOpsOpenPending(\'device-2\')"]');
  await page.waitForSelector('#adminPendingActivationModal.open #pend-customer-device-2');
  await page.select('#pend-customer-device-2', 'customer-1');
  await page.select('#pend-seller-device-2', 'seller-1');
  await page.select('#pend-plan-device-2', 'plan-1');
  await page.select('#pend-playlist-device-2', 'playlist-1');
  await page.select('#pend-backup-playlist-device-2', 'playlist-2');
  const activationStart = calls.length;
  await page.click('button[onclick="adminOpsConfirmPending(\'device-2\')"]');
  const activation = await waitForCall(story, call => call.functionName === 'finance-panel' && call.action === 'activateDeviceWithFinance', activationStart);
  assert.equal(activation.payload.playlistId, 'playlist-1');
  assert.equal(activation.payload.backupPlaylistId, 'playlist-2');
  assert.ok(activation.payload.idempotencyKey);
  await page.waitForFunction(() => !document.querySelector('#adminPendingActivationModal')?.classList.contains('open'));

  await page.click('button[data-tab="devices"]');
  await page.click('button[onclick="showDeviceDetails(\'device-1\')"]');
  await page.waitForSelector('button[onclick="renewDevice(\'device-1\')"]');
  await page.click('button[onclick="renewDevice(\'device-1\')"]');
  await page.waitForSelector('#financeModal.open #financeAdminRenewPlan');
  await page.select('#financeAdminRenewPlan', 'plan-1');
  await page.select('#financeAdminRenewPlaylist', 'playlist-1');
  await page.select('#financeAdminRenewBackup', 'playlist-2');
  const renewalStart = calls.length;
  await page.click('button[onclick="financeSubmitAdminRenew(\'device-1\')"]');
  const renewal = await waitForCall(story, call => call.functionName === 'finance-panel' && call.action === 'renewDeviceWithFinance', renewalStart);
  assert.equal(renewal.payload.playlistId, 'playlist-1');
  assert.ok(renewal.payload.idempotencyKey);

  await page.click('button[data-tab="commercial"]');
  await page.click('button[onclick="openCommercialActionModal(\'seller\')"]');
  await page.click('[data-ux-action="credits"]');
  await page.select('#uxSellerCreditSeller', 'seller-1');
  await page.$eval('#uxSellerCreditAmount', element => { element.value = '5'; });
  await page.$eval('#uxSellerCreditDescription', element => { element.value = 'Ajuste E2E autorizado'; });
  const creditStart = calls.length;
  await page.click('button[onclick="submitCommercialCredits()"]');
  const credit = await waitForCall(story, call => call.action === 'addSellerCredits', creditStart);
  assert.equal(credit.payload.sellerId, 'seller-1');
  assert.equal(credit.payload.amount, 5);
  await page.waitForFunction(() => !document.querySelector('#commercialActionModal')?.classList.contains('open'));

  await page.click('button[data-tab="devices"]');
  await page.click('button[onclick="showDeviceDetails(\'device-1\')"]');
  await page.waitForSelector('button[onclick="deleteDevice(\'device-1\')"]');
  const deleteStart = calls.length;
  await page.click('button[onclick="deleteDevice(\'device-1\')"]');
  const deletion = await waitForCall(story, call => call.action === 'deleteDevice', deleteStart);
  assert.equal(deletion.payload.id, 'device-1');

  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > window.innerWidth,
    dashboardScript: [...document.scripts].some(script => script.src.endsWith('/dashboard.js')),
  }));
  assert.equal(layout.overflow, false);
  assert.equal(layout.dashboardScript, true);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(artifactRoot, 'admin-1366x900.png'), fullPage: false });
  await page.close();
  return { calls: calls.filter(call => call.story === story).length, layout };
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
  await page.waitForFunction(() => document.querySelectorAll('#sellerTodayActions .seller-today-action').length === 3);
  await page.waitForFunction(() => window.__financeSellerActivationInstalled === true && window.__financeSellerRenewInstalled === true);

  await page.click('[data-seller-nav="activation"]');
  await page.type('#sellerDeviceCodeLookup', 'PEND5678');
  await page.click('button[onclick="sellerUxLookupDevice()"]');
  await page.waitForSelector('button[onclick="sellerUxOpenActivationForm()"]');
  await page.click('button[onclick="sellerUxOpenActivationForm()"]');
  await page.$eval('#sellerActivationCustomerName', element => { element.value = 'Cliente Novo'; });
  await page.$eval('#sellerActivationCustomerWhatsapp', element => { element.value = '11911112222'; });
  await page.select('#sellerActivationPlan', 'plan-1');
  await page.select('#sellerActivationPlaylist', 'playlist-1');
  await page.select('#sellerActivationBackupPlaylist', 'playlist-2');
  const activationStart = calls.length;
  await page.click('button[onclick="sellerUxActivateDevice()"]');
  const activation = await waitForCall(story, call => call.functionName === 'finance-panel' && call.action === 'activateDeviceWithFinance', activationStart);
  assert.equal(activation.payload.playlistId, 'playlist-1');
  assert.equal(activation.payload.backupPlaylistId, 'playlist-2');
  assert.ok(activation.payload.idempotencyKey);

  await page.click('[data-seller-nav="devices"]');
  await page.waitForSelector('#devicesBody .seller-more-actions summary');
  await page.click('#devicesBody .seller-more-actions summary');
  await page.click('button[onclick="sellerUxOpenRenewModal(\'device-1\')"]');
  await page.waitForSelector('#sellerUxModal.open #sellerRenewPlan');
  await page.select('#sellerRenewPlan', 'plan-1');
  await page.select('#sellerRenewPlaylist', 'playlist-1');
  await page.select('#sellerRenewBackupPlaylist', 'playlist-2');
  const renewalStart = calls.length;
  await page.click('button[onclick="sellerUxRenewDevice()"]');
  const renewal = await waitForCall(story, call => call.functionName === 'finance-panel' && call.action === 'renewDeviceWithFinance', renewalStart);
  assert.equal(renewal.payload.backupPlaylistId, 'playlist-2');
  assert.ok(renewal.payload.idempotencyKey);

  await page.waitForSelector('#devicesBody .seller-more-actions summary');
  await page.click('#devicesBody .seller-more-actions summary');
  const deleteStart = calls.length;
  await page.click('button[onclick="sellerUxDeleteDevice(\'device-1\')"]');
  const deletion = await waitForCall(story, call => call.action === 'deleteDevice', deleteStart);
  assert.equal(deletion.payload.deviceId, 'device-1');

  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > window.innerWidth,
    todayActions: document.querySelectorAll('#sellerTodayActions .seller-today-action').length,
    primaryActions: document.querySelectorAll('#devicesBody .seller-device-actions > .primary').length,
  }));
  assert.equal(layout.overflow, false);
  assert.equal(layout.todayActions, 3);
  assert.ok(layout.primaryActions >= 1);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(artifactRoot, 'seller-390x844.png'), fullPage: false });
  await page.close();
  return { calls: calls.filter(call => call.story === story).length, layout };
}

async function tvStoryAtViewport(browser, origin, viewport) {
  const story = 'tv-' + viewport.width;
  const page = await browser.newPage();
  await page.setViewport(viewport);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('roneca.smart-tv.deviceCode', 'TV123456');
    localStorage.setItem('roneca.smart-tv.deviceCredential', 'credential-e2e');
    localStorage.setItem('roneca.smart-tv.deviceUuid', 'uuid-tv-e2e');
  });
  await installNetwork(page, origin, 'tv', story);
  await page.goto(origin + '/tv/index.html', { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.querySelector('.status')?.textContent?.includes('Reserva ativa'));
  await page.waitForFunction(() => document.querySelectorAll('.home-library .home-media-card').length >= 3);

  const initialFocus = await page.evaluate(() => (document.activeElement?.textContent || '').trim());
  assert.match(initialFocus, /Ver detalhes|Explorar filmes/);
  await page.keyboard.press('Enter');
  await page.waitForSelector('.movie-detail');
  assert.match(await page.$eval('.movie-detail h1', element => element.textContent || ''), /Filme de Teste/);
  await page.keyboard.press('Backspace');
  await page.waitForFunction(() => !document.querySelector('.movie-detail'));
  await page.waitForFunction(() => /Ver detalhes|Explorar filmes/.test((document.activeElement?.textContent || '').trim()));

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const focus = await page.evaluate(() => {
    const active = document.activeElement;
    const style = active ? getComputedStyle(active) : null;
    return {
      text: (active?.textContent || '').trim(),
      visible: Boolean(active?.matches('[data-tv-focusable="true"]')),
      border: style?.borderColor || '',
      overflow: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
  assert.equal(focus.visible, true);
  assert.equal(focus.overflow, false);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(artifactRoot, 'tv-' + viewport.width + 'x' + viewport.height + '.png'), fullPage: false });
  await page.close();
  return { initialFocus, focus };
}

async function tvStory(browser, origin) {
  const first = await tvStoryAtViewport(browser, origin, { width: 1280, height: 720 });
  const second = await tvStoryAtViewport(browser, origin, { width: 1920, height: 1080 });
  assert.ok(reports.some(report => report.playlistId === 'playlist-primary' && report.status === 'failure'));
  assert.ok(reports.some(report => report.playlistId === 'playlist-backup' && report.status === 'success'));
  return { first, second, reports: reports.length };
}

let server;
let browser;
try {
  fs.mkdirSync(artifactRoot, { recursive: true });
  run('npm', ['run', 'build', '--prefix', 'smart-tv']);
  run(process.execPath, ['scripts/generate-panel-config.mjs'], {
    env: {
      SUPABASE_URL: 'https://example.test',
      SUPABASE_ANON_KEY: 'e2e-public-anon-key-' + 'x'.repeat(64),
    },
  });

  const started = await startServer();
  server = started.server;
  browser = await puppeteer.launch({
    executablePath: chromeExecutable(),
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const admin = await adminStory(browser, started.origin);
  const seller = await sellerStory(browser, started.origin);
  const tv = await tvStory(browser, started.origin);
  const result = { admin, seller, tv, totalCalls: calls.length };
  fs.writeFileSync(path.join(artifactRoot, 'report.json'), JSON.stringify(result, null, 2) + '\n');
  console.log('✅ E2E completo: login, administrador, vendedor, operações comerciais, listas principal/reserva e failover da TV.');
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  const pages = browser ? await browser.pages() : [];
  for (const [index, page] of pages.entries()) {
    if (page.isClosed()) continue;
    await page.screenshot({ path: path.join(artifactRoot, `failure-${index + 1}.png`), fullPage: false }).catch(() => undefined);
  }
  const failure = {
    error: error instanceof Error ? error.message : String(error),
    calls: calls.map(item => ({ story: item.story, functionName: item.functionName, action: item.action })),
    reports,
  };
  fs.writeFileSync(path.join(artifactRoot, 'failure.json'), JSON.stringify(failure, null, 2) + '\n');
  throw error;
} finally {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
  for (const [file, contents] of originalConfigs) {
    if (contents === null) fs.rmSync(file, { force: true });
    else fs.writeFileSync(file, contents);
  }
}
