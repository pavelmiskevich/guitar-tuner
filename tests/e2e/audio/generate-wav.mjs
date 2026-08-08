// Генерирует 5 секунд гармонического сигнала E2 (82.41 Гц) в 16-бит моно 48 кГц.
import { writeFileSync } from 'node:fs';

const SAMPLE_RATE = 48000;
const DURATION = 5;
const FREQ = 82.4069;
const HARMONICS = 5;

const total = SAMPLE_RATE * DURATION;
const data = Buffer.alloc(total * 2);

for (let i = 0; i < total; i++) {
  const t = i / SAMPLE_RATE;
  let sample = 0;
  for (let h = 1; h <= HARMONICS; h++) {
    sample += Math.sin(2 * Math.PI * FREQ * h * t) / h;
  }
  sample = (sample / 2.3) * 0.35;
  data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sample * 32767))), i * 2);
}

const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(SAMPLE_RATE, 24);
header.writeUInt32LE(SAMPLE_RATE * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(data.length, 40);

writeFileSync(new URL('./e2-open-string.wav', import.meta.url), Buffer.concat([header, data]));
console.log('WAV создан');
