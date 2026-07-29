import { describe, expect, it } from 'vitest';
import { inventoryLineToRow, rowToInventoryLine, movementToRow, listeCoursesItemToRow, rowToListeCoursesItem } from './sheetsMapping';
import type { InventoryLine, ListeCoursesItem, Movement } from './models';

describe('inventoryLineToRow / rowToInventoryLine (aller-retour)', () => {
  it('conserve toutes les valeurs apres un aller-retour ligne -> row -> ligne', () => {
    const line: InventoryLine = {
      id: 'abc-123',
      nom: 'Eau',
      marque: 'Marque X',
      categorie: 'epicerie_sucree',
      contenance_unitaire: 1.5,
      unite: 'l',
      quantite_totale: 10.5,
      code_barre: '3057640257427',
      date_maj: '2026-07-26T10:00:00.000Z',
      utilisateur: 'local',
      cle_fusion: 'eau|marque x|1.5|l',
      seuil_alerte: 2,
      quantite_cible: 12,
      nombre_contenants_defaut: 6,
    };

    const row = inventoryLineToRow(line);
    const roundTripped = rowToInventoryLine(row);

    expect(roundTripped).toEqual(line);
  });

  it('gere correctement code_barre et seuil_alerte nuls (chaines vides dans le Sheet)', () => {
    const line: InventoryLine = {
      id: 'abc-456',
      nom: 'Savon',
      marque: 'Marque Y',
      categorie: 'cosmetiques_hygiene',
      contenance_unitaire: 100,
      unite: 'g',
      quantite_totale: 100,
      code_barre: null,
      date_maj: '2026-07-26T10:00:00.000Z',
      utilisateur: 'local',
      cle_fusion: 'savon|marque y|100|g',
      seuil_alerte: null,
      quantite_cible: null,
      nombre_contenants_defaut: null,
    };

    const row = inventoryLineToRow(line);
    const roundTripped = rowToInventoryLine(row);

    expect(roundTripped.code_barre).toBeNull();
    expect(roundTripped.seuil_alerte).toBeNull();
    expect(roundTripped.quantite_cible).toBeNull();
    expect(roundTripped.nombre_contenants_defaut).toBeNull();
    expect(roundTripped).toEqual(line);
  });

  it("respecte l'ordre des colonnes A:N (id en premiere position, nombre_contenants_defaut en derniere)", () => {
    const line: InventoryLine = {
      id: 'id-1',
      nom: 'nom-1',
      marque: 'marque-1',
      categorie: 'fruits',
      contenance_unitaire: 1,
      unite: 'unite',
      quantite_totale: 5,
      code_barre: '111',
      date_maj: '2026-01-01T00:00:00.000Z',
      utilisateur: 'user-1',
      cle_fusion: 'cle-1',
      seuil_alerte: 1,
      quantite_cible: 8,
      nombre_contenants_defaut: 4,
    };

    const row = inventoryLineToRow(line);
    expect(row[0]).toBe('id-1');
    expect(row[row.length - 1]).toBe('4');
  });
});

describe('movementToRow', () => {
  it('serialise un mouvement dans l ordre date, cle_fusion, delta, type, utilisateur, commentaire', () => {
    const movement: Movement = {
      date: '2026-07-26T10:00:00.000Z',
      cle_fusion: 'eau|marque x|1.5|l',
      delta: -1.5,
      type: 'sortie',
      utilisateur: 'local',
      commentaire: 'test',
    };

    const row = movementToRow(movement);
    expect(row).toEqual(['2026-07-26T10:00:00.000Z', 'eau|marque x|1.5|l', '-1.5', 'sortie', 'local', 'test']);
  });

  it('serialise un commentaire absent en chaine vide', () => {
    const movement: Movement = {
      date: '2026-07-26T10:00:00.000Z',
      cle_fusion: 'eau|marque x|1.5|l',
      delta: 9,
      type: 'entree_manuelle',
      utilisateur: 'local',
    };

    const row = movementToRow(movement);
    expect(row[row.length - 1]).toBe('');
  });
});

describe('listeCoursesItemToRow / rowToListeCoursesItem (aller-retour)', () => {
  it('conserve toutes les valeurs apres un aller-retour item -> row -> item (contenance_unitaire nulle)', () => {
    const item: ListeCoursesItem = {
      id: 'lc-1',
      nom: 'Courgette',
      marque: '',
      categorie: 'legumes',
      quantite: 1,
      unite: 'unite',
      contenance_unitaire: null,
    };

    const row = listeCoursesItemToRow(item);
    expect(rowToListeCoursesItem(row)).toEqual(item);
  });

  it('conserve la contenance_unitaire pour un article liquide', () => {
    const item: ListeCoursesItem = {
      id: 'lc-2',
      nom: 'Eau',
      marque: 'Cristaline',
      categorie: 'boissons',
      quantite: 3,
      unite: 'l',
      contenance_unitaire: 1.5,
    };

    const row = listeCoursesItemToRow(item);
    expect(rowToListeCoursesItem(row)).toEqual(item);
  });
});
