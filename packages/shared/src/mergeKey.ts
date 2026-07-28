import type { Unit } from './categories';

function normalize(s: string): string {
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
 * Clé de regroupement pour l'onglet ListeCourses : pas de contenance unitaire à ce niveau (la
 * liste de courses raisonne en quantité totale à acheter, pas en conditionnement), donc produit +
 * marque + unité suffisent à décider si un nouvel écart rejoint un article déjà présent.
 */
export function buildListeCoursesKey(nom: string, marque: string, unite: Unit): string {
  return `${normalize(nom)}|${normalize(marque)}|${unite}`;
}
