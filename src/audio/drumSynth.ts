/**
 * Web Audio API Acoustic Drum Synthesizer
 * Физико-математический синтез акустических ударных инструментов без внешних аудиосемплов.
 */

export interface DrumPattern {
  id: string;
  name: string;
  genre: string;
  defaultBpm: number;
  stepsCount: number; // 16 для прямых ритмов, 12 для триольного блюза
  description: string;
  tracks: {
    kick: number[]; // 0 = тишина, 1 = удар, 0.5 = ghost note
    snare: number[];
    hihat: number[]; // 1 = closed, 2 = open
    perc?: number[]; // shaker / cross-stick
  };
}

export const DRUM_PATTERNS: DrumPattern[] = [
  {
    id: 'rock',
    name: 'Classic Rock',
    genre: 'Рок (4/4)',
    defaultBpm: 120,
    stepsCount: 16,
    description: 'Прямой энергичный рок-бит с акцентами малого барабана на 2-ю и 4-ю доли.',
    tracks: {
      kick:  [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0],
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      hihat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 2]
    }
  },
  {
    id: 'blues',
    name: 'Blues Shuffle',
    genre: 'Блюз / Свинг',
    defaultBpm: 110,
    stepsCount: 12, // Триольная сетка (12 восьмых долей)
    description: 'Блюзовый триольный шаффл со свингованным хай-хэтом и качающей бочкой.',
    tracks: {
      kick:  [1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0],
      snare: [0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0],
      hihat: [1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1]
    }
  },
  {
    id: 'bossa',
    name: 'Bossa Nova',
    genre: 'Латина / Босса-нова',
    defaultBpm: 130,
    stepsCount: 16,
    description: 'Бразильский ритм босса-новы с синкопированным римшотом и мягким пульсом.',
    tracks: {
      kick:  [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
      snare: [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0], // Cross-stick клаве
      hihat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0]
    }
  },
  {
    id: 'funk',
    name: 'Funk Groove',
    genre: 'Фанк (16-е доли)',
    defaultBpm: 105,
    stepsCount: 16,
    description: 'Плотный фанковый грув с быстрыми 16-ми долями и синкопированной бочкой.',
    tracks: {
      kick:  [1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0],
      snare: [0, 0, 0, 0, 1, 0, 0, 0.4, 0, 0, 1, 0, 0.4, 0, 0, 0],
      hihat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2]
    }
  }
];

/**
 * Синтез бочки (Kick)
 */
export function playSynthesizedKick(ctx: AudioContext, time: number, gainValue = 1.0) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  // Быстрый спад высоты тона от 160 Гц до 38 Гц
  osc.frequency.setValueAtTime(160, time);
  osc.frequency.exponentialRampToValueAtTime(38, time + 0.12);

  gain.gain.setValueAtTime(gainValue * 1.1, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(time);
  osc.stop(time + 0.36);
}

/**
 * Синтез малого барабана (Snare)
 */
export function playSynthesizedSnare(ctx: AudioContext, time: number, isCrossStick = false, gainValue = 1.0) {
  if (isCrossStick) {
    // Cross-stick / Rimshot
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420, time);
    gain.gain.setValueAtTime(0.7 * gainValue, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.07);
    return;
  }

  // Тональная составляющая тела барабана
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(180, time);
  osc.frequency.exponentialRampToValueAtTime(90, time + 0.1);
  oscGain.gain.setValueAtTime(0.5 * gainValue, time);
  oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
  osc.connect(oscGain);
  oscGain.connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.16);

  // Шумовая составляющая струн подструнника
  const bufferSize = ctx.sampleRate * 0.2;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.setValueAtTime(1000, time);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.8 * gainValue, time);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(ctx.destination);

  noise.start(time);
  noise.stop(time + 0.19);
}

/**
 * Синтез хай-хэта (Closed / Open Hi-Hat)
 */
export function playSynthesizedHiHat(ctx: AudioContext, time: number, isOpen = false, gainValue = 1.0) {
  const duration = isOpen ? 0.32 : 0.05;
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(8500, time);
  filter.Q.setValueAtTime(1.8, time);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.6 * gainValue, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  noise.start(time);
  noise.stop(time + duration + 0.01);
}
