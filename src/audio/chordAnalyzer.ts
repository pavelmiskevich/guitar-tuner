import type { Voicing } from '../domain/chords';
import { getVoicingExpectedPitches } from '../domain/chords';
import type { Tuning } from '../domain/tunings';
import { midiToFrequency, calculateCents } from '../domain/notes';

export interface StringTuningStatus {
  stringIndex: number;      // 0 = 6-я струна
  targetMidi: number;
  targetFreq: number;
  measuredFreq: number;
  cents: number;
  status: 'pending' | 'in-tune' | 'low' | 'high' | 'muted' | 'not-played' | 'undetermined';
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

export interface SpectralPeak {
  frequency: number;
  magnitude: number;
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

    updated[bestMatchIndex] = {
      stringIndex: bestMatchIndex,
      targetMidi: targetPitch.midi,
      targetFreq,
      measuredFreq,
      cents,
      status,
      confidence: 'high',
      usedPartials: 1
    };
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
 * Поиск спектральных пиков в FFT буфере с параболической интерполяцией
 */
export function extractSpectralPeaks(
  fftData: Float32Array,
  sampleRate: number,
  minFreq = 65,
  maxFreq = 2000,
  thresholdDb = -65
): SpectralPeak[] {
  const peaks: SpectralPeak[] = [];
  const binCount = fftData.length;
  const binWidth = (sampleRate / 2) / binCount;

  for (let i = 2; i < binCount - 2; i++) {
    const val = fftData[i];
    if (val < thresholdDb) continue;

    // Локальный максимум
    if (val > fftData[i - 1] && val > fftData[i + 1]) {
      // Параболическая суб-бин интерполяция для точной частоты
      const alpha = fftData[i - 1];
      const beta = fftData[i];
      const gamma = fftData[i + 1];

      const denom = (alpha - 2 * beta + gamma);
      const delta = denom !== 0 ? (0.5 * (alpha - gamma)) / denom : 0;
      const accurateBin = i + delta;
      const freq = accurateBin * binWidth;

      if (freq >= minFreq && freq <= maxFreq) {
        peaks.push({
          frequency: freq,
          magnitude: beta
        });
      }
    }
  }

  return peaks;
}

/**
 * Полифонический анализ строя аккорда по одному удару (Режим B: Спектральный анализ)
 * Реализует требования ТЗ §5.3.3:
 * - Моделирование партиалов с негармоничностью
 * - Разрешение коллизий между струнами (исключение коллизий < 30 центов)
 * - Взвешенная медиана отклонений чистых партиалов
 */
export function analyzeChordStrumSpectrum(
  fftData: Float32Array,
  sampleRate: number,
  voicing: Voicing,
  tuning: Tuning,
  inTuneThresholdCents = 5,
  a4 = 440
): StringTuningStatus[] {
  const peaks = extractSpectralPeaks(fftData, sampleRate, 65, 2200, -70);
  const expectedPitches = getVoicingExpectedPitches(voicing, tuning);

  // 1. Построение партиалов для каждой звучащей струны
  interface StringModel {
    stringIdx: number;
    targetFreq: number;
    targetMidi: number;
    b: number;
    partials: { h: number; freq: number; isCollided: boolean }[];
  }

  const models: StringModel[] = [];

  expectedPitches.forEach((pitch, idx) => {
    if (!pitch) return;
    const strSpec = tuning.strings[idx];
    const b = strSpec?.inharmonicityB || (1e-4 * Math.pow(0.85, idx));
    const targetFreq = midiToFrequency(pitch.midi, a4);
    const partialFreqs = calculatePartials(targetFreq, b, 8);

    models.push({
      stringIdx: idx,
      targetFreq,
      targetMidi: pitch.midi,
      b,
      partials: partialFreqs.map((f, hIdx) => ({
        h: hIdx + 1,
        freq: f,
        isCollided: false
      }))
    });
  });

  // 2. Разрешение коллизий: исключаем партиалы, расположенные ближе 30 центов к партиалам других струн
  for (let m1 = 0; m1 < models.length; m1++) {
    for (let m2 = m1 + 1; m2 < models.length; m2++) {
      for (const p1 of models[m1].partials) {
        for (const p2 of models[m2].partials) {
          const diffCents = Math.abs(calculateCents(p1.freq, p2.freq));
          if (diffCents < 30) {
            p1.isCollided = true;
            p2.isCollided = true;
          }
        }
      }
    }
  }

  // 3. Сопоставление с измеренными спектральными пиками и оценка отклонения
  const statuses: StringTuningStatus[] = tuning.strings.map((_, idx) => {
    const model = models.find(m => m.stringIdx === idx);
    if (!model) {
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

    const cleanPartials = model.partials.filter(p => !p.isCollided);
    const candidateDeltas: { cents: number; weight: number; measuredF0: number }[] = [];

    for (const p of cleanPartials) {
      // Ищем ближайший пик в окрестности +/- 70 центов
      let bestPeak: SpectralPeak | null = null;
      let minPeakDist = 70;

      for (const peak of peaks) {
        const dCents = calculateCents(peak.frequency, p.freq);
        if (Math.abs(dCents) < minPeakDist) {
          minPeakDist = Math.abs(dCents);
          bestPeak = peak;
        }
      }

      if (bestPeak) {
        const deltaCents = calculateCents(bestPeak.frequency, p.freq);
        // Вес обратно пропорционален номеру гармоники и прямо пропорционален амплитуде
        const linearMag = Math.pow(10, bestPeak.magnitude / 20);
        const weight = (linearMag / p.h);
        const measuredF0 = bestPeak.frequency / (p.h * Math.sqrt(1 + model.b * p.h * p.h));

        candidateDeltas.push({
          cents: deltaCents,
          weight,
          measuredF0
        });
      }
    }

    if (candidateDeltas.length === 0) {
      return {
        stringIndex: idx,
        targetMidi: model.targetMidi,
        targetFreq: model.targetFreq,
        measuredFreq: 0,
        cents: 0,
        status: 'not-played',
        confidence: 'none',
        usedPartials: 0
      };
    }

    // Взвешенная медиана центов
    candidateDeltas.sort((a, b) => a.cents - b.cents);
    const medianCents = candidateDeltas[Math.floor(candidateDeltas.length / 2)].cents;
    const avgMeasuredF0 = candidateDeltas.reduce((acc, c) => acc + c.measuredF0 * c.weight, 0) /
      candidateDeltas.reduce((acc, c) => acc + c.weight, 0);

    const confidence: 'high' | 'medium' | 'none' =
      candidateDeltas.length >= 3 ? 'high' : candidateDeltas.length >= 1 ? 'medium' : 'none';

    let status: StringTuningStatus['status'] = 'in-tune';
    if (Math.abs(medianCents) <= inTuneThresholdCents) {
      status = 'in-tune';
    } else if (medianCents < -inTuneThresholdCents) {
      status = 'low';
    } else {
      status = 'high';
    }

    return {
      stringIndex: idx,
      targetMidi: model.targetMidi,
      targetFreq: model.targetFreq,
      measuredFreq: avgMeasuredF0 || model.targetFreq,
      cents: medianCents,
      status,
      confidence,
      usedPartials: candidateDeltas.length
    };
  });

  return statuses;
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
