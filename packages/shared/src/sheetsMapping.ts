import { INVENTAIRE_COLUMNS, LISTE_COURSES_COLUMNS, MOUVEMENTS_COLUMNS } from './sheetsSchema';
import type { InventoryLine, ListeCoursesItem, Movement } from './models';
import type { Category, Unit } from './categories';

/** Convertit une ligne brute renvoyée par Sheets API (values.get) en InventoryLine typée. */
export function rowToInventoryLine(row: string[]): InventoryLine {
  const get = (col: (typeof INVENTAIRE_COLUMNS)[number]) => row[INVENTAIRE_COLUMNS.indexOf(col)] ?? '';

  return {
    id: get('id'),
    nom: get('nom'),
    marque: get('marque'),
    categorie: get('categorie') as Category,
    contenance_unitaire: Number(get('contenance_unitaire')) || 0,
    unite: get('unite') as Unit,
    quantite_totale: Number(get('quantite_totale')) || 0,
    code_barre: get('code_barre') || null,
    date_maj: get('date_maj'),
    utilisateur: get('utilisateur'),
    cle_fusion: get('cle_fusion'),
    seuil_alerte: get('seuil_alerte') ? Number(get('seuil_alerte')) : null,
    quantite_cible: get('quantite_cible') ? Number(get('quantite_cible')) : null,
  };
}

/** Convertit une InventoryLine en tableau de cellules dans l'ordre exact des colonnes. */
export function inventoryLineToRow(line: InventoryLine): string[] {
  return INVENTAIRE_COLUMNS.map((col) => {
    const value = line[col as keyof InventoryLine];
    return value === null || value === undefined ? '' : String(value);
  });
}

export function movementToRow(movement: Movement): string[] {
  return MOUVEMENTS_COLUMNS.map((col) => {
    const value = movement[col as keyof Movement];
    return value === null || value === undefined ? '' : String(value);
  });
}

export function rowToListeCoursesItem(row: string[]): ListeCoursesItem {
  const get = (col: (typeof LISTE_COURSES_COLUMNS)[number]) => row[LISTE_COURSES_COLUMNS.indexOf(col)] ?? '';

  return {
    id: get('id'),
    nom: get('nom'),
    marque: get('marque'),
    categorie: get('categorie') as Category,
    quantite: Number(get('quantite')) || 0,
    unite: get('unite') as Unit,
  };
}

export function listeCoursesItemToRow(item: ListeCoursesItem): string[] {
  return LISTE_COURSES_COLUMNS.map((col) => {
    const value = item[col as keyof ListeCoursesItem];
    return value === null || value === undefined ? '' : String(value);
  });
}
