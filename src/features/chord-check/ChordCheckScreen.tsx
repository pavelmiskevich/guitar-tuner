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
  analyzeChordStrum,
  chordProgress,
  octavePartners
} from '../../audio/chordAnalyzer';
import { ChordDiagramSVG } from './ChordDiagramSVG';
import { SteadyPitchGate } from '../../domain/tuneStability';
import { StrumCapture, STRUM_WAIT_MS } from '../../audio/strumCapture';
import { useMicrophone } from '../../audio/useMicrophone';
import { MicBar, MicErrorBanner } from '../../ui/MicBar';
import { ArrowRight, RotateCcw, Play, CheckCircle2 } from 'lucide-react';
import { LiveRegion } from '../../ui/LiveRegion';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { useThrottledAnnouncement } from '../../ui/useThrottledAnnouncement';
import {
  chordStringStatusSpoken,
  chordStringStatusText,
  strumSummaryAnnouncement
} from '../../domain/announcements';

/** Сколько после сброса не принимать оценки высоты тона (D-4, см. ignoreEstimatesUntilRef). */
const RESET_SETTLE_MS = 400;
/** Как часто скринридер может зачитывать статусы струн. */
const CHORD_ANNOUNCE_INTERVAL_MS = 1500;

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
  /**
   * Захват удара (#4): ждём удар → пропускаем атаку и пишем окно → анализ.
   * timeout — удара не дождались, кнопку можно нажать снова.
   */
  const [strumPhase, setStrumPhase] = useState<'idle' | 'waiting' | 'recording' | 'timeout'>('idle');
  const [captureProgress, setCaptureProgress] = useState(0);
  const isCapturingStrum = strumPhase === 'waiting' || strumPhase === 'recording';
  const [stringStatuses, setStringStatuses] = useState<StringTuningStatus[]>(() =>
    initChordStatuses(selectedVoicing, tuning, a4)
  );
  const [lastMatchedIndex, setLastMatchedIndex] = useState<number | null>(null);

  /**
   * До этого момента оценки после сброса игнорируются (D-4).
   *
   * AnalyserNode отдаёт валидные оценки ещё ~100–250 мс после того, как звук
   * стих: его окно анализа промывается новыми сэмплами не мгновенно. При живом
   * микрофоне такая «догоняющая» оценка перезаписывала только что сброшенный
   * статус, и он на мгновение мигал обратно в «В строе».
   */
  const ignoreEstimatesUntilRef = useRef(0);

  /**
   * В статус струны попадает только устоявшийся тон (#29). Раньше каждый кадр
   * перезаписывал статус: смесь нот на смене струны и дрейф затухания уводили
   * уже настроенную струну в «Высоко».
   */
  const steadyGateRef = useRef(new SteadyPitchGate());

  // Сброс статусов при смене аккорда или строя
  // Захват удара тоже прерывается: он записан под прежний аккорд. Раньше
  // интервал захвата убивался, а флаг оставался, и кнопка зависала (#4).
  useEffect(() => {
    setStringStatuses(initChordStatuses(selectedVoicing, tuning, a4));
    setLastMatchedIndex(null);
    steadyGateRef.current.reset();
    setStrumPhase('idle');
    setCaptureProgress(0);
  }, [selectedVoicing, tuning, a4]);

  useEffect(() => {
    const gate = steadyGateRef.current;
    gate.reset();
    const unsubscribe = sharedAudioEngine.subscribe((estimate: PitchEstimate) => {
      if (analysisMode !== 'arpeggio') return;
      const now = performance.now();
      if (now < ignoreEstimatesUntilRef.current) return;
      // Пропущенные кадры (тишина, низкая чёткость) рвут удержание сами:
      // после паузы дольше MAX_FRAME_GAP_MS ворота начинают отсчёт заново.
      if (estimate.isSilent || estimate.frequency <= 0 || estimate.clarity < 0.50) return;
      const steadyFrequency = gate.push(estimate.frequency, now);
      if (steadyFrequency === null) return;

      setStringStatuses(prev => {
        const res = evaluateArpeggioNote(steadyFrequency, selectedVoicing, tuning, prev, inTuneThreshold, a4);
        if (res.matchedIndex !== null) {
          setLastMatchedIndex(res.matchedIndex);
        }
        return res.updatedStatuses;
      });
    });

    return unsubscribe;
  }, [analysisMode, selectedVoicing, tuning, inTuneThreshold, a4]);

  // Захват удара: подписка живёт, пока идёт захват. Таймер нужен, чтобы
  // сдаться по таймауту, даже когда кадры не приходят (вкладка в фоне).
  useEffect(() => {
    if (!isCapturingStrum) return;
    const capture = new StrumCapture(performance.now(), sharedAudioEngine.getCaptureWindowMs());
    let finished = false;

    const advance = (rmsDb: number | null) => {
      if (finished) return;
      const state = capture.update(rmsDb, performance.now());
      setCaptureProgress(Math.round(state.progress * 100));
      if (state.phase === 'recording') {
        setStrumPhase('recording');
      } else if (state.phase === 'timeout') {
        finished = true;
        setStrumPhase('timeout');
      } else if (state.phase === 'ready') {
        finished = true;
        const captured = sharedAudioEngine.getRecentSamples();
        if (captured) {
          setStringStatuses(
            analyzeChordStrum(captured.samples, captured.sampleRate, selectedVoicing, tuning, inTuneThreshold, a4)
          );
        }
        setStrumPhase('idle');
      }
    };

    const unsubscribe = sharedAudioEngine.subscribe((estimate: PitchEstimate) => advance(estimate.rms));
    const timer = window.setInterval(() => advance(null), 250);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
    };
    // Фаза waiting → recording не перезапускает захват: зависимость — только
    // сам факт захвата, а смена аккорда или строя его отменяет выше.
  }, [isCapturingStrum, selectedVoicing, tuning, inTuneThreshold, a4]);

  // Микрофон выключили (здесь, из шапки) или поток оборвался посреди захвата
  // удара: дожидаться незачем — сигнала всё равно не будет.
  useEffect(() => {
    if (mic.isOn) return;
    setStrumPhase(phase => (phase === 'waiting' || phase === 'recording' ? 'idle' : phase));
  }, [mic.isOn]);

  /**
   * Захват удара для полифонического анализа (Режим B). Запись начинается не по
   * кнопке, а по самому удару, и длится, пока окно не заполнится звуком (#4).
   */
  const handleStartStrumCapture = async () => {
    if (!sharedAudioEngine.isRunning()) {
      // Раньше отказ в доступе уходил только в console.error, и кнопка просто
      // «не нажималась». Теперь причину показывает MicErrorBanner.
      await mic.start();
      if (!sharedAudioEngine.isRunning()) return;
    }
    setCaptureProgress(0);
    setStrumPhase('waiting');
  };

  const resetAnalysis = () => {
    // Запас над наблюдавшимися 250 мс: за это время окно анализатора полностью
    // промывается, а для нового щипка пауза всё равно неощутима.
    ignoreEstimatesUntilRef.current = performance.now() + RESET_SETTLE_MS;
    steadyGateRef.current.reset();
    setStringStatuses(initChordStatuses(selectedVoicing, tuning, a4));
    setLastMatchedIndex(null);
    setCaptureProgress(0);
    setStrumPhase('idle');
  };

  const { complete: isChordComplete, unmeasured: unmeasuredCount } = chordProgress(stringStatuses);
  // Озвучка для скринридера (#11): итог аккорда, иначе — последняя услышанная
  // струна в переборе или разбор удара.
  const announcementText = (() => {
    if (isChordComplete) return `Аккорд ${selectedVoicing.name} звучит безупречно`;
    if (analysisMode === 'strum') {
      if (strumPhase === 'waiting') return 'Жду удар по струнам';
      if (strumPhase === 'recording') return 'Слушаю удар';
      if (strumPhase === 'timeout') return 'Удар не услышан';
      const analyzed = stringStatuses.some(s => s.status !== 'pending' && s.status !== 'muted');
      return analyzed ? strumSummaryAnnouncement(stringStatuses, tuning.strings.map(s => s.stringNumber)) : '';
    }
    if (lastMatchedIndex === null) return '';
    const status = stringStatuses[lastMatchedIndex];
    const spoken = status ? chordStringStatusSpoken(status) : '';
    const stringNumber = tuning.strings[lastMatchedIndex]?.stringNumber;
    return spoken && stringNumber ? `${stringNumber}-я струна: ${spoken}` : '';
  })();
  const announcement = useThrottledAnnouncement(announcementText, CHORD_ANNOUNCE_INTERVAL_MS);

  const hasOctavePairs = useMemo(
    () => octavePartners(selectedVoicing, tuning).size > 0,
    [selectedVoicing, tuning]
  );

  return (
    <div style={{ width: '100%', maxWidth: '780px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--s6)' }}>
      {/* Заголовок */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <span className="eyebrow">Проверка аккорда</span>
          <h2 style={{ fontSize: '20px', margin: 0 }}>Анализ строя в аккорде</h2>
        </div>

        {/* Переключатель режимов: Арпеджио / Один удар */}
        <SegmentedControl
          label="Режим анализа"
          value={analysisMode}
          onChange={(mode) => {
            setAnalysisMode(mode);
            resetAnalysis();
          }}
          options={[
            { value: 'arpeggio', label: 'Режим A: Перебор', testId: 'cc-mode-arpeggio' },
            { value: 'strum', label: 'Режим B: Удар (Спектр)', testId: 'cc-mode-strum' }
          ]}
        />
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
          <Play size={18} />{' '}
          {strumPhase === 'waiting'
            ? 'Жду удар по струнам…'
            : strumPhase === 'recording'
              ? `Слушаю струны (${captureProgress}%)...`
              : 'Ударьте по всем струнам'}
        </button>
      )}

      <MicErrorBanner mic={mic} />

      <LiveRegion text={announcement} testId="cc-announcement" />

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
              aria-pressed={selectedVoicing.id === v.id}
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
        {analysisMode === 'strum' && (
          <span data-testid="cc-strum-hint" style={{ fontSize: '12px', color: 'var(--ink-300)' }}>
            Струну, которая звучит октавой к другой струне аккорда, в ударе отдельно не измерить: все её
            обертоны совпадают с чужими. Такие струны проверьте в тюнере или перебором.
          </span>
        )}
        {hasOctavePairs && analysisMode === 'arpeggio' && (
          <span data-testid="cc-octave-hint" style={{ fontSize: '12px', color: 'var(--ink-300)' }}>
            Струны октавной пары (E2/E3, A2/A3, D3/D4, G3/G4) звучат вместе, и в переборе слышна одна из них.
            Вторую проверьте в тюнере, придержав соседнюю.
          </span>
        )}
      </div>

      {/* Индикатор захвата удара (Режим B) */}
      {strumPhase === 'timeout' && (
        <div className="banner warn" data-testid="cc-strum-timeout">
          <div>
            <b>Удар не услышан.</b>
            <span> Нажмите кнопку и в течение {STRUM_WAIT_MS / 1000} секунд ударьте по всем струнам.</span>
          </div>
        </div>
      )}
      {strumPhase === 'waiting' && (
        <div className="panel" data-testid="cc-strum-waiting" style={{ padding: 'var(--s4)', textAlign: 'center', fontWeight: 700, color: 'var(--brand)', fontSize: '15px' }}>
          Ударьте по всем струнам — запись начнётся сама
        </div>
      )}
      {strumPhase === 'recording' && (
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
              {unmeasuredCount > 0 && (
                <span data-testid="cc-unmeasured-note">
                  {' '}Струны, звучащие октавой к другим ({unmeasuredCount}), отдельно не измерялись — проверьте их в тюнере.
                </span>
              )}
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

            const badgeText = chordStringStatusText(status, isMuted);
            const badgeColor = isMuted
              ? 'var(--ink-700)'
              : status?.status === 'in-tune'
                ? 'var(--sig-in)'
                : status?.status === 'low' || status?.status === 'high'
                  ? 'var(--sig-off)'
                  : 'var(--ink-300)';

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
