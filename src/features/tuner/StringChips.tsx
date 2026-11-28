import React from 'react';
import type { StringSpec, Tuning } from '../../domain/tunings';
import type { NotationSystem } from '../../domain/notes';
import { formatNoteName, midiToFrequency } from '../../domain/notes';
import { Volume2 } from 'lucide-react';
import './tuner.css';

/** Состояние звучащей струны: настроена, вне допуска или в допуске, но ещё не удержана. */
export type SoundingState = 'done' | 'off' | 'active';

interface StringChipsProps {
  tuning: Tuning;
  notation: NotationSystem;
  a4: number;
  lockedStringIndex: number | null;
  tunedStrings: ReadonlySet<number>;
  /** Номер звучащей сейчас струны, null — тишина. */
  soundingStringNumber: number | null;
  soundingState: SoundingState | null;
  onChipClick: (index: number) => void;
  onPlayReference: (str: StringSpec) => void;
}

/**
 * Чипы струн тюнера (#14). Отдельный компонент под React.memo: пропсы
 * меняются, только когда меняется состояние какой-то струны, а не на каждом
 * кадре анализа, как прежде у всего экрана.
 */
export const StringChips = React.memo(function StringChips({
  tuning,
  notation,
  a4,
  lockedStringIndex,
  tunedStrings,
  soundingStringNumber,
  soundingState,
  onChipClick,
  onPlayReference
}: StringChipsProps) {
  return (
    <div
      className="tun-chips"
      style={{ '--tun-chip-count': String(tuning.strings.length) } as React.CSSProperties}
    >
      {tuning.strings.map((str, idx) => {
        const isSelected = lockedStringIndex === idx;
        const isSounding = soundingStringNumber === str.stringNumber && soundingState !== null;
        const strNoteName = formatNoteName(str.open.name, notation);
        const strFreq = midiToFrequency(str.open.midi, a4).toFixed(1);

        let state = 'idle';
        if (isSelected) state = 'active';
        else if (isSounding) state = soundingState;
        else if (tunedStrings.has(idx)) state = 'done';

        const stateText = state === 'done' ? ', настроена' : state === 'off' ? ', не в строе' : '';

        return (
          // Кнопка эталона — соседка чипа, а не его потомок (#11): вложенная в
          // <button> интерактивность недостижима с клавиатуры и не видна
          // скринридеру.
          <div key={str.stringNumber} className="tun-chip-cell">
            <button
              className="schip"
              data-state={state}
              data-testid={`string-chip-${str.stringNumber}`}
              aria-pressed={isSelected}
              onClick={() => onChipClick(idx)}
              title={`${str.stringNumber}-я струна: ${strNoteName}${str.open.octave} (${strFreq} Гц) · Нажмите для выбора и воспроизведения`}
            >
              {/* Имя кнопки — из видимой ноты и скрытых пояснений: голосовое
                  управление находит кнопку по тому, что написано на ней. */}
              <span className="sr-only">{str.stringNumber}-я струна, </span>
              <span>{strNoteName}{str.open.octave}</span>
              <small className="mono" aria-hidden="true">{str.stringNumber}я</small>
              <span className="sr-only">, {strFreq} Гц{stateText}</span>
            </button>

            {/* Кнопка воспроизведения эталона на слух: зона нажатия 24×24,
                видимый кружок меньше — чтобы не закрывать ноту на узком чипе. */}
            <button
              type="button"
              className="schip-ref"
              data-testid={`string-ref-${str.stringNumber}`}
              onClick={() => onPlayReference(str)}
              aria-label={`Эталон ${str.stringNumber}-й струны, ${strNoteName}${str.open.octave}`}
              title="Воспроизвести эталонный звук"
            >
              <span className="schip-ref-dot">
                <Volume2 size={10} aria-hidden="true" />
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
});
