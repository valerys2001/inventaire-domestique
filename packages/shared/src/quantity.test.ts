import { describe, expect, it } from 'vitest';
import { computeDeltaFromPack, formatLiquidQuantity, formatQuantityDetailed, roundForDisplay } from './quantity';

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

describe('formatQuantityDetailed', () => {
  it('affiche un compte de contenants pour un liquide, jamais de litres (cas pack)', () => {
    expect(formatQuantityDetailed(9, 1.5, 'l')).toBe('6 contenants');
  });

  it("n'ajoute pas de détail quand l'unité est déjà le compte (unite/pourcent)", () => {
    expect(formatQuantityDetailed(4, 1, 'unite')).toBe('4 unité(s)');
    expect(formatQuantityDetailed(80, 100, 'pourcent')).toBe('80 % restant');
  });

  it("affiche 1 seul contenant quand il n'y en a qu'un (contenance == total)", () => {
    expect(formatQuantityDetailed(1.5, 1.5, 'l')).toBe('1 contenant');
  });

  it('affiche le % du dernier contenant entamé pour un liquide', () => {
    // 8.2 L restants sur des bouteilles de 1.5 L -> 5 pleins + dernier entamé à 47%
    expect(formatQuantityDetailed(8.2, 1.5, 'l')).toBe('6 contenants (dernier à 47%)');
  });

  it("n'affiche rien de spécial pour une contenance non renseignée (0)", () => {
    expect(formatQuantityDetailed(3, 0, 'g')).toBe('3 grammes');
    expect(formatQuantityDetailed(3, 0, 'l')).toBe('3 litres');
  });
});

describe('formatLiquidQuantity', () => {
  it('ne montre jamais de L/mL/cL', () => {
    expect(formatLiquidQuantity(9, 1.5)).not.toMatch(/[lL]itres?|[mc]l\b/);
  });

  it('renvoie "0 contenant" quand le stock est vide', () => {
    expect(formatLiquidQuantity(0, 1.5)).toBe('0 contenant');
  });

  it('compte le dernier contenant entamé même à un stock très bas', () => {
    expect(formatLiquidQuantity(0.1, 1.5)).toBe('1 contenant (dernier à 7%)');
  });
});
