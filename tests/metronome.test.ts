import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BPM,
  DEFAULT_METER_ID,
  LATE_TOLERANCE_SECONDS,
  MAX_BPM,
  METERS,
  METER_IDS,
  MIN_BPM,
  accentAt,
  beatInterval,
  clampBpm,
  createBeatClock,
  drumStepInterval,
  findMeter,
  lookaheadSeconds,
  scheduleTicks,
} from '../src/domain/metronome';

describe('метроном: расписание долей', () => {
  it('первая доля звучит в момент старта, дальше — с интервалом темпа', () => {
    const clock = createBeatClock(10);
    const { ticks } = scheduleTicks(clock, { now: 10, horizon: 11.6, interval: 0.5, cycle: 4 });
    expect(ticks).toEqual([
      { time: 10, step: 0 },
      { time: 10.5, step: 1 },
      { time: 11, step: 2 },
      { time: 11.5, step: 3 },
    ]);
  });

  it('повторный вызов не планирует уже запланированные доли второй раз', () => {
    let clock = createBeatClock(0);
    const first = scheduleTicks(clock, { now: 0, horizon: 0.6, interval: 0.5, cycle: 4 });
    clock = first.clock;
    const again = scheduleTicks(clock, { now: 0.05, horizon: 0.65, interval: 0.5, cycle: 4 });
    expect(first.ticks.map(t => t.time)).toEqual([0, 0.5]);
    expect(again.ticks).toEqual([]);
  });

  it('смена темпа не сбрасывает номер доли и сдвигает только будущие доли', () => {
    // 120 BPM: доли в 0, 0.5, 1.0 — это шаги 0, 1, 2.
    const before = scheduleTicks(createBeatClock(0), { now: 0, horizon: 1.05, interval: 0.5, cycle: 4 });
    expect(before.ticks).toEqual([
      { time: 0, step: 0 },
      { time: 0.5, step: 1 },
      { time: 1, step: 2 },
    ]);

    // Переключились на 60 BPM: уже сыгранное не трогаем, счёт идёт дальше
    // (шаг 3, а не 0), и новая доля отстоит от последней на новый интервал.
    const after = scheduleTicks(before.clock, { now: 1.05, horizon: 3.05, interval: 1, cycle: 4 });
    expect(after.ticks).toEqual([
      { time: 2, step: 3 },
      { time: 3, step: 0 },
    ]);
  });

  it('ускорение на ходу тоже действует со следующей доли, без двойного удара', () => {
    const slow = scheduleTicks(createBeatClock(0), { now: 0, horizon: 0.1, interval: 1, cycle: 4 });
    expect(slow.ticks).toEqual([{ time: 0, step: 0 }]);

    const fast = scheduleTicks(slow.clock, { now: 0.05, horizon: 0.9, interval: 0.25, cycle: 4 });
    expect(fast.ticks).toEqual([
      { time: 0.25, step: 1 },
      { time: 0.5, step: 2 },
      { time: 0.75, step: 3 },
    ]);
  });

  it('опоздавший таймер не выдаёт пачку пропущенных долей, но сохраняет сетку и счёт', () => {
    const start = scheduleTicks(createBeatClock(0), { now: 0, horizon: 0.1, interval: 0.5, cycle: 4 });
    // Вкладка «уснула» на 2.2 с: доли 0.5, 1.0, 1.5, 2.0 уже в прошлом.
    const late = scheduleTicks(start.clock, { now: 2.2, horizon: 2.6, interval: 0.5, cycle: 4 });
    expect(late.ticks).toEqual([{ time: 2.5, step: 1 }]);
  });

  it('долю, опоздавшую в пределах допуска, ещё играем', () => {
    const start = scheduleTicks(createBeatClock(0), { now: 0, horizon: 0.1, interval: 0.5, cycle: 4 });
    const now = 0.5 + LATE_TOLERANCE_SECONDS / 2;
    const slightlyLate = scheduleTicks(start.clock, { now, horizon: now + 0.1, interval: 0.5, cycle: 4 });
    expect(slightlyLate.ticks).toEqual([{ time: 0.5, step: 1 }]);
  });

  it('уменьшение длины цикла на ходу не выводит номер доли за такт', () => {
    let clock = createBeatClock(0);
    clock = scheduleTicks(clock, { now: 0, horizon: 2.6, interval: 0.5, cycle: 6 }).clock;
    expect(clock.step).toBe(0); // сыграны шаги 0..5, дальше снова 0
    clock = scheduleTicks(createBeatClock(0), { now: 0, horizon: 2.1, interval: 0.5, cycle: 6 }).clock;
    expect(clock.step).toBe(5);

    const { ticks } = scheduleTicks(clock, { now: 2.1, horizon: 3.1, interval: 0.5, cycle: 4 });
    for (const tick of ticks) expect(tick.step).toBeLessThan(4);
  });

  it('некорректный интервал не зацикливает планировщик', () => {
    const clock = createBeatClock(0);
    expect(scheduleTicks(clock, { now: 0, horizon: 1, interval: 0, cycle: 4 }).ticks).toEqual([]);
    expect(scheduleTicks(clock, { now: 0, horizon: 1, interval: Number.NaN, cycle: 4 }).ticks).toEqual([]);
  });
});

describe('метроном: размеры и акценты', () => {
  it('6/8 — шесть долей с группировкой 3+3: сильная на 1, акцент на 4', () => {
    const meter = findMeter('6/8');
    expect(meter.beats).toBe(6);
    expect(meter.unit).toBe(8);
    expect([0, 1, 2, 3, 4, 5].map(step => accentAt(meter, step))).toEqual([
      'strong', 'weak', 'weak', 'medium', 'weak', 'weak',
    ]);
  });

  it('простые размеры акцентируют только первую долю', () => {
    for (const id of ['2/4', '3/4', '4/4', '6/4'] as const) {
      const meter = findMeter(id);
      expect(accentAt(meter, 0)).toBe('strong');
      for (let step = 1; step < meter.beats; step++) expect(accentAt(meter, step)).toBe('weak');
    }
  });

  it('акцент вычисляется по номеру доли в такте, а не от начала игры', () => {
    const meter = findMeter('6/8');
    expect(accentAt(meter, 6)).toBe('strong');
    expect(accentAt(meter, 9)).toBe('medium');
  });

  it('у каждого размера число акцентов совпадает с числом долей', () => {
    for (const meter of METERS) expect(meter.accents).toHaveLength(meter.beats);
    expect(METER_IDS).toEqual(METERS.map(m => m.id));
    expect(METER_IDS).toContain(DEFAULT_METER_ID);
  });

  it('неизвестный размер даёт размер по умолчанию', () => {
    expect(findMeter('7/8').id).toBe(DEFAULT_METER_ID);
  });
});

describe('метроном: темп и шаги паттерна', () => {
  it('доля метронома — 60/BPM секунд', () => {
    expect(beatInterval(120)).toBeCloseTo(0.5);
    expect(beatInterval(60)).toBeCloseTo(1);
  });

  it('16-шаговый паттерн идёт шестнадцатыми, 12-шаговый — триолями', () => {
    expect(drumStepInterval(120, 16)).toBeCloseTo(0.125);
    expect(drumStepInterval(120, 12)).toBeCloseTo(0.5 / 3);
    // Полный круг 16-шагового паттерна — один такт 4/4.
    expect(drumStepInterval(120, 16) * 16).toBeCloseTo(2);
  });

  it('шаги паттерна идут по кругу и не сбиваются сменой темпа', () => {
    let clock = createBeatClock(0);
    const steps: number[] = [];
    // Полтора круга 12-шагового паттерна, на середине темп меняется.
    // Каждый вызов приходится ровно на момент очередного шага.
    for (let i = 0; i < 18; i++) {
      const interval = drumStepInterval(i < 9 ? 110 : 140, 12);
      const now = clock.lastTime === null ? 0 : clock.lastTime + interval;
      const result = scheduleTicks(clock, { now, horizon: now + 0.01, interval, cycle: 12 });
      expect(result.ticks).toHaveLength(1);
      steps.push(...result.ticks.map(t => t.step));
      clock = result.clock;
    }
    expect(steps).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5]);
  });

  it('темп приводится к целому в допустимых границах', () => {
    expect(clampBpm(87.4)).toBe(87);
    expect(clampBpm(10)).toBe(MIN_BPM);
    expect(clampBpm(1000)).toBe(MAX_BPM);
    expect(clampBpm(Number.NaN)).toBe(DEFAULT_BPM);
  });

  it('в скрытой вкладке окно упреждения шире секунды — переживает урезанные таймеры', () => {
    expect(lookaheadSeconds(false)).toBeLessThanOrEqual(0.15);
    expect(lookaheadSeconds(true)).toBeGreaterThan(1);
  });
});
