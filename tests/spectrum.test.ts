import { describe, it, expect } from 'vitest';
import { computeSpectrum, findPeakNear, fftInPlace } from '../src/audio/spectrum';

const SR = 48000;
const N = 32768;

function tone(parts: { freq: number; amp: number }[], length = N, sampleRate = SR): Float32Array {
  const out = new Float32Array(length);
  for (const { freq, amp } of parts) {
    const w = (2 * Math.PI * freq) / sampleRate;
    for (let i = 0; i < length; i++) out[i] += amp * Math.sin(w * i);
  }
  return out;
}

const cents = (a: number, b: number) => 1200 * Math.log2(a / b);

describe('fftInPlace', () => {
  it('переводит единичный импульс в ровный спектр', () => {
    const re = new Float64Array(8);
    const im = new Float64Array(8);
    re[0] = 1;
    fftInPlace(re, im);
    for (let k = 0; k < 8; k++) {
      expect(re[k]).toBeCloseTo(1, 12);
      expect(im[k]).toBeCloseTo(0, 12);
    }
  });

  it('кладёт косинус в свой бин', () => {
    const n = 64;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.cos((2 * Math.PI * 5 * i) / n);
    fftInPlace(re, im);
    expect(re[5]).toBeCloseTo(n / 2, 9);
    expect(re[n - 5]).toBeCloseTo(n / 2, 9);
    expect(Math.hypot(re[6], im[6])).toBeLessThan(1e-9);
  });
});

describe('computeSpectrum и findPeakNear (#4)', () => {
  it('измеряет частоту чистого тона точнее десятой цента', () => {
    const spectrum = computeSpectrum(tone([{ freq: 110.37, amp: 0.3 }]), SR);
    const peak = findPeakNear(spectrum, 110, 50);
    expect(peak).not.toBeNull();
    expect(Math.abs(cents(peak!.frequency, 110.37))).toBeLessThan(0.1);
  });

  it('разделяет основные тоны E2 и A2, которые сливались в спектре анализатора', () => {
    const e2 = 82.407;
    const a2 = 110;
    const spectrum = computeSpectrum(tone([{ freq: e2, amp: 0.3 }, { freq: a2, amp: 0.3 }]), SR);
    expect(Math.abs(cents(findPeakNear(spectrum, e2, 50)!.frequency, e2))).toBeLessThan(0.3);
    expect(Math.abs(cents(findPeakNear(spectrum, a2, 50)!.frequency, a2))).toBeLessThan(0.3);
  });

  it('не находит пика там, где только шум ниже порога', () => {
    const spectrum = computeSpectrum(tone([{ freq: 440, amp: 0.3 }]), SR);
    expect(findPeakNear(spectrum, 220, 50)).toBeNull();
  });

  it('не принимает край окна поиска за пик', () => {
    // Сильный тон чуть выше окна поиска: его склон внутри окна — не пик.
    const spectrum = computeSpectrum(tone([{ freq: 116, amp: 0.5 }]), SR);
    expect(findPeakNear(spectrum, 110, 50)).toBeNull();
  });

  it('считает с прореживанием на 96 кГц так же точно', () => {
    const spectrum = computeSpectrum(tone([{ freq: 196.5, amp: 0.3 }], N, 96000), 96000);
    expect(Math.abs(cents(findPeakNear(spectrum, 196, 50)!.frequency, 196.5))).toBeLessThan(0.2);
  });
});
