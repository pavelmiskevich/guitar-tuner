import type { Tuning } from './tunings';
import type { NotationSystem } from './notes';
import { formatNoteName, midiToFrequency, midiToPitch, NOTE_NAMES } from './notes';
import { getFretNote } from './fretboard';
import { getTriadVoicings } from './chords';

/**
 * Генератор вопросов тренажёра слуха (#16). Раньше жил внутри экрана и не
 * имел тестов; здесь — чистая функция со своим источником случайности.
 */

export type EarGameMode = 'note' | 'string' | 'chord_quality';

export interface EarQuestion {
  targetLabel: string;
  /** MIDI звучащей ноты; 0 — вопрос про аккорд. */
  targetMidi: number;
  options: string[];
  correctIndex: number;
  explanation: string;
  notesToPlay: { freq: number; delay: number }[];
}

/** Источник случайности [0, 1): Math.random в приложении, детерминированный — в тестах. */
export type Random = () => number;

/** Ноты вопроса «какая нота» берутся с ладов 0..NOTE_MAX_FRET−1. */
export const NOTE_MAX_FRET = 8;
/** Пауза между нотами аккорда, мс: перебор, а не удар — характер аккорда слышнее. */
export const CHORD_ARPEGGIO_MS = 100;

export const QUALITY_OPTIONS = ['Мажор (Светлый / Радостный)', 'Минор (Грустный / Драматичный)'];

const randomInt = (random: Random, n: number) => Math.min(n - 1, Math.floor(random() * n));

/**
 * Перемешивание Фишера — Йетса. Прежний sort(() => Math.random() − 0.5)
 * перемешивает неравномерно: правильный ответ чаще оказывался на одних и тех
 * же местах.
 */
export function shuffle<T>(items: readonly T[], random: Random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(random, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function noteQuestion(tuning: Tuning, notation: NotationSystem, a4: number, random: Random): EarQuestion {
  const strIdx = randomInt(random, tuning.strings.length);
  const fret = randomInt(random, NOTE_MAX_FRET);
  const target = getFretNote(strIdx, fret, tuning);
  const targetName = formatNoteName(target.name, notation);
  const targetFreq = midiToFrequency(target.midi, a4);

  const wrong = shuffle(
    NOTE_NAMES.filter(n => n !== target.name).map(n => formatNoteName(n, notation)),
    random
  ).slice(0, 3);
  const options = shuffle([targetName, ...wrong], random);

  return {
    targetLabel: `${targetName} (${target.name}${target.octave})`,
    targetMidi: target.midi,
    options,
    correctIndex: options.indexOf(targetName),
    explanation: `Звучала нота ${targetName}${target.octave} (${targetFreq.toFixed(1)} Гц) на ${tuning.strings[strIdx]?.stringNumber}-й струне, ${fret}-й лад.`,
    notesToPlay: [{ freq: targetFreq, delay: 0 }]
  };
}

function stringQuestion(tuning: Tuning, notation: NotationSystem, a4: number, random: Random): EarQuestion {
  const strIdx = randomInt(random, tuning.strings.length);
  const str = tuning.strings[strIdx];
  const name = formatNoteName(str.open.name, notation);
  const freq = midiToFrequency(str.open.midi, a4);

  return {
    targetLabel: `${str.stringNumber}-я струна (${name}${str.open.octave})`,
    targetMidi: str.open.midi,
    options: tuning.strings.map(s => `${s.stringNumber}-я струна (${formatNoteName(s.open.name, notation)}${s.open.octave})`),
    correctIndex: strIdx,
    explanation: `Звучала открытая ${str.stringNumber}-я струна: ${name}${str.open.octave} (${freq.toFixed(1)} Гц).`,
    notesToPlay: [{ freq, delay: 0 }]
  };
}

function chordQualityQuestion(tuning: Tuning, notation: NotationSystem, a4: number, random: Random): EarQuestion {
  const isMajor = random() >= 0.5;
  // Аппликатуры — пересчитанные под текущий строй: шестиструнная форма на
  // басе или укулеле играла не тот аккорд, о котором спрашивали (#5).
  const voicings = getTriadVoicings(isMajor ? 'maj' : 'min', tuning);

  const notes: { freq: number; delay: number }[] = [];
  let chordName: string;
  let delay = 0;
  if (voicings.length > 0) {
    const voicing = voicings[randomInt(random, voicings.length)];
    chordName = voicing.name;
    voicing.frets.forEach((fret, sIdx) => {
      if (fret === 'x') return;
      notes.push({ freq: midiToFrequency(getFretNote(sIdx, fret, tuning).midi, a4), delay });
      delay += CHORD_ARPEGGIO_MS;
    });
  } else {
    // Для строя без библиотеки аккордов (бас) — трезвучие в тесном
    // расположении от случайной ноты малой октавы: вопрос о наклонении
    // не зависит от инструмента.
    const rootMidi = 48 + randomInt(random, 12);
    const root = midiToPitch(rootMidi);
    chordName = `${formatNoteName(root.name, notation)}${isMajor ? '' : 'm'}`;
    for (const interval of [0, isMajor ? 4 : 3, 7, 12]) {
      notes.push({ freq: midiToFrequency(rootMidi + interval, a4), delay });
      delay += CHORD_ARPEGGIO_MS;
    }
  }

  return {
    targetLabel: `${chordName} (${isMajor ? 'Мажор' : 'Минор'})`,
    targetMidi: 0,
    options: QUALITY_OPTIONS,
    correctIndex: isMajor ? 0 : 1,
    explanation: `Звучал аккорд ${chordName} — это ${isMajor ? 'мажорное' : 'минорное'} трезвучие.`,
    notesToPlay: notes
  };
}

export function generateEarQuestion(
  mode: EarGameMode,
  tuning: Tuning,
  notation: NotationSystem,
  a4: number,
  random: Random = Math.random
): EarQuestion {
  switch (mode) {
    case 'note':
      return noteQuestion(tuning, notation, a4, random);
    case 'string':
      return stringQuestion(tuning, notation, a4, random);
    case 'chord_quality':
      return chordQualityQuestion(tuning, notation, a4, random);
  }
}
