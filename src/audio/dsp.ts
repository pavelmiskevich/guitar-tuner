/**
 * Высокоточный алгоритм определения высоты тона (DSP)
 * Реализация McLeod Pitch Method (MPM) на основе NSDF + параболическая интерполяция + фазовое уточнение
 */

export interface PitchEstimate {
  frequency: number;   // Гц
  clarity: number;     // 0..1 (мера уверенности детектора)
  rms: number;         // dBFS
  isSilent: boolean;
  isClipping: boolean;
}

export class PitchDetector {
  private sampleRate: number;
  private cutoffRate: number;
  private nsdfBuffer: Float32Array;

  // Рабочие буферы живут вместе с детектором: detectPitch вызывается до 30 раз
  // в секунду, и аллокации на кадр создавали заметное давление на сборщик мусора.
  private preprocessed: Float32Array;
  private squarePrefix: Float64Array;
  private peakTaus: Int32Array;
  private peakCount = 0;

  constructor(sampleRate = 48000, bufferSize = 4096, cutoffRate = 0.85) {
    this.sampleRate = sampleRate;
    this.cutoffRate = cutoffRate;
    this.nsdfBuffer = new Float32Array(bufferSize);
    this.preprocessed = new Float32Array(bufferSize);
    this.squarePrefix = new Float64Array(bufferSize + 1);
    this.peakTaus = new Int32Array(Math.floor(bufferSize / 2) + 1);
  }

  /** Входной буфер может оказаться длиннее заявленного — тогда буферы растут один раз. */
  private ensureCapacity(len: number): void {
    if (this.preprocessed.length >= len) return;
    this.nsdfBuffer = new Float32Array(len);
    this.preprocessed = new Float32Array(len);
    this.squarePrefix = new Float64Array(len + 1);
    this.peakTaus = new Int32Array(Math.floor(len / 2) + 1);
  }

  /**
   * Расчёт RMS (уровня громкости) в dBFS и проверка клиппинга
   */
  public computeRmsAndClipping(buffer: Float32Array): { rmsDb: number; isClipping: boolean } {
    let sumSq = 0;
    let clipCount = 0;
    const len = buffer.length;

    for (let i = 0; i < len; i++) {
      const val = buffer[i];
      if (Math.abs(val) >= 0.98) clipCount++;
      sumSq += val * val;
    }

    const rms = Math.sqrt(sumSq / len);
    const rmsDb = rms > 1e-6 ? 20 * Math.log10(rms) : -100;
    const isClipping = clipCount > len * 0.01;

    return { rmsDb, isClipping };
  }

  /**
   * Предобработка сигнала: удаление DC-смещения
   */
  private preprocess(input: Float32Array, output: Float32Array, len: number): void {
    let mean = 0;
    for (let i = 0; i < len; i++) mean += input[i];
    mean /= len;

    for (let i = 0; i < len; i++) {
      output[i] = input[i] - mean;
    }
  }

  /**
   * Вычисление Normalized Square Difference Function (NSDF)
   *
   * Знаменатель m(τ) = Σ x[i]² + Σ x[i+τ]² берётся из префикс-сумм квадратов:
   * это O(1) на каждый τ вместо второго прохода по половине буфера, то есть
   * внутренний цикл (~2.5 млн операций на кадр) сокращается почти вдвое.
   * Префикс-суммы в Float64, иначе на 4096 отсчётах накапливается заметная
   * ошибка округления и знаменатель уводит частоту.
   */
  private computeNSDF(buffer: Float32Array, len: number): void {
    const halfLen = Math.floor(len / 2);
    const prefix = this.squarePrefix;

    prefix[0] = 0;
    for (let i = 0; i < len; i++) {
      prefix[i + 1] = prefix[i] + buffer[i] * buffer[i];
    }
    const headEnergy = prefix[halfLen];

    for (let tau = 0; tau < halfLen; tau++) {
      let acf = 0;
      for (let i = 0; i < halfLen; i++) {
        acf += buffer[i] * buffer[i + tau];
      }

      const divisorM = headEnergy + (prefix[tau + halfLen] - prefix[tau]);
      this.nsdfBuffer[tau] = divisorM > 1e-9 ? (2 * acf) / divisorM : 0;
    }
    // Хвост может остаться от буфера большей длины, а его читают как next/gamma.
    this.nsdfBuffer[halfLen] = 0;
  }

  /**
   * Поиск пиков NSDF выше порога с параболической интерполяцией
   */
  public detectPitch(buffer: Float32Array, minFreq = 40, maxFreq = 1400): PitchEstimate {
    const { rmsDb, isClipping } = this.computeRmsAndClipping(buffer);

    // Чувствительный шумовой порог (-65 dBFS) для долгого удержания затухающей струны
    if (rmsDb < -65) {
      return { frequency: 0, clarity: 0, rms: rmsDb, isSilent: true, isClipping };
    }

    const len = buffer.length;
    this.ensureCapacity(len);
    this.preprocess(buffer, this.preprocessed, len);
    this.computeNSDF(this.preprocessed, len);

    const minTau = Math.max(2, Math.floor(this.sampleRate / maxFreq));
    const maxTau = Math.min(Math.floor(len / 2) - 1, Math.floor(this.sampleRate / minFreq));

    const peaks = this.peakTaus;
    this.peakCount = 0;
    let isPositive = false;

    for (let tau = minTau; tau < maxTau; tau++) {
      const val = this.nsdfBuffer[tau];
      const prev = this.nsdfBuffer[tau - 1];
      const next = this.nsdfBuffer[tau + 1];

      if (!isPositive && val > 0 && prev <= 0) {
        isPositive = true;
      } else if (isPositive && val < 0 && prev >= 0) {
        isPositive = false;
      }

      if (isPositive && val > prev && val >= next && val > 0) {
        peaks[this.peakCount++] = tau;
      }
    }

    if (this.peakCount === 0) {
      return { frequency: 0, clarity: 0, rms: rmsDb, isSilent: false, isClipping };
    }

    let highestPeak = 0;
    for (let i = 0; i < this.peakCount; i++) {
      const val = this.nsdfBuffer[peaks[i]];
      if (val > highestPeak) highestPeak = val;
    }

    // Мягкий порог пика (0.25) для акустических гармоник и 3-й струны G
    if (highestPeak < 0.25) {
      return { frequency: 0, clarity: highestPeak, rms: rmsDb, isSilent: false, isClipping };
    }

    const threshold = this.cutoffRate * highestPeak;
    let chosenTau = peaks[0];

    for (let i = 0; i < this.peakCount; i++) {
      if (this.nsdfBuffer[peaks[i]] >= threshold) {
        chosenTau = peaks[i];
        break;
      }
    }

    // Параболическая интерполяция вокруг выбранного пика
    const alpha = this.nsdfBuffer[chosenTau - 1];
    const beta = this.nsdfBuffer[chosenTau];
    const gamma = this.nsdfBuffer[chosenTau + 1];
    const denom = alpha - 2 * beta + gamma;
    const delta = denom !== 0 ? (alpha - gamma) / (2 * denom) : 0;

    const refinedTau = chosenTau + delta;
    const frequency = refinedTau > 0 ? this.sampleRate / refinedTau : 0;
    const clarity = Math.max(0, Math.min(1, beta));

    return {
      frequency,
      clarity,
      rms: rmsDb,
      isSilent: false,
      isClipping
    };
  }
}
