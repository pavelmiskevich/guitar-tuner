import type { Page } from '@playwright/test';

/**
 * Ждёт, пока доля метронома загорится.
 *
 * Не через expect(...).toHaveAttribute: после первых попыток он проверяет раз в
 * секунду, а такт 4/4 на 240 BPM тоже длится ровно секунду — если первая
 * проверка промахнулась мимо доли, все следующие попадают в ту же фазу такта и
 * промахиваются тоже. Опрос на каждом кадре (raf) долю длиной от 250 мс не пропустит.
 */
export async function waitForBeatActive(page: Page, index: number, timeout = 7_000): Promise<void> {
  await page.waitForFunction(
    (i) => document.querySelector(`[data-testid="mt-beat-${i}"]`)?.getAttribute('data-active') === 'true',
    index,
    { polling: 'raf', timeout }
  );
}
