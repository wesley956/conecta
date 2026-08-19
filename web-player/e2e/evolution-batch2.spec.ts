import { expect, test, type Page } from '@playwright/test';

const categories = Array.from({ length: 36 }, (_, index) => `Categoria ${String(index + 1).padStart(2, '0')}`);

async function mockApi(page: Page) {
  await page.route('**/functions/v1/web-player-login', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ access_token: 'access-1', refresh_token: 'refresh-1' }),
  }));
  await page.route('**/functions/v1/web-player-refresh', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ access_token: 'access-1', refresh_token: 'refresh-1' }),
  }));
  await page.route('**/functions/v1/web-player-session', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ id: 'session-1', client_name: 'Sala', expires_at: new Date(Date.now() + 3_600_000).toISOString() }),
  }));
  await page.route('**/functions/v1/web-player-catalog**', route => {
    const url = new URL(route.request().url());
    const section = url.searchParams.get('section');
    if (section === 'live') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [{ content_key: 'live:1', content_id: 'live-1', title: 'Canal News', category: 'Notícias', logo_url: '' }], next_cursor: null }) });
    }
    if (section === 'series') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [
        { content_key: 'series:1', content_id: 'series-1', title: 'Dark Files', category: 'Drama', poster_url: '' },
        { content_key: 'series:2', content_id: 'series-2', title: 'Crime Line', category: 'Drama', poster_url: '' },
        { content_key: 'series:3', content_id: 'series-3', title: 'Comedy House', category: 'Comédia', poster_url: '' },
      ], next_cursor: null }) });
    }
    const items = categories.map((category, index) => ({
      content_key: `movie:${index + 1}`,
      content_id: `movie-${index + 1}`,
      title: `Filme ${index + 1}`,
      category,
      year: 2026,
      poster_url: '',
      backdrop_url: '',
    }));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items, next_cursor: null }) });
  });
  await page.route('**/functions/v1/web-player-progress**', route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ progress: [
        { content_id: 'movie-1', content_key: 'movie:1', position_seconds: 420, duration_seconds: 1800, completed: false, updated_at: '2026-08-19T00:00:00.000Z' },
        { content_id: 'movie-2', content_key: 'movie:2', position_seconds: 1500, duration_seconds: 1800, completed: true, updated_at: '2026-08-18T23:00:00.000Z' },
      ] }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/functions/v1/web-player-favorites**', route => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ favorites: [] }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/functions/v1/web-player-series**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ seasons: [] }) }));
  await page.route('**/functions/v1/web-player-play', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ playback_url: 'https://example.com/master.m3u8', expires_at: new Date(Date.now() + 60_000).toISOString() }) }));
}

async function login(page: Page) {
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
  await expect(page.getByRole('button', { name: 'Categoria 30', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Categoria 01', exact: true })).toBeHidden();

  await page.getByRole('button', { name: 'Menu principal' }).click();
  await expect(page.locator('.app-shell')).not.toHaveClass(/category-mode/);
  await expect(page.locator('.side-nav nav')).toBeVisible();
});

test('Configurações ficam acessíveis no menu e persistem preferência canônica', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Abrir configurações' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Configurações do RonecaPlayTV' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Reprodução', exact: true })).toBeVisible();
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
  await page.getByRole('button', { name: 'Filmes' }).last().click();
  await expect(page.locator('.app-shell')).toHaveClass(/mobile-category-mode/);
  await page.getByRole('button', { name: /Categorias Todos/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Categorias' });
  await expect(sheet).toBeVisible();
  await sheet.getByPlaceholder('Buscar categoria…').fill('Categoria 30');
  await expect(sheet.getByRole('button', { name: 'Categoria 30', exact: true })).toBeVisible();
  await sheet.getByRole('button', { name: 'Categoria 30', exact: true }).click();
  await expect(sheet).toBeHidden();

  await page.getByRole('button', { name: 'Mais' }).click();
  await page.getByRole('button', { name: 'Configurações' }).click();
  await expect(page.getByRole('dialog', { name: 'Configurações do RonecaPlayTV' })).toBeVisible();
});

test('Home mostra no máximo dois trilhos contextuais baseados em consumo significativo', async ({ page }) => {
  await login(page);
  const shelves = page.locator('.contextual-shelf');
  await expect(shelves).toHaveCount(2);
  await expect(shelves.nth(0)).toContainText('Porque você assistiu');
  await expect(shelves.nth(1)).toContainText('Porque você assistiu');
});
