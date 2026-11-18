import { expect as rawExpect, test as rawTest } from '@playwright/test';
import { expect, test } from './fixtures/test-base';
import { findLowContrastText } from './fixtures/contrast';

/** Тема «День» (#10): читаемость, тема системы при первом запуске, theme-color. */

const TABS = ['tuner', 'fretboard', 'chord-check', 'metronome', 'ear-training'] as const;
/** theme-color в виде #rrggbb: браузер отдаёт значение токена сокращённым (#fff) и строчными. */
const themeColor = async (page: import('@playwright/test').Page) => {
  const raw = ((await page.locator('meta[name="theme-color"]').getAttribute('content')) ?? '').toLowerCase();
  return /^#[0-9a-f]{3}$/.test(raw) ? '#' + [...raw.slice(1)].map((c) => c + c).join('') : raw;
};

/** Ждём конца CSS-переходов цвета (--t-base = 200 мс) и уводим мышь: hover меняет фон кнопок. */
async function settle(page: import('@playwright/test').Page) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
}

for (const theme of ['day', 'night'] as const) {
  test(`тема «${theme === 'day' ? 'День' : 'Ночь'}»: весь текст читаем (контраст WCAG AA)`, async ({ page }, testInfo) => {
    const prefix = testInfo.project.name === 'chromium-mobile' ? 'nav-mobile' : 'nav-desktop';
    await page.goto('/');
    await page.getByTestId('settings-open').click();
    await page.getByTestId(`settings-theme-${theme}`).click();
    await settle(page);

    const problems: string[] = [];
    const audit = async (where: string) => {
      const { issues, checked } = await findLowContrastText(page);
      expect(checked, `${where}: проверка не нашла текста`).toBeGreaterThan(5);
      for (const i of issues) {
        problems.push(`${where}: «${i.text}» ${i.where} ${i.color} на ${i.background} — ${i.ratio} < ${i.required}`);
      }
    };

    await audit('окно настроек');
    await page.getByTestId('settings-close').click();
    for (const tab of TABS) {
      await page.getByTestId(`${prefix}-${tab}`).click();
      await settle(page);
      await audit(tab);
    }

    expect(problems).toEqual([]);
  });
}

test.describe('тема при первом запуске', () => {
  test.describe('светлая система', () => {
    test.use({ colorScheme: 'light' });

    test('открывается тема «День» и светлая строка состояния', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
      expect(await themeColor(page)).toBe('#ffffff');
    });

    test('сохранённый выбор важнее настройки системы', async ({ page }) => {
      await page.goto('/');
      await page.getByTestId('settings-open').click();
      await page.getByTestId('settings-theme-night').click();
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
      expect(await themeColor(page)).toBe('#0b0a1c');
    });
  });

  test('тёмная система — тема «Ночь»', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
    expect(await themeColor(page)).toBe('#0b0a1c');
  });

  test('theme-color меняется вместе с темой', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('settings-open').click();
    await page.getByTestId('settings-theme-day').click();
    await expect.poll(() => themeColor(page)).toBe('#ffffff');
    await page.getByTestId('settings-theme-night').click();
    await expect.poll(() => themeColor(page)).toBe('#0b0a1c');
  });
});

rawTest.describe('тема до загрузки приложения', () => {
  rawTest.use({ colorScheme: 'light' });

  // Без стража консоли: загрузка бандла намеренно обрывается, и браузер пишет об этом.
  rawTest('ставится в index.html, а не ждёт бандл — дневная тема не мигает ночной', async ({ page }) => {
    await page.route(/\/assets\/index-.*\.js$/, (route) => route.abort());
    await page.goto('/');
    await rawExpect(page.locator('html')).toHaveAttribute('data-theme', 'day');
    rawExpect(await themeColor(page)).toBe('#ffffff');
  });
});
