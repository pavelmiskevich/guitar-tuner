import { describe, it, expect } from 'vitest';
import { computeSpectrumBars, SPECTRUM_BARS } from '../src/audio/spectrumBars';

const SAMPLE_RATE = 48000;
const BINS = 8192;
const binOf = (hz: number) => Math.round(hz / (SAMPLE_RATE / (BINS * 2)));

/** Спектр AnalyserNode: шумовой пол и узкие пики на заданных частотах. */
function spectrum(peaks: [number, number][], floorDb = -110): Float32Array {
  const buf = new Float32Array(BINS).fill(floorDb);
  for (const [hz, db] of peaks) buf[binOf(hz)] = db;
  return buf;
}

describe('computeSpectrumBars', () => {
  it('тишина — все полосы нулевые', () => {
    const out = new Float32Array(SPECTRUM_BARS);
    computeSpectrumBars(spectrum([]), SAMPLE_RATE, out);
    expect([...out].every(v => v === 0)).toBe(true);
  });

  it('тихий вход нормируется по пику: основной тон E2 — в 5-й полосе (±1: соседние полосы делят граничный бин)', () => {
    const out = new Float32Array(SPECTRUM_BARS);
    computeSpectrumBars(spectrum([[82.41, -60], [164.8, -66], [247.2, -70]]), SAMPLE_RATE, out);
    const levels = [...out];
    expect(Math.abs(levels.indexOf(Math.max(...levels)) - 5)).toBeLessThanOrEqual(1);
    expect(Math.max(...levels)).toBe(100);
    expect(levels.filter(v => v >= 40).length).toBeGreaterThanOrEqual(3);
  });

  it('узкий пик между равными выборками не теряется: полоса берёт максимум', () => {
    const out = new Float32Array(SPECTRUM_BARS);
    computeSpectrumBars(spectrum([[1000, -50]]), SAMPLE_RATE, out);
    expect(Math.max(...out)).toBe(100);
  });

  it('пишет в переданный массив и не выходит за 0..100', () => {
    const out = new Float32Array(SPECTRUM_BARS).fill(-1);
    computeSpectrumBars(spectrum([[82.41, -20], [3000, -95]]), SAMPLE_RATE, out);
    expect([...out].every(v => v >= 0 && v <= 100)).toBe(true);
  });
});
