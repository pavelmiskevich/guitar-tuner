import type { PitchEstimate } from './dsp';
import { PitchDetector } from './dsp';

export type AudioEngineState = 'uninitialized' | 'requesting' | 'running' | 'paused' | 'error';

export interface AudioEngineOptions {
  sampleRate?: number;
  bufferSize?: number;
  onEstimate?: (
    estimate: PitchEstimate,
    rawBuffer: Float32Array,
    frequencyBuffer?: Float32Array,
    sampleRate?: number
  ) => void;
  onError?: (err: Error) => void;
  onStateChange?: (state: AudioEngineState) => void;
}

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
  private onEstimate?: (
    estimate: PitchEstimate,
    rawBuffer: Float32Array,
    frequencyBuffer?: Float32Array,
    sampleRate?: number
  ) => void;
  private onError?: (err: Error) => void;
  private onStateChange?: (state: AudioEngineState) => void;

  constructor(options: AudioEngineOptions = {}) {
    this.bufferSize = options.bufferSize || 4096;
    this.timeDataArray = new Float32Array(this.bufferSize);
    this.freqDataArray = new Float32Array(this.bufferSize);
    this.detector = new PitchDetector(48000, this.bufferSize);
    this.onEstimate = options.onEstimate;
    this.onError = options.onError;
    this.onStateChange = options.onStateChange;

    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  public getState(): AudioEngineState {
    return this.state;
  }

  public getSampleRate(): number {
    return this.audioContext?.sampleRate || 48000;
  }

  private setState(newState: AudioEngineState) {
    this.state = newState;
    this.onStateChange?.(newState);
  }

  private handleVisibilityChange() {
    if (document.hidden) {
      if (this.state === 'running' && this.audioContext) {
        this.audioContext.suspend();
        this.setState('paused');
      }
    } else {
      if (this.state === 'paused' && this.audioContext) {
        this.audioContext.resume();
        this.setState('running');
      }
    }
  }

  /**
   * Запуск захвата микрофона со строгим отключением AGC/NS/AEC
   */
  public async start(): Promise<void> {
    if (this.state === 'running') return;
    this.setState('requesting');

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioCtx({ latencyHint: 'interactive' });
      await this.audioContext.resume();

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
      this.analyserNode.smoothingTimeConstant = 0.1;

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
    const tick = () => {
      if (this.state !== 'running' || !this.analyserNode) {
        return;
      }

      // @ts-expect-error Float32Array buffer compatibility
      this.analyserNode.getFloatTimeDomainData(this.timeDataArray);
      // @ts-expect-error Float32Array buffer compatibility
      this.analyserNode.getFloatFrequencyData(this.freqDataArray);

      const estimate = this.detector.detectPitch(this.timeDataArray);
      const sampleRate = this.audioContext?.sampleRate || 48000;

      this.onEstimate?.(estimate, this.timeDataArray, this.freqDataArray, sampleRate);

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
      this.audioContext.close();
      this.audioContext = null;
    }

    this.setState('uninitialized');
  }

  public destroy(): void {
    this.stop();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }
}
