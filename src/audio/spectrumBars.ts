/**
 * Полосы мини-спектрограммы тюнера (#14): расчёт вынесен из подписки экрана
 * и пишет в готовый массив — на каждом кадре без новых массивов.
 */

/** Число полос: от ниже самой низкой басовой струны до верхних гармоник. */
export const SPECTRUM_BARS = 32;
export const SPECTRUM_MIN_HZ = 40;
export const SPECTRUM_MAX_HZ = 4000;
/** Ниже этого пика считаем, что сигнала нет, и не растягиваем шум на всю шкалу. */
export const SPECTRUM_SILENCE_DB = -75;
/** Показываемый динамический диапазон под пиком. */
export const SPECTRUM_RANGE_DB = 40;

/**
 * Уровни полос 0..100 по спектру AnalyserNode (дБ на бин).
 *
 * Каждая полоса берёт МАКСИМУМ по своему диапазону бинов, а не одиночный бин:
 * гармоника — узкий пик шириной в пару бинов, и выборка через равные
 * промежутки почти всегда попадала между пиками, показывая шумовой пол.
 * Шкала логарифмическая, иначе рабочий диапазон гитары (82–330 Гц) занимает
 * лишь первые полосы.
 *
 * Нормировка — относительно текущего пика, а не абсолютных децибел: гитара
 * через микрофон телефона даёт примерно −60 dBFS, и при абсолютной шкале все
 * полосы прижимались к нулю.
 */
export function computeSpectrumBars(freqBuf: Float32Array, sampleRate: number, out: Float32Array): void {
  const bars = out.length;
  const binWidth = sampleRate / (freqBuf.length * 2);
  const ratio = SPECTRUM_MAX_HZ / SPECTRUM_MIN_HZ;
  let peakDb = -Infinity;

  for (let i = 0; i < bars; i++) {
    const fLo = SPECTRUM_MIN_HZ * Math.pow(ratio, i / bars);
    const fHi = SPECTRUM_MIN_HZ * Math.pow(ratio, (i + 1) / bars);
    const loBin = Math.max(1, Math.floor(fLo / binWidth));
    const hiBin = Math.min(freqBuf.length - 1, Math.max(loBin, Math.ceil(fHi / binWidth)));
    let peak = -Infinity;
    for (let b = loBin; b <= hiBin; b++) {
      if (freqBuf[b] > peak) peak = freqBuf[b];
    }
    if (!Number.isFinite(peak)) peak = -100;
    out[i] = peak;
    if (peak > peakDb) peakDb = peak;
  }

  if (peakDb < SPECTRUM_SILENCE_DB) {
    out.fill(0);
    return;
  }
  const floor = peakDb - SPECTRUM_RANGE_DB;
  for (let i = 0; i < bars; i++) {
    const rel = (out[i] - floor) / SPECTRUM_RANGE_DB;
    out[i] = Math.max(0, Math.min(100, rel * 100));
  }
}
