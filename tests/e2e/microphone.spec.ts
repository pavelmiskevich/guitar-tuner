import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from './fixtures/test-base';

/**
 * Жизненный цикл общего микрофона (#8): индикатор в шапке, обрыв потока,
 * пауза на скрытой странице и ошибка доступа на всех экранах, где микрофон
 * включается.
 */

function navPrefix(testInfo: TestInfo): string {
  return testInfo.project.use.isMobile ? 'nav-mobile' : 'nav-desktop';
}

async function openTab(page: Page, testInfo: TestInfo, tab: string): Promise<void> {
  await page.getByTestId(`${navPrefix(testInfo)}-${tab}`).click();
}

/** Имитация сворачивания вкладки: Playwright не умеет скрывать страницу сам. */
async function setPageHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (value ? 'hidden' : 'visible'),
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

test.describe('микрофон', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('индикатор в шапке виден на «Грифе» и выключает микрофон', async ({ page }, testInfo) => {
    // Пока микрофон выключен, индикатор не мешает.
    await expect(page.getByTestId('header-mic')).toHaveCount(0);

    await page.getByTestId('mic-toggle').click();
    await expect(page.getByTestId('mic-status')).toBeVisible();

    // На «Грифе» анализа нет, но микрофон по-прежнему включён — это должно быть видно.
    await openTab(page, testInfo, 'fretboard');
    const indicator = page.getByTestId('header-mic');
    await expect(indicator).toBeVisible();
    await expect(indicator).toHaveAttribute('data-state', 'running');

    await indicator.click();
    await expect(indicator).toHaveCount(0);

    // Выключение из шапки видит и тюнер: он предлагает включить микрофон заново.
    await openTab(page, testInfo, 'tuner');
    await expect(page.getByTestId('mic-toggle')).toBeVisible();
    await expect(page.getByTestId('mic-status')).toHaveCount(0);
  });

  test('обрыв потока показывает, что микрофон отключился', async ({ page }) => {
    await page.getByTestId('mic-toggle').click();
    await expect(page.getByTestId('mic-status')).toBeVisible();

    // Отозвали разрешение или вытащили гарнитуру.
    await page.evaluate(() => window.__fakeMic.endTracks());

    const banner = page.getByTestId('mic-error');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute('data-issue', 'interrupted');
    await expect(banner).toContainText('Микрофон отключился');
    // Раньше плашка продолжала утверждать «Микрофон активен».
    await expect(page.getByTestId('mic-status')).toHaveCount(0);
    await expect(page.getByTestId('header-mic')).toHaveCount(0);

    // Включение заново берёт новый поток и убирает сообщение.
    await page.getByTestId('mic-toggle').click();
    await expect(page.getByTestId('mic-status')).toBeVisible();
    await expect(banner).toHaveCount(0);
  });

  test('на скрытой странице микрофон на паузе, при возврате работает снова', async ({ page }) => {
    await page.getByTestId('mic-toggle').click();
    const status = page.getByTestId('mic-status');
    await expect(status).toHaveAttribute('data-state', 'running');

    await setPageHidden(page, true);
    await expect(status).toHaveAttribute('data-state', 'paused');
    await expect(status).toContainText('Микрофон на паузе');
    await expect(page.getByTestId('header-mic')).toHaveAttribute('data-state', 'paused');

    await setPageHidden(page, false);
    await expect(status).toHaveAttribute('data-state', 'running');
    await expect(status).toContainText('Микрофон активен');
  });

  test('отказ в доступе виден на экране проверки аккорда', async ({ page }, testInfo) => {
    await openTab(page, testInfo, 'chord-check');
    await page.evaluate(() => window.__fakeMic.denyAccess());

    // Режим A: раньше ошибка уходила только в console.error.
    await page.getByTestId('cc-mic-toggle').click();
    const banner = page.getByTestId('mic-error');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute('data-issue', 'denied');
    await expect(page.getByTestId('mic-help-quick')).toContainText('адресной строк');
  });

  test('отказ в доступе виден в режиме удара', async ({ page }, testInfo) => {
    await openTab(page, testInfo, 'chord-check');
    await page.evaluate(() => window.__fakeMic.denyAccess());

    await page.getByTestId('cc-mode-strum').click();
    await page.getByTestId('cc-strum-start').click();

    await expect(page.getByTestId('mic-error')).toHaveAttribute('data-issue', 'denied');
    // Захват не начинается без микрофона.
    await expect(page.getByTestId('cc-strum-start')).toContainText('Ударьте по всем струнам');
  });

  test('отказ в доступе виден в тренажёре слуха', async ({ page }, testInfo) => {
    await openTab(page, testInfo, 'ear-training');
    await page.evaluate(() => window.__fakeMic.denyAccess());

    await page.getByTestId('et-input-guitar').click();

    const banner = page.getByTestId('et-mic-error');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Нет доступа к микрофону');
    await expect(page.getByTestId('et-input-guitar')).toHaveAttribute('aria-pressed', 'false');
  });
});
