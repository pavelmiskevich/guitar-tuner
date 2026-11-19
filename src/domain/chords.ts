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
  /**
   * Название исходной аппликатуры, если она пересчитана под другой строй и
   * звучит другим аккордом: в D Standard форма «Am» даёт Gm.
   */
  shape?: string;
}

export const OPEN_STRINGS_ID = 'open-strings';

/**
 * «Открытые струны» — единственная аппликатура, верная для любого строя:
 * строится по числу струн, а не шестью нулями.
 */
export function openStringsVoicing(tuning: Tuning): Voicing {
  return {
    id: OPEN_STRINGS_ID,
    name: 'Открытые струны',
    root: tuning.strings[0]?.open.name ?? 'E',
    type: 'open',
    frets: tuning.strings.map(() => 0)
  };
}

/**
 * Аппликатуры шестиструнной гитары в стандартном строе (от 6-й струны к 1-й).
 * Под другие строи их пересчитывает getVoicingsForTuning — напрямую к
 * произвольному строю их не применять.
 */
export const COMMON_VOICINGS: Voicing[] = [
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

/** Аппликатуры укулеле gCEA (от 4-й струны к 1-й); для Low-G те же. */
export const UKULELE_VOICINGS: Voicing[] = [
  { id: 'uke-c', name: 'C', root: 'C', type: 'maj', frets: [0, 0, 0, 3] },
  { id: 'uke-c7', name: 'C7', root: 'C', type: '7', frets: [0, 0, 0, 1] },
  { id: 'uke-d', name: 'D', root: 'D', type: 'maj', frets: [2, 2, 2, 0] },
  { id: 'uke-dm', name: 'Dm', root: 'D', type: 'min', frets: [2, 2, 1, 0] },
  { id: 'uke-e7', name: 'E7', root: 'E', type: '7', frets: [1, 2, 0, 2] },
  { id: 'uke-em', name: 'Em', root: 'E', type: 'min', frets: [0, 4, 3, 2] },
  { id: 'uke-f', name: 'F', root: 'F', type: 'maj', frets: [2, 0, 1, 0] },
  { id: 'uke-g', name: 'G', root: 'G', type: 'maj', frets: [0, 2, 3, 2] },
  { id: 'uke-g7', name: 'G7', root: 'G', type: '7', frets: [0, 2, 1, 2] },
  { id: 'uke-a', name: 'A', root: 'A', type: 'maj', frets: [2, 1, 0, 0] },
  { id: 'uke-am', name: 'Am', root: 'A', type: 'min', frets: [2, 0, 0, 0] },
  { id: 'uke-a7', name: 'A7', root: 'A', type: '7', frets: [0, 1, 0, 0] },
  { id: 'uke-bm', name: 'Bm (Hm)', root: 'B', type: 'min', frets: [4, 2, 2, 2] }
];

/** Строй, под который записаны библиотеки (MIDI открытых струн). */
const GUITAR_REFERENCE = [40, 45, 50, 55, 59, 64];
const UKULELE_REFERENCE = [67, 60, 64, 69];

/** Пересчитанная аппликатура должна браться одной рукой: не шире четырёх ладов. */
const MAX_FRET_SPAN = 3;
const MAX_ADAPTED_FRET = 12;

export type VoicingLibraryKind = 'guitar' | 'ukulele';

/**
 * Как библиотека ложится на строй: какие струны строя играют каждую струну
 * эталона. У 7-струнной это шесть верхних струн, у 12-струнной — хоры (пары
 * струн), у шестиструнной и укулеле — сами струны.
 */
interface LibraryLayout {
  kind: VoicingLibraryKind;
  reference: number[];
  library: Voicing[];
  /** groups[i] — индексы струн строя, играющих i-ю струну эталона. */
  groups: number[][];
}

function pitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

/** Разница строя и эталона по высотному классу: −5…6 полутонов. */
function pitchClassOffset(actual: number, reference: number): number {
  const d = pitchClass(actual - reference);
  return d > 6 ? d - 12 : d;
}

function libraryLayout(tuning: Tuning): LibraryLayout | null {
  const midis = tuning.strings.map(s => s.open.midi);
  const n = midis.length;
  const single = (count: number, from = 0) => Array.from({ length: count }, (_, i) => [from + i]);

  if (tuning.instrument === 'ukulele' && n === 4) {
    return { kind: 'ukulele', reference: UKULELE_REFERENCE, library: UKULELE_VOICINGS, groups: single(4) };
  }
  if (tuning.instrument === 'guitar' && n === 6) {
    return { kind: 'guitar', reference: GUITAR_REFERENCE, library: COMMON_VOICINGS, groups: single(6) };
  }
  if (tuning.instrument === 'guitar7' && n === 7) {
    // Седьмая (самая низкая) струна в аккордах шестиструнной гитары глушится.
    return { kind: 'guitar', reference: GUITAR_REFERENCE, library: COMMON_VOICINGS, groups: single(6, 1) };
  }
  if (tuning.instrument === 'guitar12' && n === 12) {
    const groups = [0, 1, 2, 3, 4, 5].map(c => [c * 2, c * 2 + 1]);
    // Струны хора должны звучать одной нотой (в унисон или через октаву),
    // иначе один и тот же лад даёт на них разные ноты и форма не работает.
    if (!groups.every(([a, b]) => pitchClass(midis[a]) === pitchClass(midis[b]))) return null;
    return { kind: 'guitar', reference: GUITAR_REFERENCE, library: COMMON_VOICINGS, groups };
  }
  return null;
}

/** Какая библиотека аккордов доступна для строя; null — только открытые струны. */
export function voicingLibraryKind(tuning: Tuning): VoicingLibraryKind | null {
  return libraryLayout(tuning)?.kind ?? null;
}

/**
 * Струн в хоре для отрисовки схемы: у 12-струнной на схеме шесть хоров,
 * а не двенадцать струн, которые слиплись бы в полосу.
 */
export function voicingCourseSize(tuning: Tuning): number {
  return libraryLayout(tuning)?.groups[0]?.length ?? 1;
}

function transposedName(voicing: Voicing, shift: number): { name: string; root: NoteName } {
  const root = NOTE_NAMES[pitchClass(NOTE_NAMES.indexOf(voicing.root) + shift)];
  const suffix = CHORD_FORMULAS.find(f => f.type === voicing.type)?.name ?? voicing.type;
  return { name: `${root}${suffix}`, root };
}

/**
 * Пересчёт аппликатуры эталона под строй с сохранением высотных классов.
 *
 * Сдвиг строя считается по каждой струне. Если все звучащие струны сдвинуты
 * одинаково (Eb/D Standard), форма остаётся прежней, а аккорд транспонируется:
 * форма «Am» в D Standard — это Gm. Если сдвиги разные (Drop D, DADGAD,
 * Open G), лады на «отстающих» струнах подправляются так, чтобы аккорд остался
 * тем же: E на Drop D берётся как 2-2-2-1-0-0. Неиграбельный результат
 * (отрицательный лад, растяжка шире четырёх ладов) отбрасывается.
 */
function adaptVoicing(voicing: Voicing, layout: LibraryLayout, midis: number[]): Voicing | null {
  const offsets = layout.groups.map((group, i) => pitchClassOffset(midis[group[0]], layout.reference[i]));

  const counts = new Map<number, number>();
  voicing.frets.forEach((fret, i) => {
    if (fret === 'x') return;
    counts.set(offsets[i], (counts.get(offsets[i]) ?? 0) + 1);
  });
  if (counts.size === 0) return null;

  // Сдвиг аккорда — тот, что у большинства звучащих струн: так подправлять
  // приходится меньше всего струн. При равенстве — меньший по модулю.
  let shift = 0;
  let best = -1;
  for (const [offset, count] of counts) {
    if (count > best || (count === best && Math.abs(offset) < Math.abs(shift))) {
      best = count;
      shift = offset;
    }
  }

  const adapted = voicing.frets.map((fret, i) => (fret === 'x' ? 'x' : fret - (offsets[i] - shift)));
  if (adapted.some(f => typeof f === 'number' && f < 0)) return null;
  const fretted = adapted.filter((f): f is number => typeof f === 'number' && f > 0);
  if (fretted.length > 0) {
    const lo = Math.min(...fretted);
    const hi = Math.max(...fretted);
    if (hi - lo > MAX_FRET_SPAN || hi > MAX_ADAPTED_FRET) return null;
  }

  const frets: (number | 'x')[] = midis.map(() => 'x');
  layout.groups.forEach((group, i) => group.forEach(idx => { frets[idx] = adapted[i]; }));

  const result: Voicing = { id: voicing.id, name: voicing.name, root: voicing.root, type: voicing.type, frets };

  // Подсказки пальцев и баре верны только для исходной формы на исходных струнах.
  const sameShape = frets.length === voicing.frets.length && frets.every((f, i) => f === voicing.frets[i]);
  if (sameShape) {
    if (voicing.fingers) result.fingers = voicing.fingers;
    if (voicing.barre) result.barre = voicing.barre;
  }
  if (shift !== 0) {
    const { name, root } = transposedName(voicing, shift);
    result.name = name;
    result.root = root;
    result.shape = voicing.name;
  }
  return result;
}

/**
 * Аппликатуры, корректные для строя: первой — «Открытые струны», затем
 * библиотека инструмента, пересчитанная под строй. Для баса и прочих
 * инструментов без библиотеки — только открытые струны (#5).
 */
export function getVoicingsForTuning(tuning: Tuning): Voicing[] {
  const open = openStringsVoicing(tuning);
  const layout = libraryLayout(tuning);
  if (!layout) return [open];
  const midis = tuning.strings.map(s => s.open.midi);
  const adapted = layout.library
    .map(v => adaptVoicing(v, layout, midis))
    .filter((v): v is Voicing => v !== null);
  return [open, ...adapted];
}

/** Все известные идентификаторы аппликатур — для проверки ссылок. */
export const ALL_VOICING_IDS: ReadonlySet<string> = new Set([
  OPEN_STRINGS_ID,
  ...COMMON_VOICINGS.map(v => v.id),
  ...UKULELE_VOICINGS.map(v => v.id)
]);

/**
 * Аппликатуры чистых трезвучий заданного наклонения.
 *
 * Отбор идёт по полю `type`, а не по названию: названия локализованы и несут
 * пояснения («A (Мажор)», «B (H)»), а подстрока «m» есть и в мажорных
 * септаккордах — Cmaj7, Fmaj7. Септаккорды сюда не попадают намеренно:
 * вопрос «мажор или минор» задаётся про трезвучие.
 */
export function getTriadVoicings(quality: 'maj' | 'min', tuning?: Tuning): Voicing[] {
  const source = tuning ? getVoicingsForTuning(tuning) : COMMON_VOICINGS;
  return source.filter(v => v.type === quality);
}

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
 * Определение аккорда по набору нажатых ладов (обратный поиск).
 *
 * Лады отсчитываются от каподастра, как и подписи нот на грифе: с капо на
 * 2-м ладу форма Am звучит как Bm, и название должно с этим совпадать (#13).
 */
export function detectChordFromFrets(frets: (number | 'x')[], tuning: Tuning, capo: number | null = null): string {
  const capoShift = capo ?? 0;
  const soundingMidis: number[] = [];
  frets.forEach((fret, i) => {
    if (fret !== 'x' && tuning.strings[i]) {
      soundingMidis.push(tuning.strings[i].open.midi + fret + capoShift);
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
