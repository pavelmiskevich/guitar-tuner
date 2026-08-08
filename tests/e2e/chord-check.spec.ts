import { expect, test } from './fixtures/test-base';
import { noteFrequency } from './fixtures/notes';

test.describe('проверка аккорда', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await page.goto('/');
    const prefix = testInfo.project.name === 'chromium-mobile' ? 'nav-mobile' : 'nav-desktop';
    await page.getByTestId(`${prefix}-chord-check`).click();
  });

  test('показывает схему аккорда и список струн', async ({ page }) => {
    await expect(page.getByTestId('chord-diagram')).toBeVisible();
    for (const n of [1, 2, 3, 4, 5, 6]) {
      await expect(page.getByTestId(`cc-string-${n}`)).toBeVisible();
    }
  });

  test('переключает режимы анализа', async ({ page }) => {
    await expect(page.getByTestId('cc-mic-toggle')).toBeVisible();

    await page.getByTestId('cc-mode-strum').click();
    await expect(page.getByTestId('cc-strum-start')).toContainText('Ударьте по всем струнам');

    await page.getByTestId('cc-mode-arpeggio').click();
    await expect(page.getByTestId('cc-mic-toggle')).toBeVisible();
  });

  test('в режиме перебора отмечает прозвучавшую струну как настроенную', async ({ page }) => {
    await page.getByTestId('cc-mic-toggle').click();
    await page.evaluate((f) => window.__fakeMic.setFrequency(f), noteFrequency('E2'));

    await expect(page.getByTestId('cc-status-6')).toContainText('В строе', { timeout: 10_000 });
  });

  test('режим удара анализирует спектр за 1.2 секунды', async ({ page }) => {
    await page.getByTestId('cc-mode-strum').click();

    // Захват сам поднимает микрофон, если он выключен.
    await page.getByTestId('cc-strum-start').click();
    await page.evaluate((f) => window.__fakeMic.setFrequency(f), noteFrequency('E2'));

    // Полоса прогресса заполняется 1200 мс, затем считается спектр.
    await expect(page.getByTestId('cc-strum-start')).toContainText('Ударьте по всем струнам', {
      timeout: 8_000,
    });

    // Шестая струна прозвучала — её статус обязан уйти из «Ожидание».
    await expect(page.getByTestId('cc-status-6')).not.toContainText('Ожидание');
  });

  test('кнопка «Настроить» уводит в тюнер на нужную струну', async ({ page }) => {
    await page.getByTestId('cc-tune-6').click();

    await expect(page.getByTestId('header-subtitle')).toContainText('Тюнер');
    // Струна зафиксирована: подпись режима автоопределения меняется на приоритет.
    await expect(page.getByTestId('string-chip-6')).toHaveAttribute('data-state', 'active');
  });

  test('сброс возвращает статусы в ожидание', async ({ page }) => {
    await page.getByTestId('cc-mic-toggle').click();
    await page.evaluate((f) => window.__fakeMic.setFrequency(f), noteFrequency('E2'));
    await expect(page.getByTestId('cc-status-6')).toContainText('В строе', { timeout: 10_000 });

    await page.evaluate(() => window.__fakeMic.silence());
    // Останавливаем микрофон перед сбросом: AnalyserNode отдаёт ещё несколько валидных
    // оценок высоты тона в течение ~100–250 мс после silence() (буфер анализа ещё не
    // "вымылся" новыми нулевыми сэмплами), и живая подписка арпеджио успевает переписать
    // статус поверх сброса. Остановка микрофона снимает эту гонку детерминированно.
    await page.getByTestId('cc-mic-toggle').click();
    await page.getByTestId('cc-reset').click();

    await expect(page.getByTestId('cc-status-6')).not.toContainText('В строе');
  });
});
