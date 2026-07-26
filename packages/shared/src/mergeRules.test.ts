import { describe, expect, it } from 'vitest';
import { resolveMerge, type CandidateEntry } from './mergeRules';
import { buildMergeKey } from './mergeKey';
import type { InventoryLine } from './models';

function makeLine(overrides: Partial<InventoryLine> = {}): InventoryLine {
  return {
    id: 'line-1',
    nom: 'Eau',
    marque: 'Marque X',
    categorie: 'epicerie_sucree',
    contenance_unitaire: 1.5,
    unite: 'l',
    quantite_totale: 9,
    code_barre: null,
    date_maj: '2026-07-01T00:00:00.000Z',
    utilisateur: 'local',
    cle_fusion: buildMergeKey('Eau', 'Marque X', 1.5, 'l'),
    seuil_alerte: null,
    ...overrides,
  };
}

function makeCandidate(overrides: Partial<CandidateEntry> = {}): CandidateEntry {
  return {
    nom: 'Eau',
    marque: 'Marque X',
    categorie: 'epicerie_sucree',
    contenance_unitaire: 1.5,
    unite: 'l',
    delta: 1.5,
    code_barre: null,
    ...overrides,
  };
}

describe('resolveMerge', () => {
  it('fusionne un pack de 6x1.5L existant (9L) avec une bouteille seule de 1.5L de même marque', () => {
    const existing = [makeLine({ quantite_totale: 9 })];
    const candidate = makeCandidate({ delta: 1.5 });

    const decision = resolveMerge(candidate, existing);

    expect(decision.action).toBe('merge');
    if (decision.action === 'merge') {
      expect(decision.nouvelle_quantite).toBe(10.5);
      expect(decision.target.id).toBe('line-1');
    }
  });

  it('cree une ligne separee (action create) pour une contenance differente du meme produit/marque', () => {
    const existing = [makeLine({ contenance_unitaire: 0.33, cle_fusion: buildMergeKey('Coca', 'Coca-Cola', 0.33, 'l'), nom: 'Coca', marque: 'Coca-Cola' })];
    const candidate = makeCandidate({ nom: 'Coca', marque: 'Coca-Cola', contenance_unitaire: 0.5, delta: 0.5 });

    const decision = resolveMerge(candidate, existing);

    expect(decision.action).toBe('create');
  });

  it("cree une ligne pour la premiere entree d'un produit inconnu (aucune ligne existante)", () => {
    const decision = resolveMerge(makeCandidate(), []);
    expect(decision.action).toBe('create');
  });

  it('ne fusionne pas deux produits de marques differentes memes nom/contenance', () => {
    const existing = [makeLine({ marque: 'Marque X', cle_fusion: buildMergeKey('Eau', 'Marque X', 1.5, 'l') })];
    const candidate = makeCandidate({ marque: 'Marque Y' });

    const decision = resolveMerge(candidate, existing);
    expect(decision.action).toBe('create');
  });

  it('fusionne malgre des differences de casse/accents entre nom et marque', () => {
    const existing = [makeLine({ nom: 'Eau', marque: 'Marque X', cle_fusion: buildMergeKey('Eau', 'Marque X', 1.5, 'l') })];
    const candidate = makeCandidate({ nom: '  eau  ', marque: 'MARQUE x' });

    const decision = resolveMerge(candidate, existing);
    expect(decision.action).toBe('merge');
  });

  it('la quantite cumulee est correcte pour plusieurs fusions successives', () => {
    let existing = [makeLine({ quantite_totale: 9 })];
    const first = resolveMerge(makeCandidate({ delta: 1.5 }), existing);
    expect(first.action).toBe('merge');
    if (first.action !== 'merge') return;
    existing = [{ ...existing[0], quantite_totale: first.nouvelle_quantite }];

    const second = resolveMerge(makeCandidate({ delta: 1.5 }), existing);
    expect(second.action).toBe('merge');
    if (second.action === 'merge') {
      expect(second.nouvelle_quantite).toBe(12);
    }
  });
});
