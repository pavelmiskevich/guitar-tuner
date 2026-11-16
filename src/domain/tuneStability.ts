/**
 * Устойчивость показаний тюнера.
 *
 * Сырая оценка высоты тона приходит ~30 раз в секунду и шумит: на атаке щипка
 * тон выше установившегося, детектор изредка ошибается на октаву, а при
 * подтяжке частота пролетает через цель за один кадр. Решать по одиночному
 * кадру, что струна настроена, нельзя — нужны сглаживание и удержание.
 */

/** Сколько струна должна непрерывно пробыть в допуске, чтобы считаться настроенной. */
export const IN_TUNE_HOLD_MS = 400;

/**
 * Пауза между оценками, после которой прежние данные считаются устаревшими.
 * Пара пропущенных кадров (провал чёткости на затухании) удержание не рвёт,
 * а новый щипок после тишины начинает отсчёт заново.
 */
export const MAX_FRAME_GAP_MS = 150;

/** Скользящая медиана: одиночный выброс не доходит до стрелки. */
export class MedianSmoother {
  private readonly size: number;
  private values: number[] = [];
  private lastAt = -Infinity;

  constructor(size = 5) {
    this.size = size;
  }

  push(value: number, now: number): number {
    if (now - this.lastAt > MAX_FRAME_GAP_MS) this.values = [];
    this.lastAt = now;

    this.values.push(value);
    if (this.values.length > this.size) this.values.shift();

    const sorted = [...this.values].sort((a, b) => a - b);
    // При чётном числе значений (пока окно наполняется) берём нижнее из двух
    // средних: тогда один выброс не проходит уже со второго кадра.
    return sorted[Math.floor((sorted.length - 1) / 2)];
  }

  reset(): void {
    this.values = [];
    this.lastAt = -Infinity;
  }
}

export interface InTuneHoldState {
  /** Струна удерживается в допуске дольше порога. */
  stable: boolean;
  /** Истинно ровно на одном обновлении — в момент перехода в устойчивое состояние. */
  justBecameStable: boolean;
}

/** Отслеживает непрерывное удержание в допуске для конкретной струны. */
export class InTuneHold {
  private readonly holdMs: number;
  private key: number | null = null;
  private since: number | null = null;
  private lastAt = -Infinity;
  private stable = false;

  constructor(holdMs = IN_TUNE_HOLD_MS) {
    this.holdMs = holdMs;
  }

  /**
   * @param key   идентификатор струны: смена струны начинает отсчёт заново
   * @param inTune попадает ли текущее отклонение в допуск
   * @param now   метка времени кадра, мс
   */
  update(key: number, inTune: boolean, now: number): InTuneHoldState {
    const stale = now - this.lastAt > MAX_FRAME_GAP_MS;
    this.lastAt = now;

    if (!inTune || stale || key !== this.key) {
      this.key = key;
      this.since = inTune ? now : null;
      this.stable = false;
      return { stable: false, justBecameStable: false };
    }

    if (this.since === null) this.since = now;

    const wasStable = this.stable;
    this.stable = now - this.since >= this.holdMs;
    return { stable: this.stable, justBecameStable: this.stable && !wasStable };
  }

  reset(): void {
    this.key = null;
    this.since = null;
    this.lastAt = -Infinity;
    this.stable = false;
  }
}
