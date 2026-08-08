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

    // Даём графу прогнаться: без этого буфер анализатора пуст.
    await new Promise((resolve) => setTimeout(resolve, 600));

    const data = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(data);

    let maxIdx = 0;
    for (let i = 1; i < data.length; i++) {
      if (data[i] > data[maxIdx]) maxIdx = i;
    }
    return (maxIdx * ctx.sampleRate) / analyser.fftSize;
  });

  expect(peakBin).toBeGreaterThan(430);
  expect(peakBin).toBeLessThan(450);
});
