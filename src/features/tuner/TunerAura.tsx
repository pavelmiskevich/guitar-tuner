import React from 'react';
import './tuner.css';

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

  // Цвет и яркость свечения — по тону (см. tuner.css); без сигнала — тусклый индиго.
  let className = 'tun-aura';
  if (isInTune) className += ' tun-aura--in';
  else if (isNear) className += ' tun-aura--near';
  else if (isOff) className += ' tun-aura--off';

  return <div className={className} />;
};
