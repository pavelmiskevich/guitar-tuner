import { describe, it, expect } from 'vitest';
import { analyzeChordStrum, chordProgress } from '../src/audio/chordAnalyzer';
import { getVoicingExpectedPitches, getVoicingsForTuning } from '../src/domain/chords';
import type { Voicing } from '../src/domain/chords';
import { midiToFrequency } from '../src/domain/notes';
import { DEFAULT_TUNING, TUNING_PRESETS } from '../src/domain/tunings';
import type { Tuning } from '../src/domain/tunings';

const SR = 48000;
const LENGTH = 32768; // столько отдаёт анализатор захвата: ~0,68 с

/** Детерминированный шум: тесты не должны зависеть от Math.random. */
function noise(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000 - 0.5;
  };
}

interface SynthOptions {
  /** Отклонение струны (индекс в строе) в центах. */
  detune?: Record<number, number>;
  /** Струны, которые не прозвучали. */
  silent?: number[];
  /** Негармоничность: как в модели строя (true) или идеальные гармоники (false). */
  inharmonic?: boolean;
  noiseDb?: number;
}

/** Синтетический удар: каждая звучащая струна — затухающие партиалы с амплитудой 1/h. */
function strum(voicing: Voicing, tuning: Tuning, opts: SynthOptions = {}): Float32Array {
  const out = new Float32Array(LENGTH);
  const expected = getVoicingExpectedPitches(voicing, tuning);
  expected.forEach((pitch, idx) => {
    if (!pitch || opts.silent?.includes(idx)) return;
    const f0 = midiToFrequency(pitch.midi) * Math.pow(2, (opts.detune?.[idx] ?? 0) / 1200);
    const b = opts.inharmonic === false ? 0 : tuning.strings[idx].inharmonicityB ?? 0;
    for (let h = 1; h <= 10; h++) {
      const f = h * f0 * Math.sqrt(1 + b * h * h);
      if (f > SR / 2) break;
      const w = (2 * Math.PI * f) / SR;
      const amp = 0.05 / h;
      const decay = 1.5 + 0.4 * h; // верхние партиалы гаснут быстрее
      const phase = idx * 0.7 + h;
      for (let i = 0; i < LENGTH; i++) {
        out[i] += amp * Math.exp((-decay * i) / SR) * Math.sin(w * i + phase);
      }
    }
  });
  if (opts.noiseDb !== undefined) {
    const rnd = noise(42);
    const level = Math.pow(10, opts.noiseDb / 20) * 2;
    for (let i = 0; i < LENGTH; i++) out[i] += level * rnd();
  }
  return out;
}

const voicing = (tuning: Tuning, id: string) => {
  const v = getVoicingsForTuning(tuning).find(x => x.id === id);
  if (!v) throw new Error(`нет аппликатуры ${id}`);
  return v;
};

const byId = (id: string) => TUNING_PRESETS.find(t => t.id === id)!;

describe('Проверка аккорда по удару (#4)', () => {
  const am = voicing(DEFAULT_TUNING, 'am-open'); // x02210: A2 E3 A3 C4 E4

  it('аккорд в строе: все измеримые струны «в строе» с точностью до пары центов', () => {
    const statuses = analyzeChordStrum(strum(am, DEFAULT_TUNING), SR, am, DEFAULT_TUNING, 5);
    expect(statuses[0].status).toBe('muted');
    for (const idx of [1, 2, 4]) {
      expect(statuses[idx].status).toBe('in-tune');
      expect(Math.abs(statuses[idx].cents)).toBeLessThan(1.5);
    }
    expect(chordProgress(statuses).complete).toBe(true);
  });

  it('струна на −15¢ отмечена «низко» с верной величиной', () => {
    const statuses = analyzeChordStrum(strum(am, DEFAULT_TUNING, { detune: { 4: -15 } }), SR, am, DEFAULT_TUNING, 5);
    expect(statuses[4].status).toBe('low');
    expect(statuses[4].cents).toBeGreaterThan(-17);
    expect(statuses[4].cents).toBeLessThan(-13);
    expect(statuses[1].status).toBe('in-tune');
    expect(chordProgress(statuses).complete).toBe(false);
  });

  it('струна на +8¢ отмечена «высоко»', () => {
    const statuses = analyzeChordStrum(strum(am, DEFAULT_TUNING, { detune: { 1: 8 } }), SR, am, DEFAULT_TUNING, 5);
    expect(statuses[1].status).toBe('high');
    expect(statuses[1].cents).toBeGreaterThan(6);
    expect(statuses[1].cents).toBeLessThan(10);
  });

  it('непрозвучавшая струна — «не прозвучала», а не «в строе»', () => {
    const statuses = analyzeChordStrum(strum(am, DEFAULT_TUNING, { silent: [4] }), SR, am, DEFAULT_TUNING, 5);
    expect(statuses[4].status).toBe('not-played');
    expect(statuses[1].status).toBe('in-tune');
  });

  it('струна, дублирующая другую через октаву, отдельно не измеряется', () => {
    // A3 = 2·A2 и E4 = 2·E3: все их партиалы совпадают с партиалами нижних струн.
    const statuses = analyzeChordStrum(strum(am, DEFAULT_TUNING), SR, am, DEFAULT_TUNING, 5);
    expect(statuses[3].status).toBe('unmeasured');
    expect(statuses[5].status).toBe('unmeasured');
  });

  it('тишина: ни одна струна не «в строе»', () => {
    const statuses = analyzeChordStrum(new Float32Array(LENGTH), SR, am, DEFAULT_TUNING, 5);
    for (const s of statuses) expect(['muted', 'not-played', 'unmeasured']).toContain(s.status);
  });

  it('шум не мешает: −15¢ различимы при шуме на −50 дБ', () => {
    const statuses = analyzeChordStrum(
      strum(am, DEFAULT_TUNING, { detune: { 2: -15 }, noiseDb: -50 }),
      SR, am, DEFAULT_TUNING, 5
    );
    expect(statuses[2].status).toBe('low');
    expect(statuses[1].status).toBe('in-tune');
  });

  it('идеальные гармоники без негармоничности тоже в строе', () => {
    const statuses = analyzeChordStrum(strum(am, DEFAULT_TUNING, { inharmonic: false }), SR, am, DEFAULT_TUNING, 5);
    for (const idx of [1, 2, 4]) expect(statuses[idx].status).toBe('in-tune');
  });

  it('открытые струны: E2 и A2 больше не сливаются', () => {
    const open = getVoicingsForTuning(DEFAULT_TUNING)[0];
    const statuses = analyzeChordStrum(strum(open, DEFAULT_TUNING, { detune: { 1: -10 } }), SR, open, DEFAULT_TUNING, 5);
    expect(statuses[0].status).toBe('in-tune');
    expect(statuses[1].status).toBe('low');
  });

  it('на 12-струнной верхняя струна октавной пары отдельно не измеряется', () => {
    const tuning = byId('12-string-std');
    const open = getVoicingsForTuning(tuning)[0];
    const statuses = analyzeChordStrum(strum(open, tuning), SR, open, tuning, 5);
    expect(statuses[0].status).toBe('in-tune'); // E2
    expect(statuses[1].status).toBe('unmeasured'); // E3
    // Унисонные B3/B3 получают один и тот же замер.
    expect(statuses[8].status).toBe(statuses[9].status);
  });
});
