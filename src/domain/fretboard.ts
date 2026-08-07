import type { Pitch } from './notes';
import { midiToPitch } from './notes';
import type { Tuning } from './tunings';

export interface FretMarker {
  fret: number;
  type: 'single' | 'double';
}

export const STANDARD_FRET_MARKERS: FretMarker[] = [
  { fret: 3, type: 'single' },
  { fret: 5, type: 'single' },
  { fret: 7, type: 'single' },
  { fret: 9, type: 'single' },
  { fret: 12, type: 'double' },
  { fret: 15, type: 'single' },
  { fret: 17, type: 'single' },
  { fret: 19, type: 'single' },
  { fret: 21, type: 'single' },
  { fret: 24, type: 'double' }
];

export interface FretboardConfig {
  scaleLengthMm: number;
  fretsCount: number;
  visibleFrets: { from: number; to: number };
  capo: number | null;
  leftHanded: boolean;
  orientation: 'horizontal' | 'vertical';
  labelMode: 'note' | 'degree' | 'fret' | 'none';
}

export const DEFAULT_FRETBOARD_CONFIG: FretboardConfig = {
  scaleLengthMm: 648,
  fretsCount: 22,
  visibleFrets: { from: 0, to: 15 },
  capo: null,
  leftHanded: false,
  orientation: 'horizontal',
  labelMode: 'note'
};

/**
 * Геометрически точное расстояние от верхнего порожка до лада n
 * d(n) = L * (1 - 2^(-n/12))
 */
export function calculateFretDistance(n: number, scaleLength = 648): number {
  if (n <= 0) return 0;
  return scaleLength * (1 - Math.pow(2, -n / 12));
}

/**
 * Массив расстояний для всех ладов до maxFret
 */
export function calculateFretPositions(scaleLength = 648, maxFret = 24): number[] {
  const positions: number[] = [];
  for (let i = 0; i <= maxFret; i++) {
    positions.push(calculateFretDistance(i, scaleLength));
  }
  return positions;
}

/**
 * Нормализованные относительные позиции ладов для отрисовки SVG (0..1)
 */
export function getFretRelativePositions(fromFret: number, toFret: number, scaleLength = 648): number[] {
  const startDist = calculateFretDistance(fromFret, scaleLength);
  const endDist = calculateFretDistance(toFret, scaleLength);
  const totalSpan = Math.max(1, endDist - startDist);

  const positions: number[] = [];
  for (let f = fromFret; f <= toFret; f++) {
    const d = calculateFretDistance(f, scaleLength);
    positions.push((d - startDist) / totalSpan);
  }
  return positions;
}

/**
 * Получить ноту на конкретной струне и ладу с учетом каподастра
 */
export function getFretNote(
  stringIndex: number,
  fret: number,
  tuning: Tuning,
  capo: number | null = null
): Pitch {
  const str = tuning.strings[stringIndex];
  if (!str) return { midi: 0, name: 'C', octave: 0 };

  const effectiveFret = capo !== null ? (fret === 0 ? capo : fret + capo) : fret;
  const midi = str.open.midi + effectiveFret;
  return midiToPitch(midi);
}
