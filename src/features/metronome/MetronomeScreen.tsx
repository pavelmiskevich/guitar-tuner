import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Plus, Minus, HeartHandshake, Disc3 } from 'lucide-react';
import {
  DRUM_PATTERNS,
  playSynthesizedKick,
  playSynthesizedSnare,
  playSynthesizedHiHat
} from '../../audio/drumSynth';
import type { DrumPattern } from '../../audio/drumSynth';

interface MetronomeScreenProps {
  // Props
}

export const MetronomeScreen: React.FC<MetronomeScreenProps> = () => {
  const [activeTab, setActiveTab] = useState<'metronome' | 'drums'>('metronome');
  const [bpm, setBpm] = useState<number>(120);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [beatsPerBar, setBeatsPerBar] = useState<number>(4);
  const [currentBeat, setCurrentBeat] = useState<number>(0);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [selectedPattern, setSelectedPattern] = useState<DrumPattern>(DRUM_PATTERNS[0]);
  const [tapTimes, setTapTimes] = useState<number[]>([]);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const timerIdRef = useRef<number | null>(null);
  const nextNoteTimeRef = useRef<number>(0);
  const currentStepRef = useRef<number>(0);

  // Web Audio клик метронома
  const playClick = (time: number, isAccent: boolean) => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.frequency.setValueAtTime(isAccent ? 1200 : 800, time);
    osc.type = isAccent ? 'triangle' : 'sine';

    gain.gain.setValueAtTime(0.7, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(time);
    osc.stop(time + 0.06);
  };

  // Планировщик звука для метронома и драм-машины
  const scheduler = () => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const scheduleAheadTime = 0.1; // Планируем на 100 мс вперед

    while (nextNoteTimeRef.current < ctx.currentTime + scheduleAheadTime) {
      if (activeTab === 'metronome') {
        const isAccent = currentStepRef.current % beatsPerBar === 0;
        playClick(nextNoteTimeRef.current, isAccent);

        const beatForUi = currentStepRef.current % beatsPerBar;
        setTimeout(() => {
          setCurrentBeat(beatForUi);
        }, Math.max(0, (nextNoteTimeRef.current - ctx.currentTime) * 1000));

        const secondsPerBeat = 60.0 / bpm;
        nextNoteTimeRef.current += secondsPerBeat;
        currentStepRef.current = (currentStepRef.current + 1) % beatsPerBar;
      } else {
        // Драм-машина: 16-е доли (или 12-е для блюза)
        const stepIdx = currentStepRef.current % selectedPattern.stepsCount;
        const kickVal = selectedPattern.tracks.kick[stepIdx];
        const snareVal = selectedPattern.tracks.snare[stepIdx];
        const hihatVal = selectedPattern.tracks.hihat[stepIdx];

        if (kickVal && kickVal > 0) {
          playSynthesizedKick(ctx, nextNoteTimeRef.current, kickVal);
        }
        if (snareVal && snareVal > 0) {
          const isBossaCrossStick = selectedPattern.id === 'bossa';
          playSynthesizedSnare(ctx, nextNoteTimeRef.current, isBossaCrossStick, snareVal);
        }
        if (hihatVal && hihatVal > 0) {
          playSynthesizedHiHat(ctx, nextNoteTimeRef.current, hihatVal === 2, 0.7);
        }

        const stepForUi = stepIdx;
        setTimeout(() => {
          setCurrentStep(stepForUi);
        }, Math.max(0, (nextNoteTimeRef.current - ctx.currentTime) * 1000));

        // Длительность одного шага секвенсора
        const secondsPerStep = selectedPattern.stepsCount === 12
          ? (60.0 / bpm) / 3 // Триоли
          : (60.0 / bpm) / 4; // 16-е доли

        nextNoteTimeRef.current += secondsPerStep;
        currentStepRef.current = (currentStepRef.current + 1) % selectedPattern.stepsCount;
      }
    }
  };

  useEffect(() => {
    if (isPlaying) {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new AudioCtx();
      }
      audioCtxRef.current.resume();

      nextNoteTimeRef.current = audioCtxRef.current.currentTime + 0.05;
      currentStepRef.current = 0;

      const intervalId = window.setInterval(scheduler, 25);
      timerIdRef.current = intervalId;

      return () => {
        clearInterval(intervalId);
      };
    } else {
      if (timerIdRef.current) {
        clearInterval(timerIdRef.current);
        timerIdRef.current = null;
      }
      setCurrentBeat(0);
      setCurrentStep(0);
    }
  }, [isPlaying, bpm, beatsPerBar, activeTab, selectedPattern]);

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
      if (calculatedBpm >= 40 && calculatedBpm <= 260) {
        setBpm(calculatedBpm);
      }
    }
  };

  const changeBpm = (delta: number) => {
    setBpm(prev => Math.max(40, Math.min(260, prev + delta)));
  };

  return (
    <div style={{ width: '100%', maxWidth: '640px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--s6)' }}>
      {/* Заголовок и переключатель Метроном / Драм-ритмы */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <span className="eyebrow">Ритм и тренировка</span>
          <h2 style={{ fontSize: '20px', margin: 0 }}>{activeTab === 'metronome' ? 'Метроном' : 'Барабанные ритмы'}</h2>
        </div>

        {/* Табы режима */}
        <div style={{ display: 'flex', background: 'var(--ink-900)', border: '1px solid var(--ink-700)', borderRadius: 'var(--r-pill)', padding: '3px' }}>
          <button
            className="btn btn-sm"
            style={{
              background: activeTab === 'metronome' ? 'var(--brand)' : 'transparent',
              color: activeTab === 'metronome' ? '#fff' : 'var(--ink-300)',
              borderRadius: 'var(--r-pill)',
              padding: '6px 14px'
            }}
            onClick={() => {
              setIsPlaying(false);
              setActiveTab('metronome');
            }}
          >
            Метроном
          </button>
          <button
            className="btn btn-sm"
            style={{
              background: activeTab === 'drums' ? 'var(--brand)' : 'transparent',
              color: activeTab === 'drums' ? '#fff' : 'var(--ink-300)',
              borderRadius: 'var(--r-pill)',
              padding: '6px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
            onClick={() => {
              setIsPlaying(false);
              setActiveTab('drums');
            }}
          >
            <Disc3 size={14} /> Драм-машина
          </button>
        </div>
      </div>

      {/* Пресеты барабанных стилей (если выбран режим драм-машины) */}
      {activeTab === 'drums' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
          {DRUM_PATTERNS.map(pattern => {
            const isSelected = selectedPattern.id === pattern.id;
            return (
              <button
                key={pattern.id}
                onClick={() => {
                  setSelectedPattern(pattern);
                  setBpm(pattern.defaultBpm);
                }}
                style={{
                  background: isSelected ? 'var(--ink-800)' : 'var(--ink-900)',
                  border: `2px solid ${isSelected ? 'var(--brand)' : 'var(--ink-700)'}`,
                  borderRadius: 'var(--r-md)',
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 150ms ease'
                }}
              >
                <span style={{ fontWeight: 800, fontSize: '13px', color: isSelected ? 'var(--brand)' : 'var(--ink-050)' }}>
                  {pattern.name}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--ink-300)', marginTop: '2px' }}>
                  {pattern.genre}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Панель метронома / ритма */}
      <div
        className="panel"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--s6) var(--s4)',
          gap: 'var(--s6)',
          width: '100%',
          boxSizing: 'border-box'
        }}
      >
        {/* Индикатор долей */}
        {activeTab === 'metronome' ? (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {Array.from({ length: beatsPerBar }).map((_, i) => {
              const isActive = isPlaying && currentBeat === i;
              const isFirst = i === 0;
              return (
                <div
                  key={i}
                  style={{
                    width: isFirst ? '22px' : '16px',
                    height: isFirst ? '22px' : '16px',
                    borderRadius: '50%',
                    background: isActive
                      ? (isFirst ? 'var(--sig-in)' : 'var(--brand)')
                      : 'var(--ink-800)',
                    border: `2px solid ${isActive ? '#fff' : 'var(--ink-700)'}`,
                    boxShadow: isActive ? `0 0 16px ${isFirst ? 'var(--sig-in)' : 'var(--brand)'}` : 'none',
                    transition: 'all 60ms ease'
                  }}
                />
              );
            })}
          </div>
        ) : (
          /* 16-шаговая визуальная сетка барабанов */
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '3px', width: '100%' }}>
              {Array.from({ length: selectedPattern.stepsCount }).map((_, i) => {
                const isActive = isPlaying && currentStep === i;
                const isDownbeat = selectedPattern.stepsCount === 16 ? i % 4 === 0 : i % 3 === 0;

                return (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: '14px',
                      borderRadius: '2px',
                      background: isActive
                        ? 'var(--sig-in)'
                        : isDownbeat
                        ? 'var(--ink-600)'
                        : 'var(--ink-800)',
                      boxShadow: isActive ? '0 0 10px var(--sig-in)' : 'none',
                      transition: 'background 40ms linear'
                    }}
                  />
                );
              })}
            </div>
            <span style={{ fontSize: '12px', color: 'var(--ink-300)', textAlign: 'center' }}>
              {selectedPattern.description}
            </span>
          </div>
        )}

        {/* Крупный дисплей BPM */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span
            className="mono"
            style={{
              fontSize: '80px',
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: '-0.04em',
              color: isPlaying ? 'var(--brand)' : 'var(--ink-050)'
            }}
          >
            {bpm}
          </span>
          <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink-300)' }}>BPM</span>
        </div>

        {/* Управление темпом: -5, -1, slider, +1, +5 (адаптивная сетка, не вылезает на мобильных) */}
        <div
          style={{
            display: 'flex',
            gap: '6px',
            alignItems: 'center',
            width: '100%',
            maxWidth: '440px',
            justifyContent: 'center',
            boxSizing: 'border-box'
          }}
        >
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => changeBpm(-5)}
            style={{ fontWeight: 700, padding: '6px 8px', minWidth: '34px', flexShrink: 0 }}
            title="Уменьшить темп на 5 BPM"
          >
            -5
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => changeBpm(-1)}
            style={{ padding: '6px 8px', minWidth: '32px', flexShrink: 0 }}
            title="Уменьшить темп на 1 BPM"
          >
            <Minus size={15} />
          </button>

          {/* Ползунок темпа (адаптивный) */}
          <input
            type="range"
            min={40}
            max={260}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            style={{
              flex: 1,
              minWidth: '60px',
              maxWidth: '220px',
              accentColor: 'var(--brand)',
              cursor: 'pointer'
            }}
          />

          <button
            className="btn btn-ghost btn-sm"
            onClick={() => changeBpm(1)}
            style={{ padding: '6px 8px', minWidth: '32px', flexShrink: 0 }}
            title="Увеличить темп на 1 BPM"
          >
            <Plus size={15} />
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => changeBpm(5)}
            style={{ fontWeight: 700, padding: '6px 8px', minWidth: '34px', flexShrink: 0 }}
            title="Увеличить темп на 5 BPM"
          >
            +5
          </button>
        </div>

        {/* Выбор размера такта (для метронома) */}
        {activeTab === 'metronome' && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
            <span className="eyebrow" style={{ marginRight: '4px' }}>Размер:</span>
            {[2, 3, 4, 6].map(beats => (
              <button
                key={beats}
                className={`btn btn-sm ${beatsPerBar === beats ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setBeatsPerBar(beats)}
                style={{ fontWeight: 700, padding: '6px 12px' }}
              >
                {beats}/4
              </button>
            ))}
          </div>
        )}

        {/* Кнопка запуска / остановки */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'center', width: '100%', flexWrap: 'wrap' }}>
          <button
            className={`btn ${isPlaying ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => setIsPlaying(!isPlaying)}
            style={{ flex: 1, minWidth: '140px', maxWidth: '200px', padding: '14px 20px', fontSize: '17px', justifyContent: 'center' }}
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
            className="btn btn-ghost"
            onClick={handleTap}
            style={{ flex: 1, minWidth: '130px', maxWidth: '180px', padding: '14px 16px', fontSize: '14px', border: '1px solid var(--ink-700)', justifyContent: 'center' }}
            title="Нажимайте в такт музыке для определения BPM"
          >
            <HeartHandshake size={16} /> Tap Tempo
          </button>
        </div>
      </div>
    </div>
  );
};
