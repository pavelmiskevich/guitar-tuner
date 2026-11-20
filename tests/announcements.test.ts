import { describe, it, expect } from 'vitest';
import type { StringTuningStatus } from '../src/audio/chordAnalyzer';
import {
  AnnouncementThrottle,
  centsWord,
  chordStringStatusSpoken,
  chordStringStatusText,
  strumSummaryAnnouncement,
  tunerAnnouncement
} from '../src/domain/announcements';

const status = (s: StringTuningStatus['status'], cents = 0): StringTuningStatus => ({
  stringIndex: 0,
  targetMidi: 40,
  targetFreq: 82.4,
  measuredFreq: 82.4,
  cents,
  status: s,
  confidence: 'high'
});

describe('centsWord', () => {
  it.each([
    [1, 'цент'],
    [2, 'цента'],
    [4, 'цента'],
    [5, 'центов'],
    [11, 'центов'],
    [12, 'центов'],
    [14, 'центов'],
    [21, 'цент'],
    [22, 'цента'],
    [25, 'центов'],
    [111, 'центов'],
    [-3, 'цента']
  ])('%i → %s', (n, word) => {
    expect(centsWord(n)).toBe(word);
  });
});

describe('tunerAnnouncement', () => {
  const base = { hasPitch: true, noteLabel: 'E2', inTuneThreshold: 5 };

  it('тишина — объявлять нечего', () => {
    expect(tunerAnnouncement({ ...base, hasPitch: false, cents: -30 })).toBe('');
  });

  it('в допуске — «в строе» без центов', () => {
    expect(tunerAnnouncement({ ...base, cents: 4.9 })).toBe('E2: в строе');
    expect(tunerAnnouncement({ ...base, cents: -5 })).toBe('E2: в строе');
  });

  it('ниже цели — подтянуть, выше — ослабить', () => {
    expect(tunerAnnouncement({ ...base, cents: -22 })).toBe('E2: подтянуть, на 20 центов');
    expect(tunerAnnouncement({ ...base, cents: 33 })).toBe('E2: ослабить, на 35 центов');
  });

  it('округляет отклонение ступенями по 5 центов: мелкая дрожь не меняет текст', () => {
    const texts = [-18.6, -19.4, -20.2, -21.9].map(cents => tunerAnnouncement({ ...base, cents }));
    expect(new Set(texts).size).toBe(1);
  });

  it('малое отклонение за строгим порогом не округляется в ноль', () => {
    expect(tunerAnnouncement({ ...base, inTuneThreshold: 1, cents: 2 })).toBe('E2: ослабить, на 5 центов');
  });
});

describe('chordStringStatusText / chordStringStatusSpoken', () => {
  it('подпись плашки', () => {
    expect(chordStringStatusText(undefined, true)).toBe('Глушится (X)');
    expect(chordStringStatusText(status('in-tune', 1.24), false)).toBe('В строе (+1.2¢)');
    expect(chordStringStatusText(status('low', -12.3), false)).toBe('Низко (-12.3¢)');
    expect(chordStringStatusText(status('high', 7), false)).toBe('Высоко (+7.0¢)');
    expect(chordStringStatusText(status('pending'), false)).toBe('Ожидание');
    expect(chordStringStatusText(undefined, false)).toBe('Ожидание');
  });

  it('озвучка — словами, без «¢» и знака', () => {
    expect(chordStringStatusSpoken(status('low', -12.3))).toBe('низко на 12 центов');
    expect(chordStringStatusSpoken(status('high', 1.2))).toBe('высоко на 1 цент');
    expect(chordStringStatusSpoken(status('in-tune', 2))).toBe('в строе');
    expect(chordStringStatusSpoken(status('pending'))).toBe('');
  });
});

describe('strumSummaryAnnouncement', () => {
  it('все в строе — только счёт', () => {
    const s = [status('in-tune'), status('in-tune'), status('muted')];
    expect(strumSummaryAnnouncement(s, [6, 5, 4])).toBe('Удар разобран: в строе 2 из 2');
  });

  it('перечисляет струны не в строе и не прозвучавшие по номерам', () => {
    const s = [status('low', -15), status('in-tune'), status('not-played'), status('unmeasured')];
    expect(strumSummaryAnnouncement(s, [6, 5, 4, 3])).toBe(
      'Удар разобран: в строе 1 из 2. 6-я низко на 15 центов, 4-я не прозвучала'
    );
  });
});

describe('AnnouncementThrottle', () => {
  it('первое объявление — сразу', () => {
    const t = new AnnouncementThrottle(1500);
    expect(t.delayFor('E2: подтянуть, на 20 центов', 0)).toBe(0);
  });

  it('следующее — не раньше интервала после предыдущего', () => {
    const t = new AnnouncementThrottle(1500);
    t.commit('A', 1000);
    expect(t.delayFor('B', 1200)).toBe(1300);
    expect(t.delayFor('B', 3000)).toBe(0);
  });

  it('тот же текст повторно не объявляется', () => {
    const t = new AnnouncementThrottle(1500);
    t.commit('A', 0);
    expect(t.delayFor('A', 10_000)).toBeNull();
  });

  it('тишина не тратит интервал и позволяет повторить прежний текст после паузы', () => {
    const t = new AnnouncementThrottle(1500);
    t.commit('E2: в строе', 0);
    expect(t.delayFor('', 100)).toBe(0);
    t.commit('', 100);
    expect(t.delayFor('', 200)).toBeNull();
    // Интервал отсчитывается от последнего непустого объявления.
    expect(t.delayFor('E2: в строе', 600)).toBe(900);
  });
});
