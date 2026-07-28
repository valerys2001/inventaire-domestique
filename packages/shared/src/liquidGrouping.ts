import { normalize } from './mergeKey';
import type { Unit } from './categories';

export interface LiquidGroupable {
  nom: string;
  unite: Unit;
  contenance_unitaire: number | null;
}

export interface LiquidSizeGroup<T> {
  /** null = contenance inconnue (article créé avant l'ajout du champ, ou non renseignée). */
  contenanceUnitaire: number | null;
  lines: T[];
}

export interface LiquidFolder<T> {
  /** Nom d'affichage (casse de la première occurrence rencontrée). */
  nom: string;
  sizeGroups: Array<LiquidSizeGroup<T>>;
}

/**
 * Regroupe les produits liquides (unite === 'l') en "dossiers" par nom de produit — marque
 * ignorée pour la clé de dossier, cf. décision produit : "Eau" réunit toutes les marques d'eau.
 * À l'intérieur d'un dossier, sous-groupe par taille de contenant : deux tailles différentes
 * (1 L / 1.5 L) ne fusionnent jamais entre elles, seule leur présentation est groupée. Générique
 * sur T pour servir aussi bien InventoryLine que ListeCoursesItem.
 */
export function groupLiquidLines<T extends LiquidGroupable>(lines: T[]): Array<LiquidFolder<T>> {
  const folders = new Map<string, { nom: string; sizes: Map<number | null, T[]> }>();

  for (const line of lines) {
    if (line.unite !== 'l') continue;
    const key = normalize(line.nom);
    let folder = folders.get(key);
    if (!folder) {
      folder = { nom: line.nom, sizes: new Map() };
      folders.set(key, folder);
    }
    const sizeLines = folder.sizes.get(line.contenance_unitaire) ?? [];
    sizeLines.push(line);
    folder.sizes.set(line.contenance_unitaire, sizeLines);
  }

  return [...folders.values()]
    .map((folder) => ({
      nom: folder.nom,
      sizeGroups: [...folder.sizes.entries()]
        .sort(([a], [b]) => (a ?? Infinity) - (b ?? Infinity))
        .map(([contenanceUnitaire, groupLines]) => ({ contenanceUnitaire, lines: groupLines })),
    }))
    .sort((a, b) => a.nom.localeCompare(b.nom));
}
