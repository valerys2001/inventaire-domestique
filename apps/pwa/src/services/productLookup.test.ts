import { describe, expect, it } from 'vitest';
import { parseQuantity } from './productLookup';

describe('parseQuantity', () => {
  it('parse un pack "6 x 1.5 l" en 6 contenants de 1.5 L (delta_pack = 9)', () => {
    const parsed = parseQuantity('6 x 1.5 l');
    expect(parsed).toEqual({
      contenanceUnitaire: 1.5,
      unite: 'l',
      nombreContenants: 6,
      deltaPack: 9,
    });
  });

  it('parse un pack compact sans espaces "2x125g"', () => {
    const parsed = parseQuantity('2x125g');
    expect(parsed).toEqual({
      contenanceUnitaire: 125,
      unite: 'g',
      nombreContenants: 2,
      deltaPack: 250,
    });
  });

  it('parse une contenance simple "1.5 l" sans info de pack', () => {
    const parsed = parseQuantity('1.5 l');
    expect(parsed).toEqual({ contenanceUnitaire: 1.5, unite: 'l' });
  });

  it('convertit cl et ml en litres', () => {
    expect(parseQuantity('33 cl')).toEqual({ contenanceUnitaire: 0.33, unite: 'l' });
    expect(parseQuantity('500 ml')).toEqual({ contenanceUnitaire: 0.5, unite: 'l' });
  });

  it('convertit kg en grammes', () => {
    expect(parseQuantity('1.5 kg')).toEqual({ contenanceUnitaire: 1500, unite: 'g' });
  });

  it('accepte la virgule decimale francaise', () => {
    expect(parseQuantity('1,5 l')).toEqual({ contenanceUnitaire: 1.5, unite: 'l' });
  });

  it('un nombre sans poids/volume reconnu devient un lot de N unités, pas un contenant de taille N', () => {
    // Ex: papier toilette "12 rouleaux" -> 12 rouleaux qu'on peut retirer un par un, pas UN
    // article géant de "taille 12".
    expect(parseQuantity('4')).toEqual({
      contenanceUnitaire: 1,
      unite: 'unite',
      nombreContenants: 4,
      deltaPack: 4,
    });
    expect(parseQuantity('12 rouleaux')).toEqual({
      contenanceUnitaire: 1,
      unite: 'unite',
      nombreContenants: 12,
      deltaPack: 12,
    });
  });

  it('tolère "×" et "*" comme séparateur de pack, et le préfixe "Pack de"/"Lot de"', () => {
    expect(parseQuantity('6×1,5l')).toEqual({
      contenanceUnitaire: 1.5,
      unite: 'l',
      nombreContenants: 6,
      deltaPack: 9,
    });
    expect(parseQuantity('6*1,5l')).toEqual({
      contenanceUnitaire: 1.5,
      unite: 'l',
      nombreContenants: 6,
      deltaPack: 9,
    });
    expect(parseQuantity('Pack de 6 x 1,5 l')).toEqual({
      contenanceUnitaire: 1.5,
      unite: 'l',
      nombreContenants: 6,
      deltaPack: 9,
    });
  });

  it('renvoie null pour un format non reconnu', () => {
    expect(parseQuantity('lot de plusieurs')).toBeNull();
    expect(parseQuantity('')).toBeNull();
  });

  it('renvoie null pour une contenance nulle ou negative', () => {
    expect(parseQuantity('0 l')).toBeNull();
    expect(parseQuantity('-1 l')).toBeNull();
  });

  it('renvoie null pour un pack avec un nombre de contenants nul', () => {
    expect(parseQuantity('0 x 1.5 l')).toBeNull();
  });
});
