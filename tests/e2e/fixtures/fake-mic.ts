import type { Page } from '@playwright/test';

export interface FakeMic {
  setFrequency(freq: number): void;
  setCents(note: string, cents: number, a4?: number): void;
  /** Уровень сигнала в dBFS: реальная гитара через микрофон телефона даёт около -60. */
  setLevel(dbfs: number): void;
  /** Имитация отказа в доступе: getUserMedia начинает отклоняться, как при запрете. */
  denyAccess(): void;
  silence(): void;
  stop(): void;
  readonly frequency: number;
}

declare global {
  interface Window {
    __fakeMic: FakeMic;
  }
}

/**
 * Подменяет getUserMedia генератором гармонического сигнала.
 * Регистрируется до загрузки приложения и действует на все навигации страницы.
 */
export async function installFakeMic(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const NOTE_INDEX: Record<string, number> = {
      C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5,
      'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11,
    };

    const HARMONICS = 5;
    const LEVEL = 0.056; // суммарно около -26 dBFS: выше порога -65 и без клиппинга

    let ctx: AudioContext | null = null;
    let master: GainNode | null = null;
    let stream: MediaStream | null = null;
    const oscillators: OscillatorNode[] = [];
    let currentFreq = 82.41;
    let accessDenied = false;

    function ensureGraph(): MediaStream {
      if (stream && ctx) return stream;

      ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      master = ctx.createGain();
      master.gain.value = LEVEL;
      master.connect(dest);

      for (let h = 1; h <= HARMONICS; h++) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = currentFreq * h;
        const g = ctx.createGain();
        g.gain.value = 1 / h; // спад амплитуды гармоник, как у щипковой струны
        osc.connect(g);
        g.connect(master);
        osc.start();
        oscillators.push(osc);
      }

      stream = dest.stream;
      return stream;
    }

    function applyFrequency(freq: number): void {
      currentFreq = freq;
      ensureGraph();
      if (!ctx || !master) return;
      const t = ctx.currentTime;
      oscillators.forEach((osc, i) => {
        osc.frequency.setValueAtTime(freq * (i + 1), t);
      });
      master.gain.setValueAtTime(LEVEL, t);
      void ctx.resume();
    }

    function noteToFrequency(note: string, cents: number, a4: number): number {
      const match = /^([A-G]#?)(-?\d+)$/.exec(note);
      if (!match) throw new Error(`Некорректное имя ноты: ${note}`);
      const [, name, octaveRaw] = match;
      const octave = Number(octaveRaw);
      const midi = (octave + 1) * 12 + NOTE_INDEX[name];
      return a4 * Math.pow(2, (midi - 69) / 12) * Math.pow(2, cents / 1200);
    }

    const fakeMic = {
      setFrequency(freq: number) {
        applyFrequency(freq);
      },
      setCents(note: string, cents: number, a4 = 440) {
        applyFrequency(noteToFrequency(note, cents, a4));
      },
      denyAccess() {
        accessDenied = true;
      },
      setLevel(dbfs: number) {
        ensureGraph();
        if (!ctx || !master) return;
        master.gain.setValueAtTime(Math.pow(10, dbfs / 20), ctx.currentTime);
      },
      silence() {
        if (!ctx || !master) return;
        master.gain.setValueAtTime(0, ctx.currentTime);
      },
      stop() {
        oscillators.forEach((osc) => osc.stop());
        oscillators.length = 0;
        void ctx?.close();
        ctx = null;
        master = null;
        stream = null;
      },
      get frequency() {
        return currentFreq;
      },
    };

    Object.defineProperty(window, '__fakeMic', {
      configurable: true,
      value: fakeMic,
    });

    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      writable: true,
      // Клон: продукт останавливает дорожки при выключении микрофона.
      value: async () => {
        if (accessDenied) {
          const err = new Error('Permission denied');
          err.name = 'NotAllowedError';
          throw err;
        }
        return ensureGraph().clone();
      },
    });
  });
}
