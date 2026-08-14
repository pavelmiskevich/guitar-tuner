import type { PitchEstimate } from './dsp';
import { PitchDetector } from './dsp';

export type AudioEngineState = 'uninitialized' | 'requesting' | 'running' | 'paused' | 'error';

export type EstimateCallback = (
  estimate: PitchEstimate,
  rawBuffer: Float32Array,
  frequencyBuffer?: Float32Array,
  sampleRate?: number
) => void;

export interface AudioEngineOptions {
  sampleRate?: number;
  bufferSize?: number;
  onEstimate?: EstimateCallback;
  onError?: (err: Error) => void;
  onStateChange?: (state: AudioEngineState) => void;
}

/**
 * Частота анализа. Детекция тона стоит миллисекунды процессорного времени, и на
 * каждом кадре 60 fps она впустую жжёт батарею: стрелка тюнера всё равно
 * сглажена, а 30 измерений в секунду человек воспринимает как мгновенный отклик.
 */
const ANALYSIS_FPS = 30;
const ANALYSIS_INTERVAL_MS = 1000 / ANALYSIS_FPS;

export class AudioEngine {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private detector: PitchDetector;
  private bufferSize: number;
  private state: AudioEngineState = 'uninitialized';
  private animationFrameId: number | null = null;
  private timeDataArray: Float32Array;
  private freqDataArray: Float32Array;

  private listeners: Set<EstimateCallback> = new Set();
  /** До этого момента оценки не рассылаются: приложение играет само. */
  private suppressUntil = 0;
  private lastAnalysisAt = 0;
  private onError?: (err: Error) => void;
  private onStateChange?: (state: AudioEngineState) => void;

  constructor(options: AudioEngineOptions = {}) {
    this.bufferSize = options.bufferSize || 4096;
    this.timeDataArray = new Float32Array(this.bufferSize);
    this.freqDataArray = new Float32Array(this.bufferSize);
    this.detector = new PitchDetector(48000, this.bufferSize);

    if (options.onEstimate) {
      this.listeners.add(options.onEstimate);
    }
    this.onError = options.onError;
    this.onStateChange = options.onStateChange;

    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  /**
   * Заглушить анализ на время собственного воспроизведения.
   *
   * Динамик телефона слышен своему же микрофону, и без этого приложение
   * анализирует эталонный звук как игру пользователя: тюнер «проверяет строй»
   * собственного тона, а тренажёр слуха мог бы засчитать сыгранный вопрос
   * за ответ.
   */
  public suppressFor(ms: number): void {
    this.suppressUntil = Math.max(this.suppressUntil, performance.now() + ms);
  }

  public isSuppressed(): boolean {
    return performance.now() < this.suppressUntil;
  }

  public subscribe(cb: EstimateCallback): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  public getState(): AudioEngineState {
    return this.state;
  }

  public isRunning(): boolean {
    return this.state === 'running' && this.audioContext !== null && this.mediaStream !== null;
  }

  public getSampleRate(): number {
    return this.audioContext?.sampleRate || 48000;
  }

  private setState(newState: AudioEngineState) {
    this.state = newState;
    this.onStateChange?.(newState);
  }

  private handleVisibilityChange() {
    if (!document.hidden && this.state === 'running' && this.audioContext) {
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }
      if (this.animationFrameId === null) {
        this.startLoop();
      }
    }
  }

  /**
   * Запуск захвата микрофона со строгим отключением AGC/NS/AEC
   */
  public async start(): Promise<void> {
    if (this.isRunning()) {
      if (this.audioContext && this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      if (this.animationFrameId === null) {
        this.startLoop();
      }
      return;
    }

    this.setState('requesting');

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioCtx({ latencyHint: 'interactive' });
      }
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.detector = new PitchDetector(this.audioContext.sampleRate, this.bufferSize);

      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        },
        video: false
      };

      try {
        this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      }

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = this.bufferSize * 2;
      this.analyserNode.smoothingTimeConstant = 0.05;

      this.sourceNode.connect(this.analyserNode);

      this.setState('running');
      this.startLoop();
    } catch (err) {
      this.setState('error');
      const error = err instanceof Error ? err : new Error(String(err));
      this.onError?.(error);
      throw error;
    }
  }

  private startLoop() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // После паузы или возврата на вкладку первый кадр анализируем сразу.
    this.lastAnalysisAt = 0;

    const tick = () => {
      if (this.state !== 'running' || !this.analyserNode) {
        this.animationFrameId = null;
        return;
      }

      // Если аудио-контекст случайно перешёл в suspended — возобновляем
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }

      const now = performance.now();
      if (now - this.lastAnalysisAt < ANALYSIS_INTERVAL_MS) {
        this.animationFrameId = requestAnimationFrame(tick);
        return;
      }
      this.lastAnalysisAt = now;

      // @ts-expect-error Float32Array buffer compatibility
      this.analyserNode.getFloatTimeDomainData(this.timeDataArray);
      // @ts-expect-error Float32Array buffer compatibility
      this.analyserNode.getFloatFrequencyData(this.freqDataArray);

      // Пока звучит собственный эталон, оценки не рассылаем вовсе.
      if (this.isSuppressed()) {
        this.animationFrameId = requestAnimationFrame(tick);
        return;
      }

      const estimate = this.detector.detectPitch(this.timeDataArray);
      const sampleRate = this.audioContext?.sampleRate || 48000;

      for (const listener of this.listeners) {
        try {
          listener(estimate, this.timeDataArray, this.freqDataArray, sampleRate);
        } catch (e) {
          console.error('Error in audio estimate listener:', e);
        }
      }

      this.animationFrameId = requestAnimationFrame(tick);
    };

    this.animationFrameId = requestAnimationFrame(tick);
  }

  /**
   * Получение текущего спектра частот
   */
  public getFrequencyData(): { data: Float32Array; sampleRate: number } | null {
    if (!this.analyserNode || this.state !== 'running') return null;
    // @ts-expect-error Float32Array buffer compatibility
    this.analyserNode.getFloatFrequencyData(this.freqDataArray);
    return {
      data: new Float32Array(this.freqDataArray),
      sampleRate: this.audioContext?.sampleRate || 48000
    };
  }

  public stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    this.setState('uninitialized');
  }

  public destroy(): void {
    this.stop();
    this.listeners.clear();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }
}

// Глобальный разделяемый инстанс AudioEngine для непрерывной работы микрофона между вкладками
export const sharedAudioEngine = new AudioEngine();
