import { consoleGuardTest as test, expect } from './test-base';
import { installFakeMic } from './fake-mic';

test('фейковый микрофон отдаёт поток с заданной частотой', async ({ page }) => {
  await installFakeMic(page);
  await page.goto('/');

  const peakBin = await page.evaluate(async () => {
    window.__fakeMic.setFrequency(440);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const ctx = new AudioContext();
    await ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 8192;
    source.connect(analyser);

    const data = new Float32Array(analyser.frequencyBinCount);

    function readPeak(): { idx: number; db: number } {
      analyser.getFloatFrequencyData(data);
      let idx = 0;
      for (let i = 1; i < data.length; i++) {
        if (data[i] > data[idx]) idx = i;
      }
      return { idx, db: data[idx] };
    }

    // Анализатор сглаживает спектр по кадрам (smoothingTimeConstant по
    // умолчанию 0.8) и первые кадры после подключения источника попросту
    // пусты. Фиксированная пауза перед единственным чтением иногда попадает
    // в это ещё не устоявшееся состояние (под нагрузкой это особенно
    // заметно на chromium-mobile) — тогда argmax временно съезжает на
    // соседний с гармоникой бин или буфер всё ещё молчит. Поэтому вместо
    // фиксированной задержки опрашиваем спектр, пока индекс максимума не
    // перестанет меняться несколько чтений подряд при реальном уровне
    // сигнала — это и есть устоявшийся спектр.
    const POLL_INTERVAL_MS = 40;
    const STABLE_READS_REQUIRED = 5;
    const NOISE_FLOOR_DB = -100;
    const MAX_WAIT_MS = 5000;

    let stableCount = 0;
    let lastIdx = -1;
    let peak = readPeak();
    const deadline = performance.now() + MAX_WAIT_MS;

    while (performance.now() < deadline && stableCount < STABLE_READS_REQUIRED) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      peak = readPeak();
      if (peak.db > NOISE_FLOOR_DB && peak.idx === lastIdx) {
        stableCount += 1;
      } else {
        stableCount = 0;
      }
      lastIdx = peak.idx;
    }

    return (peak.idx * ctx.sampleRate) / analyser.fftSize;
  });

  expect(peakBin).toBeGreaterThan(430);
  expect(peakBin).toBeLessThan(450);
});
