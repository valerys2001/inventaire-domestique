import type { Unit } from './categories';

export function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // retire les accents pour un matching robuste
}

/**
 * Clé de fusion (règle 3bis) : deux lots ne fusionnent que s'ils partagent
 * le même produit, la même marque ET la même contenance unitaire.
 * Des contenances différentes du même produit/marque restent des lignes séparées.
 */
export function buildMergeKey(nom: string, marque: string, contenanceUnitaire: number, unite: Unit): string {
  return `${normalize(nom)}|${normalize(marque)}|${contenanceUnitaire}|${unite}`;
}

/**
 * Clé de regroupement pour l'onglet ListeCourses. Inclut la contenance unitaire (comme
 * buildMergeKey) : un écart sur des bouteilles de 1 L ne doit jamais se cumuler avec un écart
 * sur des bouteilles de 1.5 L dans un seul article de la liste de courses, sous peine de ne
 * plus savoir combien acheter de chaque taille.
 */
export function buildListeCoursesKey(
  nom: string,
  marque: string,
  contenanceUnitaire: number | null,
  unite: Unit,
): string {
  return `${normalize(nom)}|${normalize(marque)}|${contenanceUnitaire ?? ''}|${unite}`;
}
