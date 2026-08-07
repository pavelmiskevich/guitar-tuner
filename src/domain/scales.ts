import type { NoteName } from './notes';
import { NOTE_NAMES } from './notes';

export interface ScaleDefinition {
  id: string;
  name: string;
  category: string;
  intervals: number[];
  degrees: string[];
}

export const SCALES: ScaleDefinition[] = [
  {
    id: 'major',
    name: 'Мажор (Ионийский)',
    category: 'Основные',
    intervals: [0, 2, 4, 5, 7, 9, 11],
    degrees: ['1', '2', '3', '4', '5', '6', '7']
  },
  {
    id: 'minor-natural',
    name: 'Натуральный минор (Эолийский)',
    category: 'Основные',
    intervals: [0, 2, 3, 5, 7, 8, 10],
    degrees: ['1', '2', '♭3', '4', '5', '♭6', '♭7']
  },
  {
    id: 'pentatonic-major',
    name: 'Мажорная пентатоника',
    category: 'Пентатоники',
    intervals: [0, 2, 4, 7, 9],
    degrees: ['1', '2', '3', '5', '6']
  },
  {
    id: 'pentatonic-minor',
    name: 'Минорная пентатоника',
    category: 'Пентатоники',
    intervals: [0, 3, 5, 7, 10],
    degrees: ['1', '♭3', '4', '5', '♭7']
  },
  {
    id: 'blues',
    name: 'Блюзовый лад',
    category: 'Блюз & Джаз',
    intervals: [0, 3, 5, 6, 7, 10],
    degrees: ['1', '♭3', '4', '♭5', '5', '♭7']
  },
  {
    id: 'minor-harmonic',
    name: 'Гармонический минор',
    category: 'Минорные',
    intervals: [0, 2, 3, 5, 7, 8, 11],
    degrees: ['1', '2', '♭3', '4', '5', '♭6', '7']
  },
  {
    id: 'minor-melodic',
    name: 'Мелодический минор',
    category: 'Минорные',
    intervals: [0, 2, 3, 5, 7, 9, 11],
    degrees: ['1', '2', '♭3', '4', '5', '6', '7']
  },
  {
    id: 'dorian',
    name: 'Дорийский',
    category: 'Церковные лады',
    intervals: [0, 2, 3, 5, 7, 9, 10],
    degrees: ['1', '2', '♭3', '4', '5', '6', '♭7']
  },
  {
    id: 'phrygian',
    name: 'Фригийский',
    category: 'Церковные лады',
    intervals: [0, 1, 3, 5, 7, 8, 10],
    degrees: ['1', '♭2', '♭3', '4', '5', '♭6', '♭7']
  },
  {
    id: 'lydian',
    name: 'Лидийский',
    category: 'Церковные лады',
    intervals: [0, 2, 4, 6, 7, 9, 11],
    degrees: ['1', '2', '3', '♯4', '5', '6', '7']
  },
  {
    id: 'mixolydian',
    name: 'Миксолидийский',
    category: 'Церковные лады',
    intervals: [0, 2, 4, 5, 7, 9, 10],
    degrees: ['1', '2', '3', '4', '5', '6', '♭7']
  },
  {
    id: 'locrian',
    name: 'Локрийский',
    category: 'Церковные лады',
    intervals: [0, 1, 3, 5, 6, 8, 10],
    degrees: ['1', '♭2', '♭3', '4', '♭5', '♭6', '♭7']
  },
  {
    id: 'phrygian-dominant',
    name: 'Фригийский доминантный',
    category: 'Экзотические',
    intervals: [0, 1, 4, 5, 7, 8, 10],
    degrees: ['1', '♭2', '3', '4', '5', '♭6', '♭7']
  },
  {
    id: 'whole-tone',
    name: 'Целотонная гамма',
    category: 'Симметричные',
    intervals: [0, 2, 4, 6, 8, 10],
    degrees: ['1', '2', '3', '♯4', '♯5', '♭7']
  },
  {
    id: 'diminished-hw',
    name: 'Уменьшённая (полутон-тон)',
    category: 'Симметричные',
    intervals: [0, 1, 3, 4, 6, 7, 9, 10],
    degrees: ['1', '♭2', '♭3', '3', '♯4', '5', '6', '♭7']
  }
];

export function getScaleNotes(root: NoteName, scaleId: string): { note: NoteName; degree: string; isRoot: boolean }[] {
  const scale = SCALES.find(s => s.id === scaleId) || SCALES[0];
  const rootIndex = NOTE_NAMES.indexOf(root);
  return scale.intervals.map((interval, idx) => {
    const noteIndex = (rootIndex + interval) % 12;
    return {
      note: NOTE_NAMES[noteIndex],
      degree: scale.degrees[idx] || `${idx + 1}`,
      isRoot: interval === 0
    };
  });
}
