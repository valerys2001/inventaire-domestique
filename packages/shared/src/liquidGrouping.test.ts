import { describe, expect, it } from 'vitest';
import { groupLiquidLines } from './liquidGrouping';
import type { InventoryLine } from './models';

function line(overrides: Partial<InventoryLine>): InventoryLine {
  return {
    id: overrides.id ?? 'id',
    nom: overrides.nom ?? 'Eau',
    marque: overrides.marque ?? 'Marque X',
    categorie: overrides.categorie ?? 'boissons',
    contenance_unitaire: overrides.contenance_unitaire ?? 1.5,
    unite: overrides.unite ?? 'l',
    quantite_totale: overrides.quantite_totale ?? 3,
    code_barre: overrides.code_barre ?? null,
    date_maj: overrides.date_maj ?? '2026-07-28T00:00:00.000Z',
    utilisateur: overrides.utilisateur ?? 'local',
    cle_fusion: overrides.cle_fusion ?? 'eau|marque x|1.5|l',
    seuil_alerte: overrides.seuil_alerte ?? null,
    quantite_cible: overrides.quantite_cible ?? null,
    nombre_contenants_defaut: overrides.nombre_contenants_defaut ?? null,
  };
}

describe('groupLiquidLines', () => {
  it('regroupe par nom (marque ignorée pour la clé de dossier)', () => {
    const lines = [
      line({ id: '1', nom: 'Eau', marque: 'Cristaline', contenance_unitaire: 1.5 }),
      line({ id: '2', nom: 'Eau', marque: 'Evian', contenance_unitaire: 1.5 }),
    ];

    const folders = groupLiquidLines(lines);
    expect(folders).toHaveLength(1);
    expect(folders[0].nom).toBe('Eau');
    expect(folders[0].sizeGroups).toHaveLength(1);
    expect(folders[0].sizeGroups[0].lines.map((l) => l.marque)).toEqual(['Cristaline', 'Evian']);
  });

  it('ne fusionne jamais deux tailles de contenant différentes', () => {
    const lines = [
      line({ id: '1', nom: 'Eau', contenance_unitaire: 1 }),
      line({ id: '2', nom: 'Eau', contenance_unitaire: 1.5 }),
    ];

    const folders = groupLiquidLines(lines);
    expect(folders[0].sizeGroups).toHaveLength(2);
    expect(folders[0].sizeGroups.map((g) => g.contenanceUnitaire)).toEqual([1, 1.5]);
  });

  it('exclut les produits non liquides', () => {
    const lines = [line({ id: '1' }), line({ id: '2', unite: 'g', contenance_unitaire: 100 })];
    const folders = groupLiquidLines(lines);
    expect(folders).toHaveLength(1);
    expect(folders[0].sizeGroups[0].lines).toHaveLength(1);
  });

  it('trie les dossiers par nom et les tailles par contenance croissante', () => {
    const lines = [
      line({ id: '1', nom: 'Vinaigre', contenance_unitaire: 1 }),
      line({ id: '2', nom: 'Eau', contenance_unitaire: 1.5 }),
      line({ id: '3', nom: 'Eau', contenance_unitaire: 0.5 }),
    ];

    const folders = groupLiquidLines(lines);
    expect(folders.map((f) => f.nom)).toEqual(['Eau', 'Vinaigre']);
    expect(folders[0].sizeGroups.map((g) => g.contenanceUnitaire)).toEqual([0.5, 1.5]);
  });
});
