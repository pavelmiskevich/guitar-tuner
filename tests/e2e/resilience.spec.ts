import { expect, test } from './fixtures/test-base';

/**
 * Устойчивость (#12): приложение не должно падать белым экраном из-за
 * недоступного хранилища и не должно рапортовать о копировании, которого не было.
 */

const TABS = ['tuner', 'fretboard', 'chord-check', 'metronome', 'ear-training'] as const;

test.describe('устойчивость', () => {
  test('работает, когда хранилище сайта запрещено', async ({ page }, testInfo) => {
    // Так ведёт себя браузер с запретом данных сайтов: бросает уже само обращение
    // к window.localStorage, а не только getItem/setItem.
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('The operation is insecure.', 'SecurityError');
        },
      });
    });
    await page.goto('/');

    await expect(page.getByTestId('mic-toggle')).toBeVisible();
    await expect(page.getByTestId('error-boundary')).toHaveCount(0);

    const prefix = testInfo.project.use.isMobile ? 'nav-mobile' : 'nav-desktop';
    for (const tab of TABS) {
      await page.getByTestId(`${prefix}-${tab}`).click();
      await expect(page.getByTestId('error-boundary')).toHaveCount(0);
    }

    // Запись настройки тоже не должна ронять интерфейс.
    await page.getByTestId('settings-open').click();
    await page.getByTestId('settings-a4-432').click();
    await page.getByTestId('settings-close').click();
    await expect(page.getByTestId('header-subtitle')).toContainText('A4=432Hz');
  });

  test('переносит рекорд серии из старого ключа хранилища', async ({ page }, testInfo) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('gt_storage_version');
      localStorage.removeItem('gt_ear_best_streak');
      localStorage.setItem('nr_ear_best_streak', '5');
    });
    await page.reload();

    const prefix = testInfo.project.use.isMobile ? 'nav-mobile' : 'nav-desktop';
    await page.getByTestId(`${prefix}-ear-training`).click();
    await expect(page.getByTestId('et-best')).toHaveText(/^5 \(/);

    const keys = await page.evaluate(() => ({
      current: localStorage.getItem('gt_ear_best_streak'),
      legacy: localStorage.getItem('nr_ear_best_streak'),
    }));
    expect(keys).toEqual({ current: '5', legacy: null });
  });

  test('мусор вместо рекорда серии не превращается в NaN', async ({ page }, testInfo) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('gt_ear_best_streak', 'мусор'));
    await page.reload();

    const prefix = testInfo.project.use.isMobile ? 'nav-mobile' : 'nav-desktop';
    await page.getByTestId(`${prefix}-ear-training`).click();
    await expect(page.getByTestId('et-best')).toHaveText(/^0 \(/);
  });

  test('не пишет «Скопировано», если скопировать не удалось', async ({ page }, testInfo) => {
    // Нет Clipboard API (HTTP, часть WebView) и запасной execCommand тоже отказывает.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, get: () => undefined });
      document.execCommand = () => false;
    });
    await page.goto('/');

    const prefix = testInfo.project.use.isMobile ? 'nav-mobile' : 'nav-desktop';
    await page.getByTestId(`${prefix}-fretboard`).click();
    await page.getByTestId('fb-share').click();

    await expect(page.getByTestId('fb-share-failed')).toBeVisible();
    await expect(page.getByTestId('fb-share-copied')).toHaveCount(0);
  });
});
