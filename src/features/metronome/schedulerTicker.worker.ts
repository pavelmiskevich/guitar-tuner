/**
 * Тикер планировщика метронома в отдельном потоке.
 *
 * Сам звук планируется на главном потоке (AudioContext в воркер не передать),
 * здесь только таймер. Таймеры главного потока в скрытой вкладке браузеры режут
 * до раза в секунду и реже, а таймеры выделенного воркера — заметно мягче;
 * сообщение из воркера при этом приходит на главный поток как обычная задача,
 * а не как таймер, и под это урезание не попадает.
 */

export type TickerCommand = { type: 'start'; intervalMs: number } | { type: 'stop' };

let timer: ReturnType<typeof setInterval> | null = null;

function stop() {
  if (timer !== null) clearInterval(timer);
  timer = null;
}

self.onmessage = (event: MessageEvent<TickerCommand>) => {
  const command = event.data;
  stop();
  if (command.type === 'start') {
    timer = setInterval(() => self.postMessage('tick'), command.intervalMs);
  }
};
