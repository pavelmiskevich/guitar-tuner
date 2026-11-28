import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Tuning, StringSpec } from '../../domain/tunings';
import { findClosestString } from '../../domain/tunings';
import type { NotationSystem } from '../../domain/notes';
import { midiToFrequency, calculateCents, formatNoteName } from '../../domain/notes';
import { sharedAudioEngine } from '../../audio/audioEngine';
import type { PitchEstimate } from '../../audio/dsp';
import { playGuitarString } from '../../audio/synth';
import { useMicrophone } from '../../audio/useMicrophone';
import { MicBar, MicErrorBanner } from '../../ui/MicBar';
import { InTuneHold, MedianSmoother } from '../../domain/tuneStability';
import { CentsScale } from './CentsScale';
import { TunerAura } from './TunerAura';
import { SpectrumCanvas } from './SpectrumCanvas';
import { StringChips } from './StringChips';
import type { SoundingState } from './StringChips';
import { DonateCard } from '../donate/DonateCard';
import { LiveRegion } from '../../ui/LiveRegion';
import { useThrottledAnnouncement } from '../../ui/useThrottledAnnouncement';
import { tunerAnnouncement } from '../../domain/announcements';
import './tuner.css';
import {
  Volume2,
  CheckCircle2,
  RotateCcw,
  RotateCw,
  Info,
  SlidersHorizontal,
  Compass,
  Music
} from 'lucide-react';

/**
 * Пауза перед автошагом мастера после того, как струна признана настроенной.
 * Вместе с удержанием (IN_TUNE_HOLD_MS) даёт прежние ~1.2 с от входа в допуск.
 */
const AUTO_ADVANCE_AFTER_STABLE_MS = 800;
/** Как часто скринридер может зачитывать показания тюнера. */
const TUNER_ANNOUNCE_INTERVAL_MS = 1500;

/** Округление до шага отображения: равные значения React не перерисовывает. */
function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

interface TunerScreenProps {
  tuning: Tuning;
  availableTunings: Tuning[];
  onTuningChange: (tuning: Tuning) => void;
  a4: number;
  notation: NotationSystem;
  inTuneThreshold: number;
  lockedStringIndex: number | null;
  onSelectString: (index: number | null) => void;
}

export const TunerScreen: React.FC<TunerScreenProps> = ({
  tuning,
  availableTunings,
  onTuningChange,
  a4,
  notation,
  inTuneThreshold,
  lockedStringIndex,
  onSelectString
}) => {
  const mic = useMicrophone();
  // На паузе микрофон захвачен, но оценок нет: показания просто не обновляются.
  const isListening = mic.isOn;
  const [measuredFreq, setMeasuredFreq] = useState(0);
  const [targetFreq, setTargetFreq] = useState(0);
  const [cents, setCents] = useState(0);
  const [activeString, setActiveString] = useState<StringSpec | null>(null);
  const [isSoundActive, setIsSoundActive] = useState(false);
  const [isStableTuned, setIsStableTuned] = useState(false);
  const [inputLevelDb, setInputLevelDb] = useState(-100);
  const [isClipping, setIsClipping] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [tunedStrings, setTunedStrings] = useState<Set<number>>(new Set());
  const [showSpectrum, setShowSpectrum] = useState(false);

  const stableTimerRef = useRef<number | null>(null);
  const smootherRef = useRef(new MedianSmoother());
  const holdRef = useRef(new InTuneHold());
  const soundDecayTimerRef = useRef<number | null>(null);
  // Последний показанный уровень входа: VU-метр обновляется только на заметном
  // изменении, иначе шум в доли децибела перерисовывал весь экран на каждом кадре.
  const shownLevelDbRef = useRef(-100);

  // Хранилище актуальных настроек для обработчика аудиопотока
  const latestConfigRef = useRef({
    tuning,
    a4,
    inTuneThreshold,
    lockedStringIndex,
    autoAdvance,
    onSelectString
  });

  useEffect(() => {
    latestConfigRef.current = {
      tuning,
      a4,
      inTuneThreshold,
      lockedStringIndex,
      autoAdvance,
      onSelectString
    };
  }, [tuning, a4, inTuneThreshold, lockedStringIndex, autoAdvance, onSelectString]);

  // Смена строя или эталона A4 меняет целевые ноты: прежние отметки «настроено»,
  // последняя услышанная струна и её частоты относятся к старым целям и только
  // вводят в заблуждение. Ноты строя входят в ключ — пользовательский строй можно
  // пересохранить с тем же id, но другими струнами.
  const tuningResetKey = `${tuning.id}:${tuning.strings.map(s => s.open.midi).join(',')}@${a4}`;
  const lastResetKeyRef = useRef(tuningResetKey);
  useEffect(() => {
    if (lastResetKeyRef.current === tuningResetKey) return;
    lastResetKeyRef.current = tuningResetKey;

    setTunedStrings(new Set());
    setActiveString(null);
    setMeasuredFreq(0);
    setTargetFreq(0);
    setCents(0);
    setIsStableTuned(false);
    setIsSoundActive(false);
    smootherRef.current.reset();
    holdRef.current.reset();
    if (stableTimerRef.current) {
      clearTimeout(stableTimerRef.current);
      stableTimerRef.current = null;
    }
  }, [tuningResetKey]);

  // Интеллектуальный подбор струны
  const findBestString = useCallback((freq: number, curTuning: Tuning, curA4: number, lockedIdx: number | null): StringSpec => {
    // Если струна выбрана вручную, проверяем, не играет ли пользователь другую струну
    if (lockedIdx !== null && curTuning.strings[lockedIdx]) {
      const lockedStr = curTuning.strings[lockedIdx];
      const lockedFreq = midiToFrequency(lockedStr.open.midi, curA4);
      const diffCents = Math.abs(calculateCents(freq, lockedFreq));

      // Если звук близок к выбранной струне (в пределах 2.5 полутонов = 250 центов), остаёмся на ней
      if (diffCents <= 250) {
        return lockedStr;
      }
    }

    // Иначе (или если звук далёк от выбранной струны) — автоматически находим ближайшую струну
    return findClosestString(freq, curTuning.strings, curA4);
  }, []);

  // Подписка на глобальный AudioEngine
  useEffect(() => {
    const unsubscribe = sharedAudioEngine.subscribe((estimate: PitchEstimate) => {
      // Порог в 1 дБ: на глаз шкала не меняется, а ререндеров становится в разы меньше.
      if (Math.abs(estimate.rms - shownLevelDbRef.current) >= 1) {
        shownLevelDbRef.current = estimate.rms;
        setInputLevelDb(estimate.rms);
      }
      setIsClipping(estimate.isClipping);

      // Проверка наличия распознаваемого тона
      if (estimate.isSilent || estimate.frequency <= 0 || estimate.clarity < 0.40) {
        if (!soundDecayTimerRef.current) {
          soundDecayTimerRef.current = window.setTimeout(() => {
            setIsSoundActive(false);
            setIsStableTuned(false);
            soundDecayTimerRef.current = null;
          }, 1200);
        }
        return;
      }

      // Звук есть — отменяем затухание
      if (soundDecayTimerRef.current) {
        clearTimeout(soundDecayTimerRef.current);
        soundDecayTimerRef.current = null;
      }
      setIsSoundActive(true);

      const {
        tuning: curTuning,
        a4: curA4,
        inTuneThreshold: curThreshold,
        lockedStringIndex: curLockedIdx,
        autoAdvance: curAutoAdvance,
        onSelectString: curOnSelect
      } = latestConfigRef.current;

      // Медиана по последним кадрам: выброс на атаке щипка или одиночная октавная
      // ошибка детектора не должны дёргать стрелку и переключать струну.
      const now = performance.now();
      const freq = smootherRef.current.push(estimate.frequency, now);
      // Состояние меняется только сверх отображаемой точности (0,1 Гц, 0,1 цента):
      // дрожание в сотых долях перерисовывало весь экран на каждом кадре (#14).
      setMeasuredFreq(roundTo(freq, 0.1));

      const currentTargetStr = findBestString(freq, curTuning, curA4, curLockedIdx);
      setActiveString(currentTargetStr);

      const tFreq = midiToFrequency(currentTargetStr.open.midi, curA4);
      setTargetFreq(tFreq);

      const dCents = calculateCents(freq, tFreq);
      setCents(roundTo(dCents, 0.1));

      // Проверка удержания строя. Струна считается настроенной не по одному
      // кадру в допуске, а после непрерывного удержания: иначе её засчитывал бы
      // пролёт частоты через цель во время подтяжки.
      const inTune = Math.abs(dCents) <= curThreshold;
      const currentIdx = curTuning.strings.findIndex(s => s.stringNumber === currentTargetStr.stringNumber);
      const hold = holdRef.current.update(currentIdx, inTune, now);
      setIsStableTuned(hold.stable);

      if (hold.justBecameStable && currentIdx !== -1) {
        setTunedStrings(prev => (prev.has(currentIdx) ? prev : new Set(prev).add(currentIdx)));

        // Один раз на вход в строй: повторный вызов на каждом кадре отменял
        // предыдущий паттерн, и телефон жужжал непрерывно.
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([35, 50, 35]);
        }
      }

      if (hold.stable && currentIdx !== -1) {
        // Автопереход к следующей струне в режиме мастера
        if (curAutoAdvance && !stableTimerRef.current) {
          stableTimerRef.current = window.setTimeout(() => {
            if (currentIdx < curTuning.strings.length - 1) {
              curOnSelect(currentIdx + 1);
            }
            stableTimerRef.current = null;
          }, AUTO_ADVANCE_AFTER_STABLE_MS);
        }
      } else if (!inTune && stableTimerRef.current) {
        clearTimeout(stableTimerRef.current);
        stableTimerRef.current = null;
      }
    });

    return () => {
      unsubscribe();
      if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
      if (soundDecayTimerRef.current) clearTimeout(soundDecayTimerRef.current);
    };
  }, [findBestString]);

  const [isPlayingSample, setIsPlayingSample] = useState(false);
  const sampleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (sampleTimerRef.current) clearTimeout(sampleTimerRef.current);
    };
  }, []);

  // Микрофон выключили — здесь, с другого экрана или из шапки — или поток
  // оборвался: последние показания больше не относятся к звуку, гасим их.
  useEffect(() => {
    if (isListening) return;
    setIsSoundActive(false);
    setIsStableTuned(false);
    setMeasuredFreq(0);
  }, [isListening]);

  // Обработчики стабильны между кадрами: иначе мемоизированные чипы
  // перерисовывались бы вместе с экраном (#14).
  const handlePlayReference = useCallback((str: StringSpec) => {
    const f = midiToFrequency(str.open.midi, a4);
    playGuitarString(f, 2.8);
    setIsPlayingSample(true);
    if (sampleTimerRef.current) clearTimeout(sampleTimerRef.current);
    sampleTimerRef.current = window.setTimeout(() => setIsPlayingSample(false), 1200);
  }, [a4]);

  const handleChipClick = useCallback((idx: number) => {
    onSelectString(lockedStringIndex === idx ? null : idx);
    const str = tuning.strings[idx];
    if (str) handlePlayReference(str);
  }, [onSelectString, lockedStringIndex, tuning, handlePlayReference]);

  const currentTargetStr = activeString
    ? activeString
    : (lockedStringIndex !== null ? tuning.strings[lockedStringIndex] : tuning.strings[0]);
  const currentDisplayNote = currentTargetStr ? currentTargetStr.open : (tuning.strings[0]?.open || { name: 'E', octave: 2, midi: 40 });
  const displayNoteName = formatNoteName(currentDisplayNote.name, notation);

  const handlePlayCurrentNote = () => {
    if (currentTargetStr) {
      handlePlayReference(currentTargetStr);
    } else {
      const f = midiToFrequency(currentDisplayNote.midi, a4);
      playGuitarString(f, 2.8);
      setIsPlayingSample(true);
      if (sampleTimerRef.current) clearTimeout(sampleTimerRef.current);
      sampleTimerRef.current = window.setTimeout(() => setIsPlayingSample(false), 1200);
    }
  };

  // Озвучка для скринридера (#11): смысл показаний, не чаще раза в полторы
  // секунды — иначе диктор не успевает договорить.
  const hasPitch = isListening && measuredFreq > 0 && isSoundActive;
  const announcement = useThrottledAnnouncement(
    tunerAnnouncement({
      hasPitch,
      noteLabel: `${displayNoteName}${currentDisplayNote.octave}`,
      cents,
      inTuneThreshold
    }),
    TUNER_ANNOUNCE_INTERVAL_MS
  );

  // Звучащая струна для чипов: меняется при смене струны или пересечении
  // порога, а не на каждом кадре.
  const soundingStringNumber = isSoundActive && activeString ? activeString.stringNumber : null;
  const soundingState: SoundingState | null =
    soundingStringNumber === null
      ? null
      : isStableTuned
        ? 'done'
        : Math.abs(cents) > inTuneThreshold
          ? 'off'
          : 'active';

  // Определение команды действия тюнера (FR-TN-18). Тон задаёт цвет плашки.
  let actionCommandText = 'Сыграйте струну';
  let actionTone: 'idle' | 'in' | 'near' | 'off' = 'idle';
  let ActionIcon = Music;

  if (isListening && measuredFreq > 0 && isSoundActive) {
    if (Math.abs(cents) <= inTuneThreshold) {
      actionCommandText = 'В СТРОЕ';
      actionTone = 'in';
      ActionIcon = CheckCircle2;
    } else if (cents < 0) {
      actionCommandText = 'ПОДТЯНУТЬ';
      actionTone = cents > -15 ? 'near' : 'off';
      ActionIcon = RotateCcw; // Натяжение колка
    } else {
      actionCommandText = 'ОСЛАБИТЬ';
      actionTone = cents < 15 ? 'near' : 'off';
      ActionIcon = RotateCw; // Спуск колка
    }
  }

  // Тон крупной ноты: по показаниям, пока микрофон слушает и частота есть.
  const noteTone =
    isListening && measuredFreq > 0
      ? (Math.abs(cents) <= inTuneThreshold ? 'in' : Math.abs(cents) <= 15 ? 'near' : 'off')
      : null;

  // Заполнение VU-метра и его цвет: перегрузка, громкий сигнал, обычный.
  const vuLevel = `${Math.max(0, Math.min(100, (inputLevelDb + 60) * 2))}%`;
  const vuFillClass = isClipping
    ? 'tun-vu-fill tun-vu-fill--clip'
    : inputLevelDb > -25
      ? 'tun-vu-fill tun-vu-fill--loud'
      : 'tun-vu-fill';

  return (
    <div className="tun-screen">
      {/* Заголовок и селектор строя */}
      <div className="tun-header">
        <div>
          <span className="eyebrow">Монофонический тюнер</span>
          <h2 className="tun-title">{tuning.name}</h2>
        </div>

        <div className="tun-header-actions">
          <select
            value={tuning.id}
            onChange={(e) => {
              const found = availableTunings.find(t => t.id === e.target.value);
              if (found) onTuningChange(found);
            }}
            name="tuning"
            data-testid="tuning-select"
            aria-label="Выбор строя гитары"
            className="tun-select"
          >
            {availableTunings.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Верхний блок микрофона: крупная кнопка ДО включения, компактная плашка ПОСЛЕ включения */}
      <MicBar mic={mic} testIds={{ start: 'mic-toggle', status: 'mic-status' }}>
        {/* Компактный VU-индикатор входного уровня */}
        <div aria-hidden="true" className="tun-vu">
          <div className="tun-vu-track">
            <div
              className={vuFillClass}
              style={{ '--tun-vu-level': vuLevel } as React.CSSProperties}
            />
          </div>
          {isClipping && <span className="tun-vu-max">MAX!</span>}
        </div>
      </MicBar>

      <LiveRegion text={announcement} testId="tuner-announcement" />


      {/* Ошибки микрофона: отказ в доступе, занятое устройство, обрыв потока */}
      <MicErrorBanner mic={mic} />

      {/* Интерактивные чипы струн (ровная сетка на всю ширину без полосы прокрутки) */}
      <StringChips
        tuning={tuning}
        notation={notation}
        a4={a4}
        lockedStringIndex={lockedStringIndex}
        tunedStrings={tunedStrings}
        soundingStringNumber={soundingStringNumber}
        soundingState={soundingState}
        onChipClick={handleChipClick}
        onPlayReference={handlePlayReference}
      />

      {/* Опции: Режим автоопределения / Мастер настройки */}
      <div className="tun-options">
        <div className="tun-mode">
          <Compass size={14} color="var(--brand)" />
          <span>
            {lockedStringIndex !== null
              ? `Приоритет: ${tuning.strings[lockedStringIndex]?.stringNumber}-я струна (автопереключение при смене струны)`
              : 'Автоопределение струны: активно'}
          </span>
        </div>
        <div className="tun-mode-controls">
          <label className="tun-master">
            <input
              type="checkbox"
              checked={autoAdvance}
              onChange={(e) => setAutoAdvance(e.target.checked)}
              name="auto-advance"
              data-testid="master-mode"
              className="tun-master-input"
            />
            Мастер (автошаг)
          </label>
          {lockedStringIndex !== null && (
            <button
              onClick={() => onSelectString(null)}
              className="tun-reset"
            >
              Сброс на авто
            </button>
          )}
        </div>
      </div>

      {/* Центральный дисплей тюнера с нотой и аурой */}
      <div className="panel tun-display">
        <TunerAura cents={cents} isActive={isListening && measuredFreq > 0 && isSoundActive} inTuneThreshold={inTuneThreshold} />

        {/* Команда действия (FR-TN-18: Подтянуть / Ослабить / В строе) */}
        <div
          data-testid="tuner-action"
          className={actionTone === 'idle' ? 'tun-action' : `tun-action tun-action--${actionTone}`}
        >
          <ActionIcon size={16} />
          <span>{actionCommandText}</span>
          {isListening && measuredFreq > 0 && isSoundActive && Math.abs(cents) > inTuneThreshold && (
            <span className="mono tun-action-cents">
              ({cents > 0 ? `+${cents.toFixed(0)}` : cents.toFixed(0)}¢)
            </span>
          )}
        </div>

        {/* Крупная интерактивная нота (нажатие воспроизводит эталон) */}
        <button
          type="button"
          onClick={handlePlayCurrentNote}
          className={[
            'tuner-note-interactive tun-note',
            isPlayingSample && 'tuner-note-playing',
            !isSoundActive && !isPlayingSample && 'tun-note--dim'
          ].filter(Boolean).join(' ')}
          data-testid="tuner-note-button"
          aria-label={`${displayNoteName}${currentDisplayNote.octave} — прослушать эталон`}
          title="Нажмите на ноту, чтобы услышать эталонное звучание струны"
        >
          <span
            data-testid="tuner-note"
            className={noteTone ? `tun-note-name tun-note-name--${noteTone}` : 'tun-note-name'}
          >
            {displayNoteName}
          </span>
          <span className="tun-note-octave">
            {currentDisplayNote.octave}
          </span>

          {/* Иконка динамика на ноте */}
          <span aria-hidden="true" className="tun-note-speaker">
            <Volume2 size={13} />
          </span>
        </button>

        {/* Кнопка-подсказка под нотой */}
        <button
          onClick={handlePlayCurrentNote}
          className={`btn btn-ghost btn-sm tun-hint${isPlayingSample ? ' tun-hint--playing' : ''}`}
          title="Воспроизвести эталонный гитарный звук"
        >
          <Volume2 size={12} />
          {isPlayingSample ? 'Звучит эталон струны...' : 'Нажмите на ноту для примера'}
        </button>

        {/* Частоты: измеренная / целевая */}
        <div className={isSoundActive ? 'mono tun-freqs' : 'mono tun-freqs tun-freqs--dim'}>
          <span>Измерено: <strong data-testid="tuner-measured" className="tun-freq-value">{measuredFreq > 0 ? `${measuredFreq.toFixed(1)} Гц` : '—'}</strong></span>
          <span>Цель: <strong data-testid="tuner-target" className="tun-freq-value">{targetFreq > 0 ? `${targetFreq.toFixed(1)} Гц` : '—'}</strong></span>
        </div>

        {/* Нелинейная шкала центов */}
        <div className="tun-scale-wrap">
          <CentsScale cents={cents} inTuneThreshold={inTuneThreshold} isActive={isListening && measuredFreq > 0 && isSoundActive} />
        </div>
      </div>

      {/* Подсказка FR-TN-20: Подходите к ноте снизу при перетянутой струне */}
      {isListening && isSoundActive && cents > 15 && (
        <div data-testid="master-tip" className="banner tun-tip">
          <Info size={16} color="var(--sig-near)" />
          <div>
            <b>Совет мастера:</b> Ослабьте колок чуть ниже цели и плавно подтяните вверх, чтобы устранить люфт механики колка.
          </div>
        </div>
      )}

      {/* Мини-спектрограмма гармоник (сворачиваемая) */}
      <div className="tun-spectrum">
        <button
          className="btn btn-ghost btn-sm tun-spectrum-toggle"
          onClick={() => setShowSpectrum(!showSpectrum)}
          aria-expanded={showSpectrum}
          data-testid="spectrum-toggle"
        >
          <SlidersHorizontal size={13} /> {showSpectrum ? 'Скрыть спектр гармоник' : 'Показать спектр гармоник'}
        </button>

        {showSpectrum && (
          <div className="panel tun-spectrum-panel" aria-hidden="true">
            <SpectrumCanvas dimmed={!isListening} />
          </div>
        )}
      </div>

      {/* Заметный блок «Поддержать автора & развитие проекта» */}
      <DonateCard />
    </div>
  );
};
