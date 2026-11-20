import type { StringTuningStatus } from '../audio/chordAnalyzer';

/**
 * Тексты для скринридера (#11): что озвучивается в aria-live-областях.
 *
 * Показания тюнера меняются тридцать раз в секунду, и озвучивать каждое —
 * значит заглушить пользователя. Поэтому здесь только смысл (подтянуть,
 * ослабить, в строе) и грубое отклонение, а частоту объявлений ограничивает
 * {@link AnnouncementThrottle}.
 */

/** «1 цент», «3 цента», «12 центов». */
export function centsWord(n: number): string {
  const abs = Math.abs(Math.trunc(n));
  const lastTwo = abs % 100;
  const last = abs % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return 'центов';
  if (last === 1) return 'цент';
  if (last >= 2 && last <= 4) return 'цента';
  return 'центов';
}

/** Шаг округления отклонения в озвучке: точнее на слух не нужно, а реже — меньше болтовни. */
export const SPOKEN_CENTS_STEP = 5;

export interface TunerAnnouncementInput {
  /** Есть ли сейчас распознанный тон (микрофон включён, звук не затих). */
  hasPitch: boolean;
  /** Нота струны с октавой в выбранной нотации, например «E2» или «Ми2». */
  noteLabel: string;
  cents: number;
  inTuneThreshold: number;
}

/**
 * Пустая строка — объявлять нечего (тишина). Отклонение округляется до
 * {@link SPOKEN_CENTS_STEP}: при подтяжке колка текст меняется не на каждом
 * центе, а ступенями.
 */
export function tunerAnnouncement({ hasPitch, noteLabel, cents, inTuneThreshold }: TunerAnnouncementInput): string {
  if (!hasPitch) return '';
  if (Math.abs(cents) <= inTuneThreshold) return `${noteLabel}: в строе`;
  const action = cents < 0 ? 'подтянуть' : 'ослабить';
  const rounded = Math.max(SPOKEN_CENTS_STEP, Math.round(Math.abs(cents) / SPOKEN_CENTS_STEP) * SPOKEN_CENTS_STEP);
  return `${noteLabel}: ${action}, на ${rounded} ${centsWord(rounded)}`;
}

/** Короткая подпись статуса струны в проверке аккорда — та же, что на плашке. */
export function chordStringStatusText(status: Pick<StringTuningStatus, 'status' | 'cents'> | undefined, isMuted: boolean): string {
  if (isMuted) return 'Глушится (X)';
  switch (status?.status) {
    case 'in-tune':
      return `В строе (${status.cents > 0 ? '+' : ''}${status.cents.toFixed(1)}¢)`;
    case 'low':
      return `Низко (${status.cents.toFixed(1)}¢)`;
    case 'high':
      return `Высоко (+${status.cents.toFixed(1)}¢)`;
    case 'not-played':
      return 'Не прозвучала';
    case 'unmeasured':
      return 'Отдельно не измеряется';
    default:
      return 'Ожидание';
  }
}

/** Та же подпись словами: «¢» и «+1.2» скринридеры читают невнятно. */
export function chordStringStatusSpoken(status: Pick<StringTuningStatus, 'status' | 'cents'>): string {
  const off = Math.round(Math.abs(status.cents));
  switch (status.status) {
    case 'in-tune':
      return 'в строе';
    case 'low':
      return `низко на ${off} ${centsWord(off)}`;
    case 'high':
      return `высоко на ${off} ${centsWord(off)}`;
    case 'not-played':
      return 'не прозвучала';
    case 'unmeasured':
      return 'отдельно не измеряется';
    default:
      return '';
  }
}

/**
 * Итог разбора удара: сколько струн в строе и какие нет. stringNumbers[i] —
 * номер струны (6, 5, …) для статуса с индексом i.
 */
export function strumSummaryAnnouncement(statuses: StringTuningStatus[], stringNumbers: number[]): string {
  const measured = statuses.filter(s => s.status === 'in-tune' || s.status === 'low' || s.status === 'high');
  const tuned = measured.filter(s => s.status === 'in-tune').length;
  const problems = statuses
    .map((s, i) => ({ s, n: stringNumbers[i] }))
    .filter(({ s }) => s.status === 'low' || s.status === 'high' || s.status === 'not-played')
    .map(({ s, n }) => `${n}-я ${chordStringStatusSpoken(s)}`);
  const head = `Удар разобран: в строе ${tuned} из ${measured.length}`;
  return problems.length > 0 ? `${head}. ${problems.join(', ')}` : head;
}

/**
 * Ограничитель частоты объявлений. Текст объявляется не чаще раза в
 * minIntervalMs; промежуточные значения, сменившиеся за это время,
 * пропускаются, и звучит последнее. Повтор того же текста не объявляется.
 *
 * Пустой текст (тишина) не объявляется и интервал не тратит, но забывает
 * прошлый текст: после паузы «в строе» по той же струне прозвучит снова.
 */
export class AnnouncementThrottle {
  private lastText = '';
  private lastAt = -Infinity;
  private readonly minIntervalMs: number;

  constructor(minIntervalMs: number) {
    this.minIntervalMs = minIntervalMs;
  }

  /** Через сколько мс объявить text, или null — объявлять нечего. */
  delayFor(text: string, now: number): number | null {
    if (text === this.lastText) return null;
    if (text === '') return 0;
    return Math.max(0, this.lastAt + this.minIntervalMs - now);
  }

  /** Текст объявлен (или очищен) в момент now. */
  commit(text: string, now: number): void {
    this.lastText = text;
    if (text !== '') this.lastAt = now;
  }
}
