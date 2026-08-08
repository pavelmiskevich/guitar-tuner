import React from 'react';

interface CentsScaleProps {
  cents: number;          // -50..+50
  inTuneThreshold?: number; // по умолчанию 5 центов
  isActive?: boolean;
}

/**
 * Нелинейное отображение центов:
 * Центральная зона (±10 центов) занимает 50% общей ширины шкалы для максимальной визуальной точности
 */
function centsToPercent(cents: number): number {
  const clamped = Math.max(-50, Math.min(50, cents));
  let norm = 0;

  if (Math.abs(clamped) <= 10) {
    // В диапазоне [-10, +10] отображаем на [25%, 75%]
    norm = 50 + (clamped / 10) * 25;
  } else if (clamped > 10) {
    // В диапазоне [10, 50] отображаем на [75%, 100%]
    norm = 75 + ((clamped - 10) / 40) * 25;
  } else {
    // В диапазоне [-50, -10] отображаем на [0%, 25%]
    norm = 25 - ((Math.abs(clamped) - 10) / 40) * 25;
  }

  return Math.max(0, Math.min(100, norm));
}

export const CentsScale: React.FC<CentsScaleProps> = ({
  cents,
  inTuneThreshold = 5,
  isActive = false
}) => {
  const absCents = Math.abs(cents);
  const isInTune = isActive && absCents <= inTuneThreshold;
  const isNear = isActive && !isInTune && absCents <= 15;
  const isOff = isActive && absCents > 15;

  const needlePos = isActive ? centsToPercent(cents) : 50;

  let needleColor = 'var(--sig-idle)';
  // Цвет текста отделён от цвета стрелки: у графики требование к контрасту 3:1,
  // у текста — 4.5:1, и приглушённый --sig-idle его не проходит.
  let readoutColor = 'var(--ink-300)';
  if (isActive) {
    if (isInTune) needleColor = 'var(--sig-in)';
    else if (isNear) needleColor = 'var(--sig-near)';
    else if (isOff) needleColor = 'var(--sig-off)';
    readoutColor = needleColor;
  }

  return (
    <div style={{ width: '100%', maxWidth: '420px', margin: '0 auto', userSelect: 'none' }}>
      {/* Метки шкалы */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '11px',
          fontFamily: 'var(--font-num)',
          color: 'var(--ink-300)',
          marginBottom: '6px',
          padding: '0 4px'
        }}
      >
        <span>−50¢</span>
        <span style={{ color: 'var(--ink-500)' }}>−20</span>
        <span style={{ color: 'var(--ink-500)' }}>−10</span>
        <span style={{ color: isInTune ? 'var(--sig-in)' : 'var(--ink-100)', fontWeight: 700 }}>0¢</span>
        <span style={{ color: 'var(--ink-500)' }}>+10</span>
        <span style={{ color: 'var(--ink-500)' }}>+20</span>
        <span>+50¢</span>
      </div>

      {/* Трек шкалы */}
      <div
        style={{
          position: 'relative',
          height: '24px',
          background: 'var(--ink-900)',
          border: '1px solid var(--ink-700)',
          borderRadius: 'var(--r-pill)',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center'
        }}
      >
        {/* Зеленая зона строя (±5 центов) */}
        <div
          style={{
            position: 'absolute',
            left: `${centsToPercent(-inTuneThreshold)}%`,
            width: `${centsToPercent(inTuneThreshold) - centsToPercent(-inTuneThreshold)}%`,
            height: '100%',
            background: 'rgba(59, 232, 176, 0.12)',
            borderLeft: '1px solid rgba(59, 232, 176, 0.3)',
            borderRight: '1px solid rgba(59, 232, 176, 0.3)'
          }}
        />

        {/* Центральная нулевая засечка */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: 0,
            bottom: 0,
            width: '2px',
            background: isInTune ? 'var(--sig-in)' : 'var(--ink-500)',
            transform: 'translateX(-50%)',
            zIndex: 1
          }}
        />

        {/* Засечки делений */}
        {[-20, -10, 10, 20].map(c => (
          <div
            key={c}
            style={{
              position: 'absolute',
              left: `${centsToPercent(c)}%`,
              top: '4px',
              bottom: '4px',
              width: '1px',
              background: 'var(--ink-700)',
              transform: 'translateX(-50%)'
            }}
          />
        ))}

        {/* Стрелка / Индикатор отклонения */}
        <div
          style={{
            position: 'absolute',
            left: `${needlePos}%`,
            top: '2px',
            bottom: '2px',
            width: '8px',
            background: needleColor,
            borderRadius: 'var(--r-pill)',
            transform: 'translateX(-50%)',
            boxShadow: isInTune ? 'var(--glow-in)' : isOff ? 'var(--glow-off)' : 'none',
            transition: 'left 80ms linear, background 150ms ease, box-shadow 150ms ease',
            zIndex: 3
          }}
        />
      </div>

      {/* Текстовая подсказка отклонения */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '8px',
          fontSize: '13px',
          fontWeight: 600
        }}
      >
        <span
          style={{
            color: cents < -inTuneThreshold && isActive ? 'var(--sig-off)' : 'var(--ink-500)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          {cents < -inTuneThreshold && isActive ? '▲ ПОДТЯНУТЬ' : 'Низко (♭)'}
        </span>

        <span
          className="mono"
          style={{
            fontSize: '15px',
            fontWeight: 700,
            color: readoutColor,
            padding: '2px 8px',
            background: 'var(--ink-800)',
            borderRadius: 'var(--r-sm)',
            border: '1px solid var(--ink-700)'
          }}
        >
          {isActive ? `${cents > 0 ? '+' : ''}${cents.toFixed(1)} ¢` : '0.0 ¢'}
        </span>

        <span
          style={{
            color: cents > inTuneThreshold && isActive ? 'var(--sig-off)' : 'var(--ink-500)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          {cents > inTuneThreshold && isActive ? 'ОСЛАБИТЬ ▼' : 'Высоко (♯)'}
        </span>
      </div>
    </div>
  );
};
