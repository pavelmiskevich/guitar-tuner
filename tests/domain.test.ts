import { describe, it, expect } from 'vitest';
import { midiToFrequency, calculateCents, frequencyToMidi, formatNoteName } from '../src/domain/notes';
import { calculateFretPositions, getFretNote } from '../src/domain/fretboard';
import { DEFAULT_TUNING } from '../src/domain/tunings';
import { getScaleNotes } from '../src/domain/scales';
import { detectChordFromFrets } from '../src/domain/chords';

describe('Domain: Notes & Math Formulas', () => {
  it('should compute exact note frequencies: f(m) = A4 * 2^((m-69)/12)', () => {
    expect(midiToFrequency(69, 440)).toBeCloseTo(440.0, 3);
    expect(midiToFrequency(40, 440)).toBeCloseTo(82.407, 3); // E2
    expect(midiToFrequency(45, 440)).toBeCloseTo(110.0, 3);  // A2
    expect(midiToFrequency(50, 440)).toBeCloseTo(146.832, 3);// D3
    expect(midiToFrequency(55, 440)).toBeCloseTo(195.998, 3);// G3
    expect(midiToFrequency(59, 440)).toBeCloseTo(246.942, 3);// B3
    expect(midiToFrequency(64, 440)).toBeCloseTo(329.628, 3);// E4
  });

  it('should support non-standard A4 reference (e.g. 432 Hz)', () => {
    expect(midiToFrequency(69, 432)).toBeCloseTo(432.0, 3);
    expect(midiToFrequency(45, 432)).toBeCloseTo(108.0, 3);
  });

  it('should calculate cents difference accurately', () => {
    const fTarget = 440.0;
    const fUp100Cents = 440.0 * Math.pow(2, 100 / 1200); // 1 semitone up
    expect(calculateCents(fUp100Cents, fTarget)).toBeCloseTo(100.0, 2);

    const fDown50Cents = 440.0 * Math.pow(2, -50 / 1200);
    expect(calculateCents(fDown50Cents, fTarget)).toBeCloseTo(-50.0, 2);
  });

  it('should map note notation correctly (English, German, Solfege)', () => {
    expect(formatNoteName('B', 'english')).toBe('B');
    expect(formatNoteName('B', 'german')).toBe('H');
    expect(formatNoteName('A#', 'german')).toBe('B');
    expect(formatNoteName('C', 'solfege')).toBe('До');
    expect(formatNoteName('F#', 'solfege')).toBe('Фа♯');
  });
});

describe('Domain: Fretboard Geometry: d(n) = L * (1 - 2^(-n/12))', () => {
  it('should calculate precise fret positions', () => {
    const scaleLength = 648; // mm (Fender scale)
    const frets = calculateFretPositions(scaleLength, 12);

    expect(frets[0]).toBe(0);
    // 12th fret should be exactly at half scale length
    expect(frets[12]).toBeCloseTo(scaleLength / 2, 2);
  });

  it('should resolve note on string with capo', () => {
    // 6-я струна (E2), 3-й лад без капо -> G2
    const note1 = getFretNote(0, 3, DEFAULT_TUNING, null);
    expect(note1.name).toBe('G');
    expect(note1.octave).toBe(2);

    // 6-я струна с капо на 2-м ладу + 3-й лад -> A2
    const noteCapo = getFretNote(0, 3, DEFAULT_TUNING, 2);
    expect(noteCapo.name).toBe('A');
    expect(noteCapo.octave).toBe(2);
  });
});

describe('Domain: Scales & Chord Identification', () => {
  it('should return correct notes and degrees for A Minor Pentatonic', () => {
    const scale = getScaleNotes('A', 'pentatonic-minor');
    const noteNames = scale.map(s => s.note);
    expect(noteNames).toEqual(['A', 'C', 'D', 'E', 'G']);
    expect(scale[0].isRoot).toBe(true);
    expect(scale[1].degree).toBe('♭3');
  });

  it('should reverse detect chord from fretboard positions', () => {
    // Am chord: x 0 2 2 1 0
    const detectedAm = detectChordFromFrets(['x', 0, 2, 2, 1, 0], DEFAULT_TUNING);
    expect(detectedAm).toBe('Am');

    // C major chord: x 3 2 0 1 0
    const detectedC = detectChordFromFrets(['x', 3, 2, 0, 1, 0], DEFAULT_TUNING);
    expect(detectedC).toBe('C');

    // G major chord: 3 2 0 0 0 3
    const detectedG = detectChordFromFrets([3, 2, 0, 0, 0, 3], DEFAULT_TUNING);
    expect(detectedG).toBe('G');
  });
});
