import { describe, it, expect } from 'vitest';
import { InTuneHold, MedianSmoother, IN_TUNE_HOLD_MS, MAX_FRAME_GAP_MS } from '../src/domain/tuneStability';

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
