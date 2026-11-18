import type { Page, TestInfo } from '@playwright/test';
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
    await page.getByTestId('mt-minus-5').click();
    await expect(page.getByTestId('mt-bpm')).toHaveText('119');
    await page.getByTestId('mt-plus-1').click();
    await expect(page.getByTestId('mt-bpm')).toHaveText('120');

    await page.getByTestId('mt-bpm-slider').fill('200');
    await expect(page.getByTestId('mt-bpm')).toHaveText('200');
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
    // Метроном стартует со 120 BPM — если тапать в темпе, подразумевающем
    // те же 120, тест не отличит "tap-tempo действительно посчитал BPM" от
    // "обработчик тапа ничего не сделал". Поэтому сначала уводим BPM в
    // сторону кнопками, а затем проверяем, что tap-tempo возвращает его
    // обратно к ~120 по интервалам нажатий.
    for (let i = 0; i < 6; i++) {
      await page.getByTestId('mt-plus-5').click();
    }
    await expect(page.getByTestId('mt-bpm')).toHaveText('150');

    // Пять нажатий с интервалом ровно 500 мс — это 120 BPM. Часы страницы
    // подменены: реальные интервалы между click() под параллельной нагрузкой
    // гуляют от 300 до 1200 мс (замер: на main тест падал так же), и проверка
    // зависела бы от загрузки машины, а не от расчёта темпа.
    // install() лишь подменяет часы, и они продолжают идти в реальном темпе;
    // pauseAt останавливает их, дальше время двигает только runFor.
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 60_000));
    const tap = page.getByTestId('mt-tap');
    for (let i = 0; i < 5; i++) {
      await tap.click();
      if (i < 4) await page.clock.runFor(500);
    }

    await expect(page.getByTestId('mt-bpm')).toHaveText('120');
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

    // Нижняя граница 2, а не 1: при вдвое замедленном секвенсоре (регресс
    // тайминга) за 4 секунды случилась бы ровно одна активация — такой
    // дефект не должен проходить тест.
    expect(activations).toBeGreaterThanOrEqual(2);
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

/** Открывает вкладку «Ритм» с главной: на мобильном и десктопе разная навигация. */
async function openRhythmTab(page: Page, testInfo: TestInfo) {
  await page.getByTestId(`${navPrefix(testInfo)}-metronome`).click();
}

function navPrefix(testInfo: TestInfo) {
  return testInfo.project.name === 'chromium-mobile' ? 'nav-mobile' : 'nav-desktop';
}

/**
 * Учёт щелчков метронома: время запуска каждого генератора по часам AudioContext
 * и запас, с которым он запланирован (насколько `when` впереди текущего времени).
 */
function recordOscillatorStarts() {
  const starts: number[] = [];
  const aheads: number[] = [];
  const w = window as unknown as { __oscStarts: number[]; __oscAheads: number[] };
  w.__oscStarts = starts;
  w.__oscAheads = aheads;
  const original = OscillatorNode.prototype.start;
  OscillatorNode.prototype.start = function (this: OscillatorNode, when?: number) {
    const now = this.context.currentTime;
    starts.push(when ?? now);
    aheads.push((when ?? now) - now);
    return original.call(this, when);
  };
}

/**
 * Учёт контекстов, созданных экраном метронома, и предел их числа, как в Safari:
 * сверх предела конструктор бросает. Контексты других экранов (движок микрофона
 * на тюнере) не считаются — их жизненный цикл здесь не проверяется.
 */
function trackMetronomeAudioContexts(limit: number) {
  const Original = window.AudioContext;
  const stats = { created: 0, live: 0 };
  (window as unknown as { __mtCtx: typeof stats }).__mtCtx = stats;
  class TrackedAudioContext extends Original {
    private tracked = false;
    constructor(options?: AudioContextOptions) {
      const onMetronome = document.querySelector('[data-testid="mt-toggle"]') !== null;
      if (onMetronome && stats.live >= limit) {
        throw new DOMException('Слишком много AudioContext', 'NotSupportedError');
      }
      super(options);
      if (onMetronome) {
        this.tracked = true;
        stats.created++;
        stats.live++;
      }
    }
    close() {
      if (this.tracked) {
        this.tracked = false;
        stats.live--;
      }
      return super.close();
    }
  }
  window.AudioContext = TrackedAudioContext;
}

type ContextStats = { created: number; live: number };
const readContextStats = (page: Page) =>
  page.evaluate(() => ({ ...(window as unknown as { __mtCtx: ContextStats }).__mtCtx }));

test.describe('метроном: тайминг и жизненный цикл звука', () => {
  test('смена темпа во время игры не сбрасывает такт на первую долю', async ({ page }, testInfo) => {
    await page.goto('/');
    await openRhythmTab(page, testInfo);

    // 40 BPM — полторы секунды на долю: между долями хватает времени и на клик,
    // и на наблюдение.
    await page.getByTestId('mt-bpm-slider').fill('40');
    await page.getByTestId('mt-toggle').click();
    await expect(page.getByTestId('mt-beat-1')).toHaveAttribute('data-active', 'true');

    await page.getByTestId('mt-plus-1').click();
    await expect(page.getByTestId('mt-bpm')).toHaveText('41');

    // Раньше любое изменение темпа перезапускало такт: через 50 мс снова
    // загоралась первая доля. Теперь вторая доля горит до прихода третьей.
    const firstBeatLit = await page.evaluate(async () => {
      const first = document.querySelector('[data-testid="mt-beat-0"]') as HTMLElement;
      const start = performance.now();
      while (performance.now() - start < 700) {
        if (first.dataset.active === 'true') return true;
        await new Promise((r) => setTimeout(r, 10));
      }
      return false;
    });
    expect(firstBeatLit).toBe(false);
    await expect(page.getByTestId('mt-beat-2')).toHaveAttribute('data-active', 'true');
  });

  test('частая смена темпа на ходу не даёт сдвоенных щелчков', async ({ page }, testInfo) => {
    await page.addInitScript(recordOscillatorStarts);
    await page.goto('/');
    await openRhythmTab(page, testInfo);

    await page.getByTestId('mt-toggle').click();
    await expect(page.getByTestId('mt-beat-1')).toHaveAttribute('data-active', 'true');
    for (let i = 0; i < 6; i++) {
      await page.getByTestId('mt-plus-5').click();
      await page.waitForTimeout(120);
    }
    await expect(page.getByTestId('mt-bpm')).toHaveText('150');
    await page.waitForTimeout(800);

    const starts = await page.evaluate(() => (window as unknown as { __oscStarts: number[] }).__oscStarts.slice());
    expect(starts.length).toBeGreaterThanOrEqual(3);
    const sorted = [...starts].sort((a, b) => a - b);
    const gaps = sorted.slice(1).map((t, i) => t - sorted[i]);
    // Темп не выше 150 BPM — щелчки не ближе 0,4 с. Перезапуск такта на каждое
    // нажатие ставил новый щелчок через 50 мс поверх уже запланированного.
    expect(Math.min(...gaps)).toBeGreaterThan(0.3);
  });

  test('уход с вкладки и возврат не копит AudioContext и не ломает запуск', async ({ page }, testInfo) => {
    // Предел 2, как у браузеров с жёстким ограничением: без закрытия контекстов
    // третий заход на вкладку уже не смог бы запустить звук.
    await page.addInitScript(trackMetronomeAudioContexts, 2);
    await page.goto('/');
    const prefix = navPrefix(testInfo);

    for (let i = 0; i < 5; i++) {
      await page.getByTestId(`${prefix}-metronome`).click();
      await page.getByTestId('mt-toggle').click();
      await expect(page.getByTestId('mt-toggle')).toContainText('Стоп');
      await expect(page.getByTestId('mt-beat-1')).toHaveAttribute('data-active', 'true');
      await page.getByTestId(`${prefix}-fretboard`).click();
      await expect(page.getByTestId('mt-toggle')).toHaveCount(0);
    }

    expect((await readContextStats(page)).created).toBe(5);
    await expect.poll(async () => (await readContextStats(page)).live).toBe(0);
  });

  test('если звук не запускается, метроном говорит об этом, а не молчит', async ({ page }, testInfo) => {
    // Предел 0 — конструктор AudioContext бросает сразу, как у Safari после лимита.
    await page.addInitScript(trackMetronomeAudioContexts, 0);
    await page.goto('/');
    await openRhythmTab(page, testInfo);

    await page.getByTestId('mt-toggle').click();
    await expect(page.getByTestId('mt-audio-error')).toBeVisible();
    await expect(page.getByTestId('mt-toggle')).toContainText('Старт');
  });
});

/**
 * Подменный Screen Wake Lock: считает запросы и отпускания. Настоящий в
 * безголовом браузере ведёт себя непредсказуемо (может отказать), а проверить
 * нужно именно обвязку: запрос при старте, отпускание при остановке, повторный
 * запрос после возврата на вкладку.
 */
function installFakeWakeLock() {
  const stats = { requests: 0, releases: 0, held: 0 };
  const live = new Set<{ release: () => Promise<void> }>();
  const w = window as unknown as { __wakeLock: typeof stats; __wakeLockReleaseAll: () => Promise<void> };
  w.__wakeLock = stats;
  w.__wakeLockReleaseAll = async () => {
    await Promise.all([...live].map((lock) => lock.release()));
  };
  const wakeLock = {
    request: async () => {
      stats.requests++;
      stats.held++;
      const target = new EventTarget();
      let released = false;
      const lock = Object.assign(target, {
        type: 'screen',
        get released() {
          return released;
        },
        release: async () => {
          if (released) return;
          released = true;
          live.delete(lock);
          stats.releases++;
          stats.held--;
          target.dispatchEvent(new Event('release'));
        },
      });
      live.add(lock);
      return lock;
    },
  };
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, get: () => wakeLock });
}

/** Делает вид, что вкладка ушла в фон или вернулась: настоящую видимость в тесте не переключить. */
async function setPageHidden(page: Page, hidden: boolean) {
  await page.evaluate((isHidden) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (isHidden ? 'hidden' : 'visible') });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => isHidden });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

type WakeLockStats = { requests: number; releases: number; held: number };
const readWakeLockStats = (page: Page) =>
  page.evaluate(() => ({ ...(window as unknown as { __wakeLock: WakeLockStats }).__wakeLock }));

test.describe('метроном: работа в фоне', () => {
  test('планировщик тикает из Web Worker, а не таймером страницы', async ({ page }, testInfo) => {
    await page.goto('/');
    await openRhythmTab(page, testInfo);
    await page.getByTestId('mt-toggle').click();
    await expect(page.getByTestId('mt-beat-1')).toHaveAttribute('data-active', 'true');

    const workerLoaded = await page.evaluate(() =>
      performance.getEntriesByType('resource').some((e) => e.name.includes('schedulerTicker.worker'))
    );
    expect(workerLoaded).toBe(true);
  });

  test('в скрытой вкладке доли планируются с запасом больше секунды', async ({ page }, testInfo) => {
    await page.addInitScript(recordOscillatorStarts);
    await page.goto('/');
    await openRhythmTab(page, testInfo);
    // 240 BPM — четыре щелчка в секунду, запас наперёд хорошо виден.
    await page.getByTestId('mt-bpm-slider').fill('240');
    await page.getByTestId('mt-toggle').click();
    await expect(page.getByTestId('mt-beat-1')).toHaveAttribute('data-active', 'true');

    const maxAhead = () =>
      page.evaluate(() => Math.max(...(window as unknown as { __oscAheads: number[] }).__oscAheads));

    // На виду окно упреждения 100 мс: щелчок не планируется дальше, чем на 0,1 с вперёд.
    expect(await maxAhead()).toBeLessThanOrEqual(0.15);

    // В фоне окно 1,5 с: тики там могут приходить раз в секунду, и доли не должны кончаться.
    await setPageHidden(page, true);
    await expect.poll(maxAhead).toBeGreaterThan(1);
  });

  test('экран не гаснет, пока играет метроном, и блокировка снимается при остановке', async ({ page }, testInfo) => {
    await page.addInitScript(installFakeWakeLock);
    await page.goto('/');
    await openRhythmTab(page, testInfo);

    await page.getByTestId('mt-toggle').click();
    await expect.poll(async () => (await readWakeLockStats(page)).held).toBe(1);

    // Браузер сам снимает блокировку, когда вкладка уходит в фон; при возврате
    // метроном должен запросить её снова.
    await setPageHidden(page, true);
    await page.evaluate(() => (window as unknown as { __wakeLockReleaseAll: () => Promise<void> }).__wakeLockReleaseAll());
    await expect.poll(async () => (await readWakeLockStats(page)).held).toBe(0);
    await setPageHidden(page, false);
    await expect.poll(async () => (await readWakeLockStats(page)).held).toBe(1);
    expect((await readWakeLockStats(page)).requests).toBe(2);

    await page.getByTestId('mt-toggle').click();
    await expect.poll(async () => (await readWakeLockStats(page)).held).toBe(0);
  });
});

test.describe('метроном: размер 6/8 и сохранение настроек', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await page.goto('/');
    await openRhythmTab(page, testInfo);
  });

  test('6/8 доступен: шесть долей, сильная первая и акцент на четвёртой', async ({ page }) => {
    await expect(page.getByTestId('mt-meter-6-8')).toHaveText('6/8');
    await page.getByTestId('mt-meter-6-8').click();
    await expect(page.getByTestId('mt-meter-6-8')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('mt-beat-5')).toBeVisible();
    await expect(page.getByTestId('mt-beat-6')).toHaveCount(0);
    await expect(page.getByTestId('mt-beat-0')).toHaveAttribute('data-accent', 'strong');
    await expect(page.getByTestId('mt-beat-3')).toHaveAttribute('data-accent', 'medium');
    await expect(page.getByTestId('mt-beat-4')).toHaveAttribute('data-accent', 'weak');
  });

  test('темп и размер переживают перезагрузку', async ({ page }, testInfo) => {
    await page.getByTestId('mt-bpm-slider').fill('87');
    await page.getByTestId('mt-meter-6-8').click();
    await expect(page.getByTestId('mt-bpm')).toHaveText('87');

    await page.reload();
    await openRhythmTab(page, testInfo);
    await expect(page.getByTestId('mt-bpm')).toHaveText('87');
    await expect(page.getByTestId('mt-meter-6-8')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('mt-beat-5')).toBeVisible();
  });
});
