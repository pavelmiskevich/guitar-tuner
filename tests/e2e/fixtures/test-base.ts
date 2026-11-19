import { test as base, expect } from '@playwright/test';
import type { BrowserContext } from '@playwright/test';
import { installFakeMic } from './fake-mic';

export const STORAGE_KEYS = [
  'gt_tuning',
  'gt_a4',
  'gt_notation',
  'gt_threshold',
  'gt_theme',
  'gt_custom_tunings',
  'gt_ear_best_streak',
  'gt_metronome_bpm',
  'gt_metronome_meter',
  'gt_storage_version',
  // Ключи до версии хранилища 1 — чистим, чтобы миграция не подхватила следы прошлых прогонов.
  'night_rehearsal_custom_tunings',
  'nr_ear_best_streak',
];

/**
 * Базовый слой: очистка localStorage перед тестом и страж консоли, который роняет
 * тест при любом console.error или необработанном исключении страницы.
 * Не устанавливает фейковый микрофон — им пользуются спеки, которым он не нужен
 * или прямо противопоказан (например, smoke-realmic.spec.ts).
 */
export const consoleGuardTest = base.extend({
  page: async ({ page }, runTest) => {
    // Тишина на динамиках. Безголовый Chromium звук никуда не выводит, а
    // Firefox и WebKit играют синтезатор грифа и метроном в настоящие колонки
    // машины, на которой идёт прогон. Выход каждого контекста подменяется
    // усилителем с нулевой громкостью: граф и время контекста живут как
    // обычно, слышно только тишину. Фейковый микрофон пишет в свой
    // MediaStream, а не в destination, — его это не касается.
    await page.addInitScript(() => {
      const proto = (window.BaseAudioContext ?? window.AudioContext)?.prototype;
      const original = proto && Object.getOwnPropertyDescriptor(proto, 'destination');
      if (!proto || !original?.get) return;
      const realDestination = original.get;
      const muted = new WeakMap<BaseAudioContext, GainNode>();
      Object.defineProperty(proto, 'destination', {
        configurable: true,
        get(this: BaseAudioContext) {
          let node = muted.get(this);
          if (!node) {
            node = this.createGain();
            node.gain.value = 0;
            node.connect(realDestination.call(this));
            muted.set(this, node);
          }
          return node;
        },
      });
    });

    await page.addInitScript((keys: string[]) => {
      try {
        if (sessionStorage.getItem('__e2e_cleaned') === '1') return;
        keys.forEach((k) => localStorage.removeItem(k));
        sessionStorage.setItem('__e2e_cleaned', '1');
      } catch {
        // приватный режим — игнорируем
      }
    }, STORAGE_KEYS);

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

export const test = consoleGuardTest.extend({
  page: async ({ page }, runTest) => {
    await installFakeMic(page);
    await runTest(page);
  },
});

export { expect };

/**
 * Доступ к буферу обмена для теста. Разрешения clipboard-read/clipboard-write
 * Playwright умеет выдавать только в Chromium; в Firefox и WebKit тест
 * пропускается, а не падает на grantPermissions.
 */
export async function grantClipboard(context: BrowserContext): Promise<void> {
  const browserName = context.browser()?.browserType().name();
  base.skip(browserName !== 'chromium', 'разрешения на буфер обмена Playwright выдаёт только в Chromium');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
}
