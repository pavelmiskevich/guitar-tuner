import { describe, it, expect } from 'vitest';
import { PitchDetector } from '../src/audio/dsp';
import { calculateCents } from '../src/domain/notes';

/**
 * Генерация синтетического синусоидального буфера заданной частоты
 */
function generateSineBuffer(
  frequency: number,
  sampleRate: number,
  bufferSize: number,
  amplitude = 0.8
): Float32Array {
  const buffer = new Float32Array(bufferSize);
  for (let i = 0; i < bufferSize; i++) {
    buffer[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  }
  return buffer;
}

/**
 * Генерация сигнала с гармониками
 */
function generateHarmonicBuffer(
  f0: number,
  harmonics: number[],
  sampleRate: number,
  bufferSize: number
): Float32Array {
  const buffer = new Float32Array(bufferSize);
  for (let i = 0; i < bufferSize; i++) {
    let sample = 0;
    harmonics.forEach((amp, idx) => {
      const h = idx + 1;
      sample += amp * Math.sin((2 * Math.PI * f0 * h * i) / sampleRate);
    });
    buffer[i] = sample;
  }
  return buffer;
}

describe('PitchDetector (McLeod NSDF Algorithm)', () => {
  const sampleRate = 48000;
  const bufferSize = 4096;
  const detector = new PitchDetector(sampleRate, bufferSize);

  const guitarStandardPitches = [
    { note: 'E2', targetFreq: 82.407 },
    { note: 'A2', targetFreq: 110.000 },
    { note: 'D3', targetFreq: 146.832 },
    { note: 'G3', targetFreq: 195.998 },
    { note: 'B3', targetFreq: 246.942 },
    { note: 'E4', targetFreq: 329.628 },
    { note: 'A4', targetFreq: 440.000 }
  ];

  guitarStandardPitches.forEach(({ note, targetFreq }) => {
    it(`should accurately detect pure sine wave for ${note} (~${targetFreq} Hz) with error < 0.5 cents`, () => {
      const buffer = generateSineBuffer(targetFreq, sampleRate, bufferSize);
      const estimate = detector.detectPitch(buffer);

      expect(estimate.isSilent).toBe(false);
      expect(estimate.clarity).toBeGreaterThan(0.9);

      const centsError = calculateCents(estimate.frequency, targetFreq);
      expect(Math.abs(centsError)).toBeLessThanOrEqual(0.5);
    });
  });

  it('should correctly detect pitch for complex harmonic timbre', () => {
    // 1-я, 2-я, 3-я, 4-я гармоники со спадом амплитуды
    const targetFreq = 110.0; // A2
    const buffer = generateHarmonicBuffer(targetFreq, [0.5, 0.3, 0.2, 0.1], sampleRate, bufferSize);
    const estimate = detector.detectPitch(buffer);

    expect(estimate.isSilent).toBe(false);
    expect(estimate.clarity).toBeGreaterThan(0.85);

    const centsError = calculateCents(estimate.frequency, targetFreq);
    expect(Math.abs(centsError)).toBeLessThan(1.0);
  });

  it('should identify silence for low RMS input', () => {
    const silentBuffer = new Float32Array(bufferSize); // Нулевой буфер
    const estimate = detector.detectPitch(silentBuffer);

    expect(estimate.isSilent).toBe(true);
    expect(estimate.frequency).toBe(0);
    expect(estimate.rms).toBeLessThan(-90);
  });

  // Рабочие буферы переиспользуются между кадрами — проверяем, что от предыдущего
  // вызова не остаётся состояния, влияющего на следующий результат.
  it('should give identical results on repeated calls with the same buffer', () => {
    const reused = new PitchDetector(sampleRate, bufferSize);
    const buffer = generateSineBuffer(146.832, sampleRate, bufferSize);

    const first = reused.detectPitch(buffer);
    const second = reused.detectPitch(buffer);

    expect(second.frequency).toBe(first.frequency);
    expect(second.clarity).toBe(first.clarity);
  });

  it('should not carry state between different signals', () => {
    const reused = new PitchDetector(sampleRate, bufferSize);
    const fresh = new PitchDetector(sampleRate, bufferSize);

    reused.detectPitch(generateSineBuffer(329.628, sampleRate, bufferSize));
    reused.detectPitch(new Float32Array(bufferSize));
    reused.detectPitch(generateHarmonicBuffer(110, [0.5, 0.3, 0.2, 0.1], sampleRate, bufferSize));

    const low = generateSineBuffer(82.407, sampleRate, bufferSize);
    expect(reused.detectPitch(low).frequency).toBeCloseTo(fresh.detectPitch(low).frequency, 6);
  });

  it('should handle a buffer longer than the configured size', () => {
    const small = new PitchDetector(sampleRate, 2048);
    const long = generateSineBuffer(110, sampleRate, 8192);

    const estimate = small.detectPitch(long);

    expect(Math.abs(calculateCents(estimate.frequency, 110))).toBeLessThanOrEqual(0.5);
  });

  it('should tolerate a DC offset in the input', () => {
    const buffer = generateSineBuffer(196.0, sampleRate, bufferSize);
    for (let i = 0; i < buffer.length; i++) buffer[i] += 0.15;

    const estimate = detector.detectPitch(buffer);

    expect(Math.abs(calculateCents(estimate.frequency, 196.0))).toBeLessThanOrEqual(0.5);
  });
});
