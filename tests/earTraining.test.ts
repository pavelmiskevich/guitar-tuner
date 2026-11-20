import { describe, it, expect } from 'vitest';
import { generateEarQuestion, shuffle, NOTE_MAX_FRET, QUALITY_OPTIONS } from '../src/domain/earTraining';
import type { Random } from '../src/domain/earTraining';
import { TUNING_PRESETS } from '../src/domain/tunings';
import { frequencyToMidi } from '../src/domain/notes';

const tuning = (id: string) => TUNING_PRESETS.find(t => t.id === id)!;

/** Детерминированный генератор: прогон воспроизводим. */
function seeded(seed: number): Random {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x80000000;
  };
}

/** Набор нот аккорда — мажорное или минорное трезвучие (с удвоениями)? */
function triadQuality(freqs: number[]): 'maj' | 'min' | null {
  const pcs = new Set(freqs.map(f => ((Math.round(frequencyToMidi(f, 440)) % 12) + 12) % 12));
  if (pcs.size !== 3) return null;
  for (const root of pcs) {
    const has = (i: number) => pcs.has((root + i) % 12);
    if (has(4) && has(7)) return 'maj';
    if (has(3) && has(7)) return 'min';
  }
  return null;
}

describe('shuffle', () => {
  it('сохраняет элементы и не трогает исходный массив', () => {
    const src = [1, 2, 3, 4, 5];
    const out = shuffle(src, seeded(1));
    expect(out.sort()).toEqual([1, 2, 3, 4, 5]);
    expect(src).toEqual([1, 2, 3, 4, 5]);
  });

  it('равномерно: правильный ответ попадает на каждое из четырёх мест примерно поровну', () => {
    const random = seeded(7);
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 8000; i++) counts[shuffle(['A', 'B', 'C', 'D'], random).indexOf('A')]++;
    for (const c of counts) expect(c / 8000).toBeGreaterThan(0.22);
  });
});

describe('generateEarQuestion: нота', () => {
  it('четыре разных варианта, правильный среди них и совпадает с нотой вопроса', () => {
    const random = seeded(3);
    for (let i = 0; i < 200; i++) {
      const q = generateEarQuestion('note', tuning('standard-e'), 'english', 440, random);
      expect(new Set(q.options).size).toBe(4);
      expect(q.options[q.correctIndex]).toBe(q.targetLabel.split(' ')[0]);
      expect(Math.round(frequencyToMidi(q.notesToPlay[0].freq, 440))).toBe(q.targetMidi);
    }
  });

  it('нота лежит на одной из струн не выше 7-го лада', () => {
    const random = seeded(4);
    const t = tuning('standard-e');
    const lowest = Math.min(...t.strings.map(s => s.open.midi));
    const highest = Math.max(...t.strings.map(s => s.open.midi)) + NOTE_MAX_FRET - 1;
    for (let i = 0; i < 200; i++) {
      const q = generateEarQuestion('note', t, 'english', 440, random);
      expect(q.targetMidi).toBeGreaterThanOrEqual(lowest);
      expect(q.targetMidi).toBeLessThanOrEqual(highest);
    }
  });

  it('варианты — в выбранной нотации', () => {
    const q = generateEarQuestion('note', tuning('standard-e'), 'solfege', 440, seeded(5));
    for (const o of q.options) expect(o).toMatch(/^(До|Ре|Ми|Фа|Соль|Ля|Си)/);
  });
});

describe('generateEarQuestion: струна', () => {
  it('варианты — все струны строя, правильный — звучащая открытая струна', () => {
    const random = seeded(6);
    const t = tuning('7-string-b');
    for (let i = 0; i < 50; i++) {
      const q = generateEarQuestion('string', t, 'english', 440, random);
      expect(q.options).toHaveLength(7);
      expect(q.targetMidi).toBe(t.strings[q.correctIndex].open.midi);
    }
  });
});

describe('generateEarQuestion: мажор / минор', () => {
  it.each(['standard-e', 'drop-d', 'ukulele-gcea', 'bass-4', '12-string-std'])(
    '%s: звучит трезвучие того наклонения, что отмечено верным',
    (id) => {
      const random = seeded(id.length * 31);
      const seen = new Set<number>();
      for (let i = 0; i < 60; i++) {
        const q = generateEarQuestion('chord_quality', tuning(id), 'english', 440, random);
        expect(q.options).toEqual(QUALITY_OPTIONS);
        seen.add(q.correctIndex);
        const quality = triadQuality(q.notesToPlay.map(n => n.freq));
        expect(quality, `${q.targetLabel}`).toBe(q.correctIndex === 0 ? 'maj' : 'min');
      }
      // За 60 вопросов встречаются оба наклонения.
      expect(seen).toEqual(new Set([0, 1]));
    }
  );

  it('ноты аккорда идут перебором — по нарастающей задержке', () => {
    const q = generateEarQuestion('chord_quality', tuning('standard-e'), 'english', 440, seeded(9));
    const delays = q.notesToPlay.map(n => n.delay);
    expect(delays).toEqual([...delays].sort((a, b) => a - b));
    expect(new Set(delays).size).toBe(delays.length);
  });
});
