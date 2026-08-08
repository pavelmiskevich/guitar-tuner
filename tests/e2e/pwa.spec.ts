import { expect, test } from './fixtures/test-base';

test.describe('PWA', () => {
  test('манифест доступен и содержит обязательные поля', async ({ page, request }) => {
    await page.goto('/');

    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href, 'в index.html нет ссылки на манифест').toBeTruthy();

    const res = await request.get(href!);
    expect(res.status()).toBe(200);

    const manifest = await res.json();
    expect(manifest.name).toBeTruthy();
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.display).toBeTruthy();
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  test('все иконки манифеста отдаются', async ({ page, request }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    const manifest = await (await request.get(href!)).json();

    for (const icon of manifest.icons) {
      const iconRes = await request.get(new URL(icon.src, page.url()).toString());
      expect(iconRes.status(), `иконка ${icon.src}`).toBe(200);
    }
  });

  test('service worker регистрируется', async ({ page }) => {
    await page.goto('/');
    const scope = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return reg.scope;
    });
    expect(scope).toContain('localhost:4173');
  });

  test('приложение открывается офлайн', async ({ page, context }) => {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    // Прогрев кэша: даём SW обработать запросы основной сборки.
    await page.reload();
    await page.evaluate(() => navigator.serviceWorker.ready);

    await context.setOffline(true);
    await page.reload();

    await expect(page.getByTestId('header-subtitle')).toBeVisible();
    await expect(page.getByTestId('mic-toggle')).toBeVisible();

    await context.setOffline(false);
  });
});
