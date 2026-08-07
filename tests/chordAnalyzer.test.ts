import { describe, it, expect } from 'vitest';
import { calculatePartials, extractSpectralPeaks } from '../src/audio/chordAnalyzer';

describe('Polyphonic Chord Analyzer: Inharmonicity & Spectrum', () => {
  it('should calculate inharmonic partials: f_h = h * F0 * sqrt(1 + B * h^2)', () => {
    const f0 = 100.0;
    const b = 0.0001;
    const partials = calculatePartials(f0, b, 4);

    expect(partials).toHaveLength(4);
    // h=1: 1 * 100 * sqrt(1 + 0.0001 * 1) = 100.005
    expect(partials[0]).toBeCloseTo(100.005, 2);
    // h=2: 2 * 100 * sqrt(1 + 0.0001 * 4) = 200.04
    expect(partials[1]).toBeCloseTo(200.04, 2);
    // h=4: 4 * 100 * sqrt(1 + 0.0001 * 16) = 400.32
    expect(partials[3]).toBeCloseTo(400.32, 2);
  });

  it('should extract spectral peaks with parabolic interpolation', () => {
    const sampleRate = 48000;
    const fftSize = 4096;
    const fftData = new Float32Array(fftSize / 2).fill(-90);

    // Вставляем выраженный пик на бине 50 (соответствует частоте 50 * (48000/2) / 2048 = 585.9375 Гц)
    const peakBin = 50;
    fftData[peakBin - 1] = -40;
    fftData[peakBin] = -20;
    fftData[peakBin + 1] = -38;

    const peaks = extractSpectralPeaks(fftData, sampleRate, 60, 2000, -70);
    expect(peaks.length).toBeGreaterThan(0);
    expect(peaks[0].frequency).toBeGreaterThan(500);
    expect(peaks[0].frequency).toBeLessThan(700);
  });
});
