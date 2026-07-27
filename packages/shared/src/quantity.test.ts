import { describe, expect, it } from 'vitest';
import { computeDeltaFromPack, formatQuantityDetailed, roundForDisplay } from './quantity';

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
  it('montre le total ET le détail par contenant pour un pack (cas du cahier des charges)', () => {
    expect(formatQuantityDetailed(9, 1.5, 'l')).toBe('9 litres (6 × 1.5 litres)');
  });

  it("n'ajoute pas de détail quand l'unité est déjà le compte (unite/pourcent)", () => {
    expect(formatQuantityDetailed(4, 1, 'unite')).toBe('4 unité(s)');
    expect(formatQuantityDetailed(80, 100, 'pourcent')).toBe('80 % restant');
  });

  it("n'ajoute pas de détail quand il n'y a qu'un seul contenant (contenance == total)", () => {
    expect(formatQuantityDetailed(1.5, 1.5, 'l')).toBe('1.5 litres');
  });

  it('marque le compte comme approximatif après une sortie partielle (contenant entamé)', () => {
    // 8.2 L restants sur des bouteilles de 1.5 L -> pas un compte entier de bouteilles pleines
    expect(formatQuantityDetailed(8.2, 1.5, 'l')).toContain('≈5.5');
  });

  it("n'affiche rien de spécial pour une contenance non renseignée (0)", () => {
    expect(formatQuantityDetailed(3, 0, 'g')).toBe('3 grammes');
  });
});
