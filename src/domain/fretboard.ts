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

/**
 * Геометрически точное расстояние от верхнего порожка до лада n
 * d(n) = L * (1 - 2^(-n/12))
 */
export function calculateFretDistance(n: number, scaleLength = 648): number {
  if (n <= 0) return 0;
  return scaleLength * (1 - Math.pow(2, -n / 12));
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

  // Лады отсчитываются от каподастра: открытая струна звучит на его ладу.
  const midi = str.open.midi + fret + (capo ?? 0);
  return midiToPitch(midi);
}

/*
 * Две шкалы ладов. В состоянии экрана, в ссылке и в обратном поиске аккорда
 * лады отсчитываются от каподастра: 0 — струна, прижатая каподастром (так
 * записываются формы аккордов). Гриф же нарисован по физическим ладам — с
 * номерами и инкрустацией настоящего инструмента (#26).
 */

/** Физический лад для лада, отсчитанного от каподастра. */
export function physicalFret(fretFromCapoValue: number, capo: number | null): number {
  return fretFromCapoValue + (capo ?? 0);
}

/** Лад от каподастра для физического лада; null — лад за каподастром, он не звучит. */
export function fretFromCapo(physical: number, capo: number | null): number | null {
  const fret = physical - (capo ?? 0);
  return fret < 0 ? null : fret;
}

/** Ячейка грифа для управления с клавиатуры: лад физический, как подписан под грифом. */
export interface FretboardCell {
  stringIndex: number;
  fret: number;
}

export interface FretboardKeyBounds {
  numStrings: number;
  /** Первый звучащий лад: начало диапазона или каподастр, если он дальше. */
  minFret: number;
  maxFret: number;
  /** У левши лады идут справа налево — стрелки следуют за картинкой. */
  leftHanded: boolean;
}

/**
 * Куда переходит фокус грифа по клавише (#11). Стрелки «влево/вправо» —
 * соседний лад в ту сторону, куда он нарисован; «вверх/вниз» — соседняя
 * струна (6-я сверху); Home/End — край диапазона на той же струне.
 * null — клавиша не перемещает фокус. У края фокус остаётся на месте.
 */
export function fretboardKeyMove(cell: FretboardCell, key: string, b: FretboardKeyBounds): FretboardCell | null {
  const toward = b.leftHanded ? -1 : 1;
  let { stringIndex, fret } = cell;
  switch (key) {
    case 'ArrowRight':
      fret += toward;
      break;
    case 'ArrowLeft':
      fret -= toward;
      break;
    case 'ArrowUp':
      stringIndex -= 1;
      break;
    case 'ArrowDown':
      stringIndex += 1;
      break;
    case 'Home':
      fret = b.minFret;
      break;
    case 'End':
      fret = b.maxFret;
      break;
    default:
      return null;
  }
  return {
    stringIndex: Math.min(b.numStrings - 1, Math.max(0, stringIndex)),
    fret: Math.min(b.maxFret, Math.max(b.minFret, fret))
  };
}

/** Ячейка в пределах грифа: после смены строя, диапазона или каподастра. */
export function clampFretboardCell(cell: FretboardCell, b: Omit<FretboardKeyBounds, 'leftHanded'>): FretboardCell {
  return {
    stringIndex: Math.min(b.numStrings - 1, Math.max(0, cell.stringIndex)),
    fret: Math.min(b.maxFret, Math.max(b.minFret, cell.fret))
  };
}
