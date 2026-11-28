import React from 'react';
import './tuner.css';

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
  const isLow = cents < -inTuneThreshold && isActive;
  const isHigh = cents > inTuneThreshold && isActive;

  // Тон шкалы задаёт цвет стрелки и числа (см. tuner.css). Цвет числа без
  // сигнала отделён от цвета стрелки: у графики требование к контрасту 3:1,
  // у текста — 4.5:1, и приглушённый --sig-idle его не проходит.
  let rootClass = 'tun-cents';
  if (isActive) {
    rootClass += ' tun-cents--active';
    if (isInTune) rootClass += ' tun-cents--in';
    else if (isNear) rootClass += ' tun-cents--near';
    else if (isOff) rootClass += ' tun-cents--off';
  }

  const zoneLeft = centsToPercent(-inTuneThreshold);
  const zoneWidth = centsToPercent(inTuneThreshold) - zoneLeft;

  return (
    <div className={rootClass}>
      {/* Метки шкалы */}
      <div className="tun-cents-labels">
        <span>−50¢</span>
        <span>−20</span>
        <span>−10</span>
        <span className="tun-cents-zero-label">0¢</span>
        <span>+10</span>
        <span>+20</span>
        <span>+50¢</span>
      </div>

      {/* Трек шкалы */}
      <div className="tun-cents-track">
        {/* Зеленая зона строя (±5 центов) */}
        <div
          className="tun-cents-zone"
          style={{ '--tun-zone-left': `${zoneLeft}%`, '--tun-zone-width': `${zoneWidth}%` } as React.CSSProperties}
        />

        {/* Центральная нулевая засечка */}
        <div className="tun-cents-zero-mark" />

        {/* Засечки делений */}
        {[-20, -10, 10, 20].map(c => (
          <div
            key={c}
            className="tun-cents-tick"
            style={{ '--tun-tick-left': `${centsToPercent(c)}%` } as React.CSSProperties}
          />
        ))}

        {/* Стрелка / Индикатор отклонения */}
        <div
          className="tun-cents-needle"
          style={{ '--tun-needle-left': `${needlePos}%` } as React.CSSProperties}
        />
      </div>

      {/* Текстовая подсказка отклонения */}
      <div className="tun-cents-hints">
        <span className={isLow ? 'tun-cents-hint tun-cents-hint--alert' : 'tun-cents-hint'}>
          {isLow ? '▲ ПОДТЯНУТЬ' : 'Низко (♭)'}
        </span>

        <span className="mono tun-cents-readout">
          {isActive ? `${cents > 0 ? '+' : ''}${cents.toFixed(1)} ¢` : '0.0 ¢'}
        </span>

        <span className={isHigh ? 'tun-cents-hint tun-cents-hint--alert' : 'tun-cents-hint'}>
          {isHigh ? 'ОСЛАБИТЬ ▼' : 'Высоко (♯)'}
        </span>
      </div>
    </div>
  );
};
