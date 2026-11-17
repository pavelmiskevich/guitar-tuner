import type { PitchEstimate } from './dsp';
import { ANALYSIS_LENGTH, PitchDetector, decimate, decimationFactor } from './dsp';

export type AudioEngineState = 'uninitialized' | 'requesting' | 'running' | 'paused' | 'error';

export type EstimateCallback = (
  estimate: PitchEstimate,
  rawBuffer: Float32Array,
  frequencyBuffer?: Float32Array,
  sampleRate?: number
) => void;

/** Диапазон поиска основного тона, Гц. */
export interface PitchRange {
  minFreq: number;
  maxFreq: number;
}

/** До выбора строя — прежние границы детектора. */
const DEFAULT_PITCH_RANGE: PitchRange = { minFreq: 40, maxFreq: 1400 };

export interface AudioEngineOptions {
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
  private pitchRange: PitchRange = DEFAULT_PITCH_RANGE;
  /** Во сколько раз прореживается вход: при 96/192 кГц кадр остаётся ~85 мс. */
  private decimation = 1;
  /** Кадр для детектора после прореживания. */
  private analysisFrame = new Float32Array(ANALYSIS_LENGTH);
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
    this.timeDataArray = new Float32Array(ANALYSIS_LENGTH * 2);
    this.freqDataArray = new Float32Array(ANALYSIS_LENGTH);
    this.detector = new PitchDetector(48000, ANALYSIS_LENGTH);

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

  /**
   * Где искать основной тон. Задаётся по текущему строю (см. pitchSearchRange):
   * постоянная граница 40 Гц отрезала B0 пятиструнного баса и спущенную E1.
   */
  public setPitchRange(range: PitchRange): void {
    this.pitchRange = range;
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

      const sampleRate = this.audioContext.sampleRate;
      this.decimation = decimationFactor(sampleRate);
      this.detector = new PitchDetector(sampleRate / this.decimation, ANALYSIS_LENGTH);

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
      // Окно анализатора — вдвое длиннее кадра детектора (как и раньше на 48 кГц):
      // спектр для проверки аккорда и спектрограммы сохраняет разрешение, а
      // детектор берёт из временных данных последние, самые свежие отсчёты.
      // Предел Web Audio — 32768, его хватает и для 192 кГц.
      this.analyserNode.fftSize = Math.min(32768, ANALYSIS_LENGTH * 2 * this.decimation);
      this.timeDataArray = new Float32Array(this.analyserNode.fftSize);
      this.freqDataArray = new Float32Array(this.analyserNode.frequencyBinCount);
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

      // Раньше детектору отдавался массив вдвое короче окна анализатора, и
      // getFloatTimeDomainData заполнял его самыми старыми отсчётами — показания
      // запаздывали на лишние ~85 мс. decimate берёт последние отсчёты окна.
      decimate(this.timeDataArray, this.decimation, this.analysisFrame);
      const estimate = this.detector.detectPitch(
        this.analysisFrame,
        this.pitchRange.minFreq,
        this.pitchRange.maxFreq
      );
      const sampleRate = this.audioContext?.sampleRate || 48000;

      for (const listener of this.listeners) {
        try {
          listener(estimate, this.analysisFrame, this.freqDataArray, sampleRate);
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
