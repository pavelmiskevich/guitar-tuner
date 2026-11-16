import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  STORAGE_KEYS,
  STORAGE_VERSION,
  migrateStorage,
  readEnumSetting,
  readNumberSetting,
  readSetting,
  writeSetting
} from '../src/domain/storage';
import { deleteCustomTuning, loadSavedCustomTunings, saveCustomTuning, DEFAULT_TUNING } from '../src/domain/tunings';
import { copyToClipboard } from '../src/ui/clipboard';

/** Минимальная реализация Storage поверх Map. */
function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, String(v)); },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => data.clear()
  };
}

/** Хранилище, где каждый метод бросает — как при переполненной квоте или запрете. */
function throwingStorage(): Storage {
  const fail = () => { throw new DOMException('denied', 'SecurityError'); };
  return { length: 0, key: fail, getItem: fail, setItem: fail, removeItem: fail, clear: fail };
}

/** Само обращение к `localStorage` бросает — так ведёт себя браузер, где данные сайтов запрещены. */
function denyStorageAccess() {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { throw new DOMException('The operation is insecure.', 'SecurityError'); }
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  // denyStorageAccess определяет свойство напрямую — снимаем его вручную.
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

describe('Хранилище недоступно', () => {
  it('чтение и запись не бросают, если само обращение к localStorage запрещено', () => {
    denyStorageAccess();
    expect(readSetting(STORAGE_KEYS.tuning)).toBeNull();
    expect(writeSetting(STORAGE_KEYS.tuning, 'drop-d')).toBe(false);
    expect(readNumberSetting(STORAGE_KEYS.a4, { fallback: 440, min: 415, max: 466 })).toBe(440);
    expect(readEnumSetting(STORAGE_KEYS.theme, ['night', 'day'] as const, 'night')).toBe('night');
    expect(() => migrateStorage()).not.toThrow();
  });

  it('чтение и запись не бросают, если бросают методы хранилища', () => {
    vi.stubGlobal('localStorage', throwingStorage());
    expect(readSetting(STORAGE_KEYS.tuning)).toBeNull();
    expect(writeSetting(STORAGE_KEYS.tuning, 'drop-d')).toBe(false);
    expect(loadSavedCustomTunings()).toEqual([]);
    expect(saveCustomTuning({ ...DEFAULT_TUNING, id: 'mine', isCustom: true })).toBe(false);
    expect(deleteCustomTuning('mine')).toBe(false);
    expect(() => migrateStorage()).not.toThrow();
  });

  it('без localStorage вовсе (не браузер) возвращает значения по умолчанию', () => {
    expect(readSetting(STORAGE_KEYS.tuning)).toBeNull();
    expect(writeSetting(STORAGE_KEYS.tuning, 'x')).toBe(false);
  });
});

describe('Хранилище доступно', () => {
  it('записывает и читает значение', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    expect(writeSetting(STORAGE_KEYS.a4, '432')).toBe(true);
    expect(readSetting(STORAGE_KEYS.a4)).toBe('432');
  });

  it('сохраняет и удаляет пользовательский строй под новым ключом', () => {
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    const mine = { ...DEFAULT_TUNING, id: 'mine', name: 'Мой', isCustom: true };

    expect(saveCustomTuning(mine)).toBe(true);
    expect(storage.getItem(STORAGE_KEYS.customTunings)).toContain('Мой');
    expect(loadSavedCustomTunings().map(t => t.id)).toEqual(['mine']);

    expect(deleteCustomTuning('mine')).toBe(true);
    expect(loadSavedCustomTunings()).toEqual([]);
  });
});

describe('Миграция ключей хранилища', () => {
  it('переносит старые ключи под общий префикс и ставит версию', () => {
    const storage = memoryStorage({
      night_rehearsal_custom_tunings: '[{"id":"x"}]',
      nr_ear_best_streak: '7',
      gt_a4: '432'
    });
    vi.stubGlobal('localStorage', storage);

    migrateStorage();

    expect(storage.getItem(STORAGE_KEYS.customTunings)).toBe('[{"id":"x"}]');
    expect(storage.getItem(STORAGE_KEYS.earBestStreak)).toBe('7');
    expect(storage.getItem('night_rehearsal_custom_tunings')).toBeNull();
    expect(storage.getItem('nr_ear_best_streak')).toBeNull();
    expect(storage.getItem(STORAGE_KEYS.version)).toBe(String(STORAGE_VERSION));
    // Ключи, которые и так были в новой схеме, не трогаются.
    expect(storage.getItem(STORAGE_KEYS.a4)).toBe('432');
  });

  it('не затирает значение, уже записанное под новым ключом', () => {
    const storage = memoryStorage({
      nr_ear_best_streak: '3',
      gt_ear_best_streak: '12'
    });
    vi.stubGlobal('localStorage', storage);

    migrateStorage();

    expect(storage.getItem(STORAGE_KEYS.earBestStreak)).toBe('12');
    expect(storage.getItem('nr_ear_best_streak')).toBeNull();
  });

  it('на текущей версии ничего не делает', () => {
    const storage = memoryStorage({
      gt_storage_version: String(STORAGE_VERSION),
      nr_ear_best_streak: '3'
    });
    vi.stubGlobal('localStorage', storage);

    migrateStorage();

    expect(storage.getItem('nr_ear_best_streak')).toBe('3');
    expect(storage.getItem(STORAGE_KEYS.earBestStreak)).toBeNull();
  });

  it('на чистом хранилище только ставит версию', () => {
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);

    migrateStorage();

    expect(storage.length).toBe(1);
    expect(storage.getItem(STORAGE_KEYS.version)).toBe(String(STORAGE_VERSION));
  });
});

describe('Копирование в буфер обмена', () => {
  it('сообщает об успехе, когда Clipboard API записал текст', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await expect(copyToClipboard('https://example.test/')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://example.test/');
  });

  it('сообщает о неудаче, когда в записи отказано и запасного пути нет', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });

    await expect(copyToClipboard('x')).resolves.toBe(false);
  });

  it('сообщает о неудаче, когда Clipboard API отсутствует (HTTP, WebView)', async () => {
    vi.stubGlobal('navigator', {});

    await expect(copyToClipboard('x')).resolves.toBe(false);
  });
});
