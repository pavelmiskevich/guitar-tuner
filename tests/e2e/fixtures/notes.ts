const NOTE_INDEX: Record<string, number> = {
  C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5,
  'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11,
};

export function noteToMidi(note: string): number {
  const match = /^([A-G]#?)(-?\d+)$/.exec(note);
  if (!match) throw new Error(`Некорректное имя ноты: ${note}`);
  const [, name, octave] = match;
  return (Number(octave) + 1) * 12 + NOTE_INDEX[name];
}

export function noteFrequency(note: string, a4 = 440): number {
  return a4 * Math.pow(2, (noteToMidi(note) - 69) / 12);
}

export function centsOff(note: string, cents: number, a4 = 440): number {
  return noteFrequency(note, a4) * Math.pow(2, cents / 1200);
}
