import React, { useState, useEffect, useRef } from 'react';
import type { Tuning, StringSpec } from '../../domain/tunings';
import { TUNING_PRESETS } from '../../domain/tunings';
import type { NotationSystem } from '../../domain/notes';
import { midiToFrequency, calculateCents, formatNoteName } from '../../domain/notes';
import { AudioEngine } from '../../audio/audioEngine';
import type { PitchEstimate } from '../../audio/dsp';
import { playGuitarString } from '../../audio/synth';
import { CentsScale } from './CentsScale';
import { TunerAura } from './TunerAura';
import {
  Volume2,
  Mic,
  MicOff,
  CheckCircle2,
  RotateCcw,
  RotateCw,
  Info,
  SlidersHorizontal
} from 'lucide-react';

interface TunerScreenProps {
  tuning: Tuning;
  onTuningChange: (tuning: Tuning) => void;
  a4: number;
  notation: NotationSystem;
  inTuneThreshold: number;
  lockedStringIndex: number | null;
  onSelectString: (index: number | null) => void;
}

export const TunerScreen: React.FC<TunerScreenProps> = ({
  tuning,
  onTuningChange,
  a4,
  notation,
  inTuneThreshold,
  lockedStringIndex,
  onSelectString
}) => {
  const [isListening, setIsListening] = useState(false);
  const [measuredFreq, setMeasuredFreq] = useState(0);
  const [targetFreq, setTargetFreq] = useState(0);
  const [cents, setCents] = useState(0);
  const [activeString, setActiveString] = useState<StringSpec | null>(null);
  const [isStableTuned, setIsStableTuned] = useState(false);
  const [inputLevelDb, setInputLevelDb] = useState(-100);
  const [isClipping, setIsClipping] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [tunedStrings, setTunedStrings] = useState<Set<number>>(new Set());
  const [showSpectrum, setShowSpectrum] = useState(false);
  const [spectrumBars, setSpectrumBars] = useState<number[]>(new Array(32).fill(0));

  const audioEngineRef = useRef<AudioEngine | null>(null);
  const stableTimerRef = useRef<number | null>(null);

  // Определение ближайшей струны из текущего строя
  const findClosestString = (freq: number): StringSpec => {
    let closest = tuning.strings[0];
    let minDiff = Infinity;

    for (const str of tuning.strings) {
      const f = midiToFrequency(str.open.midi, a4);
      const diff = Math.abs(freq - f);
      if (diff < minDiff) {
        minDiff = diff;
        closest = str;
      }
    }
    return closest;
  };

  // Инициализация AudioEngine
  useEffect(() => {
    const engine = new AudioEngine({
      onEstimate: (estimate: PitchEstimate, _timeBuf, freqBuf) => {
        setInputLevelDb(estimate.rms);
        setIsClipping(estimate.isClipping);

        // Обновление мини-спектра (32 полосы)
        if (freqBuf && freqBuf.length > 0) {
          const bars: number[] = [];
          const step = Math.floor(Math.min(freqBuf.length, 512) / 32);
          for (let i = 0; i < 32; i++) {
            const db = freqBuf[i * step] || -100;
            const norm = Math.max(0, Math.min(100, (db + 90) * 1.4));
            bars.push(norm);
          }
          setSpectrumBars(bars);
        }

        if (estimate.isSilent || estimate.frequency <= 0 || estimate.clarity < 0.85) {
          return;
        }

        const freq = estimate.frequency;
        setMeasuredFreq(freq);

        // Определяем целевую струну (ручную или автоматическую)
        let currentTargetStr: StringSpec;
        if (lockedStringIndex !== null && tuning.strings[lockedStringIndex]) {
          currentTargetStr = tuning.strings[lockedStringIndex];
        } else {
          currentTargetStr = findClosestString(freq);
        }

        setActiveString(currentTargetStr);
        const tFreq = midiToFrequency(currentTargetStr.open.midi, a4);
        setTargetFreq(tFreq);

        const dCents = calculateCents(freq, tFreq);
        setCents(dCents);

        // Проверка удержания строя (≥ 1.2 с)
        if (Math.abs(dCents) <= inTuneThreshold) {
          setIsStableTuned(true);
          const currentIdx = tuning.strings.findIndex(s => s.stringNumber === currentTargetStr.stringNumber);

          if (currentIdx !== -1) {
            setTunedStrings(prev => new Set(prev).add(currentIdx));

            // Автопереход к следующей струне в режиме мастера
            if (autoAdvance && !stableTimerRef.current) {
              stableTimerRef.current = window.setTimeout(() => {
                if (currentIdx < tuning.strings.length - 1) {
                  onSelectString(currentIdx + 1);
                }
                stableTimerRef.current = null;
              }, 1200);
            }
          }

          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate([40, 60, 40]);
          }
        } else {
          setIsStableTuned(false);
          if (stableTimerRef.current) {
            clearTimeout(stableTimerRef.current);
            stableTimerRef.current = null;
          }
        }
      },
      onError: (err: Error) => {
        setErrorMessage(err.message || 'Ошибка доступа к микрофону');
        setIsListening(false);
      }
    });

    audioEngineRef.current = engine;

    return () => {
      engine.destroy();
      if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
    };
  }, [tuning, a4, lockedStringIndex, inTuneThreshold, autoAdvance, onSelectString]);

  const toggleListening = async () => {
    if (!audioEngineRef.current) return;

    if (isListening) {
      audioEngineRef.current.stop();
      setIsListening(false);
      setIsStableTuned(false);
    } else {
      setErrorMessage(null);
      try {
        await audioEngineRef.current.start();
        setIsListening(true);
      } catch {
        // Ошибка уже обработана в onError
      }
    }
  };

  const handlePlayReference = (str: StringSpec) => {
    const f = midiToFrequency(str.open.midi, a4);
    playGuitarString(f, 2.8);
  };

  const currentDisplayNote = activeString ? activeString.open : (tuning.strings[0]?.open || { name: 'E', octave: 2 });
  const displayNoteName = formatNoteName(currentDisplayNote.name, notation);

  // Определение команды действия тюнера (FR-TN-18)
  let actionCommandText = 'Сыграйте струну';
  let actionCommandColor = 'var(--ink-500)';
  let ActionIcon = Info;

  if (isListening && measuredFreq > 0) {
    if (Math.abs(cents) <= inTuneThreshold) {
      actionCommandText = 'В СТРОЕ';
      actionCommandColor = 'var(--sig-in)';
      ActionIcon = CheckCircle2;
    } else if (cents < 0) {
      actionCommandText = 'ПОДТЯНУТЬ';
      actionCommandColor = cents > -15 ? 'var(--sig-near)' : 'var(--sig-off)';
      ActionIcon = RotateCcw; // Вращение колка против часовой (натяжение)
    } else {
      actionCommandText = 'ОСЛАБИТЬ';
      actionCommandColor = cents < 15 ? 'var(--sig-near)' : 'var(--sig-off)';
      ActionIcon = RotateCw; // Вращение колка по часовой (спуск)
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
              const found = TUNING_PRESETS.find(t => t.id === e.target.value);
              if (found) onTuningChange(found);
            }}
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
            {TUNING_PRESETS.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Верхний блок микрофона: крупная кнопка ДО включения, компактная плашка ПОСЛЕ включения */}
      {!isListening ? (
        <button
          className="btn btn-primary"
          onClick={toggleListening}
          style={{
            width: '100%',
            padding: '16px 24px',
            fontSize: '17px',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            boxShadow: '0 4px 20px rgba(110, 86, 248, 0.4)'
          }}
        >
          <Mic size={22} /> Включить микрофон
        </button>
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 16px',
            background: 'var(--ink-900)',
            border: '1px solid var(--ink-700)',
            borderRadius: 'var(--r-pill)',
            gap: '12px'
          }}
        >
          {/* Индикатор работы микрофона */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: 'var(--sig-in)',
                boxShadow: '0 0 8px var(--sig-in)',
                animation: 'pulse 1.5s infinite'
              }}
            />
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink-100)' }}>
              Микрофон активен
            </span>
          </div>

          {/* Компактный VU-индикатор входного уровня */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, maxWidth: '140px' }}>
            <div style={{ flex: 1, height: '6px', background: 'var(--ink-800)', borderRadius: 'var(--r-pill)', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.max(0, Math.min(100, (inputLevelDb + 60) * 2))}%`,
                  height: '100%',
                  background: isClipping ? 'var(--sig-off)' : inputLevelDb > -20 ? 'var(--sig-in)' : 'var(--brand)',
                  transition: 'width 60ms linear'
                }}
              />
            </div>
            {isClipping && <span style={{ color: 'var(--sig-off)', fontWeight: 700, fontSize: '10px' }}>MAX!</span>}
          </div>

          {/* Минимизированная кнопка выключения */}
          <button
            className="btn btn-ghost btn-sm"
            onClick={toggleListening}
            style={{ padding: '4px 10px', fontSize: '12px', color: 'var(--ink-300)', borderColor: 'var(--ink-700)' }}
            title="Остановить микрофон"
          >
            <MicOff size={14} /> Выкл
          </button>
        </div>
      )}

      {/* Ошибки микрофона */}
      {errorMessage && (
        <div className="banner err">
          <div>
            <b>Нет доступа к микрофону</b>
            <span>{errorMessage}. Пожалуйста, разрешите доступ в настройках браузера.</span>
          </div>
        </div>
      )}

      {/* Интерактивные чипы струн */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px', overflowX: 'auto', padding: '4px 0' }}>
        {tuning.strings.map((str, idx) => {
          const isSelected = lockedStringIndex === idx;
          const isSounding = activeString?.stringNumber === str.stringNumber;
          const isMarkedTuned = tunedStrings.has(idx);
          const strNoteName = formatNoteName(str.open.name, notation);
          const strFreq = midiToFrequency(str.open.midi, a4).toFixed(1);

          let state = 'idle';
          if (isSelected) state = 'active';
          else if (isSounding) {
            state = isStableTuned ? 'done' : Math.abs(cents) > inTuneThreshold ? 'off' : 'active';
          } else if (isMarkedTuned) {
            state = 'done';
          }

          return (
            <button
              key={str.stringNumber}
              className="schip"
              data-state={state}
              onClick={() => onSelectString(isSelected ? null : idx)}
              title={`${str.stringNumber}-я струна: ${strNoteName}${str.open.octave} (${strFreq} Гц)`}
              style={{ flex: 1, position: 'relative' }}
            >
              <span>{strNoteName}{str.open.octave}</span>
              <small className="mono">{str.stringNumber}я струна</small>

              {/* Кнопка воспроизведения эталона на слух */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  handlePlayReference(str);
                }}
                style={{
                  position: 'absolute',
                  top: '-6px',
                  right: '-4px',
                  background: 'var(--ink-700)',
                  borderRadius: '50%',
                  width: '20px',
                  height: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--ink-100)',
                  cursor: 'pointer'
                }}
                title="Воспроизвести эталонный звук"
              >
                <Volume2 size={11} />
              </div>
            </button>
          );
        })}
      </div>

      {/* Опции: Мастер настройки / Автопереход */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--ink-300)' }}>
        <span>
          Режим: {lockedStringIndex !== null ? `Фиксация на ${tuning.strings[lockedStringIndex]?.stringNumber}-й струне` : 'Автоопределение струны'}
        </span>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoAdvance}
              onChange={(e) => setAutoAdvance(e.target.checked)}
              style={{ accentColor: 'var(--brand)' }}
            />
            Мастер (автопереход)
          </label>
          {lockedStringIndex !== null && (
            <button
              onClick={() => onSelectString(null)}
              style={{ color: 'var(--brand)', textDecoration: 'underline', fontSize: '12px' }}
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
        <TunerAura cents={cents} isActive={isListening && measuredFreq > 0} inTuneThreshold={inTuneThreshold} />

        {/* Команда действия (FR-TN-18: Подтянуть / Ослабить / В строе) */}
        <div
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
          {isListening && measuredFreq > 0 && Math.abs(cents) > inTuneThreshold && (
            <span className="mono" style={{ fontSize: '12px', opacity: 0.9 }}>
              ({cents > 0 ? `+${cents.toFixed(0)}` : cents.toFixed(0)}¢)
            </span>
          )}
        </div>

        {/* Крупная нота */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'baseline', zIndex: 1 }}>
          <span
            style={{
              fontSize: 'var(--fs-display)',
              fontWeight: 800,
              letterSpacing: 'var(--ls-display)',
              lineHeight: 'var(--lh-tight)',
              color: isListening && measuredFreq > 0
                ? (Math.abs(cents) <= inTuneThreshold ? 'var(--sig-in)' : Math.abs(cents) <= 15 ? 'var(--sig-near)' : 'var(--sig-off)')
                : 'var(--ink-500)',
              transition: 'color 150ms ease'
            }}
          >
            {isListening && measuredFreq > 0 ? displayNoteName : '—'}
          </span>
          {isListening && measuredFreq > 0 && (
            <span
              style={{
                fontSize: '28px',
                fontWeight: 600,
                color: 'var(--ink-300)',
                marginLeft: '4px'
              }}
            >
              {currentDisplayNote.octave}
            </span>
          )}
        </div>

        {/* Частоты: измеренная / целевая */}
        <div
          className="mono"
          style={{
            marginTop: '8px',
            fontSize: '14px',
            color: 'var(--ink-300)',
            display: 'flex',
            gap: '16px',
            zIndex: 1
          }}
        >
          <span>Измерено: <strong style={{ color: 'var(--ink-050)' }}>{measuredFreq > 0 ? `${measuredFreq.toFixed(1)} Гц` : '—'}</strong></span>
          <span>Цель: <strong style={{ color: 'var(--ink-050)' }}>{targetFreq > 0 ? `${targetFreq.toFixed(1)} Гц` : '—'}</strong></span>
        </div>

        {/* Нелинейная шкала центов */}
        <div style={{ width: '100%', marginTop: '24px', zIndex: 1 }}>
          <CentsScale cents={cents} inTuneThreshold={inTuneThreshold} isActive={isListening && measuredFreq > 0} />
        </div>
      </div>

      {/* Подсказка FR-TN-20: Подходите к ноте снизу при перетянутой струне */}
      {isListening && cents > 15 && (
        <div className="banner" style={{ background: 'var(--ink-900)', border: '1px solid var(--sig-near)', color: 'var(--ink-100)', fontSize: '13px' }}>
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
          style={{ alignSelf: 'flex-start', fontSize: '12px' }}
        >
          <SlidersHorizontal size={13} /> {showSpectrum ? 'Скрыть спектр гармоник' : 'Показать спектр гармоник'}
        </button>

        {showSpectrum && (
          <div className="panel" style={{ padding: '8px 12px', display: 'flex', alignItems: 'flex-end', height: '60px', gap: '3px' }}>
            {spectrumBars.map((val, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: `${Math.max(4, val)}%`,
                  background: val > 60 ? 'var(--sig-in)' : 'var(--brand)',
                  borderRadius: '1px',
                  opacity: isListening ? 0.85 : 0.2,
                  transition: 'height 40ms linear'
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
