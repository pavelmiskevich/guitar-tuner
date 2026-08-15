import { expect, test } from './fixtures/test-base';

const TABS = [
  { id: 'tuner', subtitle: 'Тюнер' },
  { id: 'fretboard', subtitle: 'Гриф' },
  { id: 'chord-check', subtitle: 'Аккорды' },
  { id: 'metronome', subtitle: 'Ритм' },
  { id: 'ear-training', subtitle: 'Тренажер' },
] as const;

test.describe('навигация', () => {
  test('переключает все пять экранов', async ({ page }, testInfo) => {
    await page.goto('/');
    const isMobile = testInfo.project.name === 'chromium-mobile';
    const prefix = isMobile ? 'nav-mobile' : 'nav-desktop';

    for (const tab of TABS) {
      await page.getByTestId(`${prefix}-${tab.id}`).click();
      await expect(page.getByTestId('header-subtitle')).toContainText(tab.subtitle);
    }
  });

  test('показывает нужную панель навигации для вьюпорта', async ({ page }, testInfo) => {
    await page.goto('/');
    const isMobile = testInfo.project.name === 'chromium-mobile';

    await expect(page.getByTestId('nav-desktop-tuner')).toBeVisible({ visible: !isMobile });
    await expect(page.getByTestId('nav-mobile-tuner')).toBeVisible({ visible: isMobile });
  });

  test('не создаёт горизонтальный скролл ни на одном экране', async ({ page }, testInfo) => {
    await page.goto('/');
    const prefix = testInfo.project.name === 'chromium-mobile' ? 'nav-mobile' : 'nav-desktop';

    for (const tab of TABS) {
      await page.getByTestId(`${prefix}-${tab.id}`).click();
      await expect(async () => {
        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(scrollWidth, `горизонтальный скролл на экране ${tab.id}`)
          .toBeLessThanOrEqual(clientWidth + 1);
      }).toPass();
    }
  });

  test('в шапке есть ссылка на исходный код', async ({ page }) => {
    await page.goto('/');

    const link = page.getByTestId('github-link');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', 'https://github.com/pavelmiskevich/guitar-tuner');
    // Внешняя ссылка открывается отдельной вкладкой и не даёт доступа к window.opener.
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    await expect(link).toHaveAttribute('aria-label', /GitHub/);
  });

  test('микрофон переживает переключение экранов', async ({ page }, testInfo) => {
    await page.goto('/');
    const prefix = testInfo.project.name === 'chromium-mobile' ? 'nav-mobile' : 'nav-desktop';

    await page.getByTestId('mic-toggle').click();
    await expect(page.getByTestId('mic-status')).toBeVisible();

    await page.getByTestId(`${prefix}-fretboard`).click();
    await page.getByTestId(`${prefix}-tuner`).click();

    // sharedAudioEngine — синглтон вне React: микрофон обязан остаться включённым.
    await expect(page.getByTestId('mic-status')).toBeVisible();
  });
});
