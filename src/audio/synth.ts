/**
 * Синтезатор физического моделирования струны (Karplus-Strong Algorithm)
 * и генератор эталонного синусоидального тона для настройки на слух
 */

import { sharedAudioEngine } from './audioEngine';

let sharedAudioCtx: AudioContext | null = null;

/** Запас после затухания: динамик и комната отзвучивают не мгновенно. */
const SELF_PLAY_TAIL_MS = 400;

function getAudioContext(): AudioContext {
  if (!sharedAudioCtx) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume();
  }
  return sharedAudioCtx;
}

/**
 * Рендер щипка струны алгоритмом Karplus-Strong с дробной задержкой.
 *
 * Чистая функция: не трогает Web Audio, поэтому её высоту можно измерить
 * модульным тестом. Раньше длина линии задержки округлялась до целого
 * (`Math.round(sampleRate / freq)`), и на высоких нотах это давало заметную
 * расстройку — при 44100 Гц, типичных для iOS, B3 звучала на 8.9 цента ниже
 * цели, а E4 на 9.2. Тюнер честно показывал «не в строе» для собственного же
 * эталона. Остаток периода теперь берёт на себя всепропускающий фильтр.
 */
export function renderPluckedString(
  freq: number,
  sampleRate: number,
  durationSec: number
): Float32Array {
  const totalSamples = Math.floor(sampleRate * durationSec);
  const out = new Float32Array(totalSamples);

  const period = sampleRate / freq;
  // Усредняющий фильтр в петле даёт задержку в полсэмпла, остальное — линия
  // плюс всепропускающий интерполятор.
  const lineLength = Math.max(2, Math.floor(period - 0.5));
  const fraction = period - 0.5 - lineLength;
  const allpassCoeff = (1 - fraction) / (1 + fraction);

  const line = new Float32Array(lineLength);
  for (let i = 0; i < lineLength; i++) {
    line[i] = (Math.random() * 2 - 1) * 0.9; // импульс медиатора
  }

  const damping = 0.996;
  let index = 0;
  let lowpassPrev = 0;
  let allpassX = 0;
  let allpassY = 0;

  for (let i = 0; i < totalSamples; i++) {
    const sample = line[index];
    out[i] = sample;

    const lowpass = 0.5 * (sample + lowpassPrev) * damping;
    lowpassPrev = sample;

    const allpass = allpassCoeff * lowpass + allpassX - allpassCoeff * allpassY;
    allpassX = lowpass;
    allpassY = allpass;

    line[index] = allpass;
    index = (index + 1) % lineLength;
  }

  return out;
}

/**
 * Синтез щипка струны алгоритмом Karplus-Strong
 */
export function playGuitarString(freq: number, durationSec = 2.5, gainLevel = 0.6): void {
  try {
    const ctx = getAudioContext();
    const rendered = renderPluckedString(freq, ctx.sampleRate, durationSec);

    const buffer = ctx.createBuffer(1, rendered.length, ctx.sampleRate);
    buffer.getChannelData(0).set(rendered);

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(gainLevel, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSec);

    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    source.start();
    // Микрофон услышит этот звук — на время воспроизведения анализ выключаем.
    sharedAudioEngine.suppressFor(durationSec * 1000 + SELF_PLAY_TAIL_MS);
  } catch (e) {
    console.warn('Synth audio play error:', e);
  }
}

/**
 * Простой чистый синусоидальный тон с мягкой огибающей
 */
export function playSineTone(freq: number, durationSec = 1.5, volume = 0.3): void {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + durationSec);
  } catch (e) {
    console.warn('Sine tone error:', e);
  }
}
