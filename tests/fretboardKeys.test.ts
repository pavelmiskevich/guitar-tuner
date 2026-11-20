import { describe, it, expect } from 'vitest';
import { clampFretboardCell, fretboardKeyMove } from '../src/domain/fretboard';

const bounds = { numStrings: 6, minFret: 0, maxFret: 12, leftHanded: false };

describe('fretboardKeyMove', () => {
  it('стрелки вправо/влево — соседний лад', () => {
    expect(fretboardKeyMove({ stringIndex: 2, fret: 3 }, 'ArrowRight', bounds)).toEqual({ stringIndex: 2, fret: 4 });
    expect(fretboardKeyMove({ stringIndex: 2, fret: 3 }, 'ArrowLeft', bounds)).toEqual({ stringIndex: 2, fret: 2 });
  });

  it('у левши лады нарисованы справа налево — стрелки следуют за картинкой', () => {
    const lefty = { ...bounds, leftHanded: true };
    expect(fretboardKeyMove({ stringIndex: 2, fret: 3 }, 'ArrowRight', lefty)).toEqual({ stringIndex: 2, fret: 2 });
    expect(fretboardKeyMove({ stringIndex: 2, fret: 3 }, 'ArrowLeft', lefty)).toEqual({ stringIndex: 2, fret: 4 });
  });

  it('стрелки вверх/вниз — соседняя струна', () => {
    expect(fretboardKeyMove({ stringIndex: 2, fret: 3 }, 'ArrowUp', bounds)).toEqual({ stringIndex: 1, fret: 3 });
    expect(fretboardKeyMove({ stringIndex: 2, fret: 3 }, 'ArrowDown', bounds)).toEqual({ stringIndex: 3, fret: 3 });
  });

  it('у края фокус остаётся на месте', () => {
    expect(fretboardKeyMove({ stringIndex: 0, fret: 0 }, 'ArrowUp', bounds)).toEqual({ stringIndex: 0, fret: 0 });
    expect(fretboardKeyMove({ stringIndex: 5, fret: 12 }, 'ArrowDown', bounds)).toEqual({ stringIndex: 5, fret: 12 });
    expect(fretboardKeyMove({ stringIndex: 5, fret: 12 }, 'ArrowRight', bounds)).toEqual({ stringIndex: 5, fret: 12 });
  });

  it('за каподастр не уходит: первый лад — каподастр', () => {
    const capo = { ...bounds, minFret: 3 };
    expect(fretboardKeyMove({ stringIndex: 0, fret: 3 }, 'ArrowLeft', capo)).toEqual({ stringIndex: 0, fret: 3 });
  });

  it('Home/End — края диапазона на той же струне', () => {
    const range = { ...bounds, minFret: 5, maxFret: 12 };
    expect(fretboardKeyMove({ stringIndex: 4, fret: 8 }, 'Home', range)).toEqual({ stringIndex: 4, fret: 5 });
    expect(fretboardKeyMove({ stringIndex: 4, fret: 8 }, 'End', range)).toEqual({ stringIndex: 4, fret: 12 });
  });

  it('прочие клавиши фокус не двигают', () => {
    expect(fretboardKeyMove({ stringIndex: 0, fret: 0 }, 'Enter', bounds)).toBeNull();
    expect(fretboardKeyMove({ stringIndex: 0, fret: 0 }, 'a', bounds)).toBeNull();
  });
});

describe('clampFretboardCell', () => {
  it('возвращает ячейку в пределы после смены диапазона и строя', () => {
    expect(clampFretboardCell({ stringIndex: 6, fret: 15 }, { numStrings: 4, minFret: 0, maxFret: 12 })).toEqual({
      stringIndex: 3,
      fret: 12
    });
    expect(clampFretboardCell({ stringIndex: 0, fret: 0 }, { numStrings: 6, minFret: 5, maxFret: 12 })).toEqual({
      stringIndex: 0,
      fret: 5
    });
  });
});
