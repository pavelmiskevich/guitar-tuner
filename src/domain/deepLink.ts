/**
 * Deep link грифа (FR-FB-18): полное состояние схемы кодируется в URL Hash,
 * чтобы ссылкой можно было поделиться и получатель увидел ровно ту же картинку.
 *
 * Формат: #tab=fretboard&mode=…&root=…&scale=…&voicing=…&frets=…&capo=…&left=1&range=0-15&labels=…&tuning=…
 * Значения по умолчанию не пишутся — ссылка остаётся читаемой.
 */
import type { NoteName } from './notes';
import { NOTE_NAMES } from './notes';
import { SCALES } from './scales';
import { COMMON_VOICINGS } from './chords';
import type { InstrumentType, Tuning } from './tunings';
import { createStringsFromMidi } from './tunings';

export type FretboardViewMode = 'explore' | 'scales' | 'chords';
export type LabelMode = 'note' | 'degree';
export type TabId = 'tuner' | 'fretboard' | 'chord-check' | 'metronome' | 'ear-training';

export interface FretboardShareState {
  mode: FretboardViewMode;
  root: NoteName;
  scaleId: string;
  voicingId: string;
  customFrets: (number | 'x')[];
  capo: number | null;
  leftHanded: boolean;
  fretRange: { from: number; to: number };
  labelMode: LabelMode;
  tuning: Tuning;
}

/** Разобранное состояние: присутствуют только те поля, что корректно прочитались. */
export type DecodedFretboardState = Partial<Omit<FretboardShareState, 'tuning'>>;

const TAB_IDS: TabId[] = ['tuner', 'fretboard', 'chord-check', 'metronome', 'ear-training'];
const VIEW_MODES: FretboardViewMode[] = ['explore', 'scales', 'chords'];
const INSTRUMENTS: InstrumentType[] = ['guitar', 'bass', 'ukulele', 'guitar7', 'guitar12'];

export const MAX_FRET = 24;
export const DEFAULT_FRET_RANGE = { from: 0, to: 15 };

/** Ссылки старого формата всегда несли mode= — по нему узнаём гриф без tab=. */
const LEGACY_FRETBOARD_KEY = 'mode';

function toParams(hash: string): URLSearchParams {
  return new URLSearchParams(hash.replace(/^#/, ''));
}

function parseIntStrict(raw: string | null): number | null {
  if (raw === null || !/^-?\d+$/.test(raw.trim())) return null;
  return Number(raw);
}

export function encodeFretboardHash(state: FretboardShareState): string {
  const params = new URLSearchParams();
  params.set('tab', 'fretboard');
  params.set('mode', state.mode);
  params.set('root', state.root);

  if (state.mode === 'scales') params.set('scale', state.scaleId);
  if (state.mode === 'chords') params.set('voicing', state.voicingId);
  if (state.mode === 'explore' && state.customFrets.some(f => f !== 'x')) {
    params.set('frets', state.customFrets.join('.'));
  }

  if (state.capo !== null) params.set('capo', String(state.capo));
  if (state.leftHanded) params.set('left', '1');
  if (state.fretRange.from !== DEFAULT_FRET_RANGE.from || state.fretRange.to !== DEFAULT_FRET_RANGE.to) {
    params.set('range', `${state.fretRange.from}-${state.fretRange.to}`);
  }
  if (state.labelMode !== 'note') params.set('labels', state.labelMode);

  params.set('tuning', state.tuning.id);
  // Пользовательский строй у получателя не сохранён — передаём сами струны,
  // иначе ноты на его грифе не совпадут с отправленной схемой.
  if (state.tuning.isCustom) {
    params.set('strings', state.tuning.strings.map(s => s.open.midi).join('.'));
    params.set('inst', state.tuning.instrument);
  }

  return params.toString();
}

export function decodeFretboardHash(hash: string): DecodedFretboardState {
  const params = toParams(hash);
  const state: DecodedFretboardState = {};

  const mode = params.get('mode');
  if (mode && (VIEW_MODES as string[]).includes(mode)) state.mode = mode as FretboardViewMode;

  const root = params.get('root');
  if (root && (NOTE_NAMES as string[]).includes(root)) state.root = root as NoteName;

  const scale = params.get('scale');
  if (scale && SCALES.some(s => s.id === scale)) state.scaleId = scale;

  const voicing = params.get('voicing');
  if (voicing && COMMON_VOICINGS.some(v => v.id === voicing)) state.voicingId = voicing;

  const frets = parseFrets(params.get('frets'));
  if (frets) state.customFrets = frets;

  const capoRaw = params.get('capo');
  if (capoRaw === 'none') {
    state.capo = null;
  } else {
    const capo = parseIntStrict(capoRaw);
    if (capo !== null && capo >= 0 && capo <= MAX_FRET) state.capo = capo === 0 ? null : capo;
  }

  const left = params.get('left');
  if (left === '1' || left === '0') state.leftHanded = left === '1';

  const range = parseRange(params.get('range'));
  if (range) state.fretRange = range;

  const labels = params.get('labels');
  if (labels === 'note' || labels === 'degree') state.labelMode = labels;

  return state;
}

function parseFrets(raw: string | null): (number | 'x')[] | null {
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length < 4 || parts.length > 12) return null;

  const frets: (number | 'x')[] = [];
  for (const part of parts) {
    if (part === 'x') {
      frets.push('x');
      continue;
    }
    const fret = parseIntStrict(part);
    if (fret === null || fret < 0 || fret > MAX_FRET) return null;
    frets.push(fret);
  }
  return frets;
}

function parseRange(raw: string | null): { from: number; to: number } | null {
  if (!raw) return null;
  const [fromRaw, toRaw] = raw.split('-');
  const from = parseIntStrict(fromRaw ?? null);
  const to = parseIntStrict(toRaw ?? null);
  if (from === null || to === null) return null;
  if (from < 0 || to > MAX_FRET || from >= to) return null;
  return { from, to };
}

/** Вкладка из ссылки. Ссылки старого формата (без tab=) означают гриф. */
export function parseTabFromHash(hash: string): TabId | null {
  const params = toParams(hash);
  const tab = params.get('tab');
  if (tab && (TAB_IDS as string[]).includes(tab)) return tab as TabId;
  const legacyMode = params.get(LEGACY_FRETBOARD_KEY);
  if (legacyMode && (VIEW_MODES as string[]).includes(legacyMode)) return 'fretboard';
  return null;
}

/**
 * Строй из ссылки: сперва ищем среди доступных получателю (пресеты + его
 * сохранённые), иначе собираем на лету из переданных струн.
 */
export function resolveSharedTuning(hash: string, availableTunings: Tuning[]): Tuning | null {
  const params = toParams(hash);
  const id = params.get('tuning');
  if (id) {
    const known = availableTunings.find(t => t.id === id);
    if (known) return known;
  }

  const raw = params.get('strings');
  if (!raw) return null;

  const parts = raw.split('.');
  if (parts.length < 4 || parts.length > 12) return null;

  const midi: number[] = [];
  for (const part of parts) {
    const note = parseIntStrict(part);
    if (note === null || note < 12 || note > 108) return null;
    midi.push(note);
  }

  const instRaw = params.get('inst');
  const instrument = instRaw && (INSTRUMENTS as string[]).includes(instRaw)
    ? (instRaw as InstrumentType)
    : 'guitar';

  return {
    id: id || 'shared-tuning',
    name: 'Строй из ссылки',
    category: 'Из ссылки',
    instrument,
    strings: createStringsFromMidi(midi),
    isCustom: true
  };
}

export function buildShareUrl(baseUrl: string, pathname: string, state: FretboardShareState): string {
  const origin = baseUrl.replace(/\/$/, '');
  const path = pathname === '/' ? '/' : pathname;
  return `${origin}${path}#${encodeFretboardHash(state)}`;
}
