import { test as base, expect } from '@playwright/test';
import { installFakeMic } from './fake-mic';

export const STORAGE_KEYS = [
  'gt_tuning',
  'gt_a4',
  'gt_notation',
  'gt_threshold',
  'gt_theme',
  'night_rehearsal_custom_tunings',
  'nr_ear_best_streak',
];

export const test = base.extend({
  page: async ({ page }, runTest) => {
    await page.addInitScript((keys: string[]) => {
      try {
        if (sessionStorage.getItem('__e2e_cleaned') === '1') return;
        keys.forEach((k) => localStorage.removeItem(k));
        sessionStorage.setItem('__e2e_cleaned', '1');
      } catch {
        // приватный режим — игнорируем
      }
    }, STORAGE_KEYS);

    await installFakeMic(page);

    const problems: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') problems.push(`console.error: ${msg.text()}`);
    });
    page.on('pageerror', (err) => {
      problems.push(`pageerror: ${err.message}`);
    });

    await runTest(page);

    expect(problems, `Страница сообщила об ошибках:\n${problems.join('\n')}`).toEqual([]);
  },
});

export { expect };
