import { expect, test } from './fixtures/test-base';
import { centsOff } from './fixtures/notes';

test.describe('настройки', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('settings-open').click();
    await expect(page.getByTestId('settings-modal')).toBeVisible();
  });

  test('меняет эталон A4 и показывает его в шапке', async ({ page }) => {
    await page.getByTestId('settings-a4-432').click();
    await page.getByTestId('settings-close').click();
    await expect(page.getByTestId('header-subtitle')).toContainText('A4=432Hz');
  });

  test('немецкая нотация показывает си как H', async ({ page }) => {
    await page.getByTestId('settings-notation-german').check();
    await page.getByTestId('settings-close').click();

    // 2-я струна Standard E — это B3; в немецкой нотации это H.
    await expect(page.getByTestId('string-chip-2')).toContainText('H3');
  });

  test('сольфеджио показывает си как Си', async ({ page }) => {
    await page.getByTestId('settings-notation-solfege').check();
    await page.getByTestId('settings-close').click();
    await expect(page.getByTestId('string-chip-2')).toContainText('Си3');
  });

  test('строгий порог сужает зону «В СТРОЕ»', async ({ page }) => {
    await page.getByTestId('settings-threshold-3').click();
    await page.getByTestId('settings-close').click();

    await page.getByTestId('mic-toggle').click();
    await page.evaluate((f) => window.__fakeMic.setFrequency(f), centsOff('E2', 4));

    // При пороге 3¢ отклонение в 4¢ уже вне строя.
    await expect(page.getByTestId('tuner-action')).toContainText('ОСЛАБИТЬ', { timeout: 8_000 });
  });

  test('переключение темы меняет атрибут на html', async ({ page }) => {
    await page.getByTestId('settings-theme-day').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');

    await page.getByTestId('settings-theme-night').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  });

  test('создаёт пользовательский строй и сохраняет его', async ({ page }) => {
    await page.getByTestId('custom-tuning-create').click();
    await page.getByTestId('custom-tuning-name').fill('Тестовый строй');
    await page.getByTestId('custom-tuning-save').click();

    await expect(page.getByTestId('settings-modal')).toContainText('Тестовый строй');

    const saved = await page.evaluate(() =>
      localStorage.getItem('night_rehearsal_custom_tunings')
    );
    expect(saved).toContain('Тестовый строй');
  });

  // D-1 из отчёта разведки (docs/superpowers/2026-08-07-e2e-exploration-report.md):
  // селектор строя в тюнере строится только из TUNING_PRESETS, а у сохранённых строёв
  // в настройках нет действия «Применить» — повторно выбрать свой строй нельзя.
  // Решение заказчика: в бэклог. Тест описывает желаемое поведение и включится после фикса.
  test.fixme('сохранённый пользовательский строй можно выбрать повторно', async ({ page }) => {
    await page.getByTestId('custom-tuning-create').click();
    await page.getByTestId('custom-tuning-name').fill('Строй для проверки');
    await page.getByTestId('custom-tuning-save').click();
    await page.getByTestId('settings-close').click();

    // Уходим на пресет, затем пытаемся вернуться к своему строю.
    await page.getByTestId('tuning-select').selectOption('drop-d');
    const options = await page.getByTestId('tuning-select').locator('option').allTextContents();
    expect(options).toContain('Строй для проверки');
  });

  test('настройки переживают перезагрузку', async ({ page }) => {
    await page.getByTestId('settings-a4-442').click();
    await page.getByTestId('settings-theme-day').click();
    await page.getByTestId('settings-close').click();

    await page.reload();

    await expect(page.getByTestId('header-subtitle')).toContainText('A4=442Hz');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
  });
});
