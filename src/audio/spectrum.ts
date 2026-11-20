/**
 * Спектр высокого разрешения для проверки аккорда по удару (#4).
 *
 * Спектр AnalyserNode давал бин 5,9 Гц — около 120 центов на E2: основные тоны
 * E2 и A2 сливались в один лепесток, и ±5¢ на нижних струнах были недостижимы.
 * Здесь спектр считается по ~0,7 с сырого сигнала: окно Ханна, дополнение
 * нулями в четыре раза и уточнение пика параболой по децибелам. Разрешение по
 * основному лепестку — около 3 Гц, точность частоты чистого пика — доли цента.
 */

import { fftInPlace, nextPowerOfTwo } from './fft';

// Прежний адрес БПФ: на него ссылаются тесты спектра.
export { fftInPlace };

/** Во сколько раз дополнять сигнал нулями: гуще сетка — точнее парабола по вершине. */
const ZERO_PAD = 4;

/** Выше этой частоты спектр не хранится: партиалы гитары, по которым меряем, ниже. */
const MAX_STORED_HZ = 5000;

/** Пик засчитывается, только если он не тише максимума спектра на столько дБ… */
const MAX_BELOW_PEAK_DB = 60;
/** …и громче фона (медианы спектра) хотя бы на столько дБ. */
const MIN_ABOVE_FLOOR_DB = 15;

export interface Spectrum {
  /** Амплитуда по бинам, дБ относительно полной шкалы синусоиды. */
  db: Float32Array;
  /** Ширина бина, Гц. */
  binHz: number;
  /** Самый громкий бин спектра, дБ. */
  maxDb: number;
  /** Фон: медиана спектра в полосе гитары, дБ. */
  floorDb: number;
}

export interface SpectrumPeak {
  frequency: number;
  db: number;
}


/** Амплитудный спектр сигнала с окном Ханна и дополнением нулями. */
export function computeSpectrum(samples: Float32Array, sampleRate: number): Spectrum {
  const length = samples.length;
  const n = nextPowerOfTwo(length) * ZERO_PAD;
  const re = new Float64Array(n);
  const im = new Float64Array(n);

  let windowSum = 0;
  for (let i = 0; i < length; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (length - 1));
    windowSum += w;
    re[i] = samples[i] * w;
  }
  fftInPlace(re, im);

  const binHz = sampleRate / n;
  const bins = Math.min(n / 2, Math.ceil(MAX_STORED_HZ / binHz) + 1);
  const db = new Float32Array(bins);
  // Синусоида амплитуды A даёт в пике A·Σw/2 — нормируем, чтобы 0 дБ было полной шкалой.
  const scale = 2 / windowSum;
  let maxDb = -Infinity;
  for (let k = 0; k < bins; k++) {
    const mag = Math.hypot(re[k], im[k]) * scale;
    const value = 20 * Math.log10(mag + 1e-12);
    db[k] = value;
    if (value > maxDb) maxDb = value;
  }

  const lo = Math.max(1, Math.floor(60 / binHz));
  const hi = Math.min(bins - 1, Math.ceil(2500 / binHz));
  const band = Array.from(db.subarray(lo, hi)).sort((a, b) => a - b);
  const floorDb = band.length > 0 ? band[Math.floor(band.length / 2)] : -Infinity;

  return { db, binHz, maxDb, floorDb };
}

/**
 * Самый громкий пик в окне ±windowCents вокруг freq. Вершина у границы окна —
 * это склон чужого пика, а не свой пик; тихий пик — шум. В обоих случаях null.
 */
export function findPeakNear(spectrum: Spectrum, freq: number, windowCents: number): SpectrumPeak | null {
  const { db, binHz } = spectrum;
  const ratio = Math.pow(2, windowCents / 1200);
  const lo = Math.max(1, Math.floor(freq / ratio / binHz));
  const hi = Math.min(db.length - 2, Math.ceil((freq * ratio) / binHz));
  if (hi - lo < 2) return null;

  let best = lo;
  for (let k = lo + 1; k <= hi; k++) {
    if (db[k] > db[best]) best = k;
  }
  if (best === lo || best === hi) return null;

  const threshold = Math.max(spectrum.maxDb - MAX_BELOW_PEAK_DB, spectrum.floorDb + MIN_ABOVE_FLOOR_DB);
  if (db[best] < threshold) return null;

  const a = db[best - 1];
  const b = db[best];
  const c = db[best + 1];
  const denom = a - 2 * b + c;
  const delta = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
  return { frequency: (best + delta) * binHz, db: b - 0.25 * (a - c) * delta };
}
