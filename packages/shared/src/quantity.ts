/**
 * Calcule la quantité à ajouter au total à partir d'un conditionnement.
 * Ex: pack de 6 bouteilles de 1.5 L -> nombreContenants=6, contenanceUnitaire=1.5 -> 9 L.
 * Pour un achat unitaire simple, nombreContenants=1.
 */
export function computeDeltaFromPack(nombreContenants: number, contenanceUnitaire: number): number {
  if (nombreContenants <= 0 || contenanceUnitaire <= 0) {
    throw new Error('nombreContenants et contenanceUnitaire doivent être strictement positifs');
  }
  return nombreContenants * contenanceUnitaire;
}

/** Arrondi d'affichage (2 décimales) sans accumuler d'erreurs flottantes en stockage. */
export function roundForDisplay(quantite: number): number {
  return Math.round(quantite * 100) / 100;
}
