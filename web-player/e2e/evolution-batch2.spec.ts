import { expect, test, type Page, type Route } from '@playwright/test';

const session = {
  id: 'session-evolution-b2',
  absoluteExpiresAt: '2099-12-31T23:59:59.000Z',
  idleExpiresAt: '2099-12-31T23:00:00.000Z',
  clientName: 'Homologação lote 2',
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
}

async function mockApi(page: Page) {
  await page.route('**/functions/v1/**', async route => {
    const endpoint = new URL(route.request().url()).pathname.split('/').pop() || '';
    const body = (route.request().postDataJSON?.() || {}) as Record<string, unknown>;

    if (endpoint === 'web-player-auth') {
      if (body.action === 'login') return json(route, { ok: true, accessToken: 'access-b2', refreshToken: 'refresh-b2', session });
      if (body.action === 'session') return json(route, { ok: true, session });
      if (body.action === 'refresh') return json(route, { ok: true, accessToken: 'access-b2', refreshToken: 'refresh-b2', session });
      if (body.action === 'logout') return json(route, { ok: true });
    }

    if (endpoint === 'web-player-catalog' && body.action === 'catalog') {
      const categories = Array.from({ length: 30 }, (_, index) => `Categoria ${String(index + 1).padStart(2, '0')}`);
      return json(route, {
        ok: true,
        sourceRole: 'primary',
        usingBackup: false,
        channels: [{ contentId: 'c1', contentKey: 'channel:1', type: 'channel', title: 'Canal Um', category: 'Abertos' }],
        movies: categories.map((category, index) => ({
          contentId: `m${index + 1}`,
          contentKey: `movie:${index + 1}`,
          type: 'movie',
          title: `Filme ${index + 1}`,
          category,
          year: 2026,
        })),
        series: [{ contentId: 's1', contentKey: 'series:1', type: 'series', title: 'Série Um', category: 'Drama' }],
      });
    }

    if (endpoint === 'web-player-library') {
      if (body.action === 'get') return json(route, { ok: true, favorites: [], progress: [], preferences: { aspectMode: 'contain', language: null, subtitleLanguage: null, version: 1, updatedAt: new Date().toISOString() } });
      if (body.action === 'preferences') return json(route, { ok: true, preferences: { aspectMode: body.aspectMode ?? 'contain', language: body.language ?? null, subtitleLanguage: body.subtitleLanguage ?? null, version: 2, updatedAt: new Date().toISOString() } });
    }

    return json(route, { ok: false, code: 'E2E_UNHANDLED', message: `${endpoint}:${String(body.action || '')}` }, 500);
  });
}

async function login(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/web/');
  await page.getByLabel('Código do dispositivo').fill('ABCD-1234');
  await page.getByLabel('PIN Web').fill('123456');
  await page.getByRole('button', { name: 'Entrar no RonecaPlayTV' }).click();
  await expect(page.locator('.experience-hero')).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('.launch-splash')).toBeHidden({ timeout: 3_000 });
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test('Filmes troca menu principal por categorias e permite voltar ao menu', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.getByRole('button', { name: 'Filmes' }).click();
  await expect(page.locator('.app-shell')).toHaveClass(/category-mode/);
  await expect(page.getByRole('button', { name: 'Menu principal' })).toBeVisible();
  await expect(page.getByPlaceholder('Buscar categoria…')).toBeVisible();

  await page.getByPlaceholder('Buscar categoria…').fill('Categoria 30');
  await expect(page.getByRole('button', { name: 'Categoria 30' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Categoria 01' })).toBeHidden();

  await page.getByRole('button', { name: 'Menu principal' }).click();
  await expect(page.locator('.app-shell')).not.toHaveClass(/category-mode/);
  await expect(page.locator('.side-nav nav')).toBeVisible();
});

test('Configurações ficam acessíveis no menu e persistem preferência canônica', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Abrir configurações' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Configurações do RonecaPlayTV' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Reprodução')).toBeVisible();
  await dialog.getByLabel('Aspecto padrão').selectOption('cover');
  await expect(dialog.getByText('Preferência salva.')).toBeVisible();
  await expect(dialog.getByText('Sessão Web')).toBeVisible();
  await expect(dialog.getByText('Ativa')).toBeVisible();
});

test('mobile usa sheet de categorias e mantém configurações sem sidebar desktop', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await expect(page.locator('.side-nav')).toBeHidden();
  await expect(page.locator('.bottom-nav')).toBeVisible();

  await page.getByRole('button', { name: 'Filmes' }).click();
  const categoryToggle = page.locator('.category-mobile-toggle');
  await expect(categoryToggle).toBeVisible();
  await categoryToggle.click();
  const categoryDialog = page.getByRole('dialog', { name: 'Categorias' });
  await expect(categoryDialog).toBeVisible();
  await categoryDialog.getByPlaceholder('Buscar categoria…').fill('Categoria 30');
  await categoryDialog.getByRole('button', { name: 'Categoria 30' }).click();
  await expect(categoryDialog).toBeHidden();
  await expect(page.locator('.poster-card').filter({ hasText: 'Filme 30' })).toBeVisible();

  await page.getByRole('button', { name: 'Abrir configurações' }).click();
  await expect(page.getByRole('dialog', { name: 'Configurações do RonecaPlayTV' })).toBeVisible();
  const metrics = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width + 1);
});
