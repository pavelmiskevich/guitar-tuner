import React, { useEffect, useRef } from 'react';
import { sharedAudioEngine } from '../../audio/audioEngine';
import { computeSpectrumBars, SPECTRUM_BARS } from '../../audio/spectrumBars';

interface SpectrumCanvasProps {
  /** Микрофон выключен — полосы приглушены. */
  dimmed: boolean;
}

const GAP_PX = 3;
const MIN_HEIGHT = 0.04;
/** Полоса громче этого уровня (из 100) — цветом «в строе»: заметная гармоника. */
const STRONG_LEVEL = 60;

/**
 * Мини-спектрограмма (#14). Рисуется на <canvas> прямо из подписки на
 * движок: прежние 32 div с анимацией высоты и setState на каждом кадре
 * перерисовывали весь экран тюнера ради одной полоски.
 *
 * Уровни полос дублируются в data-levels — для тестов.
 */
export const SpectrumCanvas: React.FC<SpectrumCanvasProps> = ({ dimmed }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dimmedRef = useRef(dimmed);
  useEffect(() => {
    dimmedRef.current = dimmed;
  }, [dimmed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const levels = new Float32Array(SPECTRUM_BARS);
    // Цвета темы читаются заново только при её смене: getComputedStyle на
    // каждом кадре стоил бы больше самой отрисовки.
    let theme: string | undefined;
    let brand = '';
    let strong = '';
    const readColors = () => {
      const current = document.documentElement.dataset.theme;
      if (current === theme && brand) return;
      theme = current;
      const style = getComputedStyle(document.documentElement);
      brand = style.getPropertyValue('--brand').trim() || '#7c5cff';
      strong = style.getPropertyValue('--sig-in').trim() || '#2dd4bf';
    };

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = Math.round(canvas.clientWidth * dpr);
      const height = Math.round(canvas.clientHeight * dpr);
      if (width === 0 || height === 0) return;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      readColors();
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = dimmedRef.current ? 0.2 : 0.85;
      const gap = GAP_PX * dpr;
      const barWidth = (width - gap * (SPECTRUM_BARS - 1)) / SPECTRUM_BARS;
      for (let i = 0; i < SPECTRUM_BARS; i++) {
        const h = Math.max(MIN_HEIGHT, levels[i] / 100) * height;
        ctx.fillStyle = levels[i] > STRONG_LEVEL ? strong : brand;
        ctx.fillRect(i * (barWidth + gap), height - h, barWidth, h);
      }
    };

    const showLevels = () => {
      let attr = '';
      for (let i = 0; i < SPECTRUM_BARS; i++) attr += (i ? ',' : '') + Math.round(levels[i]);
      canvas.dataset.levels = attr;
    };

    draw();
    showLevels();
    const unsubscribe = sharedAudioEngine.subscribe((_estimate, _timeBuf, freqBuf, sampleRate) => {
      if (!freqBuf || freqBuf.length === 0 || !sampleRate) return;
      computeSpectrumBars(freqBuf, sampleRate, levels);
      draw();
      showLevels();
    });
    return unsubscribe;
  }, []);

  return (
    <canvas
      ref={canvasRef}
      data-testid="spectrum-canvas"
      aria-hidden="true"
      style={{ display: 'block', width: '100%', height: '100%' }}
    />
  );
};
