import { describe, it, expect } from 'vitest';
import {
  ALL_VOICING_IDS,
  COMMON_VOICINGS,
  UKULELE_VOICINGS,
  detectChordFromFrets,
  getTriadVoicings,
  getVoicingExpectedPitches,
  getVoicingsForTuning,
  voicingCourseSize,
  voicingLibraryKind
} from '../src/domain/chords';
import type { Voicing } from '../src/domain/chords';
import { CHORD_FORMULAS } from '../src/domain/chords';
import { NOTE_NAMES } from '../src/domain/notes';
import { TUNING_PRESETS, DEFAULT_TUNING } from '../src/domain/tunings';
import type { Tuning } from '../src/domain/tunings';
import { evaluateArpeggioNote, initChordStatuses } from '../src/audio/chordAnalyzer';
import { midiToFrequency } from '../src/domain/notes';

const byId = (id: string): Tuning => {
  const t = TUNING_PRESETS.find(p => p.id === id);
  if (!t) throw new Error(`нет строя ${id}`);
  return t;
};
const voicing = (tuning: Tuning, id: string): Voicing | undefined =>
  getVoicingsForTuning(tuning).find(v => v.id === id);

/** Высотные классы звучащих струн относительно тоники. */
function intervalsFromRoot(v: Voicing, tuning: Tuning): number[] {
  const rootPc = NOTE_NAMES.indexOf(v.root);
  const pcs = new Set(
    getVoicingExpectedPitches(v, tuning)
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .map(p => (p.midi - rootPc + 120) % 12)
  );
  return [...pcs].sort((a, b) => a - b);
}

describe('Аппликатуры под строй (#5)', () => {
  it('для каждого пресета число ладов совпадает с числом струн', () => {
    for (const tuning of TUNING_PRESETS) {
      for (const v of getVoicingsForTuning(tuning)) {
        expect(v.frets.length, `${tuning.id} / ${v.id}`).toBe(tuning.strings.length);
      }
    }
  });

  it('«Открытые струны» есть всегда и строятся по числу струн', () => {
    for (const tuning of TUNING_PRESETS) {
      const [open] = getVoicingsForTuning(tuning);
      expect(open.id).toBe('open-strings');
      expect(open.frets).toEqual(tuning.strings.map(() => 0));
    }
  });

  it('в стандартном строе библиотека не меняется', () => {
    const adapted = getVoicingsForTuning(DEFAULT_TUNING).slice(1);
    expect(adapted.map(v => v.id)).toEqual(COMMON_VOICINGS.map(v => v.id));
    for (const v of adapted) {
      const original = COMMON_VOICINGS.find(c => c.id === v.id)!;
      expect(v.frets).toEqual(original.frets);
      expect(v.name).toBe(original.name);
      expect(v.shape).toBeUndefined();
    }
  });

  it('пересчитанная аппликатура звучит заявленным аккордом в любом строе', () => {
    for (const tuning of TUNING_PRESETS) {
      for (const v of getVoicingsForTuning(tuning).slice(1)) {
        const library = voicingLibraryKind(tuning) === 'ukulele' ? UKULELE_VOICINGS : COMMON_VOICINGS;
        const original = library.find(c => c.id === v.id)!;
        const reference = voicingLibraryKind(tuning) === 'ukulele' ? byId('ukulele-gcea') : DEFAULT_TUNING;
        // Тот же набор интервалов от тоники, что у исходной формы в эталонном строе.
        expect(intervalsFromRoot(v, tuning), `${tuning.id} / ${v.id}`).toEqual(intervalsFromRoot(original, reference));
      }
    }
  });

  it('в транспонированном строе форма та же, а название — по звучанию', () => {
    const am = voicing(byId('d-standard'), 'am-open')!;
    expect(am.frets).toEqual(['x', 0, 2, 2, 1, 0]);
    expect(am.name).toBe('Gm');
    expect(am.root).toBe('G');
    expect(am.shape).toBe('Am (Минор)');

    expect(voicing(byId('eb-standard'), 'e-open')!.name).toBe('D#');
  });

  it('в Drop D аккорд сохраняется, лад на 6-й струне подправляется', () => {
    const e = voicing(byId('drop-d'), 'e-open')!;
    expect(e.frets).toEqual([2, 2, 2, 1, 0, 0]);
    expect(e.name).toBe('E');
    expect(e.shape).toBeUndefined();
    // Аккорды с заглушённой 6-й струной не меняются вовсе.
    expect(voicing(byId('drop-d'), 'am-open')!.frets).toEqual(['x', 0, 2, 2, 1, 0]);
  });

  it('неиграбельные пересчёты отбрасываются', () => {
    for (const tuning of TUNING_PRESETS) {
      for (const v of getVoicingsForTuning(tuning).slice(1)) {
        const fretted = v.frets.filter((f): f is number => typeof f === 'number' && f > 0);
        if (fretted.length === 0) continue;
        expect(Math.max(...fretted) - Math.min(...fretted), `${tuning.id} / ${v.id}`).toBeLessThanOrEqual(3);
      }
    }
  });

  it('на 7-струнной седьмая струна глушится, остальное — как на шестиструнной', () => {
    const am = voicing(byId('7-string-b'), 'am-open')!;
    expect(am.frets).toEqual(['x', 'x', 0, 2, 2, 1, 0]);
    expect(am.name).toBe('Am (Минор)');
  });

  it('на 12-струнной лад повторяется на обеих струнах хора', () => {
    const tuning = byId('12-string-std');
    const am = voicing(tuning, 'am-open')!;
    expect(am.frets).toEqual(['x', 'x', 0, 0, 2, 2, 2, 2, 1, 1, 0, 0]);
    expect(voicingCourseSize(tuning)).toBe(2);
  });

  it('у баса библиотеки нет — только открытые струны', () => {
    for (const id of ['bass-4', 'bass-5']) {
      const tuning = byId(id);
      expect(voicingLibraryKind(tuning)).toBeNull();
      expect(getVoicingsForTuning(tuning).map(v => v.id)).toEqual(['open-strings']);
      expect(getTriadVoicings('maj', tuning)).toEqual([]);
    }
  });

  it('у укулеле своя библиотека, одинаковая для gCEA и Low-G', () => {
    const high = getVoicingsForTuning(byId('ukulele-gcea'));
    const low = getVoicingsForTuning(byId('ukulele-low-g'));
    expect(high.length).toBe(UKULELE_VOICINGS.length + 1);
    expect(low.map(v => [v.id, v.name, v.frets.join()])).toEqual(high.map(v => [v.id, v.name, v.frets.join()]));
    expect(voicing(byId('ukulele-gcea'), 'uke-c')!.frets).toEqual([0, 0, 0, 3]);
  });

  it('аккорды укулеле записаны верно', () => {
    const tuning = byId('ukulele-gcea');
    for (const v of UKULELE_VOICINGS) {
      const formula = CHORD_FORMULAS.find(f => f.type === v.type)!;
      const pcs = intervalsFromRoot(v, tuning);
      // Каждая звучащая нота принадлежит аккорду, тоника и терция на месте.
      expect(pcs.every(pc => formula.intervals.map(i => i % 12).includes(pc)), v.id).toBe(true);
      expect(pcs, v.id).toContain(0);
      expect(pcs, v.id).toContain(formula.intervals[1]);
    }
  });

  it('трезвучия для тренажёра берутся из библиотеки строя', () => {
    const uke = getTriadVoicings('min', byId('ukulele-gcea'));
    expect(uke.length).toBeGreaterThan(0);
    expect(uke.every(v => v.id.startsWith('uke-') && v.type === 'min')).toBe(true);
  });

  it('ссылка принимает идентификаторы аппликатур всех инструментов', () => {
    expect(ALL_VOICING_IDS.has('am-open')).toBe(true);
    expect(ALL_VOICING_IDS.has('uke-c')).toBe(true);
    expect(ALL_VOICING_IDS.has('open-strings')).toBe(true);
    expect(ALL_VOICING_IDS.has('nope')).toBe(false);
  });
});

describe('Перебор на 12-струнной: струны в унисон (#5)', () => {
  it('нота засчитывается обеим струнам хора в унисон', () => {
    const tuning = byId('12-string-std');
    const open = getVoicingsForTuning(tuning)[0];
    const statuses = initChordStatuses(open, tuning);
    // Струны 9 и 10 (индексы 8 и 9) — обе B3, MIDI 59.
    const { updatedStatuses } = evaluateArpeggioNote(midiToFrequency(59), open, tuning, statuses);
    expect(updatedStatuses[8].status).toBe('in-tune');
    expect(updatedStatuses[9].status).toBe('in-tune');
    // Октавная пара E2/E3 различима: E2 не засчитывает E3.
    const afterE2 = evaluateArpeggioNote(midiToFrequency(40), open, tuning, statuses).updatedStatuses;
    expect(afterE2[0].status).toBe('in-tune');
    expect(afterE2[1].status).toBe('pending');
  });
});

describe('Обратный поиск аккорда с каподастром (#13)', () => {
  it('форма Am с капо на 2-м ладу — это Bm', () => {
    expect(detectChordFromFrets(['x', 0, 2, 2, 1, 0], DEFAULT_TUNING, 2)).toBe('Bm');
    expect(detectChordFromFrets(['x', 0, 2, 2, 1, 0], DEFAULT_TUNING, null)).toBe('Am');
  });
});
