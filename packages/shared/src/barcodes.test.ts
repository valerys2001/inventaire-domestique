import { describe, expect, it } from 'vitest';
import {
  getNombreContenantsForBarcode,
  joinBarcodeEntries,
  joinBarcodes,
  parseBarcodeEntries,
  parseBarcodes,
  upsertBarcodeCount,
} from './barcodes';

describe('parseBarcodes', () => {
  it('renvoie un tableau vide pour null', () => {
    expect(parseBarcodes(null)).toEqual([]);
  });

  it('renvoie un seul code-barre pour le cas courant', () => {
    expect(parseBarcodes('3057640257427')).toEqual(['3057640257427']);
  });

  it('découpe plusieurs codes-barres séparés par ";"', () => {
    expect(parseBarcodes('3057640257427;3057640257434')).toEqual(['3057640257427', '3057640257434']);
  });

  it('ignore les espaces superflus et les segments vides', () => {
    expect(parseBarcodes(' 3057640257427 ; ;3057640257434')).toEqual(['3057640257427', '3057640257434']);
  });
});

describe('joinBarcodes', () => {
  it('renvoie null pour une liste vide', () => {
    expect(joinBarcodes([])).toBeNull();
  });

  it('joint plusieurs codes-barres avec ";"', () => {
    expect(joinBarcodes(['3057640257427', '3057640257434'])).toBe('3057640257427;3057640257434');
  });

  it('déduplique', () => {
    expect(joinBarcodes(['3057640257427', '3057640257427'])).toBe('3057640257427');
  });

  it('est le pendant exact de parseBarcodes (aller-retour)', () => {
    const original = ['3057640257427', '3057640257434'];
    expect(parseBarcodes(joinBarcodes(original))).toEqual(original);
  });
});

describe('parseBarcodeEntries / getNombreContenantsForBarcode', () => {
  it("lit le nombre de contenants propre à un EAN au format 'ean:count'", () => {
    const code = '3057640257427:1;3057640257434:6';
    expect(getNombreContenantsForBarcode(code, '3057640257427')).toBe(1);
    expect(getNombreContenantsForBarcode(code, '3057640257434')).toBe(6);
  });

  it('renvoie null pour un EAN sans conditionnement mémorisé', () => {
    expect(getNombreContenantsForBarcode('3057640257427', '3057640257427')).toBeNull();
    expect(getNombreContenantsForBarcode('3057640257427:6', '3057640257434')).toBeNull();
  });

  it('parseBarcodes reste compatible : renvoie les EAN nus, avec ou sans suffixe', () => {
    expect(parseBarcodes('3057640257427:1;3057640257434:6')).toEqual(['3057640257427', '3057640257434']);
  });

  it("scanner la bouteille seule après une fusion avec le pack ne renvoie pas le conditionnement du pack (bug rapporté)", () => {
    // Ligne fusionnée : EAN bouteille seule (1) + EAN pack de 6, sur la même ligne (même stock).
    const merged = '3057640257427:1;3057640257434:6';
    expect(getNombreContenantsForBarcode(merged, '3057640257427')).toBe(1);
    expect(getNombreContenantsForBarcode(merged, '3057640257434')).toBe(6);
  });
});

describe('joinBarcodeEntries', () => {
  it('sérialise un conditionnement uniquement quand il est connu', () => {
    expect(
      joinBarcodeEntries([
        { barcode: '3057640257427', nombreContenants: null },
        { barcode: '3057640257434', nombreContenants: 6 },
      ]),
    ).toBe('3057640257427;3057640257434:6');
  });

  it('en cas de doublon, garde le premier conditionnement connu', () => {
    expect(
      joinBarcodeEntries([
        { barcode: '3057640257427', nombreContenants: null },
        { barcode: '3057640257427', nombreContenants: 6 },
      ]),
    ).toBe('3057640257427:6');
  });

  it('renvoie null pour une liste vide', () => {
    expect(joinBarcodeEntries([])).toBeNull();
  });
});

describe('upsertBarcodeCount', () => {
  it("met à jour le conditionnement d'un EAN sans toucher aux autres", () => {
    const code = '3057640257427:1;3057640257434:6';
    expect(upsertBarcodeCount(code, '3057640257427', 2)).toBe('3057640257427:2;3057640257434:6');
  });

  it('ajoute un nouvel EAN si absent', () => {
    expect(upsertBarcodeCount('3057640257427:1', '3057640257434', 6)).toBe('3057640257427:1;3057640257434:6');
  });

  it('part de zéro (null) pour une toute nouvelle ligne', () => {
    expect(upsertBarcodeCount(null, '3057640257427', 1)).toBe('3057640257427:1');
  });
});
