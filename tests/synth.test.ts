import { describe, it, expect } from 'vitest';
import { renderPluckedString } from '../src/audio/synth';
import { midiToFrequency, calculateCents } from '../src/domain/notes';
import { TUNING_PRESETS } from '../src/domain/tunings';

/**
 * Оценка основного тона автокорреляцией с параболическим уточнением пика.
 * Берём установившуюся часть сигнала: в первых миллисекундах ещё слышен
 * широкополосный импульс медиатора.
 */
function estimateFrequency(buffer: Float32Array, sampleRate: number): number {
  const start = Math.floor(buffer.length * 0.2);
  const length = Math.min(16384, buffer.length - start);
  const x = buffer.subarray(start, start + length);

  const correlationAt = (lag: number): number => {
    let sum = 0;
    for (let i = 0; i < length - lag; i++) sum += x[i] * x[i + lag];
    return sum;
  };

  const minLag = Math.floor(sampleRate / 500);
  const maxLag = Math.floor(sampleRate / 60);
  let bestLag = minLag;
  let best = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const value = correlationAt(lag);
    if (value > best) {
      best = value;
      bestLag = lag;
    }
  }

  const before = correlationAt(bestLag - 1);
  const after = correlationAt(bestLag + 1);
  const shift = (before - after) / (2 * (before - 2 * best + after));
  return sampleRate / (bestLag + shift);
}

describe('Синтез щипка струны', () => {
  // 44100 — типичная частота на iOS, 48000 — на десктопе. Ошибка округления
  // линии задержки зависит от частоты дискретизации, поэтому проверяем обе.
  const sampleRates = [44100, 48000];
  const standardE = TUNING_PRESETS[0];

  for (const sampleRate of sampleRates) {
    for (const string of standardE.strings) {
      const target = midiToFrequency(string.open.midi);
      const name = `${string.open.name}${string.open.octave}`;

      it(`${name} звучит в цель при ${sampleRate} Гц`, () => {
        const rendered = renderPluckedString(target, sampleRate, 1);
        const measured = estimateFrequency(rendered, sampleRate);
        const cents = calculateCents(measured, target);

        // Порог «в строе» в приложении — 5 центов при строгой настройке 3.
        // Эталон обязан быть заметно точнее, иначе тюнер ловит собственный звук
        // как расстроенный: до исправления B3 при 44100 давала -8.9 цента.
        expect(Math.abs(cents), `${name}: отклонение ${cents.toFixed(2)}¢`).toBeLessThan(1);
      });
    }
  }

  it('высокие ноты не уходят по высоте сильнее низких', () => {
    // Ошибка целочисленной линии задержки росла с частотой: на A4 она была
    // максимальной. Проверяем именно верх диапазона.
    for (const sampleRate of sampleRates) {
      const target = 440;
      const measured = estimateFrequency(renderPluckedString(target, sampleRate, 1), sampleRate);
      const cents = calculateCents(measured, target);
      expect(Math.abs(cents), `A4 при ${sampleRate}: ${cents.toFixed(2)}¢`).toBeLessThan(1);
    }
  });
});
