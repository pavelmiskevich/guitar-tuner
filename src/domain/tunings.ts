import type { Pitch } from './notes';
import { calculateCents, midiToFrequency, midiToPitch } from './notes';

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
  /** Строй пришёл из ссылки и в хранилище получателя не сохранён (см. domain/deepLink). */
  isEphemeral?: boolean;
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

/**
 * Ближайшая струна к услышанной частоте — по расстоянию в центах, а не в герцах.
 *
 * Слух и строй логарифмические: между E2 (82.4) и A2 (110) — 27.6 Гц, между
 * B3 (246.9) и E4 (329.6) — 82.7 Гц, хотя интервалы почти одинаковые. При
 * сравнении в герцах низкие струны «притягивают» к себе всё подряд, и на
 * басовых строях тюнер выбирал соседнюю струну вместо сыгранной.
 */
export function findClosestString(freq: number, strings: StringSpec[], a4 = 440): StringSpec {
  let closest = strings[0];
  let minDistance = Infinity;

  for (const str of strings) {
    const target = midiToFrequency(str.open.midi, a4);
    const distance = Math.abs(calculateCents(freq, target));
    if (distance < minDistance) {
      minDistance = distance;
      closest = str;
    }
  }

  return closest;
}

/** Запас ниже самой низкой струны: её спускают и подтягивают снизу. */
const SEARCH_MARGIN_SEMITONES = 3;
/** Прежняя нижняя граница детектора — гитара ниже неё не опускается. */
const DEFAULT_MIN_SEARCH_HZ = 40;
const DEFAULT_MAX_SEARCH_HZ = 1400;

/**
 * Диапазон частот, в котором детектор ищет основной тон для данного строя.
 *
 * Нижняя граница — самая низкая струна минус три полутона, но не выше
 * прежних 40 Гц: для гитары это сохраняет запас на сильно спущенную струну,
 * а для баса опускает границу до 26 Гц (B0) и 35 Гц (E1). Постоянные 40 Гц
 * отрезали B0 целиком и спущенную E1.
 */
export function pitchSearchRange(tuning: Tuning, a4: number): { minFreq: number; maxFreq: number } {
  const lowestMidi = Math.min(...tuning.strings.map(s => s.open.midi));
  const lowest = midiToFrequency(lowestMidi - SEARCH_MARGIN_SEMITONES, a4);
  return {
    minFreq: Math.min(DEFAULT_MIN_SEARCH_HZ, lowest),
    maxFreq: DEFAULT_MAX_SEARCH_HZ
  };
}
