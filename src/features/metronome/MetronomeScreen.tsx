import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Plus, Minus, HeartHandshake } from 'lucide-react';

interface MetronomeScreenProps {
  // Common props if needed
}

export const MetronomeScreen: React.FC<MetronomeScreenProps> = () => {
  const [bpm, setBpm] = useState<number>(120);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [beatsPerBar, setBeatsPerBar] = useState<number>(4);
  const [currentBeat, setCurrentBeat] = useState<number>(0);
  const [tapTimes, setTapTimes] = useState<number[]>([]);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const timerIdRef = useRef<number | null>(null);
  const nextNoteTimeRef = useRef<number>(0);
  const currentBeatRef = useRef<number>(0);

  // Web Audio синтез метронома: высокий тон для 1-й доли, мягкий для остальных
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

  const scheduler = () => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const scheduleAheadTime = 0.1; // Планируем на 100 мс вперед

    while (nextNoteTimeRef.current < ctx.currentTime + scheduleAheadTime) {
      const isAccent = currentBeatRef.current === 0;
      playClick(nextNoteTimeRef.current, isAccent);

      // Синхронизация визуального состояния
      const beatForUi = currentBeatRef.current;
      setTimeout(() => {
        setCurrentBeat(beatForUi);
      }, Math.max(0, (nextNoteTimeRef.current - ctx.currentTime) * 1000));

      // Шаг к следующей доле
      const secondsPerBeat = 60.0 / bpm;
      nextNoteTimeRef.current += secondsPerBeat;
      currentBeatRef.current = (currentBeatRef.current + 1) % beatsPerBar;
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
      currentBeatRef.current = 0;

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
    }
  }, [isPlaying, bpm, beatsPerBar]);

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
      if (calculatedBpm >= 40 && calculatedBpm <= 280) {
        setBpm(calculatedBpm);
      }
    }
  };

  const changeBpm = (delta: number) => {
    setBpm(prev => Math.max(40, Math.min(280, prev + delta)));
  };

  return (
    <div style={{ width: '100%', maxWidth: '540px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--s6)' }}>
      {/* Заголовок */}
      <div>
        <span className="eyebrow">Ритм и тренировка</span>
        <h2 style={{ fontSize: '20px', margin: 0 }}>Метроном</h2>
      </div>

      {/* Панель метронома */}
      <div
        className="panel"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--s8) var(--s6)',
          gap: 'var(--s6)'
        }}
      >
        {/* Индикатор долей (светодиоды) */}
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

        {/* Крупный дисплей BPM */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span
            className="mono"
            style={{
              fontSize: '84px',
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

        {/* Управление темпом: -1, -5, +1, +5 */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => changeBpm(-5)} style={{ fontWeight: 700 }}>
            -5
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => changeBpm(-1)}>
            <Minus size={16} />
          </button>

          {/* Ползунок темпа */}
          <input
            type="range"
            min={40}
            max={260}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            style={{
              width: '180px',
              accentColor: 'var(--brand)',
              cursor: 'pointer'
            }}
          />

          <button className="btn btn-ghost btn-sm" onClick={() => changeBpm(1)}>
            <Plus size={16} />
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => changeBpm(5)} style={{ fontWeight: 700 }}>
            +5
          </button>
        </div>

        {/* Выбор размера такта */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
          <span className="eyebrow" style={{ marginRight: '4px' }}>Размер:</span>
          {[2, 3, 4, 6].map(beats => (
            <button
              key={beats}
              className={`btn btn-sm ${beatsPerBar === beats ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setBeatsPerBar(beats)}
              style={{ fontWeight: 700 }}
            >
              {beats}/4
            </button>
          ))}
        </div>

        {/* Кнопка запуска / остановки */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            className={`btn ${isPlaying ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => setIsPlaying(!isPlaying)}
            style={{ minWidth: '180px', padding: '14px 28px', fontSize: '18px' }}
          >
            {isPlaying ? (
              <>
                <Square size={20} /> Стоп
              </>
            ) : (
              <>
                <Play size={20} /> Старт
              </>
            )}
          </button>

          {/* Tap Tempo */}
          <button
            className="btn btn-ghost"
            onClick={handleTap}
            style={{ padding: '14px 20px', fontSize: '15px', border: '1px solid var(--ink-700)' }}
            title="Нажимайте в такт музыке для определения BPM"
          >
            <HeartHandshake size={18} /> Tap Tempo
          </button>
        </div>
      </div>
    </div>
  );
};
