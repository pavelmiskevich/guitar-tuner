import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Plus, Minus, HeartHandshake, Disc3 } from 'lucide-react';
import { DRUM_PATTERNS, playPatternStep } from '../../audio/drumSynth';
import type { DrumPattern } from '../../audio/drumSynth';
import {
  DEFAULT_BPM,
  DEFAULT_METER_ID,
  MAX_BPM,
  METERS,
  METER_IDS,
  MIN_BPM,
  accentAt,
  beatInterval,
  clampBpm,
  createBeatClock,
  drumStepInterval,
  findMeter,
  lookaheadSeconds,
  scheduleTicks
} from '../../domain/metronome';
import type { AccentLevel, BeatClock, Meter } from '../../domain/metronome';
import { STORAGE_KEYS, readEnumSetting, readNumberSetting, writeSetting } from '../../domain/storage';
import { startSchedulerTicker } from './schedulerTicker';
import { useScreenWakeLock } from './useScreenWakeLock';
import { SegmentedControl } from '../../ui/SegmentedControl';
import './metronome.css';

/** Задержка первой доли после старта: успеть запланировать её до того, как она прозвучит. */
const START_DELAY_SECONDS = 0.05;

/**
 * Спад громкости при остановке. Доли запланированы наперёд (в фоне — до 1,5 с),
 * и оборвать их по одной нельзя: глушим общий узел громкости. Мгновенный обрыв
 * щёлкает в динамике, поэтому короткий спад.
 */
const STOP_FADE_SECONDS = 0.03;

const CLICK_SOUND: Record<AccentLevel, { frequency: number; type: OscillatorType; gain: number }> = {
  strong: { frequency: 1200, type: 'triangle', gain: 0.7 },
  medium: { frequency: 1000, type: 'triangle', gain: 0.6 },
  weak: { frequency: 800, type: 'sine', gain: 0.7 }
};

const AUDIO_CONTEXT_ERROR =
  'Не удалось включить звук: браузер не дал создать аудиоконтекст. Закройте другие вкладки со звуком или перезагрузите страницу.';
const AUDIO_RESUME_ERROR = 'Браузер не разрешил воспроизведение звука. Нажмите «Старт» ещё раз.';

/** Идентификатор кнопки размера: у x/4 он прежний (`mt-meter-4`), у 6/8 — `mt-meter-6-8`. */
function meterTestId(meter: Meter): string {
  return meter.unit === 4 ? `mt-meter-${meter.beats}` : `mt-meter-${meter.beats}-${meter.unit}`;
}

function readSavedBpm(): number {
  return clampBpm(readNumberSetting(STORAGE_KEYS.metronomeBpm, { fallback: DEFAULT_BPM, min: MIN_BPM, max: MAX_BPM }));
}

function readSavedMeterId(): string {
  return readEnumSetting(STORAGE_KEYS.metronomeMeter, METER_IDS, DEFAULT_METER_ID);
}

/** Щелчок метронома: генератор с быстрым спадом, подключённый к общему узлу громкости. */
function playClick(ctx: AudioContext, output: AudioNode, time: number, accent: AccentLevel) {
  const sound = CLICK_SOUND[accent];
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.frequency.setValueAtTime(sound.frequency, time);
  osc.type = sound.type;

  gain.gain.setValueAtTime(sound.gain, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

  osc.connect(gain);
  gain.connect(output);

  osc.start(time);
  osc.stop(time + 0.06);
}

/** Гасит общий узел громкости и отключает его: запланированные наперёд доли не прозвучат. */
function silenceOutput(ctx: AudioContext, output: GainNode) {
  try {
    const now = ctx.currentTime;
    output.gain.cancelScheduledValues(now);
    output.gain.setValueAtTime(output.gain.value, now);
    output.gain.linearRampToValueAtTime(0, now + STOP_FADE_SECONDS);
  } catch {
    // Контекст уже закрыт — звучать нечему.
  }
  window.setTimeout(() => {
    try {
      output.disconnect();
    } catch {
      // Уже отключён.
    }
  }, (STOP_FADE_SECONDS + 0.05) * 1000);
}

export const MetronomeScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'metronome' | 'drums'>('metronome');
  const [bpm, setBpm] = useState<number>(readSavedBpm);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [meterId, setMeterId] = useState<string>(readSavedMeterId);
  const [currentBeat, setCurrentBeat] = useState<number>(0);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [selectedPattern, setSelectedPattern] = useState<DrumPattern>(DRUM_PATTERNS[0]);
  const [tapTimes, setTapTimes] = useState<number[]>([]);
  const [audioError, setAudioError] = useState<string | null>(null);

  const meter = findMeter(meterId);

  const audioCtxRef = useRef<AudioContext | null>(null);
  /** Общий узел громкости текущего запуска: всё, что играет экран, идёт через него. */
  const outputRef = useRef<GainNode | null>(null);
  const clockRef = useRef<BeatClock>(createBeatClock(0));
  const uiTimeoutsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    writeSetting(STORAGE_KEYS.metronomeBpm, String(bpm));
  }, [bpm]);

  useEffect(() => {
    writeSetting(STORAGE_KEYS.metronomeMeter, meterId);
  }, [meterId]);

  useScreenWakeLock(isPlaying);

  /** Подсветка доли в момент, когда она прозвучит, а не когда запланирована. */
  const showAt = (ctx: AudioContext, time: number, update: () => void) => {
    const id = window.setTimeout(() => {
      uiTimeoutsRef.current.delete(id);
      update();
    }, Math.max(0, (time - ctx.currentTime) * 1000));
    uiTimeoutsRef.current.add(id);
  };

  // Планировщик звука для метронома и драм-машины. Темп, размер и паттерн он
  // берёт из последнего рендера (через schedulerRef), поэтому их смена на ходу
  // действует со следующей доли и не перезапускает такт.
  const scheduler = () => {
    const ctx = audioCtxRef.current;
    const output = outputRef.current;
    if (!ctx || !output || ctx.state === 'closed') return;

    const now = ctx.currentTime;
    const hidden = document.visibilityState === 'hidden';
    const isMetronome = activeTab === 'metronome';
    const { ticks, clock } = scheduleTicks(clockRef.current, {
      now,
      horizon: now + lookaheadSeconds(hidden),
      interval: isMetronome ? beatInterval(bpm) : drumStepInterval(bpm, selectedPattern.stepsCount),
      cycle: isMetronome ? meter.beats : selectedPattern.stepsCount
    });
    clockRef.current = clock;

    for (const { time, step } of ticks) {
      if (isMetronome) {
        playClick(ctx, output, time, accentAt(meter, step));
        // Скрытую вкладку не перерисовываем: её таймеры всё равно придут пачкой.
        if (!hidden) showAt(ctx, time, () => setCurrentBeat(step));
      } else {
        playPatternStep(ctx, selectedPattern, step, time, output);
        if (!hidden) showAt(ctx, time, () => setCurrentStep(step));
      }
    }
  };

  const schedulerRef = useRef(scheduler);
  schedulerRef.current = scheduler;

  // Запуск и остановка зависят только от isPlaying. Раньше эффект зависел ещё
  // от темпа, размера и паттерна и на каждое их изменение начинал такт заново,
  // а уже запланированные доли звучали поверх новых — сдвоенными ударами.
  useEffect(() => {
    if (!isPlaying) return;
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const output = ctx.createGain();
    output.connect(ctx.destination);
    outputRef.current = output;
    clockRef.current = createBeatClock(ctx.currentTime + START_DELAY_SECONDS);

    // Тикер берёт планировщик из ref, а не из замыкания: сам планировщик
    // пересоздаётся на каждый рендер и видит свежие темп и размер.
    const stopTicker = startSchedulerTicker(() => schedulerRef.current());
    const uiTimeouts = uiTimeoutsRef.current;

    return () => {
      stopTicker();
      outputRef.current = null;
      silenceOutput(ctx, output);
      uiTimeouts.forEach(id => window.clearTimeout(id));
      uiTimeouts.clear();
      setCurrentBeat(0);
      setCurrentStep(0);
    };
  }, [isPlaying]);

  // Контекст живёт, пока открыт экран. Экран размонтируется при уходе с вкладки
  // «Ритм», и незакрытые контексты копились: браузеры ограничивают их число
  // (Safari — единицами), и после лимита метроном переставал запускаться.
  // Эффект объявлен после эффекта запуска: при размонтировании сначала гасится
  // звук, потом закрывается контекст.
  useEffect(() => {
    return () => {
      const ctx = audioCtxRef.current;
      audioCtxRef.current = null;
      if (ctx && ctx.state !== 'closed') ctx.close().catch(() => {});
    };
  }, []);

  /** Контекст создаётся по нажатию «Старт»: вне жеста пользователя браузер звук не даст. */
  const ensureAudioContext = (): AudioContext | null => {
    const existing = audioCtxRef.current;
    if (existing && existing.state !== 'closed') return existing;
    try {
      const AudioCtx = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) throw new Error('Web Audio API недоступен');
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      return ctx;
    } catch {
      // Молча падать нельзя: кнопка просто не реагировала бы, и было бы
      // непонятно, что делать. Говорим, что случилось и как это обойти.
      setAudioError(AUDIO_CONTEXT_ERROR);
      return null;
    }
  };

  const handleToggle = () => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    const ctx = ensureAudioContext();
    if (!ctx) return;
    setAudioError(null);
    ctx.resume().catch(() => {
      setAudioError(AUDIO_RESUME_ERROR);
      setIsPlaying(false);
    });
    setIsPlaying(true);
  };

  // Функция Tap-Tempo
  const handleTap = () => {
    const now = performance.now();
    const newTaps = [...tapTimes.filter(t => now - t < 3000), now];
    setTapTimes(newTaps);

    if (newTaps.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < newTaps.length; i++) {
        intervals.push(newTaps[i] - newTaps[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const calculatedBpm = Math.round(60000 / avgInterval);
      if (calculatedBpm >= MIN_BPM && calculatedBpm <= MAX_BPM) {
        setBpm(calculatedBpm);
      }
    }
  };

  const changeBpm = (delta: number) => {
    setBpm(prev => clampBpm(prev + delta));
  };

  return (
    <div className="metro-screen">
      {/* Заголовок и переключатель Метроном / Драм-ритмы */}
      <div className="metro-header">
        <div>
          <span className="eyebrow">Ритм и тренировка</span>
          <h2 className="metro-title">{activeTab === 'metronome' ? 'Метроном' : 'Барабанные ритмы'}</h2>
        </div>

        {/* Табы режима */}
        <SegmentedControl
          label="Режим ритма"
          value={activeTab}
          onChange={(tab) => {
            setIsPlaying(false);
            setActiveTab(tab);
          }}
          options={[
            { value: 'metronome', label: 'Метроном', testId: 'mt-tab-metronome' },
            { value: 'drums', label: <><Disc3 size={14} aria-hidden="true" /> Драм-машина</>, testId: 'mt-tab-drums' }
          ]}
        />
      </div>

      {/* Пресеты барабанных стилей (если выбран режим драм-машины) */}
      {activeTab === 'drums' && (
        <div className="metro-patterns">
          {DRUM_PATTERNS.map(pattern => {
            const isSelected = selectedPattern.id === pattern.id;
            return (
              <button
                key={pattern.id}
                className="metro-pattern"
                data-testid={`mt-pattern-${pattern.id}`}
                aria-pressed={isSelected}
                onClick={() => {
                  setSelectedPattern(pattern);
                  setBpm(pattern.defaultBpm);
                }}
              >
                <span className="metro-pattern-name">
                  {pattern.name}
                </span>
                <span className="metro-pattern-genre">
                  {pattern.genre}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Панель метронома / ритма */}
      <div className="panel metro-panel">
        {/* Индикатор долей */}
        {activeTab === 'metronome' ? (
          <div className="metro-beats">
            {Array.from({ length: meter.beats }).map((_, i) => {
              const isActive = isPlaying && currentBeat === i;
              const accent = accentAt(meter, i);
              // Размер, отступ и подсветка доли — в metronome.css по data-accent и data-active.
              return (
                <div
                  key={i}
                  className="metro-beat"
                  data-testid={`mt-beat-${i}`}
                  data-active={String(isActive)}
                  data-accent={accent}
                />
              );
            })}
          </div>
        ) : (
          /* 16-шаговая визуальная сетка барабанов */
          <div className="metro-seq">
            <div className="metro-steps">
              {Array.from({ length: selectedPattern.stepsCount }).map((_, i) => {
                const isActive = isPlaying && currentStep === i;
                const isDownbeat = selectedPattern.stepsCount === 16 ? i % 4 === 0 : i % 3 === 0;

                return (
                  <div
                    key={i}
                    className={isDownbeat ? 'metro-step metro-step--downbeat' : 'metro-step'}
                    data-testid={`seq-step-${i}`}
                    data-active={String(isActive)}
                  />
                );
              })}
            </div>
            <span className="metro-seq-desc">
              {selectedPattern.description}
            </span>
          </div>
        )}

        {/* Крупный дисплей BPM */}
        <div className="metro-readout">
          <span
            data-testid="mt-bpm"
            className={isPlaying ? 'mono metro-bpm metro-bpm--playing' : 'mono metro-bpm'}
          >
            {bpm}
          </span>
          <span className="metro-bpm-unit">BPM</span>
        </div>

        {/* Управление темпом: -5, -1, slider, +1, +5 (адаптивная сетка, не вылезает на мобильных) */}
        <div className="metro-tempo">
          <button
            data-testid="mt-minus-5"
            className="btn btn-ghost btn-sm metro-nudge metro-nudge--five"
            onClick={() => changeBpm(-5)}
            title="Уменьшить темп на 5 BPM"
          >
            -5
          </button>
          <button
            data-testid="mt-minus-1"
            className="btn btn-ghost btn-sm metro-nudge"
            onClick={() => changeBpm(-1)}
            title="Уменьшить темп на 1 BPM"
          >
            <Minus size={15} />
          </button>

          {/* Ползунок темпа (адаптивный) */}
          <input
            data-testid="mt-bpm-slider"
            className="metro-slider"
            aria-label="Темп"
            aria-valuetext={`${bpm} ударов в минуту`}
            type="range"
            min={MIN_BPM}
            max={MAX_BPM}
            value={bpm}
            onChange={(e) => setBpm(clampBpm(Number(e.target.value)))}
          />

          <button
            data-testid="mt-plus-1"
            className="btn btn-ghost btn-sm metro-nudge"
            onClick={() => changeBpm(1)}
            title="Увеличить темп на 1 BPM"
          >
            <Plus size={15} />
          </button>
          <button
            data-testid="mt-plus-5"
            className="btn btn-ghost btn-sm metro-nudge metro-nudge--five"
            onClick={() => changeBpm(5)}
            title="Увеличить темп на 5 BPM"
          >
            +5
          </button>
        </div>

        {/* Выбор размера такта (для метронома) */}
        {activeTab === 'metronome' && (
          <div className="metro-meters">
            <span className="eyebrow metro-meters-label">Размер:</span>
            {METERS.map(m => (
              <button
                key={m.id}
                data-testid={meterTestId(m)}
                className={`btn btn-sm metro-meter-btn ${meterId === m.id ? 'btn-primary' : 'btn-ghost'}`}
                aria-pressed={meterId === m.id}
                onClick={() => setMeterId(m.id)}
              >
                {m.id}
              </button>
            ))}
          </div>
        )}

        {/* Кнопка запуска / остановки */}
        <div className="metro-actions">
          <button
            data-testid="mt-toggle"
            className={`btn metro-toggle ${isPlaying ? 'btn-danger' : 'btn-primary'}`}
            onClick={handleToggle}
          >
            {isPlaying ? (
              <>
                <Square size={18} /> Стоп
              </>
            ) : (
              <>
                <Play size={18} /> Старт
              </>
            )}
          </button>

          {/* Tap Tempo */}
          <button
            data-testid="mt-tap"
            className="btn btn-ghost metro-tap"
            onClick={handleTap}
            title="Нажимайте в такт музыке для определения BPM"
          >
            <HeartHandshake size={16} /> Tap Tempo
          </button>
        </div>

        {audioError && (
          <div data-testid="mt-audio-error" role="alert" className="banner err metro-audio-error">
            {audioError}
          </div>
        )}
      </div>
    </div>
  );
};
