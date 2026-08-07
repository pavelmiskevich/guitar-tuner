import { expect, test } from './fixtures/test-base';

test('приложение загружается и показывает экран тюнера', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Ночная репетиция' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Включить микрофон/ })).toBeVisible();
});
