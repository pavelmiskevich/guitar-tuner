import { consoleGuardTest as test, expect } from './fixtures/test-base';

test('распознаёт ноту при настоящем захвате микрофона', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('mic-toggle').click();

  await expect(async () => {
    await expect(page.getByTestId('tuner-note')).toHaveText('E');
    await expect(page.getByTestId('tuner-action')).toContainText('В СТРОЕ');
  }).toPass({ timeout: 12_000 });
});
