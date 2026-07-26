import { describe, expect, it } from 'vitest';
import { computeDeltaFromPack, roundForDisplay } from './quantity';

describe('computeDeltaFromPack', () => {
  it('calcule 9 pour un pack de 6 bouteilles de 1.5 L', () => {
    expect(computeDeltaFromPack(6, 1.5)).toBe(9);
  });

  it('renvoie la contenance unitaire pour un achat unitaire simple (nombreContenants=1)', () => {
    expect(computeDeltaFromPack(1, 0.5)).toBe(0.5);
  });

  it('rejette une contenanceUnitaire nulle ou negative', () => {
    expect(() => computeDeltaFromPack(6, 0)).toThrow();
    expect(() => computeDeltaFromPack(6, -1)).toThrow();
  });

  it('rejette un nombreContenants nul ou negatif', () => {
    expect(() => computeDeltaFromPack(0, 1.5)).toThrow();
    expect(() => computeDeltaFromPack(-2, 1.5)).toThrow();
  });
});

describe('roundForDisplay', () => {
  it("corrige les erreurs d'arrondi flottant classiques (0.1 + 0.2)", () => {
    expect(0.1 + 0.2).not.toBe(0.3); // rappel du probleme flottant sous-jacent
    expect(roundForDisplay(0.1 + 0.2)).toBe(0.3);
  });

  it('arrondit a 2 decimales', () => {
    expect(roundForDisplay(1.005)).toBeCloseTo(1, 2);
    expect(roundForDisplay(10.5)).toBe(10.5);
    expect(roundForDisplay(9.999)).toBe(10);
  });

  it('laisse les entiers inchanges', () => {
    expect(roundForDisplay(9)).toBe(9);
    expect(roundForDisplay(0)).toBe(0);
  });
});
