import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { Tuning } from '../../domain/tunings';
import type { NotationSystem } from '../../domain/notes';
import { formatNoteName, midiToPitch } from '../../domain/notes';
import { OPEN_STRINGS_ID, getVoicingsForTuning, voicingLibraryKind } from '../../domain/chords';
import { sharedAudioEngine } from '../../audio/audioEngine';
import type { PitchEstimate } from '../../audio/dsp';
import type { StringTuningStatus } from '../../audio/chordAnalyzer';
import {
  initChordStatuses,
  evaluateArpeggioNote,
  analyzeChordStrumSpectrum
} from '../../audio/chordAnalyzer';
import { ChordDiagramSVG } from './ChordDiagramSVG';
import { useMicrophone } from '../../audio/useMicrophone';
import { MicBar, MicErrorBanner } from '../../ui/MicBar';
import { ArrowRight, RotateCcw, Play, CheckCircle2 } from 'lucide-react';

/** Сколько после сброса не принимать оценки высоты тона (D-4, см. ignoreEstimatesUntilRef). */
const RESET_SETTLE_MS = 400;

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
  // Хранится id, а аппликатура берётся из библиотеки, пересчитанной под строй:
  // шестиструнная форма на басе или укулеле давала не тот аккорд (#5).
  const [selectedVoicingId, setSelectedVoicingId] = useState<string>(OPEN_STRINGS_ID);
  const voicings = useMemo(() => getVoicingsForTuning(tuning), [tuning]);
  const hasChordLibrary = voicingLibraryKind(tuning) !== null;
  const selectedVoicing = voicings.find(v => v.id === selectedVoicingId) ?? voicings[0];
  const [analysisMode, setAnalysisMode] = useState<'arpeggio' | 'strum'>('arpeggio');
  const mic = useMicrophone();
  const [isCapturingStrum, setIsCapturingStrum] = useState(false);
  const [captureProgress, setCaptureProgress] = useState(0);
  const [stringStatuses, setStringStatuses] = useState<StringTuningStatus[]>(() =>
    initChordStatuses(selectedVoicing, tuning, a4)
  );
  const [lastMatchedIndex, setLastMatchedIndex] = useState<number | null>(null);

  const captureTimerRef = useRef<number | null>(null);

  /**
   * До этого момента оценки после сброса игнорируются (D-4).
   *
   * AnalyserNode отдаёт валидные оценки ещё ~100–250 мс после того, как звук
   * стих: его окно анализа промывается новыми сэмплами не мгновенно. При живом
   * микрофоне такая «догоняющая» оценка перезаписывала только что сброшенный
   * статус, и он на мгновение мигал обратно в «В строе».
   */
  const ignoreEstimatesUntilRef = useRef(0);

  // Сброс статусов при смене аккорда или строя
  useEffect(() => {
    setStringStatuses(initChordStatuses(selectedVoicing, tuning, a4));
    setLastMatchedIndex(null);
  }, [selectedVoicing, tuning, a4]);

  useEffect(() => {
    const unsubscribe = sharedAudioEngine.subscribe((estimate: PitchEstimate) => {
      if (analysisMode !== 'arpeggio') return;
      if (performance.now() < ignoreEstimatesUntilRef.current) return;
      if (estimate.isSilent || estimate.frequency <= 0 || estimate.clarity < 0.50) return;

      setStringStatuses(prev => {
        const res = evaluateArpeggioNote(estimate.frequency, selectedVoicing, tuning, prev, inTuneThreshold, a4);
        if (res.matchedIndex !== null) {
          setLastMatchedIndex(res.matchedIndex);
        }
        return res.updatedStatuses;
      });
    });

    return () => {
      unsubscribe();
      if (captureTimerRef.current) clearInterval(captureTimerRef.current);
    };
  }, [analysisMode, selectedVoicing, tuning, inTuneThreshold, a4]);

  // Микрофон выключили (здесь, из шапки) или поток оборвался посреди захвата
  // удара: дожидаться конца полосы незачем — спектра всё равно не будет.
  useEffect(() => {
    if (mic.isOn) return;
    if (captureTimerRef.current) {
      clearInterval(captureTimerRef.current);
      captureTimerRef.current = null;
    }
    setIsCapturingStrum(false);
  }, [mic.isOn]);

  /**
   * Запуск 1.2с спектрального захвата для полифонического анализа (Режим B)
   */
  const handleStartStrumCapture = async () => {
    if (!sharedAudioEngine.isRunning()) {
      // Раньше отказ в доступе уходил только в console.error, и кнопка просто
      // «не нажималась». Теперь причину показывает MicErrorBanner.
      await mic.start();
      if (!sharedAudioEngine.isRunning()) return;
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
        const freqInfo = sharedAudioEngine.getFrequencyData();
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
    // Запас над наблюдавшимися 250 мс: за это время окно анализатора полностью
    // промывается, а для нового щипка пауза всё равно неощутима.
    ignoreEstimatesUntilRef.current = performance.now() + RESET_SETTLE_MS;
    setStringStatuses(initChordStatuses(selectedVoicing, tuning, a4));
    setLastMatchedIndex(null);
    setCaptureProgress(0);
    setIsCapturingStrum(false);
  };

  const soundingStrings = stringStatuses.filter(s => s.status !== 'muted');
  const tunedStringsCount = soundingStrings.filter(s => s.status === 'in-tune').length;
  const isChordComplete = soundingStrings.length > 0 && tunedStringsCount === soundingStrings.length;

  return (
    <div style={{ width: '100%', maxWidth: '780px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--s6)' }}>
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
            data-testid="cc-mode-arpeggio"
            style={{
              background: analysisMode === 'arpeggio' ? 'var(--brand-strong)' : 'transparent',
              color: analysisMode === 'arpeggio' ? 'var(--on-brand)' : 'var(--ink-300)',
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
            data-testid="cc-mode-strum"
            style={{
              background: analysisMode === 'strum' ? 'var(--brand-strong)' : 'transparent',
              color: analysisMode === 'strum' ? 'var(--on-brand)' : 'var(--ink-300)',
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
        <MicBar
          mic={mic}
          startLabel="Включить микрофон (Перебор)"
          activeLabel="Слушаю перебор струн..."
          testIds={{ start: 'cc-mic-toggle', stop: 'cc-mic-toggle' }}
        />
      ) : (
        <button
          className="btn btn-primary"
          data-testid="cc-strum-start"
          onClick={handleStartStrumCapture}
          disabled={isCapturingStrum || mic.isRequesting}
          style={{
            width: '100%',
            padding: '14px 20px',
            fontSize: '16px',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: '0 4px 20px var(--shadow-brand)'
          }}
        >
          <Play size={18} /> {isCapturingStrum ? `Слушаю струны (${captureProgress}%)...` : 'Ударьте по всем струнам'}
        </button>
      )}

      <MicErrorBanner mic={mic} />

      {/* Быстрый выбор аккорда */}
      <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: 'var(--s4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <span className="eyebrow">Быстрый выбор аккорда</span>
          <button className="btn btn-ghost btn-sm" data-testid="cc-reset" onClick={resetAnalysis} title="Сбросить статус">
            <RotateCcw size={14} /> Сбросить
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {voicings.map(v => (
            <button
              key={v.id}
              className={`btn btn-sm ${selectedVoicing.id === v.id ? 'btn-primary' : 'btn-ghost'}`}
              data-testid={`cc-voicing-${v.id}`}
              onClick={() => setSelectedVoicingId(v.id)}
              title={v.shape ? `Форма ${v.shape}, пересчитанная под строй` : undefined}
              style={{ fontWeight: 700 }}
            >
              {v.name}
            </button>
          ))}
        </div>

        {!hasChordLibrary && (
          <span data-testid="cc-no-chords" style={{ fontSize: '12px', color: 'var(--ink-300)' }}>
            Для этого строя библиотеки аккордов нет — можно проверить открытые струны.
          </span>
        )}
        {voicings.some(v => v.shape) && (
          <span data-testid="cc-transposed-hint" style={{ fontSize: '12px', color: 'var(--ink-300)' }}>
            Аппликатуры пересчитаны под строй: название — то, что звучит на самом деле.
          </span>
        )}
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

      {/* Сетка: Картинка-схема аккорда + Список струн */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--s4)', alignItems: 'start' }}>
        {/* Картинка-схема аппликатуры */}
        <ChordDiagramSVG
          voicing={selectedVoicing}
          tuning={tuning}
          notation={notation}
          a4={a4}
        />

        {/* Индикаторы струн аккорда */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {tuning.strings.map((str, idx) => {
            const status = stringStatuses[idx];
            const fret = selectedVoicing.frets[idx];
            const isMuted = fret === 'x' || fret === undefined;
            const isSounding = lastMatchedIndex === idx;

            let badgeColor = 'var(--ink-300)';
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
              badgeColor = 'var(--ink-300)';
              badgeText = 'Не прозвучала';
            }

            const targetPitch = status && status.targetMidi > 0 ? midiToPitch(status.targetMidi) : str.open;
            const displayTargetName = formatNoteName(targetPitch.name, notation);

            return (
              <div
                key={str.stringNumber}
                data-testid={`cc-string-${str.stringNumber}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: isSounding ? 'color-mix(in srgb, var(--brand) 12%, var(--ink-900))' : 'var(--ink-900)',
                  border: `1px solid ${isSounding ? 'var(--brand)' : 'var(--ink-700)'}`,
                  borderRadius: 'var(--r-md)',
                  transition: 'all 150ms ease'
                }}
              >
                {/* Номер струны и лад */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span
                    className="mono"
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: 'var(--ink-800)',
                      border: '1px solid var(--ink-700)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '13px'
                    }}
                  >
                    {str.stringNumber}
                  </span>

                  <div>
                    <div style={{ fontWeight: 700, fontSize: '14px' }}>
                      {displayTargetName}{targetPitch.octave}
                      <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--ink-300)', marginLeft: '6px' }}>
                        ({isMuted ? 'глушить' : fret === 0 ? 'открытая' : `лад ${fret}`})
                      </span>
                    </div>
                    {!isMuted && status?.targetFreq ? (
                      <div className="mono" style={{ fontSize: '10px', color: 'var(--ink-300)' }}>
                        Цель: {status.targetFreq.toFixed(1)} Гц {status.measuredFreq > 0 ? `| Изм: ${status.measuredFreq.toFixed(1)} Гц` : ''}
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Статус и кнопка перейти к настройке */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    data-testid={`cc-status-${str.stringNumber}`}
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: badgeColor,
                      padding: '3px 8px',
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
                      data-testid={`cc-tune-${str.stringNumber}`}
                      onClick={() => onGoTuneString(idx)}
                      title={`Перейти в тюнер для ${str.stringNumber}-й струны`}
                      style={{ padding: '4px 8px', fontSize: '11px' }}
                    >
                      Настроить <ArrowRight size={11} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
