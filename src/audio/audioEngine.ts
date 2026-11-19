import type { PitchEstimate } from './dsp';
import { ANALYSIS_LENGTH, PitchDetector, decimate, decimationFactor } from './dsp';

/**
 * Состояния движка.
 *
 * `paused` — микрофон захвачен, но анализа нет: страница скрыта, система
 * приостановила звук (звонок на iOS) или дорожка временно заглушена. От
 * `running` отличается тем, что оценки не приходят, и интерфейс не должен
 * утверждать «Микрофон активен».
 */
export type AudioEngineState = 'uninitialized' | 'requesting' | 'running' | 'paused' | 'error';

/** Снимок состояния: объект меняется только при смене, его можно отдавать в useSyncExternalStore. */
export interface AudioEngineStatus {
  readonly state: AudioEngineState;
  /** Последняя ошибка: отказ в доступе при запуске или обрыв уже работавшего потока. */
  readonly error: Error | null;
}

export type StateCallback = (status: AudioEngineStatus) => void;

/** Почему уже работавший микрофон перестал работать. */
export type MicInterruptionReason = 'ended' | 'closed' | 'background';

/**
 * Обрыв работавшего потока. Отдельный класс, чтобы интерфейс отличал его от
 * отказа в доступе при запуске: подсказка «разрешите в браузере» тут обычно
 * не к месту — чаще вытащили гарнитуру или микрофон занял звонок.
 */
export class MicInterruptedError extends Error {
  readonly reason: MicInterruptionReason;

  constructor(reason: MicInterruptionReason, message: string) {
    super(message);
    this.name = 'MicInterruptedError';
    this.reason = reason;
  }
}

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

/**
 * Сколько держать микрофон на скрытой странице. Короткий уход — подсмотреть
 * аккорды в другом приложении, ответить на сообщение — не должен заставлять
 * заново включать микрофон. Но и часами держать его в фоне незачем: горит
 * системный индикатор записи, на Android висит уведомление, тратится батарея.
 */
export const BACKGROUND_RELEASE_MS = 60_000;

/**
 * Сколько отсчётов держит анализатор захвата для проверки аккорда по удару (#4):
 * предел Web Audio, ~0,68 с на 48 кГц. Спектр по такому окну различает
 * основные тоны соседних струн, а спектр основного анализатора (~0,17 с) — нет.
 */
export const CAPTURE_LENGTH = 32768;

/** Сырой сигнал: обработка речи (AGC/NS/AEC) искажает тон и атаку струны. */
const RAW_AUDIO_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false
  },
  video: false
};

function isPageHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden === true;
}

/** Отказ пользователя или политики: повторный запрос его не исправит. */
function isPermissionError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
}

async function requestMicrophone(mediaDevices: MediaDevices): Promise<MediaStream> {
  try {
    return await mediaDevices.getUserMedia(RAW_AUDIO_CONSTRAINTS);
  } catch (err) {
    // После отказа второй запрос в части браузеров снова показывает диалог
    // разрешения — пользователь только что ответил «нет», повторять незачем.
    if (isPermissionError(err)) throw err;
    // Остальное (обычно неподдержанные ограничения) — пробуем без них.
    return mediaDevices.getUserMedia({ audio: true, video: false });
  }
}

function releaseStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach(track => track.stop());
}

function closeContext(ctx: AudioContext | null): void {
  if (ctx && ctx.state !== 'closed') ctx.close().catch(() => {});
}

export class AudioEngine {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private captureAnalyser: AnalyserNode | null = null;
  private captureBuffer = new Float32Array(CAPTURE_LENGTH);
  private detector: PitchDetector;
  private pitchRange: PitchRange = DEFAULT_PITCH_RANGE;
  /** Во сколько раз прореживается вход: при 96/192 кГц кадр остаётся ~85 мс. */
  private decimation = 1;
  /** Кадр для детектора после прореживания. */
  private analysisFrame = new Float32Array(ANALYSIS_LENGTH);
  private status: AudioEngineStatus = { state: 'uninitialized', error: null };
  private stateListeners: Set<StateCallback> = new Set();
  /**
   * Запуск «в полёте». Без него два вызова подряд (двойное нажатие, пока висит
   * запрос разрешения) давали два getUserMedia, ссылка на первый поток терялась,
   * и индикатор микрофона в браузере горел до закрытия вкладки.
   */
  private startPromise: Promise<void> | null = null;
  /** Номер сеанса захвата: stop() во время запроса делает запуск устаревшим. */
  private session = 0;
  /** Подписки на события текущего потока и контекста — снимаются разом. */
  private sessionEvents: AbortController | null = null;
  private backgroundTimer: ReturnType<typeof setTimeout> | null = null;
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

  /**
   * Подписка на смену состояния. Раньше экраны снимали его один раз при
   * монтировании и не узнавали ни об обрыве, ни о выключении с другого экрана.
   */
  public subscribeState(cb: StateCallback): () => void {
    this.stateListeners.add(cb);
    return () => {
      this.stateListeners.delete(cb);
    };
  }

  public getStatus(): AudioEngineStatus {
    return this.status;
  }

  public getState(): AudioEngineState {
    return this.status.state;
  }

  /** Микрофон захвачен и анализ идёт. */
  public isRunning(): boolean {
    return this.status.state === 'running' && this.audioContext !== null && this.mediaStream !== null;
  }

  /** Микрофон захвачен — анализ идёт или стоит на паузе. */
  public isCapturing(): boolean {
    const { state } = this.status;
    return (state === 'running' || state === 'paused') && this.audioContext !== null && this.mediaStream !== null;
  }

  public getSampleRate(): number {
    return this.audioContext?.sampleRate || 48000;
  }

  private setStatus(state: AudioEngineState, error: Error | null = null): void {
    if (this.status.state === state && this.status.error === error) return;
    this.status = { state, error };
    this.onStateChange?.(state);
    for (const listener of this.stateListeners) {
      try {
        listener(this.status);
      } catch (e) {
        console.error('Error in audio state listener:', e);
      }
    }
  }

  private handleVisibilityChange() {
    this.updateActivity();
  }

  /**
   * Запуск захвата микрофона со строгим отключением AGC/NS/AEC.
   *
   * Повторный вызов во время запроса возвращает тот же промис, а не открывает
   * второй поток. На уже захваченном микрофоне (в том числе на паузе) — только
   * возобновляет анализ: кнопка «Продолжить» вызывается жестом пользователя,
   * без которого iOS не даёт снять контекст с паузы.
   */
  public start(): Promise<void> {
    if (this.startPromise) return this.startPromise;
    if (this.isCapturing()) return this.resumeCapture();

    const attempt = this.startCapture();
    this.startPromise = attempt;
    const clear = () => {
      if (this.startPromise === attempt) this.startPromise = null;
    };
    attempt.then(clear, clear);
    return attempt;
  }

  private async resumeCapture(): Promise<void> {
    const ctx = this.audioContext;
    if (ctx && ctx.state !== 'running' && ctx.state !== 'closed' && !isPageHidden()) {
      try {
        await ctx.resume();
      } catch {
        // Остаёмся на паузе — updateActivity ниже покажет это честно.
      }
    }
    this.updateActivity();
  }

  private async startCapture(): Promise<void> {
    const session = ++this.session;
    this.setStatus('requesting');

    // До присвоения полям ресурсы живут в локальных переменных: при ошибке или
    // устаревшем запуске их освобождает сама попытка, а не stop().
    let ctx: AudioContext | null = null;
    let stream: MediaStream | null = null;

    try {
      const mediaDevices = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
      if (!mediaDevices?.getUserMedia) {
        // Так бывает на странице без HTTPS и во встроенных браузерах приложений.
        const unsupported = new Error('Браузер не даёт доступ к микрофону на этой странице');
        unsupported.name = 'NotSupportedError';
        throw unsupported;
      }

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AudioCtx({ latencyHint: 'interactive' });
      // Возобновляем до запроса разрешения: пока висит диалог, жест
      // пользователя «остывает», и Safari потом не даёт запустить звук.
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      if (session === this.session) {
        stream = await requestMicrophone(mediaDevices);
      }

      if (session !== this.session) {
        // Пока ждали разрешения, микрофон выключили — поток уже не нужен.
        releaseStream(stream);
        closeContext(ctx);
        return;
      }
      if (!stream) return;

      const sampleRate = ctx.sampleRate;
      const decimation = decimationFactor(sampleRate);
      const sourceNode = ctx.createMediaStreamSource(stream);
      const analyserNode = ctx.createAnalyser();
      // Окно анализатора — вдвое длиннее кадра детектора (как и раньше на 48 кГц):
      // спектр для проверки аккорда и спектрограммы сохраняет разрешение, а
      // детектор берёт из временных данных последние, самые свежие отсчёты.
      // Предел Web Audio — 32768, его хватает и для 192 кГц.
      analyserNode.fftSize = Math.min(32768, ANALYSIS_LENGTH * 2 * decimation);
      analyserNode.smoothingTimeConstant = 0.05;
      sourceNode.connect(analyserNode);
      // Отдельный анализатор с самым длинным окном — только для захвата удара.
      // БПФ он не считает, пока у него не просят спектр: это просто кольцевой буфер.
      const captureAnalyser = ctx.createAnalyser();
      captureAnalyser.fftSize = CAPTURE_LENGTH;
      sourceNode.connect(captureAnalyser);

      this.audioContext = ctx;
      this.mediaStream = stream;
      this.sourceNode = sourceNode;
      this.analyserNode = analyserNode;
      this.captureAnalyser = captureAnalyser;
      this.decimation = decimation;
      this.detector = new PitchDetector(sampleRate / decimation, ANALYSIS_LENGTH);
      this.timeDataArray = new Float32Array(analyserNode.fftSize);
      this.freqDataArray = new Float32Array(analyserNode.frequencyBinCount);

      this.watchSession(session, ctx, stream);
      this.setStatus('running');
      this.updateActivity();
    } catch (err) {
      // Раньше уже созданный контекст и полученный поток при ошибке не
      // освобождались: контекст висел до закрытия вкладки, микрофон оставался занят.
      if (this.audioContext === ctx) this.releaseCapture();
      releaseStream(stream);
      closeContext(ctx);

      if (session !== this.session) return;
      const error = err instanceof Error ? err : new Error(String(err));
      this.setStatus('error', error);
      this.onError?.(error);
      throw error;
    }
  }

  /**
   * Следим за обрывом потока. Без этого отозванное разрешение, вытащенная
   * гарнитура или занятый звонком микрофон оставляли движок в `running`:
   * интерфейс показывал «Микрофон активен», а оценки не приходили.
   */
  private watchSession(session: number, ctx: AudioContext, stream: MediaStream): void {
    const events = new AbortController();
    this.sessionEvents = events;
    const { signal } = events;

    for (const track of stream.getAudioTracks()) {
      track.addEventListener(
        'ended',
        () => this.interrupt(session, 'ended', 'Поток микрофона оборвался: устройство отключено или доступ отозван'),
        { signal }
      );
      // mute — источник временно не даёт звука (на iOS так бывает во время
      // звонка): это пауза, а не обрыв, после unmute работа продолжается.
      track.addEventListener('mute', () => this.updateActivity(), { signal });
      track.addEventListener('unmute', () => this.updateActivity(), { signal });
    }

    ctx.addEventListener(
      'statechange',
      () => {
        if (ctx.state === 'closed') {
          this.interrupt(session, 'closed', 'Система закрыла звуковой поток');
        } else {
          this.updateActivity();
        }
      },
      { signal }
    );
  }

  private interrupt(session: number, reason: MicInterruptionReason, message: string): void {
    if (session !== this.session || !this.isCapturing()) return;
    this.releaseCapture();
    const error = new MicInterruptedError(reason, message);
    this.setStatus('error', error);
    this.onError?.(error);
  }

  /**
   * Сводит состояние захвата с обстановкой: видимость страницы, состояние
   * контекста, заглушённость дорожки.
   *
   * На скрытой странице анализ не нужен: цикл останавливается, контекст
   * приостанавливается (меньше работы для батареи), а через
   * BACKGROUND_RELEASE_MS микрофон отпускается совсем. Вернулись раньше —
   * всё продолжается без повторного нажатия.
   */
  private updateActivity(): void {
    const ctx = this.audioContext;
    const stream = this.mediaStream;
    if (!ctx || !stream || !this.isCapturing()) return;

    const hidden = isPageHidden();
    if (hidden) {
      this.scheduleBackgroundRelease();
      if (ctx.state === 'running') ctx.suspend().catch(() => {});
    } else {
      this.cancelBackgroundRelease();
      // Кроме 'suspended' Safari знает 'interrupted' — его тоже пробуем снять.
      if (ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => {});
    }

    const tracks = stream.getAudioTracks();
    const muted = tracks.length > 0 && tracks.every(track => track.muted);
    const active = !hidden && ctx.state === 'running' && !muted;

    if (active) {
      this.setStatus('running');
      if (this.animationFrameId === null) this.startLoop();
    } else {
      this.stopLoop();
      this.setStatus('paused');
    }
  }

  private scheduleBackgroundRelease(): void {
    if (this.backgroundTimer !== null) return;
    const session = this.session;
    this.backgroundTimer = setTimeout(() => {
      this.backgroundTimer = null;
      // Замороженная вкладка может выполнить таймер уже после возврата:
      // на видимой странице микрофон не отбираем.
      if (!isPageHidden()) return;
      this.interrupt(session, 'background', 'Микрофон выключен: приложение долго было в фоне');
    }, BACKGROUND_RELEASE_MS);
  }

  private cancelBackgroundRelease(): void {
    if (this.backgroundTimer !== null) {
      clearTimeout(this.backgroundTimer);
      this.backgroundTimer = null;
    }
  }

  private stopLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private startLoop() {
    this.stopLoop();

    // После паузы или возврата на вкладку первый кадр анализируем сразу.
    this.lastAnalysisAt = 0;

    const tick = () => {
      if (this.status.state !== 'running' || !this.analyserNode) {
        this.animationFrameId = null;
        return;
      }

      // Контекст остановился, а statechange не пришёл (так бывает в старых
      // Safari) — сверяемся сами: пауза и попытка возобновить.
      if (this.audioContext && this.audioContext.state !== 'running') {
        this.animationFrameId = null;
        this.updateActivity();
        return;
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

  /** Длительность окна захвата при текущей частоте дискретизации, мс. */
  public getCaptureWindowMs(): number {
    return (CAPTURE_LENGTH / this.getSampleRate()) * 1000;
  }

  /**
   * Последние CAPTURE_LENGTH отсчётов сырого сигнала — для проверки аккорда по
   * удару (#4). Пока звучит собственный эталон, возвращает null, как и цикл
   * анализа: иначе разбирался бы звук синтезатора вместо гитары.
   */
  public getRecentSamples(): { samples: Float32Array; sampleRate: number } | null {
    if (!this.captureAnalyser || this.status.state !== 'running') return null;
    if (this.isSuppressed()) return null;
    this.captureAnalyser.getFloatTimeDomainData(this.captureBuffer);
    return {
      samples: new Float32Array(this.captureBuffer),
      sampleRate: this.audioContext?.sampleRate || 48000
    };
  }

  public stop(): void {
    // Запуск «в полёте» становится устаревшим и сам отпустит свой поток.
    this.session++;
    this.startPromise = null;
    this.releaseCapture();
    this.setStatus('uninitialized');
  }

  /** Освобождает всё, что держит захват. Подписки снимаются первыми: свой stop() — не обрыв. */
  private releaseCapture(): void {
    this.sessionEvents?.abort();
    this.sessionEvents = null;
    this.cancelBackgroundRelease();
    this.stopLoop();

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.analyserNode) {
      this.analyserNode.disconnect();
      this.analyserNode = null;
    }
    if (this.captureAnalyser) {
      this.captureAnalyser.disconnect();
      this.captureAnalyser = null;
    }

    releaseStream(this.mediaStream);
    this.mediaStream = null;

    closeContext(this.audioContext);
    this.audioContext = null;
  }

  public destroy(): void {
    this.stop();
    this.listeners.clear();
    this.stateListeners.clear();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }
}

// Глобальный разделяемый инстанс AudioEngine для непрерывной работы микрофона между вкладками
export const sharedAudioEngine = new AudioEngine();
