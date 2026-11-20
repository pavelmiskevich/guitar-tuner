/**
 * БПФ и корреляция через него. Горячий путь: детектор высоты тона зовёт
 * корреляцию на каждом кадре анализа, поэтому здесь нет выделений памяти
 * внутри вызова.
 */

/** БПФ по месту, радикс-2. Длина — степень двойки. */
export function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  // Бит-реверсная перестановка. Обмен через временные переменные: запись
  // [a, b] = [b, a] создавала массив на каждую пару — тысячи объектов на кадр.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = (-2 * Math.PI) / size;
    const wRe = Math.cos(step);
    const wIm = Math.sin(step);
    for (let start = 0; start < n; start += size) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < half; k++) {
        const a = start + k;
        const b = a + half;
        const tRe = re[b] * curRe - im[b] * curIm;
        const tIm = re[b] * curIm + im[b] * curRe;
        re[b] = re[a] - tRe;
        im[b] = im[a] - tIm;
        re[a] += tRe;
        im[a] += tIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * Корреляция начала сигнала со всем сигналом:
 *
 *   out[τ] = Σ_{i < window} x[i] · x[i + τ],   τ = 0..maxLag
 *
 * Это числитель NSDF детектора (#14). Прямой счёт — window × maxLag умножений:
 * 2,6 млн на кадр для гитары и 4,2 млн для баса. Через БПФ — O(N log N), и
 * результат тот же с точностью до округления в Float64, а не приближение.
 *
 * Оба вещественных сигнала (начало и весь кадр) упакованы в одно комплексное
 * БПФ: начало — в действительную часть, кадр — в мнимую. Циклического
 * заворота нет: i + τ ≤ window − 1 + maxLag < len ≤ N.
 */
export class HeadCorrelator {
  private n = 0;
  private re = new Float64Array(0);
  private im = new Float64Array(0);
  private outRe = new Float64Array(0);
  private outIm = new Float64Array(0);

  private ensure(len: number): void {
    const n = nextPowerOfTwo(len);
    if (n === this.n) return;
    this.n = n;
    this.re = new Float64Array(n);
    this.im = new Float64Array(n);
    this.outRe = new Float64Array(n);
    this.outIm = new Float64Array(n);
  }

  /** Требует window + maxLag ≤ len. Пишет out[0..maxLag]. */
  correlate(x: Float32Array, len: number, window: number, maxLag: number, out: Float64Array): void {
    if (window + maxLag > len) throw new RangeError('window + maxLag > len');
    this.ensure(len);
    const { n, re, im, outRe, outIm } = this;

    for (let i = 0; i < n; i++) {
      re[i] = i < window ? x[i] : 0;
      im[i] = i < len ? x[i] : 0;
    }
    fftInPlace(re, im);

    // Z = H + iX. Разделяем спектры: H[k] = (Z[k] + conj Z[n−k]) / 2,
    // X[k] = (Z[k] − conj Z[n−k]) / 2i; спектр корреляции R = conj(H) · X.
    // Под обратное БПФ сразу кладём conj(R): IFFT(R) = conj(FFT(conj R)) / n.
    for (let k = 0; k < n; k++) {
      const j = (n - k) & (n - 1);
      const zr = re[k];
      const zi = im[k];
      const wr = re[j];
      const wi = im[j];
      const hr = (zr + wr) / 2;
      const hi = (zi - wi) / 2;
      const xr = (zi + wi) / 2;
      const xi = (wr - zr) / 2;
      outRe[k] = hr * xr + hi * xi;
      outIm[k] = -(hr * xi - hi * xr);
    }
    fftInPlace(outRe, outIm);

    // Корреляция вещественна: берём действительную часть.
    const scale = 1 / n;
    for (let tau = 0; tau <= maxLag; tau++) out[tau] = outRe[tau] * scale;
  }
}
