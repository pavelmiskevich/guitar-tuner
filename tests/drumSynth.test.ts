import { describe, it, expect } from 'vitest';
import { DRUM_PATTERNS } from '../src/audio/drumSynth';

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
