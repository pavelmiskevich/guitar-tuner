import type { Voicing } from '../domain/chords';
import { getVoicingExpectedPitches } from '../domain/chords';
import type { Tuning } from '../domain/tunings';
import { midiToFrequency, calculateCents } from '../domain/notes';
import { computeSpectrum, findPeakNear } from './spectrum';
import type { Spectrum } from './spectrum';

export interface StringTuningStatus {
  stringIndex: number;      // 0 = 6-я струна
  targetMidi: number;
  targetFreq: number;
  measuredFreq: number;
  cents: number;
  /**
   * unmeasured — струна звучит, но отдельно её не измерить: вторая струна
   * октавного хора 12-струнной в «Переборе» (#27) или струна, которая в ударе
   * дублирует другую через октаву, — все её партиалы совпадают с чужими (#4).
   */
  status: 'pending' | 'in-tune' | 'low' | 'high' | 'muted' | 'not-played' | 'unmeasured';
  confidence: 'high' | 'medium' | 'none';
  usedPartials?: number;
}

export interface ChordAnalysisResult {
  voicingId: string;
  strings: StringTuningStatus[];
  allInTune: boolean;
  activeStringIndex: number | null;
  mode: 'arpeggio' | 'strum';
}

/**
 * Октавные пары хоров 12-струнной (E2/E3, A2/A3, D3/D4, G3/G4) в аккорде:
 * индекс струны → индекс её пары. Обе струны хора дёргаются одним движением,
 * поэтому в «Переборе» детектор слышит только одну из них (#27). Унисонные
 * хоры сюда не входят — их засчитывает одна услышанная нота.
 */
export function octavePartners(voicing: Voicing, tuning: Tuning): Map<number, number> {
  const partners = new Map<number, number>();
  if (tuning.instrument !== 'guitar12' || tuning.strings.length !== 12) return partners;
  const expected = getVoicingExpectedPitches(voicing, tuning);
  for (let a = 0; a < 12; a += 2) {
    const low = expected[a];
    const high = expected[a + 1];
    if (low && high && Math.abs(low.midi - high.midi) === 12) {
      partners.set(a, a + 1);
      partners.set(a + 1, a);
    }
  }
  return partners;
}

export interface ChordProgress {
  /** Струны, которые можно измерить: звучат и не помечены «отдельно не измеряется». */
  measurable: number;
  tuned: number;
  /** Звучащие струны, которые отдельно не измерить (#27, #4). */
  unmeasured: number;
  complete: boolean;
}

/**
 * Собран ли аккорд. Струну, которую отдельно не измерить, требовать нельзя:
 * иначе «аккорд собран» на 12-струнной и в большинстве аккордов по удару не
 * появился бы никогда (#27, #4).
 */
export function chordProgress(statuses: StringTuningStatus[]): ChordProgress {
  const sounding = statuses.filter(s => s.status !== 'muted');
  const unmeasured = sounding.filter(s => s.status === 'unmeasured').length;
  const measurable = sounding.length - unmeasured;
  const tuned = sounding.filter(s => s.status === 'in-tune').length;
  return { measurable, tuned, unmeasured, complete: measurable > 0 && tuned === measurable };
}

/**
 * Оценка ноты при понотном переборе (Режим A: Арпеджио)
 */
export function evaluateArpeggioNote(
  measuredFreq: number,
  voicing: Voicing,
  tuning: Tuning,
  currentStatuses: StringTuningStatus[],
  inTuneThresholdCents = 5,
  a4 = 440
): { updatedStatuses: StringTuningStatus[]; matchedIndex: number | null } {
  if (measuredFreq <= 0) {
    return { updatedStatuses: currentStatuses, matchedIndex: null };
  }

  const expected = getVoicingExpectedPitches(voicing, tuning);
  let bestMatchIndex: number | null = null;
  let minDiffCents = 999;

  expected.forEach((pitch, idx) => {
    if (!pitch) return;
    const targetFreq = midiToFrequency(pitch.midi, a4);
    const cents = calculateCents(measuredFreq, targetFreq);

    if (Math.abs(cents) < 140 && Math.abs(cents) < Math.abs(minDiffCents)) {
      minDiffCents = cents;
      bestMatchIndex = idx;
    }
  });

  const updated = [...currentStatuses];

  if (bestMatchIndex !== null) {
    const targetPitch = expected[bestMatchIndex]!;
    const targetFreq = midiToFrequency(targetPitch.midi, a4);
    const cents = calculateCents(measuredFreq, targetFreq);

    let status: StringTuningStatus['status'] = 'in-tune';
    if (cents < -inTuneThresholdCents) status = 'low';
    else if (cents > inTuneThresholdCents) status = 'high';

    // Струны в унисон (хоры 12-струнной: B3-B3, E4-E4) по звуку неразличимы.
    // Раньше совпадение доставалось только первой, вторая навсегда оставалась
    // в «Ожидании», и аккорд не мог стать завершённым (#5).
    expected.forEach((pitch, idx) => {
      if (!pitch || pitch.midi !== targetPitch.midi) return;
      updated[idx] = {
        stringIndex: idx,
        targetMidi: targetPitch.midi,
        targetFreq,
        measuredFreq,
        cents,
        status,
        confidence: 'high',
        usedPartials: 1
      };
    });

    // Вторая струна октавного хора прозвучала вместе с услышанной, но её
    // высоту детектор не измерил. Засчитывать ей чужой замер нельзя — она
    // могла быть расстроена, — а «Ожидание» выглядело как зависшая проверка.
    const partner = octavePartners(voicing, tuning).get(bestMatchIndex);
    const partnerStatus = partner !== undefined ? updated[partner] : undefined;
    if (partner !== undefined && partnerStatus?.status === 'pending') {
      updated[partner] = { ...partnerStatus, status: 'unmeasured' };
    }
  }

  return { updatedStatuses: updated, matchedIndex: bestMatchIndex };
}

/**
 * Расчет модельных партиалов струны с учетом коэффициента негармоничности B
 * f_h = h * F0 * sqrt(1 + B * h^2)
 */
export function calculatePartials(f0: number, inharmonicityB = 5e-5, maxHarmonics = 8): number[] {
  const partials: number[] = [];
  for (let h = 1; h <= maxHarmonics; h++) {
    const freq = h * f0 * Math.sqrt(1 + inharmonicityB * h * h);
    partials.push(freq);
  }
  return partials;
}

/**
 * Окно поиска пика партиала и порог коллизии партиалов разных струн — одно
 * значение. Раньше пик искался в ±70¢, а коллизией считалось ближе 30¢: партиал
 * соседней струны в 30–70¢ не исключался и мог быть засчитан как свой (#4).
 */
export const PARTIAL_WINDOW_CENTS = 50;

/** По скольким партиалам струны меряем: выше растёт ошибка модели негармоничности. */
const MEASURED_HARMONICS = 6;

/**
 * До какого номера учитывать чужие партиалы при поиске коллизий. Чужая струна
 * звучит и на высоких гармониках: E2 на 10-й гармонике (824 Гц) накрывает
 * 5-ю гармонику E3, хотя меряем E2 только до 6-й.
 */
const COLLISION_HARMONICS = 16;

interface StringModel {
  stringIdx: number;
  targetFreq: number;
  targetMidi: number;
  b: number;
}

function partialFrequency(f0: number, b: number, h: number): number {
  return h * f0 * Math.sqrt(1 + b * h * h);
}

/** Взвешенная медиана: значение, на котором накопленный вес переходит половину. */
function weightedMedian(items: { value: number; weight: number }[]): number {
  const sorted = [...items].sort((a, b) => a.value - b.value);
  const total = sorted.reduce((sum, it) => sum + it.weight, 0);
  let acc = 0;
  for (const it of sorted) {
    acc += it.weight;
    if (acc >= total / 2) return it.value;
  }
  return sorted[sorted.length - 1].value;
}

/**
 * Полифонический анализ строя аккорда по спектру удара (Режим B, ТЗ §5.3.3).
 *
 * - партиалы каждой струны моделируются с негармоничностью;
 * - партиал, к которому ближе PARTIAL_WINDOW_CENTS подходит партиал другой
 *   струны, исключается: его пик принадлежит не только этой струне;
 * - по чистым партиалам ищутся пики, тихие пики (шум) не засчитываются;
 * - отклонение струны — взвешенная медиана отклонений партиалов, вес — амплитуда
 *   пика, делённая на номер гармоники;
 * - струна без единого чистого партиала (дублирует другую через октаву)
 *   получает «отдельно не измеряется», а не выдуманный замер.
 */
export function analyzeChordSpectrum(
  spectrum: Spectrum,
  voicing: Voicing,
  tuning: Tuning,
  inTuneThresholdCents = 5,
  a4 = 440
): StringTuningStatus[] {
  const expectedPitches = getVoicingExpectedPitches(voicing, tuning);

  // Струна в унисон с уже смоделированной не получает своей модели: по звуку
  // они неразличимы, и её статус копируется (#5).
  const models: StringModel[] = [];
  const unisonOf = new Map<number, number>();
  expectedPitches.forEach((pitch, idx) => {
    if (!pitch) return;
    const twin = models.find(m => m.targetMidi === pitch.midi);
    if (twin) {
      unisonOf.set(idx, twin.stringIdx);
      return;
    }
    models.push({
      stringIdx: idx,
      targetFreq: midiToFrequency(pitch.midi, a4),
      targetMidi: pitch.midi,
      b: tuning.strings[idx]?.inharmonicityB || 1e-4 * Math.pow(0.85, idx)
    });
  });

  const measure = (model: StringModel): StringTuningStatus => {
    const base = {
      stringIndex: model.stringIdx,
      targetMidi: model.targetMidi,
      targetFreq: model.targetFreq
    };

    const clean: number[] = [];
    for (let h = 1; h <= MEASURED_HARMONICS; h++) {
      const freq = partialFrequency(model.targetFreq, model.b, h);
      const collided = models.some(other => {
        if (other === model) return false;
        for (let k = 1; k <= COLLISION_HARMONICS; k++) {
          const otherFreq = partialFrequency(other.targetFreq, other.b, k);
          if (Math.abs(calculateCents(freq, otherFreq)) < PARTIAL_WINDOW_CENTS) return true;
        }
        return false;
      });
      if (!collided) clean.push(h);
    }

    if (clean.length === 0) {
      return { ...base, measuredFreq: 0, cents: 0, status: 'unmeasured', confidence: 'none', usedPartials: 0 };
    }

    const deltas: { value: number; weight: number }[] = [];
    for (const h of clean) {
      const expected = partialFrequency(model.targetFreq, model.b, h);
      const peak = findPeakNear(spectrum, expected, PARTIAL_WINDOW_CENTS);
      if (!peak) continue;
      deltas.push({ value: calculateCents(peak.frequency, expected), weight: Math.pow(10, peak.db / 20) / h });
    }

    if (deltas.length === 0) {
      return { ...base, measuredFreq: 0, cents: 0, status: 'not-played', confidence: 'none', usedPartials: 0 };
    }

    const cents = weightedMedian(deltas);
    const status: StringTuningStatus['status'] =
      cents < -inTuneThresholdCents ? 'low' : cents > inTuneThresholdCents ? 'high' : 'in-tune';
    return {
      ...base,
      measuredFreq: model.targetFreq * Math.pow(2, cents / 1200),
      cents,
      status,
      confidence: deltas.length >= 3 ? 'high' : 'medium',
      usedPartials: deltas.length
    };
  };

  const measured = new Map(models.map(m => [m.stringIdx, measure(m)]));

  return tuning.strings.map((_, idx) => {
    const own = measured.get(unisonOf.get(idx) ?? idx);
    if (!own) {
      return {
        stringIndex: idx,
        targetMidi: 0,
        targetFreq: 0,
        measuredFreq: 0,
        cents: 0,
        status: 'muted',
        confidence: 'high',
        usedPartials: 0
      };
    }
    return { ...own, stringIndex: idx };
  });
}

/** Анализ удара по сырому сигналу: спектр высокого разрешения, затем analyzeChordSpectrum. */
export function analyzeChordStrum(
  samples: Float32Array,
  sampleRate: number,
  voicing: Voicing,
  tuning: Tuning,
  inTuneThresholdCents = 5,
  a4 = 440
): StringTuningStatus[] {
  return analyzeChordSpectrum(computeSpectrum(samples, sampleRate), voicing, tuning, inTuneThresholdCents, a4);
}

/**
 * Инициализация статусов струн для аккорда
 */
export function initChordStatuses(voicing: Voicing, tuning: Tuning, a4 = 440): StringTuningStatus[] {
  const expected = getVoicingExpectedPitches(voicing, tuning);
  return tuning.strings.map((_, idx) => {
    const pitch = expected[idx];
    if (!pitch) {
      return {
        stringIndex: idx,
        targetMidi: 0,
        targetFreq: 0,
        measuredFreq: 0,
        cents: 0,
        status: 'muted',
        confidence: 'high',
        usedPartials: 0
      };
    }

    const targetFreq = midiToFrequency(pitch.midi, a4);
    return {
      stringIndex: idx,
      targetMidi: pitch.midi,
      targetFreq,
      measuredFreq: 0,
      cents: 0,
      status: 'pending',
      confidence: 'none',
      usedPartials: 0
    };
  });
}
