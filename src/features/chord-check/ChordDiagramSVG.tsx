import React from 'react';
import type { Voicing } from '../../domain/chords';
import type { Tuning } from '../../domain/tunings';
import type { NotationSystem } from '../../domain/notes';
import { formatNoteName, midiToFrequency } from '../../domain/notes';
import { getFretNote } from '../../domain/fretboard';
import { playGuitarString } from '../../audio/synth';
import { Volume2 } from 'lucide-react';

interface ChordDiagramSVGProps {
  voicing: Voicing;
  tuning: Tuning;
  notation?: NotationSystem;
  a4?: number;
}

export const ChordDiagramSVG: React.FC<ChordDiagramSVGProps> = ({
  voicing,
  tuning,
  notation = 'english',
  a4 = 440
}) => {
  const numStrings = 6;
  const numFrets = 5;

  const frets = voicing.frets;
  const numericFrets = frets.filter((f): f is number => typeof f === 'number' && f > 0);
  const minFret = numericFrets.length > 0 ? Math.min(...numericFrets) : 1;
  const maxFret = numericFrets.length > 0 ? Math.max(...numericFrets) : 4;

  const baseFret = maxFret > 5 ? minFret : 1;
  const isNut = baseFret === 1;

  const width = 220;
  const height = 250;
  const padX = 40;
  const padTop = 60;
  const gridWidth = 140;
  const gridHeight = 150;
  const stringSpacing = gridWidth / (numStrings - 1);
  const fretSpacing = gridHeight / numFrets;

  // Воспроизведение аккорда красивым перебором (арпеджио)
  const handlePlayChord = () => {
    let delay = 0;
    frets.forEach((fret, strIdx) => {
      if (fret !== 'x') {
        const note = getFretNote(strIdx, fret, tuning);
        const freq = midiToFrequency(note.midi, a4);
        setTimeout(() => {
          playGuitarString(freq, 2.5);
        }, delay);
        delay += 90;
      }
    });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: 'var(--ink-900)',
        border: '1px solid var(--ink-700)',
        borderRadius: 'var(--r-md)',
        padding: '12px 16px',
        position: 'relative'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '4px' }}>
        <span style={{ fontWeight: 800, fontSize: '16px', color: 'var(--ink-050)' }}>
          {voicing.name}
        </span>
        <button
          className="btn btn-ghost btn-sm"
          onClick={handlePlayChord}
          title="Слушать звучание аккорда"
          style={{ padding: '4px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <Volume2 size={13} color="var(--brand)" /> Слушать
        </button>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', maxWidth: '200px', height: 'auto', display: 'block' }}>
        <defs>
          <linearGradient id="diagramDot" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8A76FF" />
            <stop offset="100%" stopColor="#5A3EFA" />
          </linearGradient>
        </defs>

        {/* Смещение базы лада (если аккорд берется выше 5-го лада) */}
        {!isNut && (
          <text
            x={padX - 10}
            y={padTop + fretSpacing / 2 + 5}
            textAnchor="end"
            fill="var(--brand)"
            fontSize="12"
            fontWeight="800"
            fontFamily="var(--font-num)"
          >
            {baseFret}fr
          </text>
        )}

        {/* Верхний порожек или линия лада */}
        {isNut ? (
          <rect
            x={padX - 2}
            y={padTop - 4}
            width={gridWidth + 4}
            height="6"
            fill="#EDE8D0"
            rx="2"
          />
        ) : (
          <line
            x1={padX}
            y1={padTop}
            x2={padX + gridWidth}
            y2={padTop}
            stroke="var(--ink-500)"
            strokeWidth="2"
          />
        )}

        {/* Горизонтальные ладовые линии */}
        {Array.from({ length: numFrets + 1 }).map((_, fIdx) => {
          if (fIdx === 0 && isNut) return null;
          const y = padTop + fIdx * fretSpacing;
          return (
            <line
              key={`fret-${fIdx}`}
              x1={padX}
              y1={y}
              x2={padX + gridWidth}
              y2={y}
              stroke="var(--ink-600)"
              strokeWidth="1.5"
            />
          );
        })}

        {/* Вертикальные струны (6-я слева, 1-я справа) */}
        {Array.from({ length: numStrings }).map((_, sIdx) => {
          const x = padX + sIdx * stringSpacing;
          const strokeW = Math.max(1.2, 2.6 - sIdx * 0.3);
          return (
            <line
              key={`str-${sIdx}`}
              x1={x}
              y1={padTop}
              x2={x}
              y2={padTop + gridHeight}
              stroke="var(--ink-400)"
              strokeWidth={strokeW}
            />
          );
        })}

        {/* Индикаторы открытых (O) и глушеных (X) струн сверху */}
        {frets.map((fret, sIdx) => {
          const x = padX + sIdx * stringSpacing;
          const y = padTop - 14;

          if (fret === 'x') {
            return (
              <text
                key={`top-${sIdx}`}
                x={x}
                y={y}
                textAnchor="middle"
                fill="var(--sig-off)"
                fontSize="13"
                fontWeight="800"
                fontFamily="var(--font-ui)"
              >
                ✕
              </text>
            );
          }

          if (fret === 0) {
            return (
              <circle
                key={`top-${sIdx}`}
                cx={x}
                cy={y - 4}
                r="4.5"
                fill="none"
                stroke="var(--sig-in)"
                strokeWidth="1.8"
              />
            );
          }

          return null;
        })}

        {/* Зажатые точки пальцев */}
        {frets.map((fret, sIdx) => {
          if (typeof fret !== 'number' || fret <= 0) return null;

          const relFret = fret - baseFret + 1;
          if (relFret < 1 || relFret > numFrets) return null;

          const x = padX + sIdx * stringSpacing;
          const y = padTop + (relFret - 0.5) * fretSpacing;

          const note = getFretNote(sIdx, fret, tuning);
          const noteName = formatNoteName(note.name, notation);

          return (
            <g key={`dot-${sIdx}-${fret}`}>
              <circle
                cx={x}
                cy={y}
                r="11"
                fill="url(#diagramDot)"
                stroke="#FFFFFF"
                strokeWidth="1.5"
              />
              <text
                x={x}
                y={y + 3.5}
                textAnchor="middle"
                fill="#FFFFFF"
                fontSize="9"
                fontFamily="var(--font-ui)"
                fontWeight="800"
              >
                {noteName}
              </text>
            </g>
          );
        })}

        {/* Номера струн снизу (6 ... 1) */}
        {Array.from({ length: numStrings }).map((_, sIdx) => {
          const x = padX + sIdx * stringSpacing;
          const strNum = 6 - sIdx;
          return (
            <text
              key={`bottom-${sIdx}`}
              x={x}
              y={padTop + gridHeight + 16}
              textAnchor="middle"
              fill="var(--ink-500)"
              fontSize="10"
              fontFamily="var(--font-num)"
              fontWeight="600"
            >
              {strNum}
            </text>
          );
        })}
      </svg>
    </div>
  );
};
