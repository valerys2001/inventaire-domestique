import { describe, expect, it } from 'vitest';
import { buildMergeKey } from './mergeKey';

describe('buildMergeKey', () => {
  it('normalise la casse, les accents et les espaces superflus', () => {
    const a = buildMergeKey('Eau ÉVIAN ', 'Marque X', 1.5, 'l');
    const b = buildMergeKey('eau evian', 'marque x', 1.5, 'l');
    expect(a).toBe(b);
  });

  it("produit des clés différentes pour deux contenances différentes du même produit/marque", () => {
    const cl33 = buildMergeKey('Coca Cola', 'Coca-Cola', 0.33, 'l');
    const cl50 = buildMergeKey('Coca Cola', 'Coca-Cola', 0.5, 'l');
    expect(cl33).not.toBe(cl50);
  });

  it('produit des clés différentes pour deux unités différentes', () => {
    const litres = buildMergeKey('Produit', 'Marque', 1, 'l');
    const grammes = buildMergeKey('Produit', 'Marque', 1, 'g');
    expect(litres).not.toBe(grammes);
  });

  it('produit des clés différentes pour deux marques différentes du même produit', () => {
    const x = buildMergeKey('Eau', 'Marque X', 1.5, 'l');
    const y = buildMergeKey('Eau', 'Marque Y', 1.5, 'l');
    expect(x).not.toBe(y);
  });

  it('est stable (idempotent) pour des entrées identiques', () => {
    const a = buildMergeKey('Lessive', 'Ariel', 1, 'l');
    const b = buildMergeKey('Lessive', 'Ariel', 1, 'l');
    expect(a).toBe(b);
  });
});
