import { expect, test } from './fixtures/test-base';

/**
 * Аккорды для строёв, отличных от шестиструнного стандартного (#5).
 * Строй задаётся ссылкой: так тест не зависит от вёрстки селектора тюнера.
 */
test.describe('аккорды для разных инструментов', () => {
  async function openChordCheck(page: import('@playwright/test').Page, tuningId: string) {
    await page.goto(`/#tab=chord-check&tuning=${tuningId}`);
    await page.reload();
    await expect(page.getByTestId('chord-diagram')).toBeVisible();
  }

  test('у баса — только открытые струны и пояснение', async ({ page }) => {
    await openChordCheck(page, 'bass-4');

    await expect(page.getByTestId('cc-no-chords')).toBeVisible();
    await expect(page.locator('[data-testid^="cc-voicing-"]')).toHaveCount(1);
    await expect(page.getByTestId('cc-voicing-open-strings')).toBeVisible();
    for (const n of [1, 2, 3, 4]) {
      await expect(page.getByTestId(`cc-status-${n}`)).toContainText('Ожидание');
    }
    await expect(page.getByTestId('cc-string-5')).toHaveCount(0);
  });

  test('у укулеле — свои аккорды', async ({ page }) => {
    await openChordCheck(page, 'ukulele-gcea');

    await expect(page.getByTestId('cc-no-chords')).toHaveCount(0);
    await page.getByTestId('cc-voicing-uke-c').click();
    // C на укулеле — 0-0-0-3: зажата только первая струна.
    await expect(page.getByTestId('cc-string-1')).toContainText('лад 3');
    await expect(page.getByTestId('cc-string-4')).toContainText('открытая');
    // Шестиструнной библиотеки здесь нет.
    await expect(page.getByTestId('cc-voicing-am-open')).toHaveCount(0);
  });

  test('на 7-струнной седьмая струна в аккорде глушится', async ({ page }) => {
    await openChordCheck(page, '7-string-b');

    await page.getByTestId('cc-voicing-am-open').click();
    await expect(page.getByTestId('cc-status-7')).toContainText('Глушится');
    await expect(page.getByTestId('cc-status-6')).toContainText('Глушится');
    await expect(page.getByTestId('cc-string-4')).toContainText('лад 2');
  });

  test('в D Standard форма Am подписана тем, что звучит, — Gm', async ({ page }) => {
    await openChordCheck(page, 'd-standard');

    await expect(page.getByTestId('cc-voicing-am-open')).toHaveText('Gm');
    await expect(page.getByTestId('cc-transposed-hint')).toBeVisible();
    await page.getByTestId('cc-voicing-am-open').click();
    await expect(page.getByTestId('chord-shape')).toContainText('Am');
  });

  test('на 12-струнной схема рисует шесть хоров', async ({ page }) => {
    await openChordCheck(page, '12-string-std');

    await page.getByTestId('cc-voicing-am-open').click();
    // Подписи номеров снизу схемы: 6…1, а не 12…1.
    const diagram = page.getByTestId('chord-diagram');
    await expect(diagram.getByText('12', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('cc-string-12')).toContainText('Глушится');
  });

  test('на грифе в режиме аккордов у баса — пояснение вместо чужих аппликатур', async ({ page }) => {
    await page.goto('/#tab=fretboard&mode=chords&root=A&tuning=bass-4');
    await page.reload();

    await expect(page.getByTestId('fb-no-chords')).toBeVisible();
    await expect(page.getByTestId('fb-voicing').locator('option')).toHaveCount(1);
  });
});
