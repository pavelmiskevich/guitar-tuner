/**
 * Захват удара для проверки аккорда (#4).
 *
 * Раньше кнопка 1,2 с крутила полосу и брала спектр в самом конце — когда
 * аккорд уже затух, а если пользователь ударил чуть позже нажатия, то тишину
 * или одну атаку. Теперь запись привязана к самому удару: ждём скачок уровня,
 * пропускаем атаку (её тон выше установившегося) и ждём, пока окно захвата
 * целиком заполнится звучащими струнами.
 */

/** Сколько пропустить после начала удара: атака звучит выше установившегося тона. */
export const STRUM_SETTLE_MS = 100;

/** Сколько ждать удара после нажатия кнопки. */
export const STRUM_WAIT_MS = 5000;

/**
 * Уровень, с которого звук считается ударом, dBFS. Гитара через микрофон
 * телефона даёт около −60, тишина в комнате — заметно ниже.
 */
export const STRUM_ONSET_DB = -62;

/** На сколько уровень должен подскочить над самым тихим кадром, чтобы это был удар, дБ. */
export const STRUM_RISE_DB = 8;

export type StrumCapturePhase = 'waiting' | 'recording' | 'ready' | 'timeout';

export interface StrumCaptureState {
  phase: StrumCapturePhase;
  /** Доля записанного окна, 0…1. */
  progress: number;
}

export class StrumCapture {
  private readonly startedAt: number;
  private readonly windowMs: number;
  private floorDb = Infinity;
  private onsetAt: number | null = null;
  private framesSeen = 0;

  /**
   * @param startedAt момент нажатия кнопки, мс
   * @param windowMs  длительность окна захвата движка, мс
   */
  constructor(startedAt: number, windowMs: number) {
    this.startedAt = startedAt;
    this.windowMs = windowMs;
  }

  /**
   * @param rmsDb уровень кадра, dBFS; null — кадра нет, только проверка времени
   * @param now   момент, мс
   */
  update(rmsDb: number | null, now: number): StrumCaptureState {
    if (this.onsetAt === null && rmsDb !== null) {
      // Звук, который уже идёт в первом кадре, — тоже удар: пользователь мог
      // ударить и сразу нажать кнопку.
      const isFirst = this.framesSeen === 0;
      this.framesSeen++;
      if (rmsDb >= STRUM_ONSET_DB && (isFirst || rmsDb >= this.floorDb + STRUM_RISE_DB)) {
        this.onsetAt = now;
      } else {
        this.floorDb = Math.min(this.floorDb, rmsDb);
      }
    }

    if (this.onsetAt === null) {
      return { phase: now - this.startedAt >= STRUM_WAIT_MS ? 'timeout' : 'waiting', progress: 0 };
    }

    const total = STRUM_SETTLE_MS + this.windowMs;
    const progress = Math.min(1, (now - this.onsetAt) / total);
    return { phase: progress >= 1 ? 'ready' : 'recording', progress };
  }
}
