/**
 * Синтезатор физического моделирования струны (Karplus-Strong Algorithm)
 * и генератор эталонного синусоидального тона для настройки на слух
 */

let sharedAudioCtx: AudioContext | null = null;

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
 * Синтез щипка струны алгоритмом Karplus-Strong
 */
export function playGuitarString(freq: number, durationSec = 2.5, gainLevel = 0.6): void {
  try {
    const ctx = getAudioContext();
    const sampleRate = ctx.sampleRate;
    const periodSamples = Math.round(sampleRate / freq);
    const totalSamples = Math.floor(sampleRate * durationSec);

    const buffer = ctx.createBuffer(1, totalSamples, sampleRate);
    const output = buffer.getChannelData(0);

    // Инициализация случайным белым шумом (импульс медиатора)
    const delayLine = new Float32Array(periodSamples);
    for (let i = 0; i < periodSamples; i++) {
      delayLine[i] = (Math.random() * 2 - 1) * 0.9;
    }

    let delayIndex = 0;
    const damping = 0.992; // Затухание струны

    for (let i = 0; i < totalSamples; i++) {
      const currentSample = delayLine[delayIndex];
      output[i] = currentSample;

      // Простое фильтрование нижних частот (усреднение двух соседних сэмплов)
      const nextIndex = (delayIndex + 1) % periodSamples;
      const filteredSample = ((currentSample + delayLine[nextIndex]) * 0.5) * damping;

      delayLine[delayIndex] = filteredSample;
      delayIndex = nextIndex;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(gainLevel, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSec);

    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    source.start();
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
