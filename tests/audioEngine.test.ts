import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioEngineStatus } from '../src/audio/audioEngine';
import { AudioEngine, MicInterruptedError } from '../src/audio/audioEngine';

/**
 * Модульные тесты жизненного цикла микрофона (#8).
 *
 * Окружение — node без DOM, поэтому Web Audio и getUserMedia заменены
 * минимальными подделками на EventTarget: движку от них нужны только
 * состояния, события и освобождение ресурсов, а не настоящий звук.
 */

class FakeTrack extends EventTarget {
  readyState: 'live' | 'ended' = 'live';
  muted = false;
  stopped = false;

  stop(): void {
    this.stopped = true;
    this.readyState = 'ended';
  }

  /** Обрыв со стороны источника: отозвали разрешение, вытащили гарнитуру. */
  endBySource(): void {
    this.readyState = 'ended';
    this.dispatchEvent(new Event('ended'));
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.dispatchEvent(new Event(muted ? 'mute' : 'unmute'));
  }
}

class FakeStream {
  readonly tracks = [new FakeTrack()];
  getTracks(): FakeTrack[] { return this.tracks; }
  getAudioTracks(): FakeTrack[] { return this.tracks; }
}

class FakeAnalyser {
  fftSize = 2048;
  smoothingTimeConstant = 0.8;
  get frequencyBinCount(): number { return this.fftSize / 2; }
  getFloatTimeDomainData(): void {}
  getFloatFrequencyData(): void {}
  connect(): void {}
  disconnect(): void {}
}

class FakeAudioContext extends EventTarget {
  static instances: FakeAudioContext[] = [];
  /** Сбой при создании графа — для проверки освобождения ресурсов. */
  static failSourceCreation = false;

  state: 'running' | 'suspended' | 'closed' = 'running';
  readonly sampleRate = 48000;
  readonly analysers: FakeAnalyser[] = [];
  suspendCalls = 0;

  constructor() {
    super();
    FakeAudioContext.instances.push(this);
  }

  private changeState(next: FakeAudioContext['state']): void {
    if (this.state === next) return;
    this.state = next;
    // Браузер сообщает о смене состояния асинхронно.
    queueMicrotask(() => this.dispatchEvent(new Event('statechange')));
  }

  // Как и в браузере, resume() и suspend() меняют состояние не синхронно.
  async resume(): Promise<void> {
    await Promise.resolve();
    if (this.state !== 'closed') this.changeState('running');
  }

  async suspend(): Promise<void> {
    this.suspendCalls++;
    await Promise.resolve();
    if (this.state !== 'closed') this.changeState('suspended');
  }

  close(): Promise<void> {
    this.changeState('closed');
    return Promise.resolve();
  }

  /** Состояние меняет сама система: звонок на iOS, закрытие устройства. */
  externalState(next: FakeAudioContext['state']): void {
    this.changeState(next);
  }

  createMediaStreamSource() {
    if (FakeAudioContext.failSourceCreation) throw new Error('graph failed');
    return { connect: () => {}, disconnect: () => {} };
  }

  createAnalyser(): FakeAnalyser {
    const analyser = new FakeAnalyser();
    this.analysers.push(analyser);
    return analyser;
  }
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function domError(name: string, message = name): Error {
  const err = new Error(message);
  err.name = name;
  return err;
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

type FakeDocument = EventTarget & { hidden: boolean };

let getUserMedia: ReturnType<typeof vi.fn>;
let fakeDocument: FakeDocument;

function setHidden(hidden: boolean): void {
  fakeDocument.hidden = hidden;
  fakeDocument.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  FakeAudioContext.instances = [];
  FakeAudioContext.failSourceCreation = false;
  getUserMedia = vi.fn(async () => new FakeStream());
  fakeDocument = Object.assign(new EventTarget(), { hidden: false });

  vi.stubGlobal('window', { AudioContext: FakeAudioContext });
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  vi.stubGlobal('document', fakeDocument);
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function lastContext(): FakeAudioContext {
  const ctx = FakeAudioContext.instances.at(-1);
  if (!ctx) throw new Error('AudioContext не создавался');
  return ctx;
}

async function lastStream(): Promise<FakeStream> {
  const result = getUserMedia.mock.results.at(-1);
  if (!result) throw new Error('getUserMedia не вызывался');
  return (await result.value) as FakeStream;
}

describe('AudioEngine: запуск', () => {
  it('повторный start() во время запроса не открывает второй поток', async () => {
    const pending = deferred<FakeStream>();
    getUserMedia.mockImplementationOnce(() => pending.promise);
    const engine = new AudioEngine();

    const first = engine.start();
    const second = engine.start();
    await flush();
    expect(engine.getState()).toBe('requesting');

    pending.resolve(new FakeStream());
    await Promise.all([first, second]);

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(engine.getState()).toBe('running');
    expect(engine.isRunning()).toBe(true);
  });

  it('start() на работающем движке не запрашивает микрофон заново', async () => {
    const engine = new AudioEngine();
    await engine.start();
    await engine.start();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('ошибка при построении графа освобождает контекст и поток', async () => {
    FakeAudioContext.failSourceCreation = true;
    const onError = vi.fn();
    const engine = new AudioEngine({ onError });

    await expect(engine.start()).rejects.toThrow('graph failed');

    const stream = await lastStream();
    expect(stream.tracks.every(t => t.stopped)).toBe(true);
    expect(lastContext().state).toBe('closed');
    expect(engine.getState()).toBe('error');
    expect(engine.getStatus().error?.message).toBe('graph failed');
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('отказ в доступе закрывает контекст и не повторяет запрос', async () => {
    getUserMedia.mockRejectedValue(domError('NotAllowedError', 'Permission denied'));
    const engine = new AudioEngine();

    await expect(engine.start()).rejects.toThrow('Permission denied');

    // Второй запрос после отказа снова показал бы диалог разрешения.
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(lastContext().state).toBe('closed');
    expect(engine.getState()).toBe('error');
    expect(engine.getStatus().error?.name).toBe('NotAllowedError');
  });

  it('неподдержанные ограничения — повтор с простым запросом', async () => {
    getUserMedia.mockRejectedValueOnce(domError('OverconstrainedError'));
    const engine = new AudioEngine();

    await engine.start();

    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(engine.getState()).toBe('running');
  });

  it('без mediaDevices сообщает понятную ошибку', async () => {
    vi.stubGlobal('navigator', {});
    const engine = new AudioEngine();

    await expect(engine.start()).rejects.toThrow(/микрофон/i);
    expect(engine.getState()).toBe('error');
    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  it('stop() во время запроса отпускает поток, пришедший позже', async () => {
    const pending = deferred<FakeStream>();
    getUserMedia.mockImplementationOnce(() => pending.promise);
    const engine = new AudioEngine();

    const starting = engine.start();
    await flush();
    engine.stop();

    const stream = new FakeStream();
    pending.resolve(stream);
    await starting;

    expect(stream.tracks.every(t => t.stopped)).toBe(true);
    expect(lastContext().state).toBe('closed');
    expect(engine.getState()).toBe('uninitialized');
    expect(engine.isRunning()).toBe(false);
  });
});

describe('AudioEngine: остановка', () => {
  it('stop() освобождает микрофон, контекст и анализатор', async () => {
    const engine = new AudioEngine();
    await engine.start();
    const stream = await lastStream();

    engine.stop();

    expect(stream.tracks.every(t => t.stopped)).toBe(true);
    expect(lastContext().state).toBe('closed');
    expect((engine as unknown as { analyserNode: unknown }).analyserNode).toBeNull();
    expect(engine.getState()).toBe('uninitialized');
    expect(engine.getFrequencyData()).toBeNull();
  });

  it('после stop() можно запустить заново', async () => {
    const engine = new AudioEngine();
    await engine.start();
    engine.stop();
    await engine.start();

    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(engine.getState()).toBe('running');
  });
});

describe('AudioEngine: обрыв потока', () => {
  it('track ended переводит движок в ошибку, оповещает и освобождает ресурсы', async () => {
    const engine = new AudioEngine();
    const seen: AudioEngineStatus[] = [];
    engine.subscribeState(status => seen.push(status));
    await engine.start();
    const stream = await lastStream();

    stream.tracks[0].endBySource();

    expect(engine.getState()).toBe('error');
    expect(engine.isRunning()).toBe(false);
    const error = engine.getStatus().error;
    expect(error).toBeInstanceOf(MicInterruptedError);
    expect((error as MicInterruptedError).reason).toBe('ended');
    expect(seen.at(-1)?.state).toBe('error');
    expect(stream.tracks.every(t => t.stopped)).toBe(true);
    expect(lastContext().state).toBe('closed');
  });

  it('внешнее закрытие контекста — тоже обрыв', async () => {
    const engine = new AudioEngine();
    await engine.start();

    lastContext().externalState('closed');
    await flush();

    expect(engine.getState()).toBe('error');
    expect((engine.getStatus().error as MicInterruptedError).reason).toBe('closed');
  });

  it('приостановка контекста системой — пауза, возобновление — снова работа', async () => {
    const engine = new AudioEngine();
    await engine.start();
    const ctx = lastContext();
    const states: string[] = [];
    engine.subscribeState(status => states.push(status.state));

    ctx.externalState('suspended');
    await flush();

    // Пока контекст стоит, интерфейс видит паузу, а не «Микрофон активен»;
    // на видимой странице движок сам возобновляет контекст.
    expect(states).toEqual(['paused', 'running']);
    expect(ctx.state).toBe('running');
    expect(engine.getState()).toBe('running');
  });

  it('mute дорожки — пауза, unmute — работа', async () => {
    const engine = new AudioEngine();
    await engine.start();
    const track = (await lastStream()).tracks[0];

    track.setMuted(true);
    expect(engine.getState()).toBe('paused');

    track.setMuted(false);
    expect(engine.getState()).toBe('running');
  });

  it('свой stop() не считается обрывом', async () => {
    const engine = new AudioEngine();
    await engine.start();
    engine.stop();
    await flush();

    expect(engine.getState()).toBe('uninitialized');
    expect(engine.getStatus().error).toBeNull();
  });

  it('отписка от состояния прекращает оповещения', async () => {
    const engine = new AudioEngine();
    const listener = vi.fn();
    const unsubscribe = engine.subscribeState(listener);
    unsubscribe();

    await engine.start();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('AudioEngine: скрытая страница', () => {
  it('в фоне анализ стоит, контекст приостановлен; при возврате работа продолжается', async () => {
    const engine = new AudioEngine();
    await engine.start();
    const ctx = lastContext();

    setHidden(true);
    await flush();
    expect(engine.getState()).toBe('paused');
    expect(ctx.state).toBe('suspended');
    expect(cancelAnimationFrame).toHaveBeenCalled();

    setHidden(false);
    await flush();
    expect(ctx.state).toBe('running');
    expect(engine.getState()).toBe('running');
  });

  it('долгий фон отпускает микрофон', async () => {
    vi.useFakeTimers();
    const engine = new AudioEngine();
    await engine.start();
    const stream = await lastStream();

    setHidden(true);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(engine.getState()).toBe('error');
    expect((engine.getStatus().error as MicInterruptedError).reason).toBe('background');
    expect(stream.tracks.every(t => t.stopped)).toBe(true);
  });

  it('короткий фон микрофон не отпускает', async () => {
    vi.useFakeTimers();
    const engine = new AudioEngine();
    await engine.start();

    setHidden(true);
    await vi.advanceTimersByTimeAsync(10_000);
    setHidden(false);
    await vi.advanceTimersByTimeAsync(120_000);

    expect(engine.getState()).toBe('running');
  });
});

describe('AudioEngine: собственный звук', () => {
  it('getFrequencyData() молчит, пока звучит эталон', async () => {
    const engine = new AudioEngine();
    await engine.start();
    expect(engine.getFrequencyData()).not.toBeNull();

    engine.suppressFor(1000);
    expect(engine.getFrequencyData()).toBeNull();
  });
});
