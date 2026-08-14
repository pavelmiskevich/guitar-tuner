/**
 * Чтение пользовательских настроек из localStorage.
 *
 * Хранилище — внешние данные: его правит пользователь, чистят расширения,
 * туда попадают значения от старых версий приложения. Без проверки `Number(raw)`
 * тихо возвращает NaN, и он расползается по расчёту частот, а сломанный объект
 * строя падает уже в рендере грифа — далеко от места, где появился.
 */
import type { Tuning } from './tunings';

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
  if (!Array.isArray(t.strings) || t.strings.length < 1) return false;

  return t.strings.every(s => {
    if (typeof s !== 'object' || s === null) return false;
    const str = s as Record<string, unknown>;
    const open = str.open as Record<string, unknown> | undefined;
    if (typeof open !== 'object' || open === null) return false;
    return typeof open.midi === 'number' && Number.isFinite(open.midi);
  });
}

export function readNumberSetting(key: string, spec: NumberSettingSpec): number {
  if (typeof localStorage === 'undefined') return spec.fallback;
  try {
    return parseNumberSetting(localStorage.getItem(key), spec);
  } catch {
    return spec.fallback;
  }
}

export function readEnumSetting<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    return parseEnumSetting(localStorage.getItem(key), allowed, fallback);
  } catch {
    return fallback;
  }
}
