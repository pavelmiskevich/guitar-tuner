/**
 * Чтение пользовательских настроек из localStorage.
 *
 * Хранилище — внешние данные: его правит пользователь, чистят расширения,
 * туда попадают значения от старых версий приложения. Без проверки `Number(raw)`
 * тихо возвращает NaN, и он расползается по расчёту частот, а сломанный объект
 * строя падает уже в рендере грифа — далеко от места, где появился.
 */
import type { Tuning } from './tunings';
import { NOTE_NAMES } from './notes';

/** Допустимые инструменты строя (совпадает с InstrumentType в domain/tunings). */
export const INSTRUMENT_TYPES = ['guitar', 'bass', 'ukulele', 'guitar7', 'guitar12'] as const;

/** Диапазон MIDI открытой струны — от C0 до C8, как при разборе ссылки. */
export const MIN_STRING_MIDI = 12;
export const MAX_STRING_MIDI = 108;

export interface NumberSettingSpec {
  fallback: number;
  min: number;
  max: number;
}

/** Число из хранилища в заданных границах, иначе значение по умолчанию. */
export function parseNumberSetting(raw: string | null, spec: NumberSettingSpec): number {
  if (raw === null || raw.trim() === '') return spec.fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return spec.fallback;
  if (value < spec.min || value > spec.max) return spec.fallback;
  return value;
}

/** Значение из фиксированного набора, иначе значение по умолчанию. */
export function parseEnumSetting<T extends string>(raw: string | null, allowed: readonly T[], fallback: T): T {
  return raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

/** Проверка формы сохранённого строя: одна битая запись не должна ронять приложение. */
export function isValidTuning(value: unknown): value is Tuning {
  if (typeof value !== 'object' || value === null) return false;
  const t = value as Record<string, unknown>;

  if (typeof t.id !== 'string' || t.id === '') return false;
  if (typeof t.name !== 'string') return false;
  if (typeof t.instrument !== 'string' || !(INSTRUMENT_TYPES as readonly string[]).includes(t.instrument)) return false;
  if (!Array.isArray(t.strings) || t.strings.length < 1 || t.strings.length > 12) return false;

  // Те же границы, что при разборе строя из ссылки (domain/deepLink).
  return t.strings.every(s => {
    if (typeof s !== 'object' || s === null) return false;
    const str = s as Record<string, unknown>;
    const open = str.open as Record<string, unknown> | undefined;
    if (typeof open !== 'object' || open === null) return false;
    return (
      typeof open.midi === 'number' &&
      Number.isInteger(open.midi) &&
      open.midi >= MIN_STRING_MIDI &&
      open.midi <= MAX_STRING_MIDI &&
      typeof open.name === 'string' &&
      (NOTE_NAMES as string[]).includes(open.name) &&
      typeof open.octave === 'number' &&
      Number.isFinite(open.octave)
    );
  });
}

/**
 * Все ключи приложения в одном месте и с одним префиксом. Раньше их было три
 * схемы (`gt_*`, `night_rehearsal_*`, `nr_*`), и при смене формата было не
 * понять, какие записи наши.
 */
export const STORAGE_KEYS = {
  tuning: 'gt_tuning',
  a4: 'gt_a4',
  notation: 'gt_notation',
  threshold: 'gt_threshold',
  theme: 'gt_theme',
  customTunings: 'gt_custom_tunings',
  earBestStreak: 'gt_ear_best_streak',
  metronomeBpm: 'gt_metronome_bpm',
  metronomeMeter: 'gt_metronome_meter',
  version: 'gt_storage_version'
} as const;

/** Версия формата хранилища. Поднимать вместе с новым шагом в `migrateStorage`. */
export const STORAGE_VERSION = 1;

/** Ключи до версии 1 → их новые имена. */
const LEGACY_KEYS_V1: Record<string, string> = {
  night_rehearsal_custom_tunings: STORAGE_KEYS.customTunings,
  nr_ear_best_streak: STORAGE_KEYS.earBestStreak
};

/**
 * Хранилище или null, если оно недоступно. Само обращение к `localStorage`
 * бросает SecurityError, когда данные сайтов запрещены, — поэтому даже
 * проверка `typeof` должна стоять внутри `try`.
 */
function getStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Строка из хранилища; null — если записи нет или хранилище недоступно. */
export function readSetting(key: string): string | null {
  try {
    return getStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/**
 * Запись в хранилище. Не бросает: переполненная квота или запрет доступа не
 * должны ронять интерфейс — настройка просто не переживёт перезагрузку.
 * Возвращает true, если запись удалась.
 */
export function writeSetting(key: string, value: string): boolean {
  const storage = getStorage();
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function readNumberSetting(key: string, spec: NumberSettingSpec): number {
  return parseNumberSetting(readSetting(key), spec);
}

export function readEnumSetting<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  return parseEnumSetting(readSetting(key), allowed, fallback);
}

/**
 * Приводит хранилище к текущей версии формата. Вызывается один раз до первого
 * рендера. Старое значение переносится, только если под новым именем ничего
 * нет, — уже записанное новой версией не затирается.
 */
export function migrateStorage(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    const version = Number(storage.getItem(STORAGE_KEYS.version) ?? '0');
    if (version >= STORAGE_VERSION) return;

    for (const [legacy, current] of Object.entries(LEGACY_KEYS_V1)) {
      const value = storage.getItem(legacy);
      if (value === null) continue;
      if (storage.getItem(current) === null) storage.setItem(current, value);
      storage.removeItem(legacy);
    }
    storage.setItem(STORAGE_KEYS.version, String(STORAGE_VERSION));
  } catch {
    // Не удалось — попробуем при следующем запуске; старые ключи на месте.
  }
}
