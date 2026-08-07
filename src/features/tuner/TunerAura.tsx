import React from 'react';

interface TunerAuraProps {
  cents: number;
  isActive: boolean;
  inTuneThreshold?: number;
}

export const TunerAura: React.FC<TunerAuraProps> = ({
  cents,
  isActive,
  inTuneThreshold = 5
}) => {
  const absCents = Math.abs(cents);
  const isInTune = isActive && absCents <= inTuneThreshold;
  const isNear = isActive && !isInTune && absCents <= 15;
  const isOff = isActive && absCents > 15;

  let auraColor = 'rgba(78, 72, 148, 0.15)'; // idle indigo
  let intensity = 0.4;

  if (isActive) {
    if (isInTune) {
      auraColor = 'rgba(59, 232, 176, 0.45)'; // emerald
      intensity = 0.8;
    } else if (isNear) {
      auraColor = 'rgba(255, 200, 87, 0.35)'; // amber
      intensity = 0.6;
    } else if (isOff) {
      auraColor = 'rgba(255, 77, 141, 0.40)'; // magenta
      intensity = 0.7;
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: '320px',
        height: '320px',
        transform: 'translate(-50%, -50%)',
        borderRadius: '50%',
        background: `radial-gradient(circle, ${auraColor} 0%, rgba(11, 10, 28, 0) 70%)`,
        filter: 'blur(30px)',
        pointerEvents: 'none',
        opacity: intensity,
        transition: 'background 250ms ease, opacity 250ms ease',
        zIndex: 0
      }}
    />
  );
};
