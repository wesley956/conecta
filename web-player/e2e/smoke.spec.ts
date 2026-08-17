import { expect, test } from '@playwright/test';

test('login shell', async ({ page }) => {
  await page.goto('/web/');
  await expect(page.getByRole('heading', { name: 'Entrar com seu aparelho' })).toBeVisible();
  await expect(page.getByLabel('Código do dispositivo')).toBeVisible();
  await expect(page.getByLabel('PIN Web')).toBeVisible();
});

test('manifest and offline fallback', async ({ request }) => {
  const manifestResponse = await request.get('/web/manifest.webmanifest');
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json();
  expect(manifest.start_url).toBe('/web/');
  expect(manifest.scope).toBe('/web/');
  expect(manifest.display).toBe('standalone');

  const offlineResponse = await request.get('/web/offline.html');
  expect(offlineResponse.ok()).toBeTruthy();
  expect(await offlineResponse.text()).toContain('não salva catálogo privado');
});
