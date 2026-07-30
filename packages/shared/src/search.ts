import { normalize } from './mergeKey';

/**
 * Recherche insensible à la casse ET aux accents (cf. `normalize`), sur un nombre variable de
 * champs (nom, marque...). Chaîne vide -> tout matche (pas de filtre actif). Partagée par tous
 * les écrans qui listent des produits (Inventaire, Entrée, Sortie, Besoins, Liste de courses)
 * pour un comportement de recherche identique partout.
 */
export function matchesSearch(query: string, ...values: Array<string | null | undefined>): boolean {
  const q = normalize(query);
  if (!q) return true;
  return values.some((value) => Boolean(value) && normalize(value as string).includes(q));
}
