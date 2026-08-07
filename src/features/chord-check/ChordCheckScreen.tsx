import React, { useState, useEffect, useRef } from 'react';
import type { Tuning } from '../../domain/tunings';
import type { NotationSystem } from '../../domain/notes';
import { formatNoteName, midiToPitch } from '../../domain/notes';
import type { Voicing } from '../../domain/chords';
import { COMMON_VOICINGS } from '../../domain/chords';
import { AudioEngine } from '../../audio/audioEngine';
import type { PitchEstimate } from '../../audio/dsp';
import type { StringTuningStatus } from '../../audio/chordAnalyzer';
import {
  initChordStatuses,
  evaluateArpeggioNote,
  analyzeChordStrumSpectrum
} from '../../audio/chordAnalyzer';
import { Mic, MicOff, ArrowRight, RotateCcw, Play, CheckCircle2 } from 'lucide-react';

interface ChordCheckScreenProps {
  tuning: Tuning;
  notation: NotationSystem;
  a4: number;
  inTuneThreshold: number;
  onGoTuneString: (stringIndex: number) => void;
}

export const ChordCheckScreen: React.FC<ChordCheckScreenProps> = ({
  tuning,
  notation,
  a4,
  inTuneThreshold,
  onGoTuneString
}) => {
  const [selectedVoicing, setSelectedVoicing] = useState<Voicing>(COMMON_VOICINGS[0]); // Open strings
  const [analysisMode, setAnalysisMode] = useState<'arpeggio' | 'strum'>('arpeggio');
  const [isListening, setIsListening] = useState(false);
  const [isCapturingStrum, setIsCapturingStrum] = useState(false);
  const [captureProgress, setCaptureProgress] = useState(0);
  const [stringStatuses, setStringStatuses] = useState<StringTuningStatus[]>(() =>
    initChordStatuses(COMMON_VOICINGS[0], tuning, a4)
  );
  const [lastMatchedIndex, setLastMatchedIndex] = useState<number | null>(null);

  const audioEngineRef = useRef<AudioEngine | null>(null);
  const captureTimerRef = useRef<number | null>(null);

  // Сброс статусов при смене аккорда или строя
  useEffect(() => {
    setStringStatuses(initChordStatuses(selectedVoicing, tuning, a4));
    setLastMatchedIndex(null);
  }, [selectedVoicing, tuning, a4]);

  useEffect(() => {
    const engine = new AudioEngine({
      onEstimate: (estimate: PitchEstimate) => {
        if (analysisMode !== 'arpeggio') return;
        if (estimate.isSilent || estimate.frequency <= 0 || estimate.clarity < 0.85) return;

        setStringStatuses(prev => {
          const res = evaluateArpeggioNote(estimate.frequency, selectedVoicing, tuning, prev, inTuneThreshold, a4);
          if (res.matchedIndex !== null) {
            setLastMatchedIndex(res.matchedIndex);
          }
          return res.updatedStatuses;
        });
      }
    });

    audioEngineRef.current = engine;

    return () => {
      engine.destroy();
      if (captureTimerRef.current) clearInterval(captureTimerRef.current);
    };
  }, [analysisMode, selectedVoicing, tuning, inTuneThreshold, a4]);

  const toggleListening = async () => {
    if (!audioEngineRef.current) return;
    if (isListening) {
      audioEngineRef.current.stop();
      setIsListening(false);
      setIsCapturingStrum(false);
    } else {
      try {
        await audioEngineRef.current.start();
        setIsListening(true);
      } catch (e) {
        console.error(e);
      }
    }
  };

  /**
   * Запуск 1.2с спектрального захвата для полифонического анализа (Режим B)
   */
  const handleStartStrumCapture = async () => {
    if (!audioEngineRef.current) return;
    if (!isListening) {
      try {
        await audioEngineRef.current.start();
        setIsListening(true);
      } catch (e) {
        console.error(e);
        return;
      }
    }

    setIsCapturingStrum(true);
    setCaptureProgress(0);

    const startTime = performance.now();
    const duration = 1200; // 1.2 с захвата звука струн

    if (captureTimerRef.current) clearInterval(captureTimerRef.current);

    captureTimerRef.current = window.setInterval(() => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(100, Math.round((elapsed / duration) * 100));
      setCaptureProgress(progress);

      if (elapsed >= duration) {
        if (captureTimerRef.current) clearInterval(captureTimerRef.current);
        setIsCapturingStrum(false);

        // Получаем накопленный спектр из AudioEngine и анализируем
        const freqInfo = audioEngineRef.current?.getFrequencyData();
        if (freqInfo) {
          const analyzed = analyzeChordStrumSpectrum(
            freqInfo.data,
            freqInfo.sampleRate,
            selectedVoicing,
            tuning,
            inTuneThreshold,
            a4
          );
          setStringStatuses(analyzed);
        }
      }
    }, 50);
  };

  const resetAnalysis = () => {
    setStringStatuses(initChordStatuses(selectedVoicing, tuning, a4));
    setLastMatchedIndex(null);
    setCaptureProgress(0);
    setIsCapturingStrum(false);
  };

  const soundingStrings = stringStatuses.filter(s => s.status !== 'muted');
  const tunedStringsCount = soundingStrings.filter(s => s.status === 'in-tune').length;
  const isChordComplete = soundingStrings.length > 0 && tunedStringsCount === soundingStrings.length;

  return (
    <div style={{ width: '100%', maxWidth: '640px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--s6)' }}>
      {/* Заголовок */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <span className="eyebrow">Проверка аккорда</span>
          <h2 style={{ fontSize: '20px', margin: 0 }}>Анализ строя в аккорде</h2>
        </div>

        {/* Переключатель режимов: Арпеджио / Один удар */}
        <div style={{ display: 'flex', background: 'var(--ink-900)', border: '1px solid var(--ink-700)', borderRadius: 'var(--r-pill)', padding: '3px' }}>
          <button
            className="btn btn-sm"
            style={{
              background: analysisMode === 'arpeggio' ? 'var(--brand)' : 'transparent',
              color: analysisMode === 'arpeggio' ? '#fff' : 'var(--ink-300)',
              borderRadius: 'var(--r-pill)',
              padding: '6px 12px'
            }}
            onClick={() => {
              setAnalysisMode('arpeggio');
              resetAnalysis();
            }}
          >
            Режим A: Перебор
          </button>
          <button
            className="btn btn-sm"
            style={{
              background: analysisMode === 'strum' ? 'var(--brand)' : 'transparent',
              color: analysisMode === 'strum' ? '#fff' : 'var(--ink-300)',
              borderRadius: 'var(--r-pill)',
              padding: '6px 12px'
            }}
            onClick={() => {
              setAnalysisMode('strum');
              resetAnalysis();
            }}
          >
            Режим B: Удар (Спектр)
          </button>
        </div>
      </div>

      {/* Верхний блок микрофона: крупная кнопка ДО включения, минимизированный статус ПОСЛЕ */}
      {analysisMode === 'arpeggio' ? (
        !isListening ? (
          <button
            className="btn btn-primary"
            onClick={toggleListening}
            style={{
              width: '100%',
              padding: '14px 20px',
              fontSize: '16px',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 20px rgba(110, 86, 248, 0.4)'
            }}
          >
            <Mic size={20} /> Включить микрофон (Перебор)
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
              borderRadius: 'var(--r-pill)'
            }}
          >
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
                Слушаю перебор струн...
              </span>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={toggleListening}
              style={{ padding: '4px 10px', fontSize: '12px', color: 'var(--ink-300)', borderColor: 'var(--ink-700)' }}
            >
              <MicOff size={14} /> Выкл
            </button>
          </div>
        )
      ) : (
        <button
          className="btn btn-primary"
          onClick={handleStartStrumCapture}
          disabled={isCapturingStrum}
          style={{
            width: '100%',
            padding: '14px 20px',
            fontSize: '16px',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: '0 4px 20px rgba(110, 86, 248, 0.4)'
          }}
        >
          <Play size={18} /> {isCapturingStrum ? `Слушаю струны (${captureProgress}%)...` : 'Ударьте по всем струнам'}
        </button>
      )}

      {/* Быстрый выбор аккорда */}
      <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: 'var(--s4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <span className="eyebrow">Быстрый выбор аккорда</span>
          <button className="btn btn-ghost btn-sm" onClick={resetAnalysis} title="Сбросить статус">
            <RotateCcw size={14} /> Сбросить
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {COMMON_VOICINGS.map(v => (
            <button
              key={v.id}
              className={`btn btn-sm ${selectedVoicing.id === v.id ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setSelectedVoicing(v)}
              style={{ fontWeight: 700 }}
            >
              {v.name}
            </button>
          ))}
        </div>
      </div>

      {/* Индикатор захвата удара (Режим B) */}
      {isCapturingStrum && (
        <div className="panel" style={{ padding: 'var(--s4)', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, color: 'var(--brand)', fontSize: '15px' }}>
            Слушаю удар по струнам... {captureProgress}%
          </div>
          <div style={{ width: '100%', height: '8px', background: 'var(--ink-800)', borderRadius: 'var(--r-pill)', overflow: 'hidden' }}>
            <div
              style={{
                width: `${captureProgress}%`,
                height: '100%',
                background: 'var(--brand)',
                transition: 'width 50ms linear'
              }}
            />
          </div>
          <span style={{ fontSize: '12px', color: 'var(--ink-300)' }}>
            Дайте струнам звенеть, пока полоса не заполнится
          </span>
        </div>
      )}

      {/* Поздравление при успешной проверке всех струн */}
      {isChordComplete && (
        <div className="banner ok" style={{ animation: 'pulse 1s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={20} color="var(--sig-in)" />
            <div>
              <b>Аккорд звучит безупречно!</b>
              <span>Все звучащие струны аккорда {selectedVoicing.name} идеально настроены (погрешность ≤ ±{inTuneThreshold}¢).</span>
            </div>
          </div>
        </div>
      )}

      {/* Индикаторы струн аккорда */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {tuning.strings.map((str, idx) => {
          const status = stringStatuses[idx];
          const fret = selectedVoicing.frets[idx];
          const isMuted = fret === 'x';
          const isSounding = lastMatchedIndex === idx;

          let badgeColor = 'var(--ink-500)';
          let badgeText = 'Ожидание';

          if (isMuted) {
            badgeColor = 'var(--ink-700)';
            badgeText = 'Глушится (X)';
          } else if (status?.status === 'in-tune') {
            badgeColor = 'var(--sig-in)';
            badgeText = `В строе (${status.cents > 0 ? '+' : ''}${status.cents.toFixed(1)}¢)`;
          } else if (status?.status === 'low') {
            badgeColor = 'var(--sig-off)';
            badgeText = `Низко (${status.cents.toFixed(1)}¢)`;
          } else if (status?.status === 'high') {
            badgeColor = 'var(--sig-off)';
            badgeText = `Высоко (+${status.cents.toFixed(1)}¢)`;
          } else if (status?.status === 'not-played') {
            badgeColor = 'var(--ink-500)';
            badgeText = 'Не прозвучала';
          }

          const targetPitch = status && status.targetMidi > 0 ? midiToPitch(status.targetMidi) : str.open;
          const displayTargetName = formatNoteName(targetPitch.name, notation);

          return (
            <div
              key={str.stringNumber}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: isSounding ? 'color-mix(in srgb, var(--brand) 12%, var(--ink-900))' : 'var(--ink-900)',
                border: `1px solid ${isSounding ? 'var(--brand)' : 'var(--ink-700)'}`,
                borderRadius: 'var(--r-md)',
                transition: 'all 150ms ease'
              }}
            >
              {/* Номер струны и лад */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span
                  className="mono"
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: 'var(--ink-800)',
                    border: '1px solid var(--ink-700)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '14px'
                  }}
                >
                  {str.stringNumber}
                </span>

                <div>
                  <div style={{ fontWeight: 700, fontSize: '15px' }}>
                    {displayTargetName}{targetPitch.octave}
                    <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--ink-300)', marginLeft: '6px' }}>
                      ({isMuted ? 'глушить' : fret === 0 ? 'открытая' : `лад ${fret}`})
                    </span>
                  </div>
                  {!isMuted && status?.targetFreq ? (
                    <div className="mono" style={{ fontSize: '11px', color: 'var(--ink-300)' }}>
                      Цель: {status.targetFreq.toFixed(1)} Гц {status.measuredFreq > 0 ? `| Изм: ${status.measuredFreq.toFixed(1)} Гц` : ''}
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Статус и кнопка перейти к настройке */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: badgeColor,
                    padding: '4px 10px',
                    background: 'var(--ink-800)',
                    borderRadius: 'var(--r-pill)',
                    border: `1px solid ${badgeColor}`
                  }}
                >
                  {badgeText}
                </span>

                {!isMuted && status && status.status !== 'in-tune' && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => onGoTuneString(idx)}
                    title={`Перейти в тюнер для ${str.stringNumber}-й струны`}
                    style={{ padding: '6px 10px', fontSize: '12px' }}
                  >
                    Настроить <ArrowRight size={12} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
