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

  test('быстрый выбор аккорда меняет аппликатуру', async ({ page }) => {
    // По умолчанию выбран аккорд из открытых струн: заглушенных нет.
    await expect(page.getByTestId('cc-status-6')).not.toContainText('Глушится');

    // У Am шестая струна глушится, а третья зажимается на 2-м ладу —
    // проверяем и статус, и подпись лада, чтобы утверждение зависело
    // именно от выбранной аппликатуры.
    await page.getByTestId('cc-voicing-am-open').click();
    await expect(page.getByTestId('cc-status-6')).toContainText('Глушится');
    await expect(page.getByTestId('cc-string-4')).toContainText('лад 2');
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
    await page.getByTestId('cc-mic-toggle').click();
    await page.getByTestId('cc-reset').click();

    await expect(page.getByTestId('cc-status-6')).toContainText('Ожидание');
  });

  test('сброс при включённом микрофоне не мигает статусом обратно', async ({ page }) => {
    // D-4: AnalyserNode отдаёт валидные оценки ещё ~100–250 мс после silence() —
    // окно анализа промывается не мгновенно. Раньше такая «догоняющая» оценка
    // переписывала сброшенный статус, и тест приходилось страховать выключением
    // микрофона. Здесь микрофон остаётся включённым — именно то, что делает
    // пользователь.
    await page.getByTestId('cc-mic-toggle').click();
    await page.evaluate((f) => window.__fakeMic.setFrequency(f), noteFrequency('E2'));
    await expect(page.getByTestId('cc-status-6')).toContainText('В строе', { timeout: 10_000 });

    await page.evaluate(() => window.__fakeMic.silence());
    await page.getByTestId('cc-reset').click();

    // Статус обязан оставаться в «Ожидании» всё время промывки окна анализа,
    // а не вернуться на мгновение в «В строе».
    for (let i = 0; i < 6; i++) {
      await expect(page.getByTestId('cc-status-6')).toContainText('Ожидание');
      await page.waitForTimeout(50);
    }
  });
});

test.describe('проверка аккорда: перебор подряд (#29)', () => {
  const OPEN_STRINGS: [string, number][] = [['E2', 6], ['A2', 5], ['D3', 4], ['G3', 3], ['B3', 2], ['E4', 1]];

  test.beforeEach(async ({ page }, testInfo) => {
    await page.goto('/');
    const prefix = testInfo.project.name === 'chromium-mobile' ? 'nav-mobile' : 'nav-desktop';
    await page.getByTestId(`${prefix}-chord-check`).click();
    await page.getByTestId('cc-mic-toggle').click();
  });

  for (const withPauses of [false, true]) {
    test(`настроенные струны не портятся переходами${withPauses ? ' и затуханием' : ''}`, async ({ page }) => {
      for (const [note, stringNumber] of OPEN_STRINGS) {
        await page.evaluate((f) => window.__fakeMic.setFrequency(f), noteFrequency(note));
        await expect(page.getByTestId(`cc-status-${stringNumber}`)).toContainText('В строе', { timeout: 10_000 });
        if (withPauses) {
          await page.evaluate(() => window.__fakeMic.silence());
          await page.waitForTimeout(400);
        }
      }
      if (!withPauses) {
        await page.evaluate(() => window.__fakeMic.silence());
        await page.waitForTimeout(400);
      }

      // Сигнал был точно в строе — ни одна струна не должна уйти в «Высоко»/«Низко».
      for (const [, stringNumber] of OPEN_STRINGS) {
        await expect(page.getByTestId(`cc-status-${stringNumber}`)).toContainText('В строе');
      }
      await expect(page.getByText('Аккорд звучит безупречно!')).toBeVisible();
    });
  }
});
