import { describe, expect, it } from 'vitest';
import { joinBarcodes, parseBarcodes } from './barcodes';

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
