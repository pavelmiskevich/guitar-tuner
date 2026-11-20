import { describe, it, expect } from 'vitest';
import {
  DRUM_PATTERNS,
  NOISE_BUFFER_SECONDS,
  noiseBuffer,
  noiseOffset,
  playSynthesizedHiHat,
  playSynthesizedSnare
} from '../src/audio/drumSynth';

describe('Drum Patterns & Synthesis', () => {
  it('defines all required preset rhythms (Rock, Blues, Bossa Nova, Funk)', () => {
    const ids = DRUM_PATTERNS.map(p => p.id);
    expect(ids).toContain('rock');
    expect(ids).toContain('blues');
    expect(ids).toContain('bossa');
    expect(ids).toContain('funk');
  });

  it('verifies pattern step lengths and track consistency', () => {
    DRUM_PATTERNS.forEach(p => {
      expect(p.tracks.kick.length).toBe(p.stepsCount);
      expect(p.tracks.snare.length).toBe(p.stepsCount);
      expect(p.tracks.hihat.length).toBe(p.stepsCount);
      expect(p.defaultBpm).toBeGreaterThanOrEqual(60);
      expect(p.defaultBpm).toBeLessThanOrEqual(200);
    });
  });
});

describe('буфер шума барабанов (#14)', () => {
  /** Минимальный аудиоконтекст: считает созданные буферы и запоминает старт шума. */
  function fakeContext() {
    const param = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {} });
    const node = () => ({ connect() {}, frequency: param(), gain: param(), Q: param(), type: '' });
    const starts: number[] = [];
    let buffers = 0;
    const ctx = {
      sampleRate: 48000,
      destination: node(),
      createBuffer(_ch: number, length: number) {
        buffers++;
        const data = new Float32Array(length);
        return { length, getChannelData: () => data };
      },
      createBufferSource: () => ({ ...node(), buffer: null, start: (_t: number, offset = 0) => starts.push(offset), stop() {} }),
      createOscillator: () => ({ ...node(), start() {}, stop() {} }),
      createGain: node,
      createBiquadFilter: node
    };
    return { ctx: ctx as unknown as AudioContext, starts, buffers: () => buffers };
  }

  it('один буфер на контекст, сколько бы ударов ни было', () => {
    const { ctx, buffers } = fakeContext();
    for (let i = 0; i < 16; i++) {
      playSynthesizedHiHat(ctx, i * 0.1, i % 4 === 3);
      if (i % 4 === 2) playSynthesizedSnare(ctx, i * 0.1);
    }
    expect(buffers()).toBe(1);
    expect(noiseBuffer(ctx)).toBe(noiseBuffer(ctx));
  });

  it('у другого контекста — свой буфер', () => {
    const a = fakeContext();
    const b = fakeContext();
    expect(noiseBuffer(a.ctx)).not.toBe(noiseBuffer(b.ctx));
  });

  it('удар начинается внутри буфера и успевает прозвучать до его конца', () => {
    const { ctx, starts } = fakeContext();
    for (let i = 0; i < 50; i++) playSynthesizedHiHat(ctx, 0, true);
    for (const offset of starts) {
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset + 0.33).toBeLessThanOrEqual(NOISE_BUFFER_SECONDS);
    }
    expect(noiseOffset(5)).toBe(0);
  });
});
