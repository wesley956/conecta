import { expect, test, type Page, type Route } from '@playwright/test';

const session = {
  id: 'session-splash-polish',
  absoluteExpiresAt: '2099-12-31T23:59:59.000Z',
  idleExpiresAt: '2099-12-31T23:00:00.000Z',
  clientName: 'Splash Polish',
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
}

async function mockApi(page: Page, loginDelayMs = 0) {
  await page.route('**/functions/v1/**', async route => {
    const endpoint = new URL(route.request().url()).pathname.split('/').pop() || '';
    const body = (route.request().postDataJSON?.() || {}) as Record<string, unknown>;
    if (endpoint === 'web-player-auth') {
      if (body.action === 'login') {
        if (loginDelayMs > 0) await new Promise(resolve => setTimeout(resolve, loginDelayMs));
        return json(route, { ok: true, accessToken: 'splash-access', refreshToken: 'splash-refresh', session });
      }
      if (body.action === 'session') return json(route, { ok: true, session });
      if (body.action === 'refresh') return json(route, { ok: true, accessToken: 'splash-access', refreshToken: 'splash-refresh', session });
      if (body.action === 'logout') return json(route, { ok: true });
    }
    if (endpoint === 'web-player-catalog' && body.action === 'catalog') {
      return json(route, {
        ok: true,
        catalogVersion: 'splash-polish-1',
        sourceRole: 'primary',
        usingBackup: false,
        channels: [],
        movies: [{ contentId: 'spm1', contentKey: 'splash:movie:1', type: 'movie', title: 'Entrada', category: 'Drama', year: 2026 }],
        series: [],
      });
    }
    if (endpoint === 'web-player-library' && body.action === 'get') {
      return json(route, { ok: true, favorites: [], progress: [], preferences: null });
    }
    return json(route, { ok: false, code: 'SPLASH_POLISH_UNHANDLED' }, 500);
  });
}

async function fillLogin(page: Page) {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/web/');
  await page.getByLabel('Código do dispositivo').fill('SPLASH-1234');
  await page.getByLabel('PIN Web').fill('123456');
}

async function submitLogin(page: Page) {
  await fillLogin(page);
  await page.getByRole('button', { name: 'Entrar no RonecaPlayTV' }).click();
  await expect(page.locator('.launch-splash')).toBeVisible({ timeout: 8_000 });
}

test('gesto de login mantém o mesmo áudio vivo durante autenticação e revela a Home', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Política de mídia é exercitada de forma determinística no Chromium.');
  await page.addInitScript(() => {
    const state = window as Window & { __splashPauseCount?: number; __splashPlayCount?: number };
    state.__splashPauseCount = 0;
    state.__splashPlayCount = 0;
    HTMLMediaElement.prototype.play = function play() {
      state.__splashPlayCount = (state.__splashPlayCount || 0) + 1;
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function pause() {
      state.__splashPauseCount = (state.__splashPauseCount || 0) + 1;
    };
  });
  await mockApi(page, 450);
  await fillLogin(page);
  await page.getByRole('button', { name: 'Entrar no RonecaPlayTV' }).click();

  const audio = page.locator('.launch-splash-audio');
  await expect(audio).toHaveCount(1);
  const src = await audio.evaluate(element => (element as HTMLAudioElement).src);
  expect(src).toContain('/web/brand/roneca_launch_video.mp4');

  // reset inicial pode chamar pause uma vez; durante a autenticação o áudio não pode
  // ser pausado novamente, pois isso perderia o vínculo com o gesto do usuário.
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.splashAudio)).toBe('primed');
  await page.waitForTimeout(180);
  expect(await page.evaluate(() => (window as Window & { __splashPauseCount?: number }).__splashPauseCount)).toBe(1);
  expect(await page.evaluate(() => (window as Window & { __splashPlayCount?: number }).__splashPlayCount)).toBe(1);

  await expect(page.locator('.launch-splash')).toBeVisible({ timeout: 8_000 });
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.splashAudio)).toMatch(/primed|playing/);
  await expect.poll(() => page.evaluate(() => document.body.classList.contains('splash-polish-active'))).toBeTruthy();

  const video = page.locator('.launch-splash-video');
  await video.evaluate(element => {
    const target = element as HTMLVideoElement;
    target.currentTime = 6.05;
    target.dispatchEvent(new Event('timeupdate'));
  });
  await expect(page.locator('.launch-splash')).toHaveClass(/is-polish-revealing/);
  await expect.poll(() => page.evaluate(() => document.body.classList.contains('splash-polish-reveal'))).toBeTruthy();

  await video.evaluate(element => element.dispatchEvent(new Event('ended', { bubbles: true })));
  await expect(page.locator('.launch-splash')).toBeHidden({ timeout: 3_000 });
  await expect.poll(() => page.evaluate(() => document.body.classList.contains('splash-polish-active'))).toBeFalsy();
});

test('quando áudio separado é bloqueado tenta o próprio vídeo e nunca quebra o splash', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Fallback de autoplay é exercitado uma vez no Chromium.');
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function play() {
      if ((this as HTMLElement).classList.contains('launch-splash-audio')) return Promise.reject(new DOMException('blocked', 'NotAllowedError'));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function pause() {};
  });
  await mockApi(page);
  await submitLogin(page);

  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.splashAudio)).toMatch(/video|silent/);
  const mode = await page.evaluate(() => document.documentElement.dataset.splashAudio);
  if (mode === 'video') {
    expect(await page.locator('.launch-splash-video').evaluate(element => (element as HTMLVideoElement).muted)).toBeFalsy();
  }

  await page.locator('.launch-splash-video').evaluate(element => element.dispatchEvent(new Event('ended', { bubbles: true })));
  await expect(page.locator('.launch-splash')).toBeHidden({ timeout: 3_000 });
  await expect(page.locator('.experience-hero')).toBeVisible();
});
