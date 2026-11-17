import type { TickerCommand } from './schedulerTicker.worker';

/** Период тиков планировщика. Окно упреждения должно быть заметно больше. */
export const TICK_INTERVAL_MS = 25;

/**
 * Запускает периодические тики планировщика и возвращает функцию остановки.
 *
 * Основной путь — таймер в Web Worker: в фоне он не замирает так, как таймеры
 * главного потока. Если воркер недоступен (старый браузер, запрет политикой,
 * сбой загрузки скрипта) — тикаем обычным setInterval: метроном работает, хоть
 * и хуже в фоне. Первый тик — сразу, чтобы первая доля не ждала таймера.
 */
export function startSchedulerTicker(onTick: () => void): () => void {
  let worker: Worker | null = null;
  let fallbackTimer: number | null = null;
  let stopped = false;

  const startFallback = () => {
    if (stopped || fallbackTimer !== null) return;
    fallbackTimer = window.setInterval(onTick, TICK_INTERVAL_MS);
  };

  try {
    worker = new Worker(new URL('./schedulerTicker.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = () => {
      if (!stopped) onTick();
    };
    worker.onerror = (event) => {
      // Ошибка загрузки или исполнения воркера не должна всплывать как
      // необработанная — переходим на таймер главного потока.
      event.preventDefault();
      worker?.terminate();
      worker = null;
      startFallback();
    };
    const command: TickerCommand = { type: 'start', intervalMs: TICK_INTERVAL_MS };
    worker.postMessage(command);
  } catch {
    worker = null;
    startFallback();
  }

  onTick();

  return () => {
    stopped = true;
    worker?.terminate();
    worker = null;
    if (fallbackTimer !== null) window.clearInterval(fallbackTimer);
    fallbackTimer = null;
  };
}
