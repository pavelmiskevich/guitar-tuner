import { describe, it, expect } from 'vitest';
import {
  encodeFretboardHash,
  decodeFretboardHash,
  parseTabFromHash,
  resolveSharedTuning,
  buildShareUrl,
  type FretboardShareState
} from '../src/domain/deepLink';
import { DEFAULT_TUNING, TUNING_PRESETS, createStringsFromMidi } from '../src/domain/tunings';
import type { Tuning } from '../src/domain/tunings';

const baseState: FretboardShareState = {
  mode: 'scales',
  root: 'A',
  scaleId: 'pentatonic-minor',
  voicingId: 'am-open',
  customFrets: ['x', 'x', 'x', 'x', 'x', 'x'],
  capo: null,
  leftHanded: false,
  fretRange: { from: 0, to: 15 },
  labelMode: 'note',
  tuning: DEFAULT_TUNING
};

const customTuning: Tuning = {
  id: 'my-tuning',
  name: 'Мой строй',
  category: 'Пользовательские',
  instrument: 'guitar',
  strings: createStringsFromMidi([38, 45, 50, 55, 59, 62]),
  isCustom: true
};

describe('Deep link: кодирование состояния грифа', () => {
  it('всегда помечает вкладку грифа, чтобы ссылка открывала нужный экран', () => {
    const params = new URLSearchParams(encodeFretboardHash(baseState));
    expect(params.get('tab')).toBe('fretboard');
  });

  it('кодирует режим, тонику и гамму в режиме гамм', () => {
    const params = new URLSearchParams(
      encodeFretboardHash({ ...baseState, mode: 'scales', root: 'D', scaleId: 'blues' })
    );
    expect(params.get('mode')).toBe('scales');
    expect(params.get('root')).toBe('D');
    expect(params.get('scale')).toBe('blues');
    expect(params.get('voicing')).toBeNull();
    expect(params.get('frets')).toBeNull();
  });

  it('кодирует выбранную аппликатуру в режиме аккордов', () => {
    const params = new URLSearchParams(
      encodeFretboardHash({ ...baseState, mode: 'chords', voicingId: 'c-open' })
    );
    expect(params.get('mode')).toBe('chords');
    expect(params.get('voicing')).toBe('c-open');
    expect(params.get('scale')).toBeNull();
  });

  it('кодирует расставленные вручную ноты в режиме исследования', () => {
    const params = new URLSearchParams(
      encodeFretboardHash({
        ...baseState,
        mode: 'explore',
        customFrets: ['x', 3, 2, 0, 1, 0]
      })
    );
    expect(params.get('mode')).toBe('explore');
    expect(params.get('frets')).toBe('x.3.2.0.1.0');
  });

  it('даёт разные ссылки для разных наборов нот на грифе', () => {
    const a = encodeFretboardHash({ ...baseState, mode: 'explore', customFrets: ['x', 3, 2, 0, 1, 0] });
    const b = encodeFretboardHash({ ...baseState, mode: 'explore', customFrets: ['x', 'x', 0, 2, 3, 2] });
    expect(a).not.toBe(b);
  });

  it('не пишет пустую аппликатуру, когда все струны заглушены', () => {
    const params = new URLSearchParams(encodeFretboardHash({ ...baseState, mode: 'explore' }));
    expect(params.get('frets')).toBeNull();
  });

  it('кодирует капо, ориентацию, диапазон ладов и режим подписей', () => {
    const params = new URLSearchParams(
      encodeFretboardHash({
        ...baseState,
        capo: 3,
        leftHanded: true,
        fretRange: { from: 5, to: 12 },
        labelMode: 'degree'
      })
    );
    expect(params.get('capo')).toBe('3');
    expect(params.get('left')).toBe('1');
    expect(params.get('range')).toBe('5-12');
    expect(params.get('labels')).toBe('degree');
  });

  it('опускает значения по умолчанию, чтобы ссылка оставалась короткой', () => {
    const params = new URLSearchParams(encodeFretboardHash(baseState));
    expect(params.get('capo')).toBeNull();
    expect(params.get('left')).toBeNull();
    expect(params.get('range')).toBeNull();
    expect(params.get('labels')).toBeNull();
  });

  it('кодирует id строя, а для пользовательского строя — ещё и сами струны', () => {
    const preset = new URLSearchParams(encodeFretboardHash(baseState));
    expect(preset.get('tuning')).toBe('standard-e');
    expect(preset.get('strings')).toBeNull();

    const custom = new URLSearchParams(encodeFretboardHash({ ...baseState, tuning: customTuning }));
    expect(custom.get('tuning')).toBe('my-tuning');
    expect(custom.get('strings')).toBe('38.45.50.55.59.62');
    expect(custom.get('inst')).toBe('guitar');
  });
});

describe('Deep link: разбор состояния грифа', () => {
  it('переживает круговой обход для полного состояния', () => {
    const state: FretboardShareState = {
      mode: 'explore',
      root: 'F#',
      scaleId: 'dorian',
      voicingId: 'c-open',
      customFrets: [3, 2, 'x', 0, 12, 'x'],
      capo: 5,
      leftHanded: true,
      fretRange: { from: 0, to: 24 },
      labelMode: 'degree',
      tuning: customTuning
    };

    const decoded = decodeFretboardHash(encodeFretboardHash(state));

    expect(decoded.mode).toBe('explore');
    expect(decoded.root).toBe('F#');
    expect(decoded.customFrets).toEqual([3, 2, 'x', 0, 12, 'x']);
    expect(decoded.capo).toBe(5);
    expect(decoded.leftHanded).toBe(true);
    expect(decoded.fretRange).toEqual({ from: 0, to: 24 });
    expect(decoded.labelMode).toBe('degree');
  });

  it('переносит гамму и аппликатуру для своих режимов', () => {
    const scales = decodeFretboardHash(
      encodeFretboardHash({ ...baseState, mode: 'scales', scaleId: 'blues' })
    );
    expect(scales.scaleId).toBe('blues');

    const chords = decodeFretboardHash(
      encodeFretboardHash({ ...baseState, mode: 'chords', voicingId: 'c-open' })
    );
    expect(chords.voicingId).toBe('c-open');
  });

  it('принимает хэш и с ведущим «#», и без него', () => {
    expect(decodeFretboardHash('#mode=chords&root=G').mode).toBe('chords');
    expect(decodeFretboardHash('mode=chords&root=G').root).toBe('G');
  });

  it('понимает ссылки старого формата без вкладки', () => {
    const decoded = decodeFretboardHash('mode=scales&root=D&scale=blues&capo=3');
    expect(decoded.mode).toBe('scales');
    expect(decoded.root).toBe('D');
    expect(decoded.scaleId).toBe('blues');
    expect(decoded.capo).toBe(3);
  });

  it('игнорирует неизвестные и повреждённые значения', () => {
    const decoded = decodeFretboardHash(
      'mode=drums&root=H&scale=nonexistent&voicing=nope&capo=abc&range=20-3&frets=1.2.zz&labels=x&left=maybe'
    );
    expect(decoded).toEqual({});
  });

  it('трактует capo=none как отсутствие каподастра', () => {
    expect(decodeFretboardHash('capo=none').capo).toBeNull();
  });

  it('отбрасывает лады вне диапазона грифа', () => {
    expect(decodeFretboardHash('frets=0.0.0.0.0.99').customFrets).toBeUndefined();
    expect(decodeFretboardHash('capo=99').capo).toBeUndefined();
  });

  it('не падает на пустом хэше', () => {
    expect(decodeFretboardHash('')).toEqual({});
    expect(decodeFretboardHash('#')).toEqual({});
  });
});

describe('Deep link: вкладка и строй', () => {
  it('читает вкладку из хэша', () => {
    expect(parseTabFromHash('#tab=fretboard&root=A')).toBe('fretboard');
    expect(parseTabFromHash('#tab=metronome')).toBe('metronome');
  });

  it('возвращает null для неизвестной или отсутствующей вкладки', () => {
    expect(parseTabFromHash('#tab=piano')).toBeNull();
    expect(parseTabFromHash('#root=A')).toBeNull();
    expect(parseTabFromHash('')).toBeNull();
  });

  it('считает вкладкой грифа старые ссылки с параметрами схемы', () => {
    expect(parseTabFromHash('#mode=scales&root=D&scale=blues')).toBe('fretboard');
  });

  it('находит пресет строя среди доступных', () => {
    const resolved = resolveSharedTuning('#tuning=drop-c', TUNING_PRESETS);
    expect(resolved?.id).toBe('drop-c');
  });

  it('восстанавливает пользовательский строй из списка струн', () => {
    const resolved = resolveSharedTuning('#tuning=my-tuning&strings=38.45.50.55.59.62&inst=guitar', TUNING_PRESETS);
    expect(resolved).not.toBeNull();
    expect(resolved!.strings.map(s => s.open.midi)).toEqual([38, 45, 50, 55, 59, 62]);
    expect(resolved!.isCustom).toBe(true);
  });

  it('предпочитает уже сохранённый строй восстановлению из струн', () => {
    const resolved = resolveSharedTuning(
      '#tuning=my-tuning&strings=38.45.50.55.59.62',
      [...TUNING_PRESETS, customTuning]
    );
    expect(resolved).toBe(customTuning);
  });

  it('возвращает null, если строй не указан или повреждён', () => {
    expect(resolveSharedTuning('#root=A', TUNING_PRESETS)).toBeNull();
    expect(resolveSharedTuning('#tuning=unknown', TUNING_PRESETS)).toBeNull();
    expect(resolveSharedTuning('#tuning=unknown&strings=40.999', TUNING_PRESETS)).toBeNull();
  });
});

describe('Deep link: сборка адреса', () => {
  it('склеивает базовый адрес, путь и хэш без задвоенных слэшей', () => {
    const url = buildShareUrl('https://example.com/', '/', baseState);
    expect(url.startsWith('https://example.com/#')).toBe(true);
    expect(url).toContain('tab=fretboard');
  });

  it('сохраняет путь размещения приложения в подкаталоге', () => {
    const url = buildShareUrl('https://example.com', '/tuner/', baseState);
    expect(url.startsWith('https://example.com/tuner/#')).toBe(true);
  });
});
