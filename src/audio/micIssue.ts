import { MicInterruptedError } from './audioEngine';

/**
 * Что случилось с микрофоном — с точки зрения пользователя.
 *
 * Раньше любая ошибка показывалась одинаково («Нет доступа к микрофону»),
 * и человек, у которого микрофон просто занят звонком, искал в настройках
 * браузера разрешение, которое у него и так есть.
 */
export type MicIssue =
  /** Отказ в доступе: пользователь или политика браузера. */
  | 'denied'
  /** Микрофон занят другим приложением или не смог стартовать. */
  | 'busy'
  /** Устройства нет или оно не подходит. */
  | 'not-found'
  /** На этой странице браузер не даёт микрофон вовсе (нет HTTPS, встроенный браузер). */
  | 'unsupported'
  /** Работавший поток оборвался. */
  | 'interrupted'
  /** Всё остальное. */
  | 'failed';

export function classifyMicError(error: Error | null): MicIssue | null {
  if (!error) return null;
  if (error instanceof MicInterruptedError) return 'interrupted';
  switch (error.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'denied';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'busy';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'not-found';
    case 'NotSupportedError':
      return 'unsupported';
    default:
      return 'failed';
  }
}
