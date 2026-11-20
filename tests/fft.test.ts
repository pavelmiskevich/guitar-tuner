import { describe, it, expect } from 'vitest';
import { HeadCorrelator, nextPowerOfTwo } from '../src/audio/fft';

function directCorrelation(x: Float32Array, window: number, maxLag: number): number[] {
  const out: number[] = [];
  for (let tau = 0; tau <= maxLag; tau++) {
    let s = 0;
    for (let i = 0; i < window; i++) s += x[i] * x[i + tau];
    out.push(s);
  }
  return out;
}

/** Детерминированный шум: тест не должен зависеть от Math.random. */
function noise(len: number, seed: number): Float32Array {
  const x = new Float32Array(len);
  let s = seed;
  for (let i = 0; i < len; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    x[i] = s / 0x7fffffff - 0.5;
  }
  return x;
}

describe('HeadCorrelator', () => {
  it.each([
    // [длина, окно, макс. задержка]: гитара, бас, короткий и неровный кадры
    [4096, 3295, 800],
    [4096, 2175, 1920],
    [1000, 600, 399],
    [4096, 4096, 0]
  ])('совпадает с прямым счётом: len=%i, window=%i, maxLag=%i', (len, window, maxLag) => {
    const x = noise(len, len + window);
    const out = new Float64Array(maxLag + 1);
    new HeadCorrelator().correlate(x, len, window, maxLag, out);
    const expected = directCorrelation(x, window, maxLag);
    const scale = Math.max(...expected.map(Math.abs));
    for (let tau = 0; tau <= maxLag; tau++) {
      expect(Math.abs(out[tau] - expected[tau]) / scale).toBeLessThan(1e-9);
    }
  });

  it('переиспользуется на кадрах разной длины без остатков прошлого кадра', () => {
    const c = new HeadCorrelator();
    const out = new Float64Array(101);
    c.correlate(noise(4096, 1), 4096, 3000, 100, out);
    const x = noise(512, 2);
    c.correlate(x, 512, 400, 100, out);
    const expected = directCorrelation(x, 400, 100);
    for (let tau = 0; tau <= 100; tau++) expect(out[tau]).toBeCloseTo(expected[tau], 9);
  });

  it('отказывает, если окно с задержкой не помещается в кадр', () => {
    expect(() => new HeadCorrelator().correlate(noise(100, 3), 100, 60, 41, new Float64Array(42))).toThrow(RangeError);
  });

  it('nextPowerOfTwo', () => {
    expect(nextPowerOfTwo(1)).toBe(1);
    expect(nextPowerOfTwo(4096)).toBe(4096);
    expect(nextPowerOfTwo(4097)).toBe(8192);
  });
});
