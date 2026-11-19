import { describe, it, expect } from 'vitest';
import { StrumCapture, STRUM_SETTLE_MS, STRUM_WAIT_MS } from '../src/audio/strumCapture';

const WINDOW_MS = 683; // 32768 отсчётов на 48 кГц
const FRAME = 33;

describe('StrumCapture (#4)', () => {
  it('ждёт удара, пока тихо', () => {
    const capture = new StrumCapture(0, WINDOW_MS);
    for (let t = 0; t < 2000; t += FRAME) {
      expect(capture.update(-80, t).phase).toBe('waiting');
    }
  });

  it('после удара пропускает атаку и копит полное окно', () => {
    const capture = new StrumCapture(0, WINDOW_MS);
    capture.update(-80, 0);
    capture.update(-78, FRAME);
    const onsetAt = 2 * FRAME;
    expect(capture.update(-30, onsetAt).phase).toBe('recording');

    const readyAt = onsetAt + STRUM_SETTLE_MS + WINDOW_MS;
    const before = capture.update(-35, readyAt - 1);
    expect(before.phase).toBe('recording');
    expect(before.progress).toBeGreaterThan(0.95);
    expect(before.progress).toBeLessThan(1);

    const ready = capture.update(-40, readyAt);
    expect(ready.phase).toBe('ready');
    expect(ready.progress).toBe(1);
  });

  it('звук, который уже идёт при нажатии, считается ударом', () => {
    const capture = new StrumCapture(0, WINDOW_MS);
    expect(capture.update(-30, 0).phase).toBe('recording');
  });

  it('ровный фон без скачка ударом не считается', () => {
    const capture = new StrumCapture(0, WINDOW_MS);
    capture.update(-70, 0);
    for (let t = FRAME; t < 1000; t += FRAME) {
      expect(capture.update(-66 + (t % 2), t).phase).toBe('waiting');
    }
  });

  it('без удара сдаётся по таймауту, даже если кадры не приходят', () => {
    const capture = new StrumCapture(0, WINDOW_MS);
    capture.update(-80, 0);
    expect(capture.update(null, STRUM_WAIT_MS - 1).phase).toBe('waiting');
    expect(capture.update(null, STRUM_WAIT_MS).phase).toBe('timeout');
  });

  it('начатая запись таймаутом не обрывается', () => {
    const capture = new StrumCapture(0, WINDOW_MS);
    capture.update(-80, 0);
    capture.update(-30, STRUM_WAIT_MS - 100);
    expect(capture.update(null, STRUM_WAIT_MS + 100).phase).toBe('recording');
    expect(capture.update(null, STRUM_WAIT_MS - 100 + STRUM_SETTLE_MS + WINDOW_MS).phase).toBe('ready');
  });
});
