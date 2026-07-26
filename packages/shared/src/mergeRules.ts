import { buildMergeKey } from './mergeKey';
import type { InventoryLine } from './models';
import type { Category, Unit } from './categories';

export interface CandidateEntry {
  nom: string;
  marque: string;
  categorie: Category;
  contenance_unitaire: number;
  unite: Unit;
  /** Quantité déjà exprimée dans `unite` (ex: pack déjà "explosé" en amont par l'agent Scan). */
  delta: number;
  code_barre?: string | null;
}

export type MergeDecision =
  | { action: 'merge'; target: InventoryLine; nouvelle_quantite: number; cle_fusion: string }
  | { action: 'create'; cle_fusion: string };

/**
 * Détermine si une entrée doit fusionner avec une ligne existante ou créer une nouvelle ligne.
 * Appelée par les 3 points d'entrée (extension, scan, saisie manuelle) AVANT toute écriture,
 * pour garantir un comportement identique partout (cf. cahier des charges §3bis).
 */
export function resolveMerge(candidate: CandidateEntry, existingLines: InventoryLine[]): MergeDecision {
  const cle_fusion = buildMergeKey(candidate.nom, candidate.marque, candidate.contenance_unitaire, candidate.unite);
  const target = existingLines.find((line) => line.cle_fusion === cle_fusion);

  if (!target) {
    return { action: 'create', cle_fusion };
  }

  return {
    action: 'merge',
    target,
    nouvelle_quantite: target.quantite_totale + candidate.delta,
    cle_fusion,
  };
}
