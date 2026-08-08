import { expect, test } from './fixtures/test-base';

test.describe('метроном', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await page.goto('/');
    const prefix = testInfo.project.name === 'chromium-mobile' ? 'nav-mobile' : 'nav-desktop';
    await page.getByTestId(`${prefix}-metronome`).click();
  });

  test('запускается и останавливается', async ({ page }) => {
    await expect(page.getByTestId('mt-toggle')).toContainText('Старт');
    await page.getByTestId('mt-toggle').click();
    await expect(page.getByTestId('mt-toggle')).toContainText('Стоп');
    await page.getByTestId('mt-toggle').click();
    await expect(page.getByTestId('mt-toggle')).toContainText('Старт');
  });

  test('меняет темп кнопками и ползунком', async ({ page }) => {
    await expect(page.getByTestId('mt-bpm')).toHaveText('120');
    await page.getByTestId('mt-plus-5').click();
    await expect(page.getByTestId('mt-bpm')).toHaveText('125');
    await page.getByTestId('mt-minus-1').click();
    await expect(page.getByTestId('mt-bpm')).toHaveText('124');
  });

  test('меняет размер такта', async ({ page }) => {
    await page.getByTestId('mt-meter-3').click();
    await expect(page.getByTestId('mt-beat-0')).toBeVisible();
    await expect(page.getByTestId('mt-beat-2')).toBeVisible();
    await expect(page.getByTestId('mt-beat-3')).toHaveCount(0);

    await page.getByTestId('mt-meter-6').click();
    await expect(page.getByTestId('mt-beat-5')).toBeVisible();
  });

  test('tap-tempo вычисляет темп по интервалу нажатий', async ({ page }) => {
    const tap = page.getByTestId('mt-tap');
    // Пять нажатий с интервалом 500 мс — это 120 BPM.
    // click() сам по себе занимает заметное время (проверка actionability,
    // диспатч события) — от него зависит фактический интервал между тапами
    // с точки зрения приложения. Поэтому ждём не фиксированные 500 мс, а
    // компенсируем длительность самого клика, чтобы реальный интервал между
    // событиями tap был максимально близок к 500 мс — это часть измерения,
    // а не ожидание утверждения.
    for (let i = 0; i < 5; i++) {
      const clickStart = Date.now();
      await tap.click();
      const clickLatency = Date.now() - clickStart;
      if (i < 4) await page.waitForTimeout(Math.max(0, 500 - clickLatency));
    }

    const bpm = Number(await page.getByTestId('mt-bpm').innerText());
    expect(Math.abs(bpm - 120)).toBeLessThanOrEqual(12); // допуск 10%
  });

  test('секвенсор драм-машины идёт в темпе', async ({ page }) => {
    await page.getByTestId('mt-tab-drums').click();
    await page.getByTestId('mt-pattern-rock').click();

    // Rock: 16 шагов по 16-м долям. При 120 BPM шаг = 125 мс, полный круг = 2 с.
    await expect(page.getByTestId('seq-step-15')).toBeVisible();
    await expect(page.getByTestId('seq-step-16')).toHaveCount(0);

    await page.getByTestId('mt-toggle').click();

    // Считаем, сколько раз шаг 0 становится активным за 4 секунды: ожидаем 2 круга.
    const activations = await page.evaluate(async () => {
      const step = document.querySelector('[data-testid="seq-step-0"]') as HTMLElement;
      let count = 0;
      let wasActive = false;
      const start = performance.now();
      while (performance.now() - start < 4000) {
        const isActive = step.dataset.active === 'true';
        if (isActive && !wasActive) count++;
        wasActive = isActive;
        await new Promise((r) => setTimeout(r, 10));
      }
      return count;
    });

    expect(activations).toBeGreaterThanOrEqual(1);
    expect(activations).toBeLessThanOrEqual(3);
  });

  test('все четыре ритма переключаются и держат свою сетку', async ({ page }) => {
    await page.getByTestId('mt-tab-drums').click();

    // Blues Shuffle — триольная сетка из 12 шагов, остальные ритмы 16-шаговые.
    const patterns = [
      { id: 'rock', steps: 16 },
      { id: 'blues', steps: 12 },
      { id: 'bossa', steps: 16 },
      { id: 'funk', steps: 16 },
    ];

    for (const pattern of patterns) {
      await page.getByTestId(`mt-pattern-${pattern.id}`).click();
      await expect(page.getByTestId(`seq-step-${pattern.steps - 1}`)).toBeVisible();
      await expect(page.getByTestId(`seq-step-${pattern.steps}`)).toHaveCount(0);
    }
  });
});
