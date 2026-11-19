import { describe, it, expect } from 'vitest';
import {
  InTuneHold,
  MedianSmoother,
  SteadyPitchGate,
  IN_TUNE_HOLD_MS,
  MAX_FRAME_GAP_MS,
  STEADY_HOLD_MS,
  STEADY_TOLERANCE_CENTS
} from '../src/domain/tuneStability';

const FRAME = 33;

describe('MedianSmoother', () => {
  it('первый кадр отдаёт как есть — отклик без задержки', () => {
    const s = new MedianSmoother();
    expect(s.push(82.4, 0)).toBe(82.4);
  });

  it('гасит одиночный выброс (октавная ошибка детектора)', () => {
    const s = new MedianSmoother();
    let t = 0;
    s.push(82.4, t);
    s.push(82.5, (t += FRAME));
    s.push(82.4, (t += FRAME));
    expect(s.push(164.8, (t += FRAME))).toBeCloseTo(82.4, 1);
    expect(s.push(82.4, (t += FRAME))).toBeCloseTo(82.4, 1);
  });

  it('выброс на втором кадре тоже не проходит', () => {
    const s = new MedianSmoother();
    s.push(82.4, 0);
    expect(s.push(164.8, FRAME)).toBe(82.4);
  });

  it('следует за настоящей сменой ноты за несколько кадров', () => {
    const s = new MedianSmoother();
    let t = 0;
    for (let i = 0; i < 5; i++) s.push(82.4, (t += FRAME));
    let out = 0;
    for (let i = 0; i < 3; i++) out = s.push(110, (t += FRAME));
    expect(out).toBe(110);
  });

  it('после паузы начинает с чистого листа', () => {
    const s = new MedianSmoother();
    let t = 0;
    for (let i = 0; i < 5; i++) s.push(82.4, (t += FRAME));
    expect(s.push(110, t + MAX_FRAME_GAP_MS + 1)).toBe(110);
  });
});

describe('InTuneHold', () => {
  it('одиночный кадр в допуске не делает струну настроенной', () => {
    const h = new InTuneHold();
    expect(h.update(0, true, 0)).toEqual({ stable: false, justBecameStable: false });
  });

  it('пролёт через цель во время подтяжки не засчитывается', () => {
    const h = new InTuneHold();
    let t = 0;
    h.update(0, false, t);
    h.update(0, true, (t += FRAME));
    h.update(0, true, (t += FRAME));
    const res = h.update(0, false, (t += FRAME));
    expect(res.stable).toBe(false);
  });

  it('становится устойчивой после удержания и сообщает об этом ровно один раз', () => {
    const h = new InTuneHold();
    let fired = 0;
    let last = { stable: false, justBecameStable: false };
    for (let t = 0; t <= IN_TUNE_HOLD_MS + 10 * FRAME; t += FRAME) {
      last = h.update(0, true, t);
      if (last.justBecameStable) fired++;
      if (t < IN_TUNE_HOLD_MS) expect(last.stable).toBe(false);
    }
    expect(last.stable).toBe(true);
    expect(fired).toBe(1);
  });

  it('выход из допуска сбрасывает удержание, повторный вход считается заново', () => {
    const h = new InTuneHold();
    let t = 0;
    for (; t <= IN_TUNE_HOLD_MS + FRAME; t += FRAME) h.update(0, true, t);
    expect(h.update(0, false, (t += FRAME)).stable).toBe(false);
    expect(h.update(0, true, (t += FRAME)).stable).toBe(false);

    let fired = 0;
    const end = t + IN_TUNE_HOLD_MS + FRAME;
    for (t += FRAME; t <= end; t += FRAME) {
      if (h.update(0, true, t).justBecameStable) fired++;
    }
    expect(fired).toBe(1);
  });

  it('смена струны начинает отсчёт заново', () => {
    const h = new InTuneHold();
    let t = 0;
    for (; t <= IN_TUNE_HOLD_MS + FRAME; t += FRAME) h.update(0, true, t);
    expect(h.update(1, true, (t += FRAME)).stable).toBe(false);
  });

  it('тишина дольше допустимой паузы не даёт засчитать старое удержание', () => {
    const h = new InTuneHold();
    let t = 0;
    for (; t < IN_TUNE_HOLD_MS - FRAME; t += FRAME) h.update(0, true, t);
    // Секунда тишины, затем один кадр в допуске: по часам прошло больше порога,
    // но непрерывного удержания не было.
    expect(h.update(0, true, t + 1000).stable).toBe(false);
  });

  it('короткий провал внутри удержания не мешает засчитать струну', () => {
    const h = new InTuneHold();
    let t = 0;
    let stable = false;
    for (; t <= IN_TUNE_HOLD_MS + FRAME * 3; t += FRAME) {
      if (t === FRAME * 5 || t === FRAME * 6) continue; // два кадра без оценки
      stable = h.update(0, true, t).stable;
    }
    expect(stable).toBe(true);
  });
});

describe('SteadyPitchGate (#29)', () => {
  const FRAME = 33; // ~30 кадров в секунду
  const cents = (f: number, c: number) => f * Math.pow(2, c / 1200);

  /** Подаёт ровный тон и возвращает последний выход ворот и момент первого открытия. */
  function feed(gate: SteadyPitchGate, freq: number | ((i: number) => number), from: number, frames: number) {
    let out: number | null = null;
    let firstOpenAt: number | null = null;
    for (let i = 0; i < frames; i++) {
      const t = from + i * FRAME;
      out = gate.push(typeof freq === 'number' ? freq : freq(i), t);
      if (out !== null && firstOpenAt === null) firstOpenAt = t;
    }
    return { out, firstOpenAt, end: from + frames * FRAME };
  }

  it('пропускает ровный тон только после удержания', () => {
    const gate = new SteadyPitchGate();
    const { out, firstOpenAt } = feed(gate, 110, 0, 20);
    expect(firstOpenAt).not.toBeNull();
    expect(firstOpenAt!).toBeGreaterThanOrEqual(STEADY_HOLD_MS);
    expect(out).toBeCloseTo(110, 6);
  });

  it('не пропускает переходные кадры на смене ноты', () => {
    const gate = new SteadyPitchGate();
    const a = feed(gate, 110, 0, 20);
    // Три кадра смеси двух нот, затем новая нота. Наружу не выходит ни одно
    // переходное значение: ворота закрыты или ещё отдают точную старую ноту.
    const mixed = [112, 125, 140];
    for (let i = 0; i < mixed.length; i++) {
      const out = gate.push(mixed[i], a.end + i * FRAME);
      if (out !== null) expect(out).toBeCloseTo(110, 6);
    }
    const b = feed(gate, 146.83, a.end + mixed.length * FRAME, 20);
    expect(b.out).toBeCloseTo(146.83, 6);
    expect(b.firstOpenAt! - a.end).toBeGreaterThanOrEqual(STEADY_HOLD_MS);
  });

  it('не пропускает дрейф затухания', () => {
    const gate = new SteadyPitchGate();
    const a = feed(gate, 110, 0, 20);
    // Затухание: тон уползает вверх на 2¢ за кадр — до +16¢.
    const tail = feed(gate, i => cents(110, 2 * (i + 1)), a.end, 8);
    // Ворота либо закрыты, либо отдают значение в пределах допуска от ровного тона.
    if (tail.out !== null) {
      expect(Math.abs(1200 * Math.log2(tail.out / 110))).toBeLessThanOrEqual(STEADY_TOLERANCE_CENTS);
    }
    for (let i = 3; i < 8; i++) {
      // Дальше половины затухания ворота уже закрыты.
      expect(gate.push(cents(110, 2 * (i + 9)), tail.end + i * FRAME)).toBeNull();
    }
  });

  it('одиночный выброс октавы не закрывает ворота', () => {
    const gate = new SteadyPitchGate();
    const a = feed(gate, 110, 0, 20);
    expect(gate.push(220, a.end)).toBeCloseTo(110, 6);
    expect(gate.push(110, a.end + FRAME)).toBeCloseTo(110, 6);
  });

  it('пауза начинает отсчёт заново', () => {
    const gate = new SteadyPitchGate();
    const a = feed(gate, 110, 0, 20);
    expect(gate.push(110, a.end + MAX_FRAME_GAP_MS + 50)).toBeNull();
  });

  it('reset закрывает ворота', () => {
    const gate = new SteadyPitchGate();
    const a = feed(gate, 110, 0, 20);
    gate.reset();
    expect(gate.push(110, a.end)).toBeNull();
  });
});
