import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adminRoot = path.join(root, 'admin-panel');
const artifacts = path.join(root, 'artifacts', 'e2e', 'lote4');
const ids = {
  seller: '41000000-0000-4000-8000-000000000001',
  plan: '41000000-0000-4000-8000-000000000002',
  primary: '41000000-0000-4000-8000-000000000003',
  provisional: '41000000-0000-4000-8000-000000000004',
  active: '41000000-0000-4000-8000-000000000005',
  pending: '41000000-0000-4000-8000-000000000006',
};
const now = new Date().toISOString();
const fixture = {
  seller: { id: ids.seller, name: 'Vendedor UX', creditBalance: 7, canGoNegative: false },
  plan: { id: ids.plan, name: 'Mensal 30', durationDays: 30, creditCost: 2, status: 'active' },
  primary: { id: ids.primary, name: 'W Premium', active: true, lifecycleStatus: 'ready_cache', lifecycleLabel: 'Pronta com cache', cacheItemCount: 425, platformCapabilities: { android: 'available', lg: 'available_by_cache', samsung: 'available_by_cache' } },
  provisional: { id: ids.provisional, name: 'Origem Nova', active: true, lifecycleStatus: 'awaiting_device_confirmation', lifecycleLabel: 'Aguardando confirmação no aparelho', cacheItemCount: 0, platformCapabilities: { android: 'provisional', lg: 'unavailable', samsung: 'unavailable' } },
  pending: { id: ids.pending, deviceCode: 'UXPEND01', status: 'pending', deviceType: 'android', canActivate: true },
  active: { id: ids.active, deviceCode: 'UXACTIVE', status: 'active', deviceType: 'android', sellerId: ids.seller, customerName: 'Cliente Ativo', customerWhatsapp: '11988887777', planId: ids.plan, planName: 'Mensal 30', playlistId: ids.primary, playlistName: 'W Premium', backupPlaylistId: null, backupPlaylistName: null, expiresAt: '2026-09-15T02:59:59.999Z' },
};

function mime(file) {
  if (file.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  return 'text/plain; charset=utf-8';
}
async function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (!url.pathname.startsWith('/admin/')) { res.writeHead(404); res.end(); return; }
    const file = path.resolve(adminRoot, url.pathname.slice(7));
    if (!file.startsWith(adminRoot + path.sep) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': mime(file), 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}
function cors() { return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, authorization, apikey', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }; }

async function installNetwork(page) {
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = request.url();
    if (url.startsWith('http://127.0.0.1:')) return request.continue();
    if (request.method() === 'OPTIONS') return request.respond({ status: 204, headers: cors() });
    if (!url.includes('/functions/v1/')) return request.respond({ status: 200, contentType: 'application/json', headers: cors(), body: '{}' });
    const fn = new URL(url).pathname.split('/').filter(Boolean).at(-1);
    let body = {}; try { body = JSON.parse(request.postData() || '{}'); } catch { body = {}; }
    if (fn === 'seller-panel') {
      if (body.action === 'lookupDeviceCode') return request.respond({ status: 200, contentType: 'application/json', headers: cors(), body: JSON.stringify({ ok: true, device: fixture.pending }) });
      return request.respond({ status: 200, contentType: 'application/json', headers: cors(), body: JSON.stringify({
        seller: fixture.seller,
        plans: [fixture.plan], devices: [fixture.active, fixture.pending], playlists: [fixture.primary, fixture.provisional],
        creditLedger: [{ id: 'r1', type: 'renewal', referenceId: ids.active, amount: -2, createdAt: now, balanceAfter: 7 }], stats: {},
      }) });
    }
    if (fn === 'playlist-registration') {
      const list = [fixture.primary, fixture.provisional];
      const selected = list.find(item => item.id === body.playlistId) || fixture.primary;
      return request.respond({ status: 200, contentType: 'application/json', headers: cors(), body: JSON.stringify(body.action === 'status' ? { ok: true, playlist: selected } : { ok: true, playlists: list }) });
    }
    if (fn === 'playlist-source-manager') {
      return request.respond({ status: 200, contentType: 'application/json', headers: cors(), body: JSON.stringify({ ok: true, sources: [
        { id: ids.primary, endpoints: [{ primary: true, host: 'edge.exemplo.com' }] },
        { id: ids.provisional, endpoints: [{ primary: true, host: 'novo.exemplo.com' }] },
      ] }) });
    }
    if (fn === 'seller-device-flow') return request.respond({ status: 200, contentType: 'application/json', headers: cors(), body: JSON.stringify({ ok: true, result: { applied: true, confirmationStatus: 'confirmed' }, message: 'Concluído.' }) });
    return request.respond({ status: 200, contentType: 'application/json', headers: cors(), body: '{}' });
  });
}

async function loadWizard(page, origin) {
  await page.setContent(`<!doctype html><html><head><link rel="stylesheet" href="${origin}/admin/seller-activation-wizard.css"></head><body>
    <script>
      window.RONECA_PANEL_CONFIG={supabaseUrl:'https://example.test',anonKey:'${'x'.repeat(64)}'};
      window.RonecaPanelAuth={getAccessToken:async()=> 'ux-token'};
      window.loadPortal=async()=>{}; window.RonecaSellerPortal={refresh:async()=>{}};
      window.RonecaUniversalPlaylists={
        open(){let modal=document.getElementById('uplModal');if(!modal){modal=document.createElement('div');modal.id='uplModal';modal.innerHTML='<div class="upl-modal-card"><input aria-label="Fonte universal"><button type="button">Salvar</button></div>';document.body.appendChild(modal);}modal.classList.add('open');},
        close(){document.getElementById('uplModal')?.classList.remove('open');}, async save(){}, go(){}, refresh(){}, edit(){}, testSaved(){}, remove(){}, toggleLegacy(){}
      };
    </script>
    <script src="${origin}/admin/panel-time.js"></script>
    <script src="${origin}/admin/universal-playlist-inline.js"></script>
    <script src="${origin}/admin/seller-activation-wizard.js"></script>
  </body></html>`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => Boolean(window.RonecaSellerDeviceFlowUI && window.RonecaPanelTime && window.RonecaUniversalPlaylists?.openInline));
}

async function activationViewport(browser, origin, width, height, label) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  await installNetwork(page);
  await loadWizard(page, origin);
  await page.evaluate(code => window.RonecaSellerDeviceFlowUI.openActivation(code), fixture.pending.deviceCode);
  await page.waitForSelector('#activationWizard.open [data-aw-field="customerName"]');

  const geometry = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth, cardScroll: document.querySelector('.activation-wizard-card').scrollWidth, cardClient: document.querySelector('.activation-wizard-card').clientWidth }));
  assert.ok(geometry.doc <= geometry.win + 1, `${label}: página não pode ter overflow horizontal`);
  assert.ok(geometry.cardScroll <= geometry.cardClient + 2, `${label}: wizard não pode estourar horizontalmente`);
  assert.equal(await page.$eval('[data-aw-step="5"]', node => node.disabled), true, `${label}: etapa final deve começar bloqueada`);

  await page.click('[data-aw-action="next"]');
  assert.ok(await page.$$eval('.aw-field-error', nodes => nodes.length) >= 2, `${label}: erros devem aparecer dentro da etapa`);
  await page.waitForFunction(() => document.activeElement?.dataset?.awField === 'customerName');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset?.awField), 'customerName', `${label}: primeiro erro deve receber foco`);

  await page.type('[data-aw-field="customerName"]', 'Cliente UX');
  await page.type('[data-aw-field="customerWhatsapp"]', '11912345678');
  await page.type('[data-aw-field="customerNotes"]', 'Observação opcional preservada');
  await page.click('[data-aw-action="next"]');
  await page.select('[data-aw-field="planId"]', ids.plan);
  assert.ok((await page.$eval('.aw-summary-grid', node => node.textContent)).includes('Saldo depois'), `${label}: plano deve mostrar saldo projetado`);
  await page.click('[data-aw-action="next"]');
  await page.waitForSelector('.aw-playlist-card');
  const listText = await page.$eval('#awPrimaryResults', node => node.textContent);
  for (const token of ['edge.exemplo.com', '425', 'Android', 'LG', 'Samsung']) assert.ok(listText.includes(token), `${label}: lista deve mostrar ${token}`);

  await page.click('[data-aw-action="new-playlist"]');
  await page.waitForSelector('#awInlinePlaylistHost .upl-inline-card');
  assert.ok(await page.$('#awInlinePlaylistHost .upl-inline-card'), `${label}: cadastro universal deve abrir dentro da etapa`);
  await page.evaluate(() => window.RonecaUniversalPlaylists.close());

  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('#activationWizard'))), true, `${label}: navegação por teclado deve permanecer no wizard`);
  await page.screenshot({ path: path.join(artifacts, `activation-${label}.png`), fullPage: true });
  await page.close();
}

async function renewalStory(browser, origin) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1180, height: 800 });
  await installNetwork(page); await loadWizard(page, origin);
  await page.evaluate(id => window.RonecaSellerDeviceFlowUI.openRenewal(id), ids.active);
  await page.waitForSelector('[data-aw-field="confirmRecentRenewal"]');
  const text = await page.$eval('#activationWizardBody', node => node.textContent);
  assert.ok(text.includes('Última renovação'));
  assert.ok(text.includes('Validade atual'));
  assert.ok(text.includes('Validade resultante'));
  await page.click('[data-aw-action="next"]');
  assert.ok(await page.$('.aw-field-error'), 'Renovação recente deve exigir confirmação reforçada.');
  await page.click('[data-aw-field="confirmRecentRenewal"]');
  await page.click('[data-aw-action="next"]');
  const review = await page.$eval('#activationWizardBody', node => node.textContent);
  assert.ok(review.includes('America/Sao_Paulo'));
  assert.ok(review.includes('7 → 5'));

  const localEnd = await page.evaluate(() => {
    const iso = window.RonecaPanelTime.endOfDayIso('2026-08-31');
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
    return { iso, parts };
  });
  assert.equal(localEnd.parts, '23:59:59');
  await page.screenshot({ path: path.join(artifacts, 'renewal-recent.png'), fullPage: true });
  await page.close();
}

async function mobilePanelExperience(browser, origin, width, height, label) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  await page.goto(`${origin}/admin/seller-dynamic-navigation-v2.js`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => history.replaceState(null, '', '/admin/seller.html'));
  await page.setContent(`<!doctype html><html><head>
    <link rel="stylesheet" href="${origin}/admin/roneca-panel-premium.css">
    <link rel="stylesheet" href="${origin}/admin/universal-playlist-registration.css">
  </head><body class="seller-v2">
    <section id="dashboardView">
      <nav class="seller-v2-nav">
        <button data-seller-nav="home" class="active"><span>Início</span></button>
        <button data-seller-nav="activation"><span>Ativar</span></button>
        <button data-seller-nav="devices"><span>Aparelhos</span></button>
        <button data-seller-nav="lists"><span>Listas</span></button>
        <button data-seller-nav="credits"><span>Créditos</span></button>
        <button data-seller-nav="app"><span>Aplicativo</span></button>
      </nav>
      <section class="seller-portal-section" data-seller-section="home"></section>
      <section class="seller-portal-section" data-seller-section="app" hidden></section>
      <section class="seller-portal-section" data-seller-section="diagnostics" hidden></section>
    </section>
    <script>
      window.RonecaPanelAuth={hasSession:()=>false};
      window.sellerPortalNavigate=section=>{
        document.querySelectorAll('.seller-portal-section').forEach(item=>{item.hidden=item.dataset.sellerSection!==section;});
      };
      window.sellerPortalRefreshNavigation=()=>{};
      document.querySelectorAll('[data-seller-nav]').forEach(button=>button.addEventListener('click',()=>window.sellerPortalNavigate(button.dataset.sellerNav)));
    </script>
    <script src="${origin}/admin/seller-dynamic-navigation-v2.js"></script>
    <script src="${origin}/admin/universal-playlist-registration.js"></script>
  </body></html>`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.seller-v2-more > summary');

  await page.click('.seller-v2-more > summary');
  assert.equal(await page.$eval('.seller-v2-more', node => node.open), true, `${label}: Mais deve abrir`);
  assert.equal(await page.$eval('.seller-v2-more > summary', node => node.getAttribute('aria-expanded')), 'true', `${label}: Mais deve anunciar o estado aberto`);
  await page.click('.seller-v2-more-menu [data-seller-nav="app"]');
  assert.equal(await page.$eval('.seller-v2-more', node => node.open), false, `${label}: Mais deve fechar depois da escolha`);
  assert.equal(await page.$eval('[data-seller-section="app"]', node => node.hidden), false, `${label}: opção do Mais deve navegar`);

  await page.evaluate(() => {
    const button = document.createElement('button');
    button.dataset.sellerNav = 'diagnostics';
    button.innerHTML = '<span>Diagnóstico</span>';
    button.addEventListener('click', () => window.sellerPortalNavigate('diagnostics'));
    document.querySelector('.seller-v2-nav').appendChild(button);
    window.dispatchEvent(new CustomEvent('roneca:seller-navigation-changed'));
  });
  assert.ok(await page.$('.seller-v2-more-menu [data-seller-nav="diagnostics"]'), `${label}: módulo tardio deve aparecer no Mais`);

  await page.evaluate(() => window.RonecaUniversalPlaylists.open());
  await page.waitForSelector('#uplModal.open .upl-modal-card');
  const layout = await page.evaluate(() => {
    const card = document.querySelector('.upl-modal-card');
    const modes = [...document.querySelectorAll('.upl-mode')].map(node => node.getBoundingClientRect());
    const textarea = document.querySelector('.upl-provider-message').getBoundingClientRect();
    const optional = document.querySelector('.upl-optional-fields');
    const action = document.querySelector('[data-upl-pane="1"] > .upl-actions').getBoundingClientRect();
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      cardHeight: card.getBoundingClientRect().height,
      viewportHeight: innerHeight,
      cardScrollHeight: card.scrollHeight,
      cardClientHeight: card.clientHeight,
      twoColumns: modes.length === 4 && Math.abs(modes[0].top - modes[1].top) < 2 && modes[0].left < modes[1].left,
      textareaHeight: textarea.height,
      optionalClosed: !optional.open,
      actionTop: action.top,
    };
  });
  assert.ok(layout.documentWidth <= layout.viewportWidth + 1, `${label}: formulário não pode ter overflow horizontal`);
  assert.ok(layout.cardHeight <= layout.viewportHeight + 1, `${label}: formulário deve ocupar no máximo a tela (${JSON.stringify(layout)})`);
  assert.ok(layout.cardScrollHeight <= layout.cardClientHeight * 1.25, `${label}: primeira etapa não pode exigir rolagem longa (${JSON.stringify(layout)})`);
  assert.equal(layout.twoColumns, true, `${label}: tipos de origem devem usar grade compacta 2x2`);
  assert.ok(layout.textareaHeight <= 110, `${label}: mensagem deve iniciar compacta`);
  assert.equal(layout.optionalClosed, true, `${label}: dados opcionais devem iniciar recolhidos`);
  assert.ok(layout.actionTop < layout.viewportHeight, `${label}: ação principal deve ficar acessível sem rolagem longa (${JSON.stringify(layout)})`);
  await page.screenshot({ path: path.join(artifacts, `mobile-panel-${label}.png`), fullPage: true });
  await page.close();
}

let browser; let server;
try {
  fs.mkdirSync(artifacts, { recursive: true });
  const started = await startServer(); server = started.server;
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  for (const viewport of [
    [1440, 900, 'desktop'], [1180, 800, 'notebook'], [768, 1024, 'tablet'], [390, 844, 'mobile'],
  ]) await activationViewport(browser, started.origin, ...viewport);
  await renewalStory(browser, started.origin);
  for (const viewport of [
    [360, 740, '360'], [390, 844, '390'], [430, 932, '430'], [800, 1000, '800'],
  ]) await mobilePanelExperience(browser, started.origin, ...viewport);
  console.log('✅ Browser Lote 4: desktop, notebook, tablet, mobile, foco, overflow, listas e renovação recente validados.');
} finally {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
