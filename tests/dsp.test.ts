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
});
