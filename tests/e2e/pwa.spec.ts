import { test as rawTest } from '@playwright/test';
import { expect, test } from './fixtures/test-base';
import { waitForBeatActive } from './fixtures/beats';

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
    expect(scope).toBe(new URL('/', page.url()).href);
  });

  /** Воркер установлен, файлы сборки в кэше, страница под его управлением. */
  async function waitForServiceWorker(page: import('@playwright/test').Page) {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  }

  test('открывается офлайн сразу после первого визита (#9)', async ({ page, context }) => {
    // Без прогревочной перезагрузки: раньше офлайн работал, только если до
    // отключения сети страницу открывали второй раз, и тест это маскировал.
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);

    await context.setOffline(true);
    await page.reload();

    await expect(page.getByTestId('header-subtitle')).toBeVisible();
    await expect(page.getByTestId('mic-toggle')).toBeVisible();

    await context.setOffline(false);
  });

  test('метроном играет офлайн: скрипт его воркера берётся из кэша (#7)', async ({ page, context }, testInfo) => {
    // Тикер метронома — отдельный файл сборки (Web Worker). Его запрос идёт уже
    // после загрузки страницы, по нажатию «Старт»; если бы он не попал в
    // предкэш, офлайн метроном молча перешёл бы на таймер страницы.
    await page.goto('/');
    await waitForServiceWorker(page);

    await context.setOffline(true);
    await page.reload();
    const prefix = testInfo.project.use.isMobile ? 'nav-mobile' : 'nav-desktop';
    await page.getByTestId(`${prefix}-metronome`).click();
    await page.getByTestId('mt-toggle').click();
    await waitForBeatActive(page, 1);

    const worker = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .find((e) => e.name.includes('schedulerTicker.worker')) as PerformanceResourceTiming | undefined
    );
    expect(worker, 'скрипт воркера метронома не загружался').toBeTruthy();

    await context.setOffline(false);
  });

  // Без стража консоли: браузер сам пишет в неё ERR_INTERNET_DISCONNECTED на
  // этот запрос — здесь это ожидаемый результат, а не ошибка страницы.
  rawTest('офлайн не подменяет недоступный ресурс на index.html (#9)', async ({ page, context }) => {
    await page.goto('/');
    await waitForServiceWorker(page);

    await context.setOffline(true);
    const result = await page.evaluate(async () => {
      try {
        const res = await fetch('./assets/no-such-file.js');
        return `ответ ${res.status} ${res.headers.get('content-type')}`;
      } catch {
        return 'сетевая ошибка';
      }
    });
    await context.setOffline(false);

    expect(result).toBe('сетевая ошибка');
  });

  test('держит один кэш, названный по хэшу сборки, и удаляет старые (#9)', async ({ page }) => {
    // Кэш от прежней версии воркера, у которой имя было константой.
    await page.addInitScript(() => {
      void caches.open('night-rehearsal-v2');
    });
    await page.goto('/');
    await waitForServiceWorker(page);

    const { keys, cached } = await page.evaluate(async () => {
      const keys = await caches.keys();
      const cache = await caches.open(keys[0]);
      const cached = (await cache.keys()).map((r) => new URL(r.url).pathname);
      return { keys, cached };
    });

    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^gt-precache-[0-9a-f]{12}$/);
    expect(cached).toContain('/index.html');
    expect(cached).toContain('/manifest.json');
    expect(cached.some((p) => /^\/assets\/index-.+\.js$/.test(p))).toBe(true);
    expect(cached.some((p) => p.startsWith('/fonts/'))).toBe(true);
  });
});
