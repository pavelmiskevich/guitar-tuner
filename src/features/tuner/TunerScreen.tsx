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

  // Определение команды действия тюнера (FR-TN-18)
  let actionCommandText = 'Сыграйте струну';
  let actionCommandColor = 'var(--ink-300)';
  let ActionIcon = Music;

  if (isListening && measuredFreq > 0 && isSoundActive) {
    if (Math.abs(cents) <= inTuneThreshold) {
      actionCommandText = 'В СТРОЕ';
      actionCommandColor = 'var(--sig-in)';
      ActionIcon = CheckCircle2;
    } else if (cents < 0) {
      actionCommandText = 'ПОДТЯНУТЬ';
      actionCommandColor = cents > -15 ? 'var(--sig-near)' : 'var(--sig-off)';
      ActionIcon = RotateCcw; // Натяжение колка
    } else {
      actionCommandText = 'ОСЛАБИТЬ';
      actionCommandColor = cents < 15 ? 'var(--sig-near)' : 'var(--sig-off)';
      ActionIcon = RotateCw; // Спуск колка
    }
  }

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: '580px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--s6)' }}>
      {/* Заголовок и селектор строя */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <span className="eyebrow">Монофонический тюнер</span>
          <h2 style={{ fontSize: '20px', margin: 0 }}>{tuning.name}</h2>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select
            value={tuning.id}
            onChange={(e) => {
              const found = availableTunings.find(t => t.id === e.target.value);
              if (found) onTuningChange(found);
            }}
            data-testid="tuning-select"
            aria-label="Выбор строя гитары"
            style={{
              background: 'var(--ink-800)',
              color: 'var(--ink-050)',
              border: '1px solid var(--ink-700)',
              borderRadius: 'var(--r-pill)',
              padding: '8px 14px',
              fontFamily: 'var(--font-ui)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
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
        <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, maxWidth: '140px' }}>
          <div style={{ flex: 1, height: '6px', background: 'var(--ink-800)', borderRadius: 'var(--r-pill)', overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.max(0, Math.min(100, (inputLevelDb + 60) * 2))}%`,
                height: '100%',
                background: isClipping ? 'var(--sig-off)' : inputLevelDb > -25 ? 'var(--sig-in)' : 'var(--brand)',
                transition: 'width 60ms linear'
              }}
            />
          </div>
          {isClipping && <span style={{ color: 'var(--sig-off)', fontWeight: 700, fontSize: '10px' }}>MAX!</span>}
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--ink-300)', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Compass size={14} color="var(--brand)" />
          <span>
            {lockedStringIndex !== null
              ? `Приоритет: ${tuning.strings[lockedStringIndex]?.stringNumber}-я струна (автопереключение при смене струны)`
              : 'Автоопределение струны: активно'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoAdvance}
              onChange={(e) => setAutoAdvance(e.target.checked)}
              data-testid="master-mode"
              style={{ accentColor: 'var(--brand)' }}
            />
            Мастер (автошаг)
          </label>
          {lockedStringIndex !== null && (
            <button
              onClick={() => onSelectString(null)}
              style={{ color: 'var(--brand)', textDecoration: 'underline', fontSize: '12px', minHeight: '24px', padding: '0 4px' }}
            >
              Сброс на авто
            </button>
          )}
        </div>
      </div>

      {/* Центральный дисплей тюнера с нотой и аурой */}
      <div
        className="panel"
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--s8) var(--s6)',
          overflow: 'hidden',
          minHeight: '270px'
        }}
      >
        <TunerAura cents={cents} isActive={isListening && measuredFreq > 0 && isSoundActive} inTuneThreshold={inTuneThreshold} />

        {/* Команда действия (FR-TN-18: Подтянуть / Ослабить / В строе) */}
        <div
          data-testid="tuner-action"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--ink-900)',
            border: `1px solid ${actionCommandColor}`,
            color: actionCommandColor,
            borderRadius: 'var(--r-pill)',
            padding: '6px 16px',
            fontSize: '14px',
            fontWeight: 800,
            letterSpacing: '0.05em',
            zIndex: 2,
            marginBottom: '12px',
            transition: 'all 150ms ease'
          }}
        >
          <ActionIcon size={16} />
          <span>{actionCommandText}</span>
          {isListening && measuredFreq > 0 && isSoundActive && Math.abs(cents) > inTuneThreshold && (
            <span className="mono" style={{ fontSize: '12px', opacity: 0.9 }}>
              ({cents > 0 ? `+${cents.toFixed(0)}` : cents.toFixed(0)}¢)
            </span>
          )}
        </div>

        {/* Крупная интерактивная нота (нажатие воспроизводит эталон) */}
        <button
          type="button"
          onClick={handlePlayCurrentNote}
          className={`tuner-note-interactive ${isPlayingSample ? 'tuner-note-playing' : ''}`}
          data-testid="tuner-note-button"
          aria-label={`${displayNoteName}${currentDisplayNote.octave} — прослушать эталон`}
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'baseline',
            zIndex: 2,
            opacity: isSoundActive || isPlayingSample ? 1 : 0.85,
            transition: 'opacity 300ms ease'
          }}
          title="Нажмите на ноту, чтобы услышать эталонное звучание струны"
        >
          <span
            data-testid="tuner-note"
            style={{
              fontSize: 'var(--fs-display)',
              fontWeight: 800,
              letterSpacing: 'var(--ls-display)',
              lineHeight: 'var(--lh-tight)',
              color: isPlayingSample
                ? 'var(--brand)'
                : isListening && measuredFreq > 0
                ? (Math.abs(cents) <= inTuneThreshold ? 'var(--sig-in)' : Math.abs(cents) <= 15 ? 'var(--sig-near)' : 'var(--sig-off)')
                : 'var(--ink-100)',
              transition: 'color 150ms ease'
            }}
          >
            {displayNoteName}
          </span>
          <span
            style={{
              fontSize: '28px',
              fontWeight: 600,
              color: isPlayingSample ? 'var(--brand)' : 'var(--ink-300)',
              marginLeft: '4px'
            }}
          >
            {currentDisplayNote.octave}
          </span>

          {/* Иконка динамика на ноте */}
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              right: '-14px',
              top: '8px',
              background: isPlayingSample ? 'var(--brand-strong)' : 'var(--ink-800)',
              color: isPlayingSample ? 'var(--on-brand)' : 'var(--ink-300)',
              borderRadius: '50%',
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px var(--shadow-soft)',
              transition: 'all 150ms ease'
            }}
          >
            <Volume2 size={13} />
          </span>
        </button>

        {/* Кнопка-подсказка под нотой */}
        <button
          onClick={handlePlayCurrentNote}
          className="btn btn-ghost btn-sm"
          style={{
            zIndex: 2,
            marginTop: '6px',
            fontSize: '11px',
            padding: '3px 10px',
            color: isPlayingSample ? 'var(--brand)' : 'var(--ink-300)',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            borderRadius: 'var(--r-pill)',
            border: isPlayingSample ? '1px solid var(--brand)' : '1px dashed var(--ink-700)',
            background: isPlayingSample ? 'color-mix(in srgb, var(--brand) 15%, transparent)' : 'transparent'
          }}
          title="Воспроизвести эталонный гитарный звук"
        >
          <Volume2 size={12} />
          {isPlayingSample ? 'Звучит эталон струны...' : 'Нажмите на ноту для примера'}
        </button>

        {/* Частоты: измеренная / целевая */}
        <div
          className="mono"
          style={{
            marginTop: '8px',
            fontSize: '14px',
            color: 'var(--ink-300)',
            display: 'flex',
            gap: '16px',
            zIndex: 1,
            opacity: isSoundActive ? 1 : 0.65
          }}
        >
          <span>Измерено: <strong data-testid="tuner-measured" style={{ color: 'var(--ink-050)' }}>{measuredFreq > 0 ? `${measuredFreq.toFixed(1)} Гц` : '—'}</strong></span>
          <span>Цель: <strong data-testid="tuner-target" style={{ color: 'var(--ink-050)' }}>{targetFreq > 0 ? `${targetFreq.toFixed(1)} Гц` : '—'}</strong></span>
        </div>

        {/* Нелинейная шкала центов */}
        <div style={{ width: '100%', marginTop: '24px', zIndex: 1 }}>
          <CentsScale cents={cents} inTuneThreshold={inTuneThreshold} isActive={isListening && measuredFreq > 0 && isSoundActive} />
        </div>
      </div>

      {/* Подсказка FR-TN-20: Подходите к ноте снизу при перетянутой струне */}
      {isListening && isSoundActive && cents > 15 && (
        <div data-testid="master-tip" className="banner" style={{ background: 'var(--ink-900)', border: '1px solid var(--sig-near)', color: 'var(--ink-100)', fontSize: '13px' }}>
          <Info size={16} color="var(--sig-near)" />
          <div>
            <b>Совет мастера:</b> Ослабьте колок чуть ниже цели и плавно подтяните вверх, чтобы устранить люфт механики колка.
          </div>
        </div>
      )}

      {/* Мини-спектрограмма гармоник (сворачиваемая) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setShowSpectrum(!showSpectrum)}
          aria-expanded={showSpectrum}
          data-testid="spectrum-toggle"
          style={{ alignSelf: 'flex-start', fontSize: '12px' }}
        >
          <SlidersHorizontal size={13} /> {showSpectrum ? 'Скрыть спектр гармоник' : 'Показать спектр гармоник'}
        </button>

        {showSpectrum && (
          <div className="panel" aria-hidden="true" style={{ padding: '8px 12px', height: '60px' }}>
            <SpectrumCanvas dimmed={!isListening} />
          </div>
        )}
      </div>

      {/* Заметный блок «Поддержать автора & развитие проекта» */}
      <DonateCard />
    </div>
  );
};
