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

  constructor(sampleRate = 48000, bufferSize = 4096, cutoffRate = 0.85) {
    this.sampleRate = sampleRate;
    this.cutoffRate = cutoffRate;
    this.nsdfBuffer = new Float32Array(bufferSize);
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
  private preprocess(input: Float32Array, output: Float32Array): void {
    const len = input.length;
    let mean = 0;
    for (let i = 0; i < len; i++) mean += input[i];
    mean /= len;

    for (let i = 0; i < len; i++) {
      output[i] = input[i] - mean;
    }
  }

  /**
   * Вычисление Normalized Square Difference Function (NSDF)
   */
  private computeNSDF(buffer: Float32Array): void {
    const len = buffer.length;
    const halfLen = Math.floor(len / 2);
    this.nsdfBuffer.fill(0);

    for (let tau = 0; tau < halfLen; tau++) {
      let acf = 0;
      let divisorM = 0;

      for (let i = 0; i < halfLen; i++) {
        const x1 = buffer[i];
        const x2 = buffer[i + tau];
        acf += x1 * x2;
        divisorM += x1 * x1 + x2 * x2;
      }

      this.nsdfBuffer[tau] = divisorM > 1e-9 ? (2 * acf) / divisorM : 0;
    }
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

    const preprocessed = new Float32Array(buffer.length);
    this.preprocess(buffer, preprocessed);
    this.computeNSDF(preprocessed);

    const minTau = Math.max(2, Math.floor(this.sampleRate / maxFreq));
    const maxTau = Math.min(Math.floor(buffer.length / 2) - 1, Math.floor(this.sampleRate / minFreq));

    const maxPositions: number[] = [];
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
        maxPositions.push(tau);
      }
    }

    if (maxPositions.length === 0) {
      return { frequency: 0, clarity: 0, rms: rmsDb, isSilent: false, isClipping };
    }

    let highestPeak = 0;
    for (const tau of maxPositions) {
      if (this.nsdfBuffer[tau] > highestPeak) {
        highestPeak = this.nsdfBuffer[tau];
      }
    }

    // Мягкий порог пика (0.25) для акустических гармоник и 3-й струны G
    if (highestPeak < 0.25) {
      return { frequency: 0, clarity: highestPeak, rms: rmsDb, isSilent: false, isClipping };
    }

    const threshold = this.cutoffRate * highestPeak;
    let chosenTau = maxPositions[0];

    for (const tau of maxPositions) {
      if (this.nsdfBuffer[tau] >= threshold) {
        chosenTau = tau;
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
