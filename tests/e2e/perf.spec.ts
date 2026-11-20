import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from './fixtures/test-base';
import { noteFrequency } from './fixtures/notes';

/**
 * Замер горячего пути (#14): тюнер с включённым микрофоном на процессоре,
 * замедленном вшестеро (как телефон среднего класса). В обычный прогон не
 * входит — `npm run test:e2e:perf`, только Chromium: замедление процессора
 * есть лишь в CDP.
 *
 * Критерий из задачи — нет кадров длиннее 16 мс. Кадр меряется интервалом
 * между вызовами requestAnimationFrame: при 60 Гц это 16,7 мс, а работа,
 * не уложившаяся в кадр, растягивает интервал до 33 мс и дальше.
 */

const CPU_SLOWDOWN = 6;
const MEASURE_MS = 5_000;
/** Интервал больше этого — пропущенный кадр (16,7 мс + запас на дрожание vsync). */
const DROPPED_FRAME_MS = 20;

interface FrameStats {
  frames: number;
  dropped: number;
  p50: number;
  p95: number;
  max: number;
  /** Доля времени, занятого задачами главного потока, по метрикам CDP. */
  busy: number;
}

async function measure(page: Page, testInfo: TestInfo, label: string): Promise<FrameStats> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });
  // Разгон: подписки, первые кадры анализа, JIT.
  await page.waitForTimeout(1_000);

  const metric = async (name: string) => {
    const { metrics } = await cdp.send('Performance.getMetrics');
    return metrics.find(m => m.name === name)?.value ?? 0;
  };
  const taskBefore = await metric('TaskDuration');
  const wallBefore = await metric('Timestamp');

  const intervals = await page.evaluate(
    (ms) =>
      new Promise<number[]>((resolve) => {
        const out: number[] = [];
        let last = 0;
        const start = performance.now();
        const step = (t: number) => {
          if (last) out.push(t - last);
          last = t;
          if (t - start < ms) requestAnimationFrame(step);
          else resolve(out);
        };
        requestAnimationFrame(step);
      }),
    MEASURE_MS
  );

  const busy = (await metric('TaskDuration')) - taskBefore;
  const wall = (await metric('Timestamp')) - wallBefore;
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  const sorted = [...intervals].sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  const stats: FrameStats = {
    frames: intervals.length,
    dropped: intervals.filter(i => i > DROPPED_FRAME_MS).length,
    p50: +pct(0.5).toFixed(1),
    p95: +pct(0.95).toFixed(1),
    max: +sorted[sorted.length - 1].toFixed(1),
    busy: +(busy / wall).toFixed(2)
  };
  console.log(`[perf] ${label}: ${JSON.stringify(stats)}`);
  await testInfo.attach(`perf-${label}`, { body: JSON.stringify(stats, null, 2), contentType: 'application/json' });
  return stats;
}

test.describe('производительность', { tag: '@perf' }, () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'замедление процессора — только в CDP');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('mic-toggle').click();
    await expect(page.getByTestId('mic-status')).toBeVisible();
    await page.evaluate((f) => window.__fakeMic.setFrequency(f), noteFrequency('E2') * 1.005);
    await expect(page.getByTestId('tuner-action')).toContainText(/ОСЛАБИТЬ|В СТРОЕ|ПОДТЯНУТЬ/);
  });

  test('тюнер: гитара', async ({ page }, testInfo) => {
    await measure(page, testInfo, 'tuner-guitar');
  });

  test('тюнер: гитара со спектром', async ({ page }, testInfo) => {
    await page.getByTestId('spectrum-toggle').click();
    await measure(page, testInfo, 'tuner-spectrum');
  });

  test('тюнер: 5-струнный бас', async ({ page }, testInfo) => {
    // У баса нижняя граница поиска ~25 Гц — самое длинное окно NSDF.
    await page.getByTestId('tuning-select').selectOption('bass-5');
    await page.evaluate((f) => window.__fakeMic.setFrequency(f), noteFrequency('B0'));
    await measure(page, testInfo, 'tuner-bass5');
  });
});
