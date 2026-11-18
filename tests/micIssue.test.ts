import { describe, expect, it } from 'vitest';
import { MicInterruptedError } from '../src/audio/audioEngine';
import { classifyMicError } from '../src/audio/micIssue';

function named(name: string): Error {
  const err = new Error(name);
  err.name = name;
  return err;
}

describe('classifyMicError', () => {
  it('нет ошибки — нет проблемы', () => {
    expect(classifyMicError(null)).toBeNull();
  });

  it('отказ в доступе отличается от занятого и отсутствующего микрофона', () => {
    // Раньше всё показывалось как «Нет доступа», и человек с микрофоном,
    // занятым звонком, искал в настройках разрешение, которое у него есть.
    expect(classifyMicError(named('NotAllowedError'))).toBe('denied');
    expect(classifyMicError(named('SecurityError'))).toBe('denied');
    expect(classifyMicError(named('NotReadableError'))).toBe('busy');
    expect(classifyMicError(named('NotFoundError'))).toBe('not-found');
    expect(classifyMicError(named('NotSupportedError'))).toBe('unsupported');
    expect(classifyMicError(new Error('что-то иное'))).toBe('failed');
  });

  it('обрыв работавшего потока — отдельная проблема', () => {
    expect(classifyMicError(new MicInterruptedError('ended', 'оборвался'))).toBe('interrupted');
  });
});
