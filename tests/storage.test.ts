import { describe, it, expect } from 'vitest';
import { parseNumberSetting, parseEnumSetting, isValidTuning } from '../src/domain/storage';
import { DEFAULT_TUNING, TUNING_PRESETS, findClosestString } from '../src/domain/tunings';
import { midiToFrequency } from '../src/domain/notes';

const A4 = { fallback: 440, min: 415, max: 466 };

describe('Настройки из localStorage: числа', () => {
  it('принимает корректное значение в границах', () => {
    expect(parseNumberSetting('432', A4)).toBe(432);
    expect(parseNumberSetting('415', A4)).toBe(415);
    expect(parseNumberSetting('466', A4)).toBe(466);
  });

  it('возвращает значение по умолчанию для мусора', () => {
    expect(parseNumberSetting('abc', A4)).toBe(440);
    expect(parseNumberSetting('', A4)).toBe(440);
    expect(parseNumberSetting('   ', A4)).toBe(440);
    expect(parseNumberSetting(null, A4)).toBe(440);
    expect(parseNumberSetting('NaN', A4)).toBe(440);
    expect(parseNumberSetting('Infinity', A4)).toBe(440);
  });

  it('отбрасывает значения вне допустимого диапазона', () => {
    expect(parseNumberSetting('0', A4)).toBe(440);
    expect(parseNumberSetting('-440', A4)).toBe(440);
    expect(parseNumberSetting('100000', A4)).toBe(440);
  });
});

describe('Настройки из localStorage: перечисления', () => {
  const systems = ['english', 'german', 'solfege'] as const;

  it('принимает известное значение', () => {
    expect(parseEnumSetting('german', systems, 'english')).toBe('german');
  });

  it('заменяет неизвестное значение на значение по умолчанию', () => {
    expect(parseEnumSetting('klingon', systems, 'english')).toBe('english');
    expect(parseEnumSetting(null, systems, 'english')).toBe('english');
  });
});

describe('Подбор ближайшей струны', () => {
  const bass5 = TUNING_PRESETS.find(t => t.id === 'bass-5')!;

  it('находит струну, когда играют точно её ноту', () => {
    for (const str of DEFAULT_TUNING.strings) {
      const freq = midiToFrequency(str.open.midi, 440);
      expect(findClosestString(freq, DEFAULT_TUNING.strings).open.midi).toBe(str.open.midi);
    }
  });

  it('меряет расстояние в центах, а не в герцах', () => {
    // 260 центов выше B0 (30.87 Гц) — по слуху ближе к E1 (осталось 240 центов),
    // но в герцах ближе к B0 (4.99 Гц против 5.34). Логарифмическая мера решает верно.
    const freq = midiToFrequency(23, 440) * Math.pow(2, 260 / 1200);

    expect(findClosestString(freq, bass5.strings).open.midi).toBe(28);
  });

  it('учитывает эталон A4', () => {
    const e2at432 = midiToFrequency(40, 432);
    expect(findClosestString(e2at432, DEFAULT_TUNING.strings, 432).open.midi).toBe(40);
  });
});

describe('Настройки из localStorage: строи', () => {
  it('признаёт корректный строй', () => {
    expect(isValidTuning(DEFAULT_TUNING)).toBe(true);
    expect(isValidTuning(JSON.parse(JSON.stringify(DEFAULT_TUNING)))).toBe(true);
  });

  it('отвергает повреждённые записи', () => {
    expect(isValidTuning(null)).toBe(false);
    expect(isValidTuning('standard-e')).toBe(false);
    expect(isValidTuning({})).toBe(false);
    expect(isValidTuning({ id: 'x', name: 'X' })).toBe(false);
    expect(isValidTuning({ id: 'x', name: 'X', strings: [] })).toBe(false);
    expect(isValidTuning({ id: 'x', name: 'X', strings: [{ index: 1 }] })).toBe(false);
    expect(isValidTuning({ id: 'x', name: 'X', strings: [{ open: { midi: 'сорок' } }] })).toBe(false);
    expect(isValidTuning({ id: '', name: 'X', strings: [{ open: { midi: 40 } }] })).toBe(false);
  });
});
