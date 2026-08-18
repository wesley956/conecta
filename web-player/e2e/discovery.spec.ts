import { expect, test, type Page, type Route } from '@playwright/test';

const session = {
  id: 'session-ux-e2e',
  absoluteExpiresAt: '2099-12-31T23:59:59.000Z',
  idleExpiresAt: '2099-12-31T23:00:00.000Z',
  clientName: 'Homologação UX',
};

const movies = [
  { contentId: 'm1', contentKey: 'movie:1', type: 'movie', title: 'Filme Alfa', category: 'Ação', year: 2026, duration: '1h 42min', synopsis: 'Missão urbana de alta tensão.' },
  { contentId: 'm2', contentKey: 'movie:2', type: 'movie', title: 'Filme Beta', category: 'Ação', year: 2025, duration: '1h 35min', synopsis: 'Uma equipe precisa terminar o trabalho.' },
  { contentId: 'm3', contentKey: 'movie:3', type: 'movie', title: 'Filme Gama', category: 'Drama', year: 2024, duration: '1h 58min', synopsis: 'Drama contemporâneo.' },
  { contentId: 'm4', contentKey: 'movie:4', type: 'movie', title: 'Filme Delta', category: 'Comédia', year: 2026, duration: '1h 28min', synopsis: 'Comédia leve.' },
] as const;

const series = [
  { contentId: 's1', contentKey: 'series:1', type: 'series', title: 'Série Um', category: 'Drama', synopsis: 'Mistério em duas temporadas.' },
  { contentId: 's2', contentKey: 'series:2', type: 'series', title: 'Série Dois', category: 'Drama', synopsis: 'Outra história do mesmo gênero.' },
] as const;

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body),
  });
}

async function mockWebApi(page: Page) {
  await page.route('**/functions/v1/**', async route => {
    const url = new URL(route.request().url());
    const endpoint = url.pathname.split('/').pop() || '';
    const body = (route.request().postDataJSON?.() || {}) as Record<string, unknown>;

    if (endpoint === 'web-player-auth') {
      if (body.action === 'login') {
        return json(route, { ok: true, accessToken: 'access-e2e', refreshToken: 'refresh-e2e', session });
      }
      if (body.action === 'session') return json(route, { ok: true, session });
      if (body.action === 'refresh') {
        return json(route, { ok: true, accessToken: 'access-e2e', refreshToken: 'refresh-e2e', session });
      }
      if (body.action === 'logout') return json(route, { ok: true });
    }

    if (endpoint === 'web-player-catalog') {
      if (body.action === 'catalog') {
        return json(route, {
          ok: true,
          catalogVersion: 'e2e-1',
          sourceRole: 'primary',
          usingBackup: false,
          channels: [{ contentId: 'c1', contentKey: 'channel:1', type: 'channel', title: 'Canal Um', category: 'Abertos' }],
          movies,
          series,
        });
      }
      if (body.action === 'series') {
        return json(route, {
          ok: true,
          contentId: body.contentId,
          contentKey: 'series:1',
          title: 'Série Um',
          detailsReady: true,
          seasons: [
            { number: 1, episodes: [
              { contentId: 'e11', contentKey: 'episode:1:1', type: 'episode', number: 1, title: 'Começo', duration: '44min' },
              { contentId: 'e12', contentKey: 'episode:1:2', type: 'episode', number: 2, title: 'Pista', duration: '46min' },
            ] },
            { number: 2, episodes: [
              { contentId: 'e21', contentKey: 'episode:2:1', type: 'episode', number: 1, title: 'Retorno', duration: '48min' },
            ] },
          ],
        });
      }
      if (body.action === 'epg') return json(route, { ok: true, available: false, programs: [] });
    }

    if (endpoint === 'web-player-library') {
      if (body.action === 'get') return json(route, { ok: true, favorites: [], progress: [], preferences: null });
      if (body.action === 'favorite') {
        return json(route, { ok: true, favorite: { contentKey: body.contentKey, active: body.active, version: 1, updatedAt: new Date().toISOString() } });
      }
    }

    if (endpoint === 'web-player-playback') {
      return json(route, {
        ok: true,
        mode: 'gateway',
        playbackUrl: 'https://example.invalid/media.m3u8',
        mediaKind: 'hls',
        contentType: 'movie',
        contentKey: 'movie:1',
        playlistRole: 'primary',
        alternativesAvailable: 0,
        recoveryToken: 'recovery-e2e',
        expiresAt: '2099-12-31T23:59:59.000Z',
      });
    }

    return json(route, { ok: false, code: 'E2E_UNHANDLED', message: `${endpoint}:${String(body.action || '')}` }, 500);
  });
}

async function login(page: Page, reducedMotion = true) {
  if (reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/web/');
  await page.getByLabel('Código do dispositivo').fill('ABCD-1234');
  await page.getByLabel('PIN Web').fill('123456');
  await page.getByRole('button', { name: 'Entrar no RonecaPlayTV' }).click();
  await expect(page.locator('.launch-splash')).toBeVisible();
  await expect(page.locator('.launch-splash')).toBeHidden({ timeout: reducedMotion ? 3_000 : 12_000 });
  await expect(page.getByText('RONECAPLAYTV WEB')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await mockWebApi(page);
});

test('login → splash → Home com hero de seis itens', async ({ page }) => {
  await login(page);
  await expect(page.locator('.hero-indicators button')).toHaveCount(6);
  await page.locator('.hero-indicators button').nth(1).click();
  await expect(page.locator('.hero-indicators button').nth(1)).toHaveClass(/active/);
});

test('detalhe de filme fecha com Escape e devolve o foco', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Filmes' }).click();
  const origin = page.locator('.poster-card').filter({ hasText: 'Filme Alfa' }).first();
  await origin.click();
  await expect(page.getByRole('dialog', { name: 'Detalhes de Filme Alfa' })).toBeVisible();
  await expect(page.getByText('Você também pode gostar')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Detalhes de Filme Alfa' })).toBeHidden();
  await expect(origin).toBeFocused();
});

test('temporadas suportam setas e atualizam apenas os episódios ativos', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Séries' }).click();
  await page.locator('.poster-card').filter({ hasText: 'Série Um' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Detalhes de Série Um' });
  await expect(dialog).toBeVisible();
  const t1 = dialog.getByRole('tab', { name: 'T1' });
  const t2 = dialog.getByRole('tab', { name: 'T2' });
  await t1.focus();
  await page.keyboard.press('ArrowRight');
  await expect(t2).toHaveAttribute('aria-selected', 'true');
  await expect(dialog.getByText('Retorno')).toBeVisible();
  await expect(dialog.getByText('Começo')).toBeHidden();
});

test('hover preview respeita intenção de 600 ms', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Timing de hover é coberto uma vez no engine Chromium.');
  await login(page);
  await page.getByRole('button', { name: 'Filmes' }).click();
  const card = page.locator('.poster-card').filter({ hasText: 'Filme Alfa' }).first();
  await card.hover();
  await page.waitForTimeout(250);
  await expect(page.locator('.hover-preview')).toHaveCount(0);
  await page.waitForTimeout(430);
  await expect(page.locator('.hover-preview')).toBeVisible();
});

test('mobile 390 px permanece sem overflow e com navegação inferior', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await expect(page.locator('.bottom-nav')).toBeVisible();
  await expect(page.locator('.side-nav')).toBeHidden();
  const metrics = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width + 1);
  await page.screenshot({ path: `test-results/ux-home-390-${testInfo.project.name}.png`, fullPage: true });
});

test('reduced motion remove partículas contínuas', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/web/');
  await expect(page.locator('.ambient-particles')).toHaveCSS('display', 'none');
});

test('splash real usa o vídeo oficial antes da Home', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Vídeo real é exercitado uma vez para reduzir duração do CI.');
  await login(page, false);
  await expect(page.locator('.experience-hero')).toBeVisible();
});
