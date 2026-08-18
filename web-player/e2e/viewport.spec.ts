import { devices, expect, test, type Page, type Route } from '@playwright/test';

const session = {
  id: 'session-viewport-e2e',
  absoluteExpiresAt: '2099-12-31T23:59:59.000Z',
  idleExpiresAt: '2099-12-31T23:00:00.000Z',
  clientName: 'Viewport UX',
};

const movies = [
  { contentId: 'vm1', contentKey: 'viewport:movie:1', type: 'movie', title: 'Horizonte', category: 'Ação', year: 2026, duration: '1h 40min', synopsis: 'Filme de referência visual.' },
  { contentId: 'vm2', contentKey: 'viewport:movie:2', type: 'movie', title: 'Aurora', category: 'Drama', year: 2025, duration: '1h 32min', synopsis: 'Segundo filme de referência.' },
  { contentId: 'vm3', contentKey: 'viewport:movie:3', type: 'movie', title: 'Pulso', category: 'Ação', year: 2024, duration: '1h 48min', synopsis: 'Terceiro filme de referência.' },
  { contentId: 'vm4', contentKey: 'viewport:movie:4', type: 'movie', title: 'Lume', category: 'Comédia', year: 2026, duration: '1h 26min', synopsis: 'Quarto filme de referência.' },
] as const;
const series = [
  { contentId: 'vs1', contentKey: 'viewport:series:1', type: 'series', title: 'Órbita', category: 'Drama', synopsis: 'Série de referência visual.' },
  { contentId: 'vs2', contentKey: 'viewport:series:2', type: 'series', title: 'Vértice', category: 'Drama', synopsis: 'Segunda série de referência.' },
] as const;

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
}

async function expectImagesLoaded(page: Page, selector: string) {
  const images = page.locator(selector);
  const count = await images.count();
  expect(count, `esperava imagens em ${selector}`).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const state = await images.nth(index).evaluate(image => {
      const element = image as HTMLImageElement;
      return { src: element.currentSrc || element.src, complete: element.complete, naturalWidth: element.naturalWidth };
    });
    expect(state.src, `asset fora da base /web/: ${state.src}`).toContain('/web/brand/');
    expect(state.complete, `imagem ainda não concluiu: ${state.src}`).toBeTruthy();
    expect(state.naturalWidth, `imagem quebrada: ${state.src}`).toBeGreaterThan(0);
  }
}

async function mockApi(page: Page) {
  await page.route('**/functions/v1/**', async route => {
    const endpoint = new URL(route.request().url()).pathname.split('/').pop() || '';
    const body = (route.request().postDataJSON?.() || {}) as Record<string, unknown>;
    if (endpoint === 'web-player-auth') {
      if (body.action === 'login') return json(route, { ok: true, accessToken: 'viewport-access', refreshToken: 'viewport-refresh', session });
      if (body.action === 'session') return json(route, { ok: true, session });
      if (body.action === 'refresh') return json(route, { ok: true, accessToken: 'viewport-access', refreshToken: 'viewport-refresh', session });
      if (body.action === 'logout') return json(route, { ok: true });
    }
    if (endpoint === 'web-player-catalog') {
      if (body.action === 'catalog') return json(route, {
        ok: true,
        catalogVersion: 'viewport-1',
        sourceRole: 'primary',
        usingBackup: false,
        channels: [{ contentId: 'vc1', contentKey: 'viewport:channel:1', type: 'channel', title: 'Canal Referência', category: 'Abertos' }],
        movies,
        series,
      });
      if (body.action === 'series') return json(route, {
        ok: true,
        contentId: body.contentId,
        contentKey: 'viewport:series:1',
        title: 'Órbita',
        detailsReady: true,
        seasons: [{ number: 1, episodes: [{ contentId: 've1', contentKey: 'viewport:episode:1', type: 'episode', number: 1, title: 'Piloto', duration: '45min' }] }],
      });
      if (body.action === 'epg') return json(route, { ok: true, available: false, programs: [] });
    }
    if (endpoint === 'web-player-library') {
      if (body.action === 'get') return json(route, { ok: true, favorites: [], progress: [], preferences: null });
      if (body.action === 'favorite') return json(route, { ok: true, favorite: { contentKey: body.contentKey, active: body.active, version: 1, updatedAt: '2026-08-18T00:00:00.000Z' } });
    }
    return json(route, { ok: false, code: 'VIEWPORT_E2E_UNHANDLED' }, 500);
  });
}

async function login(page: Page, reducedMotion = true) {
  await page.emulateMedia({ reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
  await page.goto('/web/');
  await page.getByLabel('Código do dispositivo').fill('VIEW-1234');
  await page.getByLabel('PIN Web').fill('123456');
  await page.getByRole('button', { name: 'Entrar no RonecaPlayTV' }).click();
  await expect(page.locator('.experience-hero')).toBeVisible({ timeout: 8_000 });
  if (!reducedMotion) {
    const splash = page.locator('.launch-splash');
    await expect(splash).toBeVisible();
    const video = splash.locator('video');
    await expect(video).toHaveCount(1);
    const media = await video.evaluate(element => {
      const target = element as HTMLVideoElement;
      return { src: target.currentSrc || target.src, networkState: target.networkState, error: target.error?.code || 0 };
    });
    expect(media.src).toContain('/web/brand/roneca_launch_video.mp4');
    expect(media.networkState).not.toBe(HTMLMediaElement.NETWORK_NO_SOURCE);
    expect(media.error).toBe(0);
    await video.evaluate(element => element.dispatchEvent(new Event('ended')));
  }
  await expect(page.locator('.launch-splash')).toBeHidden({ timeout: 3_000 });
}

test('login possui evidência visual desktop e mobile sem overflow', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Composição do login é registrada uma vez no Chromium.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const viewport of [{ width: 360, height: 800 }, { width: 1366, height: 768 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/web/');
    await expect(page.getByRole('heading', { name: 'Entrar com seu aparelho' })).toBeVisible();
    await expectImagesLoaded(page, '.experience-login-brand img');
    const metrics = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
    await page.screenshot({ path: `test-results/ux-login-${viewport.width}x${viewport.height}-chromium.png`, fullPage: true, animations: 'disabled' });
  }
});

test('matriz 360–2560 não produz overflow horizontal e registra evidência', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Matriz de composição é registrada uma vez no Chromium; cross-browser fica no discovery.spec.');
  await mockApi(page);
  await login(page);

  const viewports = [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
    { width: 2560, height: 1080 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const metrics = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(metrics.scrollWidth, `${viewport.width}x${viewport.height} criou overflow horizontal`).toBeLessThanOrEqual(metrics.clientWidth + 1);
    await expect(page.locator('.experience-hero')).toBeVisible();
    if (viewport.width <= 640) {
      await expect(page.locator('.bottom-nav')).toBeVisible();
      await expect(page.locator('.side-nav')).toBeHidden();
      await expectImagesLoaded(page, '.mobile-topbar img');
    } else {
      await expect(page.locator('.side-nav')).toBeVisible();
      await expect(page.locator('.bottom-nav')).toBeHidden();
      await expectImagesLoaded(page, '.brand-button img');
    }
    await page.screenshot({
      path: `test-results/ux-viewport-${viewport.width}x${viewport.height}-chromium.png`,
      fullPage: true,
      animations: 'disabled',
    });
  }
});

test('hero rotaciona em ~7 s e pausa durante interação', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Temporização real do hero é exercitada uma vez no Chromium.');
  await mockApi(page);
  await login(page, false);
  const activeButton = () => page.locator('.hero-indicators button.active');
  const initial = await activeButton().getAttribute('aria-label');
  await page.waitForTimeout(7_400);
  const rotated = await activeButton().getAttribute('aria-label');
  expect(rotated).not.toBe(initial);
  await page.locator('.experience-hero').hover();
  const paused = await activeButton().getAttribute('aria-label');
  await page.waitForTimeout(7_400);
  expect(await activeButton().getAttribute('aria-label')).toBe(paused);
});

test('hover preview não desloca cards vizinhos', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Geometria do hover é exercitada uma vez no Chromium.');
  await mockApi(page);
  await login(page);
  await page.getByRole('button', { name: 'Filmes' }).first().click();
  const cards = page.locator('.poster-card');
  const first = cards.nth(0);
  const second = cards.nth(1);
  const beforeFirst = await first.boundingBox();
  const beforeSecond = await second.boundingBox();
  expect(beforeFirst).not.toBeNull();
  expect(beforeSecond).not.toBeNull();
  await first.hover();
  await page.waitForTimeout(680);
  await expect(page.locator('.hover-preview')).toBeVisible();
  const afterFirst = await first.boundingBox();
  const afterSecond = await second.boundingBox();
  expect(afterFirst).not.toBeNull();
  expect(afterSecond).not.toBeNull();
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    expect(afterFirst?.[key]).toBeCloseTo(beforeFirst?.[key] || 0, 0);
    expect(afterSecond?.[key]).toBeCloseTo(beforeSecond?.[key] || 0, 0);
  }
});

test('fluxo principal pode ser concluído somente por teclado', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Contrato de teclado é exercitado uma vez e temporadas são testadas cross-browser no discovery.spec.');
  await mockApi(page);
  await login(page);
  const moviesButton = page.getByRole('button', { name: 'Filmes' }).first();
  await moviesButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Filmes' })).toBeVisible();
  const firstCard = page.locator('.poster-card').first();
  await firstCard.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(firstCard).toBeFocused();
});

test('touch/coarse pointer abre navegação e conteúdo sem hover persistente', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'Contrato de touch é exercitado em um contexto Pixel 5 no Chromium.');
  const context = await browser.newContext({
    ...devices['Pixel 5'],
    baseURL: 'http://127.0.0.1:4173',
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  try {
    await mockApi(page);
    await login(page);
    await expectImagesLoaded(page, '.mobile-topbar img');
    await page.getByRole('button', { name: 'Filmes' }).tap();
    await expect(page.getByRole('heading', { name: 'Filmes' })).toBeVisible();
    await page.locator('.poster-card').first().tap();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('.hover-preview')).toHaveCount(0);
  } finally {
    await context.close();
  }
});
