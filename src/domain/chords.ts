import type { NoteName, Pitch } from './notes';
import { NOTE_NAMES } from './notes';
import type { Tuning } from './tunings';

export interface Voicing {
  id: string;
  name: string;            // 'Am', 'C', 'G', 'F', 'Open Strings'
  root: NoteName;
  type: string;            // 'maj', 'min', '7', 'maj7', 'm7', 'sus4', 'dim', etc.
  frets: (number | 'x')[]; // по струнам от 6-й к 1-й (0 = открытая, 'x' = глушить)
  fingers?: (number | null)[];
  barre?: { fret: number; fromString: number; toString: number };
  baseFret?: number;
}

export const COMMON_VOICINGS: Voicing[] = [
  {
    id: 'open-strings',
    name: 'Открытые струны',
    root: 'E',
    type: 'open',
    frets: [0, 0, 0, 0, 0, 0]
  },
  // A chords
  {
    id: 'a-open',
    name: 'A (Мажор)',
    root: 'A',
    type: 'maj',
    frets: ['x', 0, 2, 2, 2, 0],
    fingers: [null, null, 1, 2, 3, null]
  },
  {
    id: 'am-open',
    name: 'Am (Минор)',
    root: 'A',
    type: 'min',
    frets: ['x', 0, 2, 2, 1, 0],
    fingers: [null, null, 2, 3, 1, null]
  },
  {
    id: 'a7-open',
    name: 'A7',
    root: 'A',
    type: '7',
    frets: ['x', 0, 2, 0, 2, 0],
    fingers: [null, null, 2, null, 3, null]
  },
  {
    id: 'am7-open',
    name: 'Am7',
    root: 'A',
    type: 'm7',
    frets: ['x', 0, 2, 0, 1, 0],
    fingers: [null, null, 2, null, 1, null]
  },
  {
    id: 'amaj7-open',
    name: 'Amaj7',
    root: 'A',
    type: 'maj7',
    frets: ['x', 0, 2, 1, 2, 0],
    fingers: [null, null, 2, 1, 3, null]
  },
  {
    id: 'asus4-open',
    name: 'Asus4',
    root: 'A',
    type: 'sus4',
    frets: ['x', 0, 2, 2, 3, 0],
    fingers: [null, null, 1, 2, 4, null]
  },
  // B chords
  {
    id: 'b-barre',
    name: 'B (H)',
    root: 'B',
    type: 'maj',
    frets: ['x', 2, 4, 4, 4, 2],
    fingers: [null, 1, 2, 3, 4, 1],
    barre: { fret: 2, fromString: 5, toString: 1 }
  },
  {
    id: 'bm-barre',
    name: 'Bm (Hm)',
    root: 'B',
    type: 'min',
    frets: ['x', 2, 4, 4, 3, 2],
    fingers: [null, 1, 3, 4, 2, 1],
    barre: { fret: 2, fromString: 5, toString: 1 }
  },
  {
    id: 'b7-open',
    name: 'B7 (H7)',
    root: 'B',
    type: '7',
    frets: ['x', 2, 1, 2, 0, 2],
    fingers: [null, 2, 1, 3, null, 4]
  },
  // C chords
  {
    id: 'c-open',
    name: 'C',
    root: 'C',
    type: 'maj',
    frets: ['x', 3, 2, 0, 1, 0],
    fingers: [null, 3, 2, null, 1, null]
  },
  {
    id: 'cmaj7-open',
    name: 'Cmaj7',
    root: 'C',
    type: 'maj7',
    frets: ['x', 3, 2, 0, 0, 0],
    fingers: [null, 3, 2, null, null, null]
  },
  {
    id: 'c7-open',
    name: 'C7',
    root: 'C',
    type: '7',
    frets: ['x', 3, 2, 3, 1, 0],
    fingers: [null, 3, 2, 4, 1, null]
  },
  {
    id: 'cadd9-open',
    name: 'Cadd9',
    root: 'C',
    type: 'add9',
    frets: ['x', 3, 2, 0, 3, 0],
    fingers: [null, 2, 1, null, 3, null]
  },
  // D chords
  {
    id: 'd-open',
    name: 'D',
    root: 'D',
    type: 'maj',
    frets: ['x', 'x', 0, 2, 3, 2],
    fingers: [null, null, null, 1, 3, 2]
  },
  {
    id: 'dm-open',
    name: 'Dm',
    root: 'D',
    type: 'min',
    frets: ['x', 'x', 0, 2, 3, 1],
    fingers: [null, null, null, 2, 3, 1]
  },
  {
    id: 'd7-open',
    name: 'D7',
    root: 'D',
    type: '7',
    frets: ['x', 'x', 0, 2, 1, 2],
    fingers: [null, null, null, 2, 1, 3]
  },
  {
    id: 'dmaj7-open',
    name: 'Dmaj7',
    root: 'D',
    type: 'maj7',
    frets: ['x', 'x', 0, 2, 2, 2],
    fingers: [null, null, null, 1, 2, 3]
  },
  {
    id: 'dsus4-open',
    name: 'Dsus4',
    root: 'D',
    type: 'sus4',
    frets: ['x', 'x', 0, 2, 3, 3],
    fingers: [null, null, null, 1, 2, 4]
  },
  // E chords
  {
    id: 'e-open',
    name: 'E',
    root: 'E',
    type: 'maj',
    frets: [0, 2, 2, 1, 0, 0],
    fingers: [null, 2, 3, 1, null, null]
  },
  {
    id: 'em-open',
    name: 'Em',
    root: 'E',
    type: 'min',
    frets: [0, 2, 2, 0, 0, 0],
    fingers: [null, 2, 3, null, null, null]
  },
  {
    id: 'e7-open',
    name: 'E7',
    root: 'E',
    type: '7',
    frets: [0, 2, 0, 1, 0, 0],
    fingers: [null, 2, null, 1, null, null]
  },
  {
    id: 'em7-open',
    name: 'Em7',
    root: 'E',
    type: 'm7',
    frets: [0, 2, 0, 0, 0, 0],
    fingers: [null, 2, null, null, null, null]
  },
  // F chords
  {
    id: 'f-barre',
    name: 'F',
    root: 'F',
    type: 'maj',
    frets: [1, 3, 3, 2, 1, 1],
    fingers: [1, 3, 4, 2, 1, 1],
    barre: { fret: 1, fromString: 6, toString: 1 }
  },
  {
    id: 'fm-barre',
    name: 'Fm',
    root: 'F',
    type: 'min',
    frets: [1, 3, 3, 1, 1, 1],
    fingers: [1, 3, 4, 1, 1, 1],
    barre: { fret: 1, fromString: 6, toString: 1 }
  },
  {
    id: 'fmaj7-open',
    name: 'Fmaj7',
    root: 'F',
    type: 'maj7',
    frets: ['x', 'x', 3, 2, 1, 0],
    fingers: [null, null, 3, 2, 1, null]
  },
  // G chords
  {
    id: 'g-open',
    name: 'G',
    root: 'G',
    type: 'maj',
    frets: [3, 2, 0, 0, 0, 3],
    fingers: [2, 1, null, null, null, 3]
  },
  {
    id: 'gm-barre',
    name: 'Gm',
    root: 'G',
    type: 'min',
    frets: [3, 5, 5, 3, 3, 3],
    fingers: [1, 3, 4, 1, 1, 1],
    barre: { fret: 3, fromString: 6, toString: 1 }
  },
  {
    id: 'g7-open',
    name: 'G7',
    root: 'G',
    type: '7',
    frets: [3, 2, 0, 0, 0, 1],
    fingers: [3, 2, null, null, null, 1]
  }
];

export interface ChordFormula {
  type: string;
  name: string;
  intervals: number[]; // полутоны
}

export const CHORD_FORMULAS: ChordFormula[] = [
  { type: 'maj', name: '', intervals: [0, 4, 7] },
  { type: 'min', name: 'm', intervals: [0, 3, 7] },
  { type: '7', name: '7', intervals: [0, 4, 7, 10] },
  { type: 'maj7', name: 'maj7', intervals: [0, 4, 7, 11] },
  { type: 'm7', name: 'm7', intervals: [0, 3, 7, 10] },
  { type: 'dim', name: 'dim', intervals: [0, 3, 6] },
  { type: 'dim7', name: 'dim7', intervals: [0, 3, 6, 9] },
  { type: 'aug', name: 'aug', intervals: [0, 4, 8] },
  { type: 'sus2', name: 'sus2', intervals: [0, 2, 7] },
  { type: 'sus4', name: 'sus4', intervals: [0, 5, 7] },
  { type: '6', name: '6', intervals: [0, 4, 7, 9] },
  { type: 'm6', name: 'm6', intervals: [0, 3, 7, 9] },
  { type: '9', name: '9', intervals: [0, 4, 7, 10, 14] },
  { type: 'add9', name: 'add9', intervals: [0, 4, 7, 14] },
  { type: '5', name: '5 (power)', intervals: [0, 7] }
];

/**
 * Получить ожидаемые ноты (Pitch) для каждой струны в аппликатуре
 */
export function getVoicingExpectedPitches(voicing: Voicing, tuning: Tuning): (Pitch | null)[] {
  return tuning.strings.map((str, idx) => {
    const fret = voicing.frets[idx];
    if (fret === 'x' || fret === undefined) return null;
    const midi = str.open.midi + fret;
    const noteIndex = ((midi % 12) + 12) % 12;
    return {
      midi,
      name: NOTE_NAMES[noteIndex],
      octave: Math.floor(midi / 12) - 1
    };
  });
}

/**
 * Определение аккорда по набору нажатых ладов (обратный поиск)
 */
export function detectChordFromFrets(frets: (number | 'x')[], tuning: Tuning): string {
  const soundingMidis: number[] = [];
  frets.forEach((fret, i) => {
    if (fret !== 'x' && tuning.strings[i]) {
      soundingMidis.push(tuning.strings[i].open.midi + fret);
    }
  });

  if (soundingMidis.length < 2) return '';

  const uniquePitchClasses = Array.from(new Set(soundingMidis.map(m => ((m % 12) + 12) % 12)));
  const lowestMidi = Math.min(...soundingMidis);
  const bassPitchClass = ((lowestMidi % 12) + 12) % 12;
  const bassNoteName = NOTE_NAMES[bassPitchClass];

  let bestMatch: { root: NoteName; formula: ChordFormula; isBassRoot: boolean } | null = null;
  let bestScore = -1;

  for (const root of NOTE_NAMES) {
    const rootIndex = NOTE_NAMES.indexOf(root);
    for (const formula of CHORD_FORMULAS) {
      const formulaPcs = formula.intervals.map(iv => (rootIndex + iv) % 12);
      const isSubset = uniquePitchClasses.every(pc => formulaPcs.includes(pc));
      const hasAllKeyNotes = formulaPcs.slice(0, 2).every(pc => uniquePitchClasses.includes(pc));

      if (isSubset && hasAllKeyNotes) {
        const isBassRoot = rootIndex === bassPitchClass;
        const score = (uniquePitchClasses.length === formulaPcs.length ? 10 : 5) + (isBassRoot ? 4 : 0);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = { root, formula, isBassRoot };
        }
      }
    }
  }

  if (bestMatch) {
    const chordBase = `${bestMatch.root}${bestMatch.formula.name}`;
    if (!bestMatch.isBassRoot && bassNoteName !== bestMatch.root) {
      return `${chordBase}/${bassNoteName}`;
    }
    return chordBase;
  }

  return '';
}
