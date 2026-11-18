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

  let auraColor = 'color-mix(in srgb, var(--sig-idle) 15%, transparent)'; // idle indigo
  let intensity = 0.4;

  if (isActive) {
    if (isInTune) {
      auraColor = 'color-mix(in srgb, var(--sig-in) 45%, transparent)'; // emerald
      intensity = 0.8;
    } else if (isNear) {
      auraColor = 'color-mix(in srgb, var(--sig-near) 35%, transparent)'; // amber
      intensity = 0.6;
    } else if (isOff) {
      auraColor = 'color-mix(in srgb, var(--sig-off) 40%, transparent)'; // magenta
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
        background: `radial-gradient(circle, ${auraColor} 0%, transparent 70%)`,
        filter: 'blur(30px)',
        pointerEvents: 'none',
        opacity: intensity,
        transition: 'background 250ms ease, opacity 250ms ease',
        zIndex: 0
      }}
    />
  );
};
