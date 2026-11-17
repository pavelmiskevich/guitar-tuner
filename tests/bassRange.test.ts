import { describe, expect, it } from 'vitest';
import { ANALYSIS_LENGTH, PitchDetector, decimate, decimationFactor } from '../src/audio/dsp';
import { calculateCents, midiToFrequency } from '../src/domain/notes';
import { DEFAULT_TUNING, TUNING_PRESETS, pitchSearchRange } from '../src/domain/tunings';

/**
 * Низкие струны баса (#1): B0 = 30,87 Гц не определялась вовсе, E1 = 41,2 Гц
 * пропадала при расстройке вниз больше ~50 центов, а на 96/192 кГц нижняя
 * граница поднималась до 47/94 Гц.
 */

/** Сигнал с шестью гармониками убывающей громкости — грубое подобие струны. */
function stringLike(f0: number, sampleRate: number, length: number): Float32Array {
  const out = new Float32Array(length);
  const amps = [1, 0.7, 0.5, 0.35, 0.25, 0.15];
  for (let i = 0; i < length; i++) {
    let s = 0;
    for (let h = 0; h < amps.length; h++) {
      s += amps[h] * Math.sin((2 * Math.PI * f0 * (h + 1) * i) / sampleRate + h);
    }
    out[i] = 0.2 * s;
  }
  return out;
}

/** Как движок готовит кадр: прореживание до ~44–48 кГц и окно фиксированной длины. */
function detectAt(f0: number, sampleRate: number, range: { minFreq: number; maxFreq: number }) {
  const factor = decimationFactor(sampleRate);
  const raw = stringLike(f0, sampleRate, ANALYSIS_LENGTH * factor);
  const frame = new Float32Array(ANALYSIS_LENGTH);
  decimate(raw, factor, frame);
  const detector = new PitchDetector(sampleRate / factor, ANALYSIS_LENGTH);
  return detector.detectPitch(frame, range.minFreq, range.maxFreq).frequency;
}

const bass4 = TUNING_PRESETS.find(t => t.id === 'bass-4')!;
const bass5 = TUNING_PRESETS.find(t => t.id === 'bass-5')!;
const B0 = midiToFrequency(23, 440);
const E1 = midiToFrequency(28, 440);
const withCents = (f: number, cents: number) => f * Math.pow(2, cents / 1200);

describe('Диапазон поиска по строю', () => {
  it('для баса опускается на три полутона ниже самой низкой струны', () => {
    expect(pitchSearchRange(bass5, 440).minFreq).toBeCloseTo(withCents(B0, -300), 2);
    expect(pitchSearchRange(bass4, 440).minFreq).toBeCloseTo(withCents(E1, -300), 2);
  });

  it('для гитары не поднимается выше прежних 40 Гц: сильно опущенная струна остаётся видна', () => {
    expect(pitchSearchRange(DEFAULT_TUNING, 440).minFreq).toBe(40);
  });

  it('учитывает эталон A4', () => {
    expect(pitchSearchRange(bass5, 432).minFreq).toBeLessThan(pitchSearchRange(bass5, 440).minFreq);
  });
});

describe('Прореживание', () => {
  it('на 44,1 и 48 кГц не нужно, на 96 и 192 кГц сводит частоту к 48 кГц', () => {
    expect(decimationFactor(44100)).toBe(1);
    expect(decimationFactor(48000)).toBe(1);
    expect(decimationFactor(88200)).toBe(2);
    expect(decimationFactor(96000)).toBe(2);
    expect(decimationFactor(192000)).toBe(4);
  });

  it('усредняет блоки отсчётов', () => {
    const out = new Float32Array(2);
    decimate(new Float32Array([1, 3, 5, 7]), 2, out);
    expect(Array.from(out)).toEqual([2, 6]);
  });
});

describe('Низкие струны баса', () => {
  for (const sampleRate of [44100, 48000, 96000, 192000]) {
    describe(`${sampleRate / 1000} кГц`, () => {
      it('определяет B0 пятиструнного баса', () => {
        const f = detectAt(B0, sampleRate, pitchSearchRange(bass5, 440));
        expect(Math.abs(calculateCents(f, B0))).toBeLessThan(1);
      });

      for (const cents of [-100, -60, -30, 30, 100]) {
        it(`определяет E1 с расстройкой ${cents > 0 ? '+' : ''}${cents}¢`, () => {
          const target = withCents(E1, cents);
          const f = detectAt(target, sampleRate, pitchSearchRange(bass4, 440));
          expect(Math.abs(calculateCents(f, target))).toBeLessThan(1);
        });
      }

      it('определяет E2 гитары', () => {
        const E2 = midiToFrequency(40, 440);
        const f = detectAt(E2, sampleRate, pitchSearchRange(DEFAULT_TUNING, 440));
        expect(Math.abs(calculateCents(f, E2))).toBeLessThan(0.5);
      });
    });
  }
});
