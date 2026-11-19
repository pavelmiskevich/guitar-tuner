import { describe, it, expect } from 'vitest';
import { calculatePartials } from '../src/audio/chordAnalyzer';

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

});
