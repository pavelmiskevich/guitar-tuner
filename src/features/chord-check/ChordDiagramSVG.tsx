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

  const width = 230;
  const height = 270;
  const padX = 42;
  const padTop = 56;
  const gridWidth = 140;
  const gridHeight = 160;
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
        padding: '14px 16px',
        position: 'relative'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '6px' }}>
        <div>
          <span style={{ fontWeight: 800, fontSize: '17px', color: 'var(--ink-050)' }}>
            {voicing.name}
          </span>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={handlePlayChord}
          title="Слушать звучание аккорда"
          style={{ padding: '4px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <Volume2 size={13} color="var(--brand)" /> Слушать
        </button>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', maxWidth: '210px', height: 'auto', display: 'block' }}>
        <defs>
          {/* Яркий серебристый градиент для ладов */}
          <linearGradient id="chordFretWire" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#8A87B0" />
            <stop offset="50%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#6C6894" />
          </linearGradient>

          <linearGradient id="diagramDot" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8A76FF" />
            <stop offset="100%" stopColor="#5A3EFA" />
          </linearGradient>
        </defs>

        {/* Фон накладки грифа под аккордом */}
        <rect
          x={padX}
          y={padTop}
          width={gridWidth}
          height={gridHeight}
          fill="#16132E"
          stroke="var(--ink-700)"
          strokeWidth="1"
          rx="2"
        />

        {/* Смещение базы лада (если аккорд берется выше 5-го лада) */}
        {!isNut && (
          <text
            x={padX - 10}
            y={padTop + fretSpacing / 2 + 5}
            textAnchor="end"
            fill="var(--brand)"
            fontSize="12"
            fontWeight="900"
            fontFamily="var(--font-num)"
          >
            {baseFret}fr
          </text>
        )}

        {/* Верхний порожек или верхний лад */}
        {isNut ? (
          <g>
            <rect
              x={padX - 2}
              y={padTop - 6}
              width={gridWidth + 4}
              height="8"
              fill="#F5EFCF"
              stroke="#A39A77"
              strokeWidth="1.5"
              rx="2"
            />
          </g>
        ) : (
          <g>
            <line
              x1={padX}
              y1={padTop}
              x2={padX + gridWidth}
              y2={padTop}
              stroke="url(#chordFretWire)"
              strokeWidth="3.5"
            />
          </g>
        )}

        {/* Горизонтальные ладовые линии (четкие, контрастные и объемные) */}
        {Array.from({ length: numFrets + 1 }).map((_, fIdx) => {
          if (fIdx === 0 && isNut) return null;
          const y = padTop + fIdx * fretSpacing;
          return (
            <g key={`fret-${fIdx}`}>
              {/* Тень снизу от лада */}
              <line
                x1={padX}
                y1={y + 1}
                x2={padX + gridWidth}
                y2={y + 1}
                stroke="rgba(0,0,0,0.6)"
                strokeWidth="2"
              />
              {/* Металлическая линия ладового порожка */}
              <line
                x1={padX}
                y1={y}
                x2={padX + gridWidth}
                y2={y}
                stroke="url(#chordFretWire)"
                strokeWidth="3"
                strokeLinecap="round"
              />
              {/* Номер лада справа от сетки */}
              {fIdx > 0 && (
                <text
                  x={padX + gridWidth + 10}
                  y={y - fretSpacing / 2 + 4}
                  fill="var(--ink-400)"
                  fontSize="10"
                  fontFamily="var(--font-num)"
                  fontWeight="700"
                  textAnchor="middle"
                >
                  {baseFret + fIdx - 1}
                </text>
              )}
            </g>
          );
        })}

        {/* Вертикальные струны (6-я слева, 1-я справа) */}
        {Array.from({ length: numStrings }).map((_, sIdx) => {
          const x = padX + sIdx * stringSpacing;
          const strokeW = Math.max(1.4, 3.2 - sIdx * 0.35);
          return (
            <line
              key={`str-${sIdx}`}
              x1={x}
              y1={padTop}
              x2={x}
              y2={padTop + gridHeight}
              stroke={sIdx < 3 ? '#C4B89D' : '#DDDCEB'}
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
                fontSize="14"
                fontWeight="900"
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
                r="5"
                fill="none"
                stroke="var(--sig-in)"
                strokeWidth="2.2"
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
                r="12"
                fill="url(#diagramDot)"
                stroke="#FFFFFF"
                strokeWidth="2"
              />
              <text
                x={x}
                y={y + 4}
                textAnchor="middle"
                fill="#FFFFFF"
                fontSize="9.5"
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
              y={padTop + gridHeight + 18}
              textAnchor="middle"
              fill="var(--ink-400)"
              fontSize="11"
              fontFamily="var(--font-num)"
              fontWeight="700"
            >
              {strNum}
            </text>
          );
        })}
      </svg>
    </div>
  );
};
