export type NoteName = 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';

export type NotationSystem = 'english' | 'german' | 'solfege';

export interface Pitch {
  midi: number;
  name: NoteName;
  octave: number;
}

export const NOTE_NAMES: NoteName[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const FLAT_NOTE_NAMES: string[] = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export const GERMAN_NOTE_NAMES: Record<NoteName, string> = {
  'C': 'C', 'C#': 'Cis', 'D': 'D', 'D#': 'Dis', 'E': 'E', 'F': 'F',
  'F#': 'Fis', 'G': 'G', 'G#': 'Gis', 'A': 'A', 'A#': 'B', 'B': 'H'
};

export const SOLFEGE_NOTE_NAMES: Record<NoteName, string> = {
  'C': 'До', 'C#': 'До♯', 'D': 'Ре', 'D#': 'Ре♯', 'E': 'Ми', 'F': 'Фа',
  'F#': 'Фа♯', 'G': 'Соль', 'G#': 'Соль♯', 'A': 'Ля', 'A#': 'Ля♯', 'B': 'Си'
};

/**
 * Расчёт целевой частоты ноты по формуле f(m) = A4 * 2^((m - 69) / 12)
 */
export function midiToFrequency(midi: number, a4 = 440.0): number {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Определение ближайшего MIDI номера по частоте
 */
export function frequencyToMidi(freq: number, a4 = 440.0): number {
  return Math.round(69 + 12 * Math.log2(freq / a4));
}

/**
 * Расчёт отклонения в центах: Δ = 1200 * log2(f_measured / f_target)
 */
export function calculateCents(measuredFreq: number, targetFreq: number): number {
  if (measuredFreq <= 0 || targetFreq <= 0) return 0;
  return 1200 * Math.log2(measuredFreq / targetFreq);
}

/**
 * Преобразование MIDI номера в структуру Pitch
 */
export function midiToPitch(midi: number): Pitch {
  const noteIndex = ((midi % 12) + 12) % 12;
  const name = NOTE_NAMES[noteIndex];
  const octave = Math.floor(midi / 12) - 1;
  return { midi, name, octave };
}

/**
 * Создание Pitch из имени ноты и октавы
 */
export function pitchFromName(name: NoteName, octave: number): Pitch {
  const noteIndex = NOTE_NAMES.indexOf(name);
  const midi = (octave + 1) * 12 + noteIndex;
  return { midi, name, octave };
}

/**
 * Форматирование имени ноты в соответствии с выбранной системой нотации
 */
export function formatNoteName(name: NoteName, system: NotationSystem = 'english', useFlats = false): string {
  if (system === 'german') {
    return GERMAN_NOTE_NAMES[name] || name;
  }
  if (system === 'solfege') {
    return SOLFEGE_NOTE_NAMES[name] || name;
  }
  if (useFlats) {
    const idx = NOTE_NAMES.indexOf(name);
    return FLAT_NOTE_NAMES[idx] || name;
  }
  return name;
}
