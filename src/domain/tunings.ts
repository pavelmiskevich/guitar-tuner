import type { Pitch } from './notes';
import { midiToPitch } from './notes';

export interface StringSpec {
  index: number;
  stringNumber: number;
  open: Pitch;
  gauge?: number;
  inharmonicityB?: number;
}

export type InstrumentType = 'guitar' | 'bass' | 'ukulele' | 'guitar7' | 'guitar12';

export interface Tuning {
  id: string;
  name: string;
  category: string;
  instrument: InstrumentType;
  strings: StringSpec[];
  isCustom?: boolean;
}

export const DEFAULT_STRING_GAUGES_6 = [0.046, 0.036, 0.026, 0.017, 0.013, 0.010];

export function createStringsFromMidi(midiNotes: number[], gauges?: number[]): StringSpec[] {
  const total = midiNotes.length;
  return midiNotes.map((midi, i) => {
    const stringNumber = total - i;
    const index = i + 1;
    const gauge = gauges ? gauges[i] : (0.050 - (i * 0.007));
    const inharmonicityB = Math.max(1e-5, (1.8e-4) * Math.pow(0.85, i));
    return {
      index,
      stringNumber,
      open: midiToPitch(midi),
      gauge,
      inharmonicityB
    };
  });
}

export const TUNING_PRESETS: Tuning[] = [
  {
    id: 'standard-e',
    name: 'Standard E (EADGBE)',
    category: 'Guitar (6)',
    instrument: 'guitar',
    strings: createStringsFromMidi([40, 45, 50, 55, 59, 64], DEFAULT_STRING_GAUGES_6)
  },
  {
    id: 'drop-d',
    name: 'Drop D (DADGBE)',
    category: 'Guitar (6)',
    instrument: 'guitar',
    strings: createStringsFromMidi([38, 45, 50, 55, 59, 64], [0.048, 0.036, 0.026, 0.017, 0.013, 0.010])
  },
  {
    id: 'drop-c',
    name: 'Drop C (CGCFAD)',
    category: 'Guitar (6)',
    instrument: 'guitar',
    strings: createStringsFromMidi([36, 43, 48, 53, 57, 62], [0.054, 0.042, 0.032, 0.020, 0.015, 0.011])
  },
  {
    id: 'eb-standard',
    name: 'Eb Standard (Полтона вниз)',
    category: 'Guitar (6)',
    instrument: 'guitar',
    strings: createStringsFromMidi([39, 44, 49, 54, 58, 63], DEFAULT_STRING_GAUGES_6)
  },
  {
    id: 'd-standard',
    name: 'D Standard (Тон вниз)',
    category: 'Guitar (6)',
    instrument: 'guitar',
    strings: createStringsFromMidi([38, 43, 48, 53, 57, 62], [0.050, 0.038, 0.028, 0.018, 0.014, 0.011])
  },
  {
    id: 'dadgad',
    name: 'DADGAD (Кельтский)',
    category: 'Guitar (6)',
    instrument: 'guitar',
    strings: createStringsFromMidi([38, 45, 50, 55, 57, 62], DEFAULT_STRING_GAUGES_6)
  },
  {
    id: 'open-d',
    name: 'Open D (DADF#AD)',
    category: 'Guitar (6)',
    instrument: 'guitar',
    strings: createStringsFromMidi([38, 45, 50, 54, 57, 62], DEFAULT_STRING_GAUGES_6)
  },
  {
    id: 'open-g',
    name: 'Open G (DGDGBD)',
    category: 'Guitar (6)',
    instrument: 'guitar',
    strings: createStringsFromMidi([38, 43, 50, 55, 59, 62], DEFAULT_STRING_GAUGES_6)
  },
  {
    id: 'open-c',
    name: 'Open C (CGCGCE)',
    category: 'Guitar (6)',
    instrument: 'guitar',
    strings: createStringsFromMidi([36, 43, 48, 55, 60, 64], [0.054, 0.042, 0.032, 0.018, 0.014, 0.010])
  },
  {
    id: 'open-e',
    name: 'Open E (EBEG#BE)',
    category: 'Guitar (6)',
    instrument: 'guitar',
    strings: createStringsFromMidi([40, 47, 52, 56, 59, 64], DEFAULT_STRING_GAUGES_6)
  },
  {
    id: 'double-drop-d',
    name: 'Double Drop D (DADGBD)',
    category: 'Guitar (6)',
    instrument: 'guitar',
    strings: createStringsFromMidi([38, 45, 50, 55, 59, 62], DEFAULT_STRING_GAUGES_6)
  },
  {
    id: '7-string-b',
    name: '7-String B Standard (BEADGBE)',
    category: 'Guitar (7)',
    instrument: 'guitar7',
    strings: createStringsFromMidi([35, 40, 45, 50, 55, 59, 64], [0.059, 0.046, 0.036, 0.026, 0.017, 0.013, 0.010])
  },
  {
    id: '12-string-std',
    name: '12-String Standard (EE AA DD GG BB EE)',
    category: 'Guitar (12)',
    instrument: 'guitar12',
    strings: createStringsFromMidi(
      [40, 52, 45, 57, 50, 62, 55, 67, 59, 59, 64, 64],
      [0.047, 0.027, 0.038, 0.018, 0.028, 0.012, 0.020, 0.008, 0.014, 0.014, 0.010, 0.010]
    )
  },
  {
    id: 'bass-4',
    name: 'Bass 4-String (EADG)',
    category: 'Bass',
    instrument: 'bass',
    strings: createStringsFromMidi([28, 33, 38, 43], [0.105, 0.085, 0.065, 0.045])
  },
  {
    id: 'bass-5',
    name: 'Bass 5-String (BEADG)',
    category: 'Bass',
    instrument: 'bass',
    strings: createStringsFromMidi([23, 28, 33, 38, 43], [0.130, 0.105, 0.085, 0.065, 0.045])
  },
  {
    id: 'ukulele-gcea',
    name: 'Ukulele Soprano/Concert (gCEA)',
    category: 'Ukulele',
    instrument: 'ukulele',
    strings: createStringsFromMidi([67, 60, 64, 69], [0.024, 0.030, 0.034, 0.022])
  },
  {
    id: 'ukulele-low-g',
    name: 'Ukulele Low-G (GCEA)',
    category: 'Ukulele',
    instrument: 'ukulele',
    strings: createStringsFromMidi([55, 60, 64, 69], [0.030, 0.032, 0.036, 0.022])
  }
];

export const DEFAULT_TUNING = TUNING_PRESETS[0];

const STORAGE_CUSTOM_KEY = 'night_rehearsal_custom_tunings';

export function loadSavedCustomTunings(): Tuning[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOM_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveCustomTuning(tuning: Tuning): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const current = loadSavedCustomTunings().filter(t => t.id !== tuning.id);
    current.push(tuning);
    localStorage.setItem(STORAGE_CUSTOM_KEY, JSON.stringify(current));
  } catch (e) {
    console.error('Failed to save tuning:', e);
  }
}

export function deleteCustomTuning(tuningId: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const current = loadSavedCustomTunings().filter(t => t.id !== tuningId);
    localStorage.setItem(STORAGE_CUSTOM_KEY, JSON.stringify(current));
  } catch (e) {
    console.error('Failed to delete tuning:', e);
  }
}
