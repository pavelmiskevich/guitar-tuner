/**
 * Чистая логика метронома и драм-машины: темп, размеры с акцентами и расписание
 * долей по часам AudioContext. Без Web Audio и React — чтобы тайминг можно было
 * проверить модульными тестами, а не на слух.
 */

export const MIN_BPM = 40;
export const MAX_BPM = 260;
export const DEFAULT_BPM = 120;

/** Темп к целому в допустимых границах; мусор — к темпу по умолчанию. */
export function clampBpm(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BPM;
  return Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(value)));
}

export type AccentLevel = 'strong' | 'medium' | 'weak';

export interface Meter {
  id: string;
  /** Число долей (щелчков) в такте. */
  beats: number;
  /** Длительность доли: 4 — четверть, 8 — восьмая. */
  unit: 4 | 8;
  /** Сила каждой доли такта. */
  accents: readonly AccentLevel[];
}

function simpleMeter(beats: number): Meter {
  return {
    id: `${beats}/4`,
    beats,
    unit: 4,
    accents: Array.from({ length: beats }, (_, i) => (i === 0 ? 'strong' : 'weak'))
  };
}

/**
 * Размеры метронома. 6/8 — сложный размер: шесть восьмых группируются 3+3, и
 * вторая группа начинается с собственного (более слабого, чем первая доля)
 * акцента. В 6/4 так не делаем: его играют и 3+3, и 2+2+2, а прежнее поведение
 * (акцент только на первой) пользователи уже знают.
 *
 * Темп в 6/8 считается по щелчкам, то есть восьмыми: каждая подсвеченная точка
 * звучит с отображаемым BPM — так же, как в остальных размерах.
 */
export const METERS: readonly Meter[] = [
  simpleMeter(2),
  simpleMeter(3),
  simpleMeter(4),
  simpleMeter(6),
  {
    id: '6/8',
    beats: 6,
    unit: 8,
    accents: ['strong', 'weak', 'weak', 'medium', 'weak', 'weak']
  }
];

export const METER_IDS: readonly string[] = METERS.map(m => m.id);
export const DEFAULT_METER_ID = '4/4';

/** Размер по идентификатору; неизвестный — размер по умолчанию. */
export function findMeter(id: string): Meter {
  return METERS.find(m => m.id === id) ?? METERS.find(m => m.id === DEFAULT_METER_ID)!;
}

/** Сила доли по её номеру; номер может выходить за такт — берётся по модулю. */
export function accentAt(meter: Meter, step: number): AccentLevel {
  const index = ((step % meter.beats) + meter.beats) % meter.beats;
  return meter.accents[index];
}

/** Длительность доли метронома в секундах. */
export function beatInterval(bpm: number): number {
  return 60 / bpm;
}

/**
 * Длительность шага драм-машины: 12-шаговые паттерны (шаффл) идут триолями
 * восьмых, остальные — шестнадцатыми.
 */
export function drumStepInterval(bpm: number, stepsCount: number): number {
  return stepsCount === 12 ? beatInterval(bpm) / 3 : beatInterval(bpm) / 4;
}

/**
 * Насколько вперёд планировать доли. На виду хватает 100 мс: тики приходят
 * каждые 25 мс, а смена темпа и остановка слышны почти сразу. В скрытой вкладке
 * браузер может придержать тики до секунды и дольше — окно шире, чтобы между
 * тиками доли не кончались; менять темп там всё равно некому.
 */
export function lookaheadSeconds(hidden: boolean): number {
  return hidden ? 1.5 : 0.1;
}

/**
 * Насколько доля может опоздать, чтобы её ещё сыграть. Опоздавшую сильнее
 * пропускаем: иначе после задержки таймера все пропущенные доли прозвучали бы
 * разом, пачкой.
 */
export const LATE_TOLERANCE_SECONDS = 0.05;

/**
 * Часы долей. Хранится время последней запланированной доли, а не следующей:
 * следующая вычисляется по темпу в момент планирования, поэтому смена темпа
 * действует с ближайшей ещё не запланированной доли и не сбрасывает счёт.
 */
export interface BeatClock {
  /** Время первой доли (по часам AudioContext). */
  startTime: number;
  /** Время последней запланированной доли; null — ещё ни одной. */
  lastTime: number | null;
  /** Номер следующей доли в цикле (такте или паттерне). */
  step: number;
}

export function createBeatClock(startTime: number): BeatClock {
  return { startTime, lastTime: null, step: 0 };
}

export interface ScheduleRequest {
  /** Текущее время AudioContext. */
  now: number;
  /** Планировать доли строго раньше этого момента. */
  horizon: number;
  /** Интервал между долями при текущем темпе, с. */
  interval: number;
  /** Длина цикла: долей в такте или шагов в паттерне. */
  cycle: number;
}

export interface Tick {
  time: number;
  step: number;
}

/**
 * Доли, которые пора запланировать, и новое состояние часов. Уже
 * запланированные доли повторно не выдаются — двойных ударов не бывает.
 */
export function scheduleTicks(clock: BeatClock, req: ScheduleRequest): { ticks: Tick[]; clock: BeatClock } {
  const { now, horizon, interval } = req;
  const cycle = Math.max(1, Math.floor(req.cycle));
  if (!(interval > 0) || !Number.isFinite(interval)) return { ticks: [], clock };

  // Цикл мог укоротиться на ходу (сменили размер или паттерн).
  let step = clock.step % cycle;
  let lastTime = clock.lastTime;
  let time = lastTime === null ? clock.startTime : lastTime + interval;

  // Таймер опоздал (вкладка в фоне, долгая сборка мусора): пропущенные доли не
  // играем, но сдвигаем сетку и счёт, как если бы они прозвучали.
  const lateLimit = now - LATE_TOLERANCE_SECONDS;
  if (time < lateLimit) {
    const missed = Math.ceil((lateLimit - time) / interval);
    time += missed * interval;
    lastTime = time - interval;
    step = (step + missed) % cycle;
  }

  const ticks: Tick[] = [];
  while (time < horizon) {
    ticks.push({ time, step });
    lastTime = time;
    step = (step + 1) % cycle;
    time = lastTime + interval;
  }

  return { ticks, clock: { startTime: clock.startTime, lastTime, step } };
}
