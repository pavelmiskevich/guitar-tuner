import React from 'react';
import type { Tuning } from '../../domain/tunings';
import type { NotationSystem } from '../../domain/notes';
import { formatNoteName, midiToFrequency } from '../../domain/notes';
import { STANDARD_FRET_MARKERS, getFretRelativePositions, getFretNote } from '../../domain/fretboard';
import { playGuitarString } from '../../audio/synth';

export interface HighlightedNote {
  stringIndex: number; // 0 = 6-я струна
  fret: number;
  label?: string;
  isRoot?: boolean;
  color?: string;
}

interface FretboardSVGProps {
  tuning: Tuning;
  visibleFrets?: { from: number; to: number };
  capo?: number | null;
  leftHanded?: boolean;
  orientation?: 'horizontal' | 'vertical';
  notation?: NotationSystem;
  labelMode?: 'note' | 'degree' | 'fret' | 'none';
  highlightedNotes?: HighlightedNote[];
  activeSoundingNote?: { stringIndex: number; fret: number } | null;
  onFretClick?: (stringIndex: number, fret: number) => void;
  a4?: number;
}

export const FretboardSVG: React.FC<FretboardSVGProps> = ({
  tuning,
  visibleFrets = { from: 0, to: 15 },
  capo = null,
  leftHanded = false,
  orientation = 'horizontal',
  notation = 'english',
  labelMode = 'note',
  highlightedNotes = [],
  activeSoundingNote = null,
  onFretClick,
  a4 = 440
}) => {
  const fromFret = visibleFrets.from;
  const toFret = visibleFrets.to;
  const numFrets = toFret - fromFret;
  const numStrings = tuning.strings.length;

  const width = 840;
  const height = numStrings * 36 + 28;
  const nutWidth = fromFret === 0 ? 12 : 0;
  const playableWidth = width - nutWidth - 20;

  // Рассчитываем физически корректные координаты ладов
  const relativeFretPositions = getFretRelativePositions(fromFret, toFret);

  const getStringY = (strIndex: number) => {
    // 0 = 6-я струна (сверху в горизонтальном виде)
    const padding = 24;
    const spacing = (height - padding * 2) / (numStrings - 1);
    return padding + strIndex * spacing;
  };

  const getFretX = (fretNum: number) => {
    if (fretNum < fromFret) return 0;
    const relIdx = fretNum - fromFret;
    const relPos = relativeFretPositions[relIdx] || 0;
    let posX = nutWidth + relPos * playableWidth;
    if (leftHanded) {
      posX = width - posX;
    }
    return posX;
  };

  const getFretMidX = (fretNum: number) => {
    if (fretNum === 0) return nutWidth / 2;
    const currentX = getFretX(fretNum);
    const prevX = getFretX(fretNum - 1);
    return (currentX + prevX) / 2;
  };

  const handleCellClick = (strIdx: number, fretNum: number) => {
    const note = getFretNote(strIdx, fretNum, tuning, capo);
    const freq = midiToFrequency(note.midi, a4);
    playGuitarString(freq, 2.2);
    onFretClick?.(strIdx, fretNum);
  };

  return (
    <div style={{ width: '100%', overflowX: 'auto', padding: '8px 0' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{
          width: '100%',
          minWidth: orientation === 'horizontal' ? '680px' : '320px',
          height: 'auto',
          background: 'linear-gradient(180deg, #181534 0%, #100E26 100%)',
          borderRadius: 'var(--r-md)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          border: '1px solid var(--ink-700)',
          display: 'block'
        }}
      >
        <defs>
          <linearGradient id="fretWire" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#7C77B8" />
            <stop offset="50%" stopColor="#EDEBFF" />
            <stop offset="100%" stopColor="#4E4894" />
          </linearGradient>
          <linearGradient id="woundString" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#B3A890" />
            <stop offset="50%" stopColor="#F5EBD0" />
            <stop offset="100%" stopColor="#786E56" />
          </linearGradient>
          <linearGradient id="steelString" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#9E9EBA" />
            <stop offset="50%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#6C6990" />
          </linearGradient>
        </defs>

        {/* Маркеры ладов (точки инкрустации) */}
        {STANDARD_FRET_MARKERS.filter(m => m.fret >= fromFret && m.fret <= toFret).map((marker) => {
          const midX = getFretMidX(marker.fret);
          const midY = height / 2;

          if (marker.type === 'double') {
            return (
              <g key={`marker-${marker.fret}`} opacity="0.35">
                <circle cx={midX} cy={midY - 26} r="4.5" fill="#EDEBFF" />
                <circle cx={midX} cy={midY + 26} r="4.5" fill="#EDEBFF" />
              </g>
            );
          }

          return (
            <circle
              key={`marker-${marker.fret}`}
              cx={midX}
              cy={midY}
              r="4.5"
              fill="#EDEBFF"
              opacity="0.3"
            />
          );
        })}

        {/* Номера ладов снизу */}
        {Array.from({ length: numFrets + 1 }).map((_, i) => {
          const f = fromFret + i;
          if (f === 0) return null;
          const midX = getFretMidX(f);
          return (
            <text
              key={`fret-num-${f}`}
              x={midX}
              y={height - 4}
              textAnchor="middle"
              fill="var(--ink-500)"
              fontSize="10"
              fontFamily="var(--font-num)"
              fontWeight="600"
            >
              {f}
            </text>
          );
        })}

        {/* Ладовые порожки (металлические лады) */}
        {Array.from({ length: numFrets + 1 }).map((_, i) => {
          const f = fromFret + i;
          const posX = getFretX(f);
          if (f === 0 && fromFret === 0) return null;

          return (
            <line
              key={`fret-line-${f}`}
              x1={posX}
              y1={12}
              x2={posX}
              y2={height - 14}
              stroke="url(#fretWire)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          );
        })}

        {/* Верхний порожек (Nut) */}
        {fromFret === 0 && (
          <rect
            x={leftHanded ? width - nutWidth : 0}
            y={10}
            width={nutWidth}
            height={height - 20}
            fill="#E2DEC6"
            stroke="#8A8268"
            rx="2"
          />
        )}

        {/* Каподастр (если установлен) */}
        {capo !== null && capo >= fromFret && capo <= toFret && (
          <g>
            <rect
              x={getFretX(capo) - 5}
              y={8}
              width="10"
              height={height - 16}
              fill="var(--brand)"
              rx="4"
              opacity="0.85"
            />
            <text
              x={getFretX(capo)}
              y={6}
              fill="var(--ink-050)"
              fontSize="9"
              fontWeight="800"
              textAnchor="middle"
            >
              CAPO {capo}
            </text>
          </g>
        )}

        {/* Струны */}
        {tuning.strings.map((str, strIdx) => {
          const y = getStringY(strIdx);
          const isWound = strIdx < 3; // 6, 5, 4 струны в оплётке
          const stringThickness = Math.max(1.2, 4.0 - strIdx * 0.55);

          return (
            <g key={`string-${str.stringNumber}`}>
              <line
                x1={0}
                y1={y}
                x2={width}
                y2={y}
                stroke={isWound ? 'url(#woundString)' : 'url(#steelString)'}
                strokeWidth={stringThickness}
                opacity="0.9"
              />
            </g>
          );
        })}

        {/* Интерактивные кликабельные зоны и ноты */}
        {tuning.strings.map((_, strIdx) => {
          const y = getStringY(strIdx);

          return Array.from({ length: numFrets + 1 }).map((_, fIdx) => {
            const fretNum = fromFret + fIdx;
            const midX = getFretMidX(fretNum);
            const note = getFretNote(strIdx, fretNum, tuning, capo);

            const hl = highlightedNotes.find(
              h => h.stringIndex === strIdx && h.fret === fretNum
            );
            const isLiveSounding =
              activeSoundingNote?.stringIndex === strIdx && activeSoundingNote?.fret === fretNum;

            const isRoot = hl?.isRoot;
            const noteText =
              labelMode === 'degree' && hl?.label
                ? hl.label
                : formatNoteName(note.name, notation);

            return (
              <g
                key={`cell-${strIdx}-${fretNum}`}
                onClick={() => handleCellClick(strIdx, fretNum)}
                style={{ cursor: 'pointer' }}
              >
                {/* Невидимая область для легкого нажатия пальцем */}
                <rect
                  x={fretNum === 0 ? 0 : getFretX(fretNum - 1)}
                  y={y - 16}
                  width={fretNum === 0 ? nutWidth + 16 : Math.abs(getFretX(fretNum) - getFretX(fretNum - 1))}
                  height={32}
                  fill="transparent"
                />

                {/* Подсветка ноты (если активна или найдена в гамме/аккорде) */}
                {(hl || isLiveSounding) && (
                  <g>
                    {isLiveSounding && (
                      <circle
                        cx={midX}
                        cy={y}
                        r="16"
                        fill="var(--sig-in)"
                        opacity="0.45"
                        filter="blur(4px)"
                      />
                    )}

                    <circle
                      cx={midX}
                      cy={y}
                      r={isLiveSounding ? 12 : 10.5}
                      fill={isLiveSounding ? 'var(--sig-in)' : isRoot ? 'var(--brand)' : hl?.color || 'var(--ink-800)'}
                      stroke={isLiveSounding ? '#FFFFFF' : isRoot ? '#FFFFFF' : 'var(--ink-300)'}
                      strokeWidth="1.5"
                    />

                    <text
                      x={midX}
                      y={y + 3.5}
                      textAnchor="middle"
                      fill={isLiveSounding || isRoot ? '#FFFFFF' : 'var(--ink-050)'}
                      fontSize="10"
                      fontFamily="var(--font-ui)"
                      fontWeight="700"
                    >
                      {noteText}
                    </text>
                  </g>
                )}
              </g>
            );
          });
        })}
      </svg>
    </div>
  );
};
