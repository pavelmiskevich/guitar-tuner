/**
 * Высокоточный алгоритм определения высоты тона (DSP)
 * Реализация McLeod Pitch Method (MPM) на основе NSDF + параболическая интерполяция + фазовое уточнение
 */

import { HeadCorrelator } from './fft';

export interface PitchEstimate {
  frequency: number;   // Гц
  clarity: number;     // 0..1 (мера уверенности детектора)
  rms: number;         // dBFS
  isSilent: boolean;
  isClipping: boolean;
}

/**
 * Длина кадра анализа в отсчётах после прореживания. При 44,1–48 кГц это
 * ~85–93 мс: два с половиной периода B0 (30,87 Гц) — достаточно, чтобы
 * найти период самой низкой басовой струны.
 */
export const ANALYSIS_LENGTH = 4096;

/**
 * Во сколько раз прореживать вход, чтобы частота анализа была 44,1–48 кГц.
 *
 * Кадр задан во времени, а не в отсчётах: на 96 и 192 кГц те же 4096 отсчётов
 * покрывали бы 43 и 21 мс, и нижняя граница поднималась до 47 и 94 Гц (не
 * определялась даже E2 гитары). Брать вдвое-вчетверо более длинный кадр без
 * прореживания — квадратично дороже, а для диапазона до 1400 Гц лишняя
 * частота дискретизации ничего не даёт.
 */
export function decimationFactor(sampleRate: number): number {
  return Math.max(1, Math.floor(sampleRate / 44100));
}

/**
 * Прореживание усреднением блоков по `factor` отсчётов. Усреднение — заодно
 * простой фильтр нижних частот: на 96/192 кГц выше новой частоты Найквиста
 * лежит только ультразвук, которого у струны и микрофона практически нет.
 */
export function decimate(input: Float32Array, factor: number, output: Float32Array): void {
  const count = Math.min(output.length, Math.floor(input.length / factor));
  // Берём последние отсчёты входа: они самые свежие.
  const offset = input.length - count * factor;
  for (let i = 0; i < count; i++) {
    let sum = 0;
    const start = offset + i * factor;
    for (let k = 0; k < factor; k++) sum += input[start + k];
    output[i] = sum / factor;
  }
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
  private correlator = new HeadCorrelator();
  private acf: Float64Array;

  constructor(sampleRate = 48000, bufferSize = 4096, cutoffRate = 0.85) {
    this.sampleRate = sampleRate;
    this.cutoffRate = cutoffRate;
    this.nsdfBuffer = new Float32Array(bufferSize);
    this.preprocessed = new Float32Array(bufferSize);
    this.squarePrefix = new Float64Array(bufferSize + 1);
    this.peakTaus = new Int32Array(Math.floor(bufferSize / 2) + 1);
    this.acf = new Float64Array(bufferSize);
  }

  /** Входной буфер может оказаться длиннее заявленного — тогда буферы растут один раз. */
  private ensureCapacity(len: number): void {
    if (this.preprocessed.length >= len) return;
    this.nsdfBuffer = new Float32Array(len);
    this.preprocessed = new Float32Array(len);
    this.squarePrefix = new Float64Array(len + 1);
    this.peakTaus = new Int32Array(Math.floor(len / 2) + 1);
    this.acf = new Float64Array(len);
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
   * Вычисление Normalized Square Difference Function (NSDF) для задержек 0..maxTau+1.
   *
   * Окно суммирования — всё, что остаётся от кадра после самой большой
   * задержки: W = len − maxTau − 1. Раньше окно и диапазон задержек были жёстко
   * равны половине кадра, и период длиннее половины кадра не находился вовсе
   * (B0, спущенная E1). Теперь узкий диапазон (гитара) даёт длинное окно и
   * меньше работы, широкий (бас) — более короткое окно, но период в него влезает.
   *
   * Знаменатель m(τ) = Σ x[i]² + Σ x[i+τ]² берётся из префикс-сумм квадратов —
   * O(1) на каждую задержку. Префикс-суммы в Float64, иначе на тысячах
   * отсчётов накапливается ошибка округления и знаменатель уводит частоту.
   */
  private computeNSDF(buffer: Float32Array, len: number, maxTau: number): void {
    const window = len - maxTau - 1;
    const prefix = this.squarePrefix;

    prefix[0] = 0;
    for (let i = 0; i < len; i++) {
      prefix[i + 1] = prefix[i] + buffer[i] * buffer[i];
    }
    const headEnergy = prefix[window];

    // Числитель — корреляция начала кадра со всем кадром, через БПФ (#14):
    // прямой двойной цикл стоил 2,6–4,2 млн умножений на кадр.
    this.correlator.correlate(buffer, len, window, maxTau + 1, this.acf);

    for (let tau = 0; tau <= maxTau + 1; tau++) {
      const acf = this.acf[tau];

      const divisorM = headEnergy + (prefix[tau + window] - prefix[tau]);
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

    const len = buffer.length;
    this.ensureCapacity(len);
    this.preprocess(buffer, this.preprocessed, len);

    const minTau = Math.max(2, Math.floor(this.sampleRate / maxFreq));
    // Период должен целиком помещаться в окно суммирования (W ≥ maxTau), иначе
    // NSDF на больших задержках считается по обрывку и врёт. Поэтому задержка
    // ограничена примерно половиной кадра — для 4096 отсчётов на 48 кГц это ~23 Гц.
    const maxTau = Math.min(Math.floor((len - 2) / 2), Math.ceil(this.sampleRate / minFreq) + 1);
    if (maxTau <= minTau) {
      return { frequency: 0, clarity: 0, rms: rmsDb, isSilent: false, isClipping };
    }
    this.computeNSDF(this.preprocessed, len, maxTau);

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
