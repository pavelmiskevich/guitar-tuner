/**
 * Пользовательские строи в localStorage: проверка формы записи, чтение,
 * сохранение и удаление.
 *
 * Раньше это жило в `tunings.ts` рядом с данными пресетов, а проверка
 * `isValidTuning` — в `storage.ts`, который ради неё импортировал тип из
 * `tunings.ts`: два доменных модуля зависели друг от друга (#16). Теперь
 * `tunings.ts` — только данные и расчёты, `storage.ts` — только общий доступ
 * к хранилищу, а связывает их этот модуль.
 */
import type { Tuning } from './tunings';
import { NOTE_NAMES } from './notes';
import { INSTRUMENT_TYPES, MAX_STRING_MIDI, MIN_STRING_MIDI, STORAGE_KEYS, readSetting, writeSetting } from './storage';

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

export function loadSavedCustomTunings(): Tuning[] {
  const raw = readSetting(STORAGE_KEYS.customTunings);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Битую запись отбрасываем поштучно: одна испорченная строка в хранилище
    // не должна лишать пользователя остальных сохранённых строёв.
    return parsed.filter(isValidTuning);
  } catch {
    return [];
  }
}

/** Возвращает false, если хранилище недоступно или переполнено. */
export function saveCustomTuning(tuning: Tuning): boolean {
  const current = loadSavedCustomTunings().filter(t => t.id !== tuning.id);
  current.push(tuning);
  return writeSetting(STORAGE_KEYS.customTunings, JSON.stringify(current));
}

/** Возвращает false, если хранилище недоступно или переполнено. */
export function deleteCustomTuning(tuningId: string): boolean {
  const current = loadSavedCustomTunings().filter(t => t.id !== tuningId);
  return writeSetting(STORAGE_KEYS.customTunings, JSON.stringify(current));
}
