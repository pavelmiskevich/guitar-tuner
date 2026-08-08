import { expect, test } from './fixtures/test-base';
import { centsOff, noteFrequency } from './fixtures/notes';

async function startMic(page: import('@playwright/test').Page) {
  await page.getByTestId('mic-toggle').click();
  await expect(page.getByTestId('mic-status')).toBeVisible();
}

test.describe('тюнер', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('до включения микрофона просит сыграть струну', async ({ page }) => {
    await expect(page.getByTestId('mic-toggle')).toContainText('Включить микрофон');
    await expect(page.getByTestId('tuner-action')).toContainText('Сыграйте струну');
  });

  test('распознаёт точную ноту и сообщает «В СТРОЕ»', async ({ page }) => {
    await startMic(page);
    await page.evaluate((f) => window.__fakeMic.setFrequency(f), noteFrequency('E2'));

    await expect(async () => {
      await expect(page.getByTestId('tuner-note')).toHaveText('E');
      await expect(page.getByTestId('tuner-action')).toContainText('В СТРОЕ');
      await expect(page.getByTestId('tuner-target')).toContainText('82.4 Гц');

      const measured = await page.getByTestId('tuner-measured').innerText();
      const value = Number(measured.replace(/[^\d.]/g, ''));
      expect(Math.abs(value - 82.41)).toBeLessThanOrEqual(0.3);
    }).toPass({ timeout: 8_000 });

    await expect(page.getByTestId('string-chip-6')).toHaveAttribute('data-state', 'done');
  });

  test('на заниженной струне требует подтянуть', async ({ page }) => {
    await startMic(page);
    await page.evaluate((f) => window.__fakeMic.setFrequency(f), centsOff('E2', -20));

    // Пока анализатор высоты тона «домотает» окно анализа до новой частоты, показания
    // цента колеблются (наблюдалось от -26 до +5, включая кратковременное «ОСЛАБИТЬ»).
    // Оба чтения текста и числовое сравнение должны выполняться за один снимок DOM
    // внутри toPass — иначе toPass может зафиксировать успех на переходном значении,
    // а последующее отдельное чтение подхватит уже другое число и упадёт без вины теста.
    await expect(async () => {
      const action = await page.getByTestId('tuner-action').innerText();
      expect(action).toContain('ПОДТЯНУТЬ');
      expect(action).toContain('¢');

      const cents = Number(/\(([-+]?\d+)¢\)/.exec(action)?.[1]);
      expect(Math.abs(cents + 20)).toBeLessThanOrEqual(1);
    }).toPass({ timeout: 8_000 });
  });

  test('на завышенной струне требует ослабить и даёт совет мастера', async ({ page }) => {
    await startMic(page);
    await page.evaluate((f) => window.__fakeMic.setFrequency(f), centsOff('E2', 20));

    await expect(page.getByTestId('tuner-action')).toContainText('ОСЛАБИТЬ', { timeout: 8_000 });
    // Подсказка показывается при отклонении больше 15 центов.
    await expect(page.getByTestId('master-tip')).toBeVisible();
  });

  test('возвращается в исходное состояние после тишины', async ({ page }) => {
    await startMic(page);
    await page.evaluate((f) => window.__fakeMic.setFrequency(f), noteFrequency('E2'));
    await expect(page.getByTestId('tuner-action')).toContainText('В СТРОЕ', { timeout: 8_000 });

    await page.evaluate(() => window.__fakeMic.silence());
    // Затухание в коде — 1200 мс; берём запас.
    await expect(page.getByTestId('tuner-action')).toContainText('Сыграйте струну', { timeout: 5_000 });
  });

  test('сам определяет струну без ручного выбора', async ({ page }) => {
    await startMic(page);
    await page.evaluate((f) => window.__fakeMic.setFrequency(f), noteFrequency('G3'));

    await expect(page.getByTestId('tuner-note')).toHaveText('G', { timeout: 8_000 });
    await expect(page.getByTestId('tuner-target')).toContainText('196.0 Гц');
  });

  test('удерживает выбранную струну при отклонении в пределах порога', async ({ page }) => {
    await startMic(page);

    // G3 (196.0 Гц) и B3 (246.9 Гц) разделены 400 центами; частота на +220¢ от G3 (≈222.6 Гц)
    // лежит ближе по герцам к B3 (24.4 Гц разницы), чем к G3 (26.6 Гц разницы).
    const freq = centsOff('G3', 220);

    // Без ручного выбора струны автоопределение берёт ближайшую по герцам — B3.
    await page.evaluate((f) => window.__fakeMic.setFrequency(f), freq);
    await expect(page.getByTestId('tuner-note')).toHaveText('B', { timeout: 8_000 });
    await expect(page.getByTestId('tuner-target')).toContainText('246.9 Гц');

    // После ручного выбора G3 то же самое отклонение (220¢) укладывается в порог удержания 250¢,
    // поэтому тюнер остаётся на G3, а не переключается на более близкую по герцам B3.
    await page.getByTestId('string-chip-3').click();
    await page.evaluate((f) => window.__fakeMic.setFrequency(f), freq);
    await expect(page.getByTestId('tuner-note')).toHaveText('G', { timeout: 8_000 });
    await expect(page.getByTestId('tuner-target')).toContainText('196.0 Гц');
  });

  test('в режиме Мастера сам переходит на следующую струну', async ({ page }) => {
    await startMic(page);
    await page.getByTestId('master-mode').check();
    await page.getByTestId('string-chip-6').click();
    await page.evaluate((f) => window.__fakeMic.setFrequency(f), noteFrequency('E2'));

    // Автопереход срабатывает после 1200 мс удержания строя.
    await expect(page.getByTestId('string-chip-5')).toHaveAttribute('data-state', 'active', {
      timeout: 10_000,
    });
  });

  test('учитывает эталон A4 = 432 Гц', async ({ page }) => {
    await page.getByTestId('settings-open').click();
    await page.getByTestId('settings-a4-432').click();
    await page.getByTestId('settings-close').click();

    await startMic(page);
    await page.evaluate((f) => window.__fakeMic.setFrequency(f), noteFrequency('E2', 432));

    await expect(page.getByTestId('tuner-target')).toContainText('80.9 Гц', { timeout: 8_000 });
    await expect(page.getByTestId('tuner-action')).toContainText('В СТРОЕ');
  });

  test('переключение на Drop D меняет шестую струну на D2', async ({ page }) => {
    await page.getByTestId('tuning-select').selectOption('drop-d');
    await expect(page.getByTestId('string-chip-6')).toContainText('D2');

    await startMic(page);
    await page.evaluate((f) => window.__fakeMic.setFrequency(f), noteFrequency('D2'));

    await expect(page.getByTestId('tuner-target')).toContainText('73.4 Гц', { timeout: 8_000 });
  });
});
